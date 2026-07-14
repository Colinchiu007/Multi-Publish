"""Video stitch xfade 过渡模块（从 video_stitch.py 拆分）

负责 xfade 链式过渡的 filtergraph 构建 —— 把 N > 2 个视频片段用 ffmpeg xfade
滤镜渐进式拼接。原 ``VideoStitch._chain_xfade`` 方法把纯字符串构建与
``self.run_command(cmd)`` subprocess 调用混在一起，使得 filtergraph 算术
在不 mock ffmpeg 的情况下无法测试。本模块把纯构建逻辑抽出来，配套测试见
``tests/test_video_stitch_xfade.py``。

提取的两个函数都是纯函数：无 I/O、无 subprocess、给定输入确定性输出。

已知问题（暂不修复，留待后续 commit）：
- BUG-A: ``_chain_xfade`` 使用原始 probes 的 duration，但 working_clips 可能
  已被 ``_normalize_clip`` 重新编码，时长会偏移几毫秒 → xfade offset 略有偏差。
  修复需在 normalization 后重新 probe，属于行为变更，不在本次拆分范围。
"""

from __future__ import annotations

from typing import Any

# ═══════════════════════════════════════════════════════════
# 单对 xfade offset 计算
# ═══════════════════════════════════════════════════════════


def get_xfade_offset(
    probes: list[dict[str, Any]],
    clip_index: int,
    duration: float,
) -> float:
    """计算单个 clip pair 的 xfade offset。

    offset 是输出时间轴上过渡开始的位置，等于第一个 clip 的时长减去过渡时长。

    Args:
        probes: probe 字典列表（每个含 ``duration`` 键）
        clip_index: 要计算 offset 的 clip 索引
        duration: 过渡时长（秒）

    Returns:
        offset（秒），负值钳制为 0，保留 3 位小数
    """
    clip_dur = probes[clip_index].get("duration", 0) if clip_index < len(probes) else 0
    offset = max(0, clip_dur - duration)
    return round(offset, 3)


# ═══════════════════════════════════════════════════════════
# 链式 xfade filtergraph 构建（纯函数，不调用 subprocess）
# ═══════════════════════════════════════════════════════════


def build_chain_xfade_filtergraph(
    clips: list[str],
    duration: float,
    probes: list[dict[str, Any]],
    transition: str,
) -> tuple[list[str], str]:
    """为 N > 2 个 clips 构建链式 xfade filtergraph。

    构建一个复杂 filtergraph，在每对相邻 clip 之间渐进地应用 xfade。
    返回 ``(input_args, filter_complex)`` —— 调用方负责拼到 ffmpeg 命令中
    并执行 subprocess。

    filtergraph 结构（以 3 clips 为例）::

        [0:v][1:v]xfade=transition=fade:duration=1:offset=4[vfade0];
        [vfade0][2:v]xfade=transition=fade:duration=1:offset=8[vout];
        [0:a][1:a]acrossfade=d=1[afade0];
        [afade0][2:a]acrossfade=d=1[aout]

    label 链规则：
    - 第一对 (i=0)：in1 = ``[0:v]`` / ``[0:a]``
    - 中间对 (0 < i < n-2)：in1 = ``[vfade{i-1}]`` / ``[afade{i-1}]``
    - 最后一对 (i = n-2)：out = ``[vout]`` / ``[aout]``
    - 其余对的 out = ``[vfade{i}]`` / ``[afade{i}]``

    offset 累加规则：
    - offset[0] = clip0_dur - duration
    - offset[i] = offset[i-1] + clip{i}_dur - duration
    - 负值钳制为 0，保留 3 位小数

    Args:
        clips: clip 文件路径列表
        duration: 单次过渡时长（秒）
        probes: probe 字典列表（每个含 ``duration`` 键）
        transition: xfade 过渡类型（如 ``fade`` / ``wipeleft`` / ``slideup``）

    Returns:
        (input_args, filter_complex)
        - input_args: ``["-i", clip0, "-i", clip1, ...]``
        - filter_complex: 用 ``;`` 连接的滤镜链字符串；单 clip 时为空串
    """
    n = len(clips)
    input_args: list[str] = []
    for clip in clips:
        input_args.extend(["-i", clip])

    # 单 clip 无需过渡
    if n < 2:
        return input_args, ""

    # 计算累加 offset
    # 每个 xfade offset = 之前所有片段的累加时长 - 累加过渡重叠 - 当前过渡时长
    video_filters: list[str] = []
    audio_filters: list[str] = []
    cumulative_offset = 0.0

    for i in range(n - 1):
        clip_dur = probes[i].get("duration", 0) if i < len(probes) else 0
        offset = round(cumulative_offset + clip_dur - duration, 3)
        offset = max(0, offset)

        # in1 来自上一段过渡的输出（或第一段的原始流）
        if i == 0:
            v_in1 = "[0:v]"
            a_in1 = "[0:a]"
        else:
            v_in1 = f"[vfade{i - 1}]"
            a_in1 = f"[afade{i - 1}]"

        # in2 始终是下一段原始流
        v_in2 = f"[{i + 1}:v]"
        a_in2 = f"[{i + 1}:a]"

        # out 标签：最后一对输出 [vout]/[aout]，其余输出 [vfadeN]/[afadeN]
        if i < n - 2:
            v_out = f"[vfade{i}]"
            a_out = f"[afade{i}]"
        else:
            v_out = "[vout]"
            a_out = "[aout]"

        video_filters.append(
            f"{v_in1}{v_in2}xfade=transition={transition}:duration={duration}:offset={offset}{v_out}"
        )
        audio_filters.append(f"{a_in1}{a_in2}acrossfade=d={duration}{a_out}")

        # 累加 offset 推进 clip 时长减去重叠
        cumulative_offset = offset

    filter_complex = ";".join(video_filters + audio_filters)
    return input_args, filter_complex
