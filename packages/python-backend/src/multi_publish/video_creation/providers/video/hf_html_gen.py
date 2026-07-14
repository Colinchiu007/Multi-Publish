"""HyperFrames HTML 生成模块（从 hyperframes_compose.py 拆分）

负责把 ``edit_decisions.cuts`` 与 ``audio_refs`` 渲染成符合 HyperFrames 合约的
``index.html``。这是纯字符串生成，零 I/O — 因此可以独立单测覆盖。

设计模式
--------
两个公开函数都是 standalone 函数，第一个参数为 ``host`` 宿主对象。宿主需提供：
- ``_f(v: float) -> str``              浮点数格式化（CSS 友好）
- ``_escape_text(s: str) -> str``       HTML 文本转义
- ``_escape_attr(s: str) -> str``       HTML 属性值转义（包含引号）
- ``_rel_from_workspace(path: str) -> str``  绝对路径转 workspace 相对路径

这样 ``HyperFramesCompose`` 类的方法可以变成薄委托 wrapper，而测试可以用
``SimpleNamespace`` 构造最小 mock 宿主，避免拉起整个 BaseTool 依赖链。

提取前这两个方法（``_cut_to_html`` / ``_generate_index_html``）零直接测试覆盖；
本模块配套的 ``tests/test_hf_html_gen.py`` 建立回归网。
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

# 模块级常量（与原 hyperframes_compose.py 保持一致）
_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".bmp", ".tiff", ".tif", ".webp", ".gif"}
_VIDEO_EXTENSIONS = {".mp4", ".mov", ".webm", ".mkv", ".m4v"}


# ═══════════════════════════════════════════════════════════
# 单个 cut 渲染
# ═══════════════════════════════════════════════════════════


def cut_to_html(
    host,
    index: int,
    cut: dict,
    width: int,
    height: int,
) -> tuple[str, str | None]:
    """渲染单个 cut 为 HTML 片段 + 入场 tween。

    根据以下信号决定 scene shape：
    1. ``cut.type`` ∈ {text_card, hero_title, callout} → text_card 形状
    2. 无 ``source`` 但有 ``text`` → 自动识别为 text_card
    3. ``source`` 后缀 ∈ ``_IMAGE_EXTENSIONS`` → image-clip
    4. ``source`` 后缀 ∈ ``_VIDEO_EXTENSIONS`` → video-clip
    5. ``source`` 后缀 ∈ {.html, .htm} → composition-clip
    6. 其他 → placeholder（text_card 形状 + Scene N 默认文案）

    Args:
        host: 宿主对象（提供 _f / _escape_text / _escape_attr / _rel_from_workspace）
        index: cut 序号（用于 id="cut-{index}"）
        cut: cut 字典（in_seconds / out_seconds / type / source / text / subtitle / caption / reason）
        width: 合成宽度（仅 composition-clip 用到）
        height: 合成高度（仅 composition-clip 用到）

    Returns:
        (html, tween) — tween 可能为 None（video / composition / placeholder）
    """
    cut_id = f"cut-{index}"
    in_s = float(cut.get("in_seconds", 0) or 0)
    out_s = float(cut.get("out_seconds", 0) or 0)
    # duration 至少 0.1s，避免 0 时长导致渲染失败
    duration = max(0.1, out_s - in_s)

    source = cut.get("source") or ""
    cut_type = (cut.get("type") or "").lower()
    text = cut.get("text") or cut.get("title") or ""

    src_path = Path(source) if source else None
    ext = src_path.suffix.lower() if src_path else ""

    # ─── 1. text_card 形状 ─────────────────────────────
    if cut_type in {"text_card", "hero_title", "callout"} or (not source and text):
        inner = f"<h1>{host._escape_text(text or f'Scene {index + 1}')}</h1>"
        subtitle = cut.get("subtitle") or cut.get("caption")
        if subtitle:
            inner += f'<div class="subtitle">{host._escape_text(subtitle)}</div>'
        html = (
            f'<div id="{cut_id}" class="clip text-card" '
            f'data-start="{host._f(in_s)}" data-duration="{host._f(duration)}" '
            f'data-track-index="1">{inner}</div>'
        )
        # 轻入场动画 — fade + lift
        tween = (
            f'tl.from("#{cut_id} h1", {{ y: 40, opacity: 0, duration: 0.6, '
            f'ease: "power3.out" }}, {host._f(in_s + 0.1)});'
        )
        return html, tween

    # ─── 2. image-clip 形状 ────────────────────────────
    if ext in _IMAGE_EXTENSIONS and src_path:
        rel = host._rel_from_workspace(str(src_path))
        html = (
            f'<img id="{cut_id}" class="clip image-clip" '
            f'src="{host._escape_attr(rel)}" '
            f'data-start="{host._f(in_s)}" data-duration="{host._f(duration)}" '
            f'data-track-index="1" alt="">'
        )
        tween = (
            f'tl.from("#{cut_id}", {{ scale: 1.05, opacity: 0, duration: 0.5, '
            f'ease: "power2.out" }}, {host._f(in_s)});'
        )
        return html, tween

    # ─── 3. video-clip 形状 ────────────────────────────
    if ext in _VIDEO_EXTENSIONS and src_path:
        rel = host._rel_from_workspace(str(src_path))
        html = (
            f'<video id="{cut_id}" class="clip video-clip" '
            f'src="{host._escape_attr(rel)}" '
            f'data-start="{host._f(in_s)}" data-duration="{host._f(duration)}" '
            f'data-track-index="1" muted playsinline></video>'
        )
        return html, None

    # ─── 4. composition-clip 形状 ──────────────────────
    if ext in {".html", ".htm"} and src_path:
        rel = host._rel_from_workspace(str(src_path))
        composition_id = Path(rel).stem
        # HTML 属性使用正斜杠（URL 路径），避免 Windows 反斜杠
        rel_url = rel.replace("\\", "/")
        html = (
            f'<div id="{cut_id}" class="clip composition-clip" '
            f'data-composition-id="{host._escape_attr(composition_id)}" '
            f'data-composition-src="{host._escape_attr(rel_url)}" '
            f'data-start="{host._f(in_s)}" data-duration="{host._f(duration)}" '
            f'data-width="{width}" data-height="{height}" '
            f'data-track-index="1"></div>'
        )
        return html, None

    # ─── 5. placeholder 兜底 ───────────────────────────
    # 未知 cut 形状 — 渲染一个 placeholder text card 让 render 仍能跑通；
    # lint/validate 会暴露问题。
    placeholder = host._escape_text(text or cut.get("reason") or f"Scene {index + 1}")
    html = (
        f'<div id="{cut_id}" class="clip text-card" '
        f'data-start="{host._f(in_s)}" data-duration="{host._f(duration)}" '
        f'data-track-index="1"><h1>{placeholder}</h1></div>'
    )
    return html, None


# ═══════════════════════════════════════════════════════════
# 完整 index.html 生成
# ═══════════════════════════════════════════════════════════


def generate_index_html(
    host,
    cuts: list[dict],
    audio_refs: dict[str, Any],
    width: int,
    height: int,
    total_duration: float,
    css_vars: dict[str, str],
    title: str,
) -> str:
    """生成符合 HyperFrames 合约的完整 ``index.html``。

    Phase 1 覆盖烟雾测试运行时所需的最小集：
    - 静态图片（img.clip）
    - 视频片段（video.clip，muted playsinline + 必要时独立音轨）
    - 文本卡片（div.clip with styled <h1>）
    - 旁白片段（audio）
    - 背景音乐（audio，音量降低）

    更复杂的 scene 类型（registry blocks、kinetic typography）由 agent 直接
    写入 ``compositions/`` —— 本生成器只提供功能性起步骨架。

    Args:
        host: 宿主对象（提供 _f / _escape_text / _escape_attr / _rel_from_workspace）
        cuts: cut 字典列表
        audio_refs: {narration: [...], music: {...}} 结构
        width: 合成宽度
        height: 合成高度
        total_duration: 总时长（秒）—— 用于无 end_seconds 的 narration 与 music
        css_vars: 注入到 ``:root`` 的 CSS 变量字典
        title: <title> 标签内容（会被 HTML 转义）

    Returns:
        完整的 HTML 文档字符串
    """
    vars_css = "\n      ".join(f"{k}: {v};" for k, v in css_vars.items())

    clip_html: list[str] = []
    entrance_tweens: list[str] = []
    for i, cut in enumerate(cuts):
        html, tween = cut_to_html(host, i, cut, width, height)
        clip_html.append(html)
        if tween:
            entrance_tweens.append(tween)

    audio_html: list[str] = []
    for j, nar in enumerate(audio_refs.get("narration") or []):
        src = host._rel_from_workspace(nar["src"])
        start = nar.get("start_seconds", 0)
        end = nar.get("end_seconds")
        # 若 end 缺失或早于 start，duration 回退为 (total - start)
        duration = (end - start) if end and end > start else (total_duration - start)
        audio_html.append(
            f'<audio id="nar-{j}" '
            f'data-start="{host._f(start)}" data-duration="{host._f(duration)}" '
            f'data-track-index="2" src="{host._escape_attr(src)}" '
            f'data-volume="1"></audio>'
        )

    music = audio_refs.get("music")
    if music:
        src = host._rel_from_workspace(music["src"])
        audio_html.append(
            f'<audio id="music" '
            f'data-start="0" data-duration="{host._f(total_duration)}" '
            f'data-track-index="3" src="{host._escape_attr(src)}" '
            f'data-volume="{host._f(music["volume"])}"></audio>'
        )

    tween_block = "\n        ".join(entrance_tweens) if entrance_tweens else "// no tweens"

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>{host._escape_text(title)}</title>
  <style>
    :root {{
      {vars_css}
    }}
    body {{ margin: 0; background: var(--color-bg); color: var(--color-fg); font-family: var(--font-body); }}
    [data-composition-id="root"] {{
      position: relative;
      width: {width}px;
      height: {height}px;
      overflow: hidden;
    }}
    .clip {{ position: absolute; inset: 0; }}
    .clip.video-clip, .clip.image-clip {{ object-fit: cover; width: 100%; height: 100%; }}
    .clip.text-card {{ display: flex; align-items: center; justify-content: center; padding: 120px 160px; box-sizing: border-box; text-align: center; }}
    .clip.text-card h1 {{ font-family: var(--font-heading); font-weight: 700; font-size: 96px; line-height: 1.1; margin: 0; color: var(--color-fg); }}
    .clip.text-card .subtitle {{ font-size: 36px; margin-top: 24px; color: var(--color-accent); }}
  </style>
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
</head>
<body>
  <div data-composition-id="root" data-start="0" data-duration="{host._f(total_duration)}" data-width="{width}" data-height="{height}">
    {"".join(clip_html)}
    {"".join(audio_html)}
    <script>
      window.__timelines = window.__timelines || {{}};
      const tl = gsap.timeline({{ paused: true }});
      {tween_block}
      window.__timelines["root"] = tl;
    </script>
  </div>
</body>
</html>
"""
