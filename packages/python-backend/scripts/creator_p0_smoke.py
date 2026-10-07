#!/usr/bin/env python
"""博主监控 P0 冒烟（E2E-1~E2E-5）

用法
----
    set YOUTUBE_API_KEY=<你的 YouTube Data API v3 密钥>
    python packages/python-backend/scripts/creator_p0_smoke.py

    # 可选：指定被测频道（默认用官方公开频道做冒烟）
    set CREATOR_P0_CHANNEL=@YouTube

为什么必须先跑这个
------------------
本特性最大的风险不是逻辑复杂度，而是**依赖不可用**：
`content_aggregator` 是本仓 python-backend 的 **optional 依赖**，且本仓打包产物
**不分发 Python 环境**（python-bridge 直接 spawn 系统 python）。若依赖不可用，
后续数千行实现会整体归零。本脚本用最小代价先证伪该风险。

判据
----
E2E-1 频道解析    4 种输入形态解析到同一 channelId，且归并为一行
E2E-2 作品枚举    返回条数 > 0，video_id 与 channel_id 均非空
E2E-3 字幕正文    正文 >= 500 字 且 transcript_source == 'subtitle'
E2E-4 探测幂等    连续探测 3 次，枚举结果条数与 id 集合不变
E2E-5 单条入库    首条正文非空、非纯空白（内容可用）

任一失败 → 退出码 1，且打印可操作的修复建议。
"""

from __future__ import annotations

import asyncio
import os
import sys

MIN_TRANSCRIPT_CHARS = 500

DEFAULT_CHANNEL = os.environ.get("CREATOR_P0_CHANNEL", "@YouTube")

# 频道输入形态。**必须是以 https:// 开头的完整 URL**：实测依赖库的
# `youtube_collector.py:141` 只在 `channel_id.startswith('http')` 时才进 URL 解析分支，
# 传裸串（`youtube.com/@x` 或 `@x`）会被原样塞进 API 的 channelId 参数 → HTTP 400。
# 且该库对 `@handle` 的处理是**降级成关键词搜索**（把 handle 当搜索词、channel_id 置 None），
# 拿到的是「标题含该词的视频」而非该频道自己的作品 —— 因此 adapter 必须自己用
# `channels.list?forHandle=` 解析 handle，不能依赖库的 URL 分支。
CHANNEL_INPUT_FORMS = [
    "https://www.youtube.com/channel/UC_x5XG1OV2P6uZZ5FSM9Ttw",  # 完整 URL + UC ID
    "https://www.youtube.com/@GoogleDevelopers",                 # 完整 URL + @handle
    "https://www.youtube.com/c/GoogleDevelopers",                # 完整 URL + 旧式 /c/
    "https://www.youtube.com/user/GoogleDevelopers",             # 完整 URL + 旧式 /user/
]
EXPECTED_CHANNEL_ID = "UC_x5XG1OV2P6uZZ5FSM9Ttw"

results: list[tuple[str, bool, str]] = []


def record(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, ok, detail))
    print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f"  ->  {detail}" if detail else ""))


def load_collector():
    """延迟导入：缺依赖时给出可操作提示，而不是抛栈。"""
    try:
        from content_aggregator.sources.collectors.youtube_collector import YouTubeCollector
        return YouTubeCollector
    except ImportError as exc:
        print("=" * 70)
        print("FATAL: 无法导入 content_aggregator —— 这正是本冒烟要证伪的风险。")
        print(f"  原因: {exc}")
        print("  修复: 在运行本应用的 Python 环境中执行")
        print("        pip install content-aggregator")
        print("=" * 70)
        sys.exit(2)


async def main() -> int:
    api_key = os.environ.get("YOUTUBE_API_KEY", "").strip()
    if not api_key:
        print("FATAL: 未设置 YOUTUBE_API_KEY。")
        print("  获取方式: Google Cloud Console -> 启用 YouTube Data API v3 -> 创建 API 密钥")
        print("  免费额度 10,000 units/day；本冒烟与方案日常用量约 1,500 units")
        print()
        print("  注: 应用内凭证真源是 config.yaml 的 sources.youtube.api_key；")
        print("      本脚本走环境变量直传构造函数，便于冒烟时不影响用户配置。")
        print("  已实测: 缺 Key 时 collector._fetch 抛 OSError（fail-closed，不返回空列表），")
        print("        报 'YOUTUBE_API_KEY 未配置，请在 config.yaml 中设置 sources.youtube.api_key'")
        sys.exit(2)

    YouTubeCollector = load_collector()

    # ---------- E2E-1 频道解析 ----------
    resolved: dict[str, str] = {}
    for form in CHANNEL_INPUT_FORMS:
        try:
            c = YouTubeCollector(api_key=api_key, fetch_transcript=False)
            out = await c._fetch(channel_id=form)
            items = out if isinstance(out, list) else []
            cid = (items[0].get("metadata", {}).get("channel_id") if items else "") or ""
            resolved[form] = cid
        except Exception as exc:  # noqa: BLE001 - 冒烟需要看到任何异常形态
            resolved[form] = f"<error: {type(exc).__name__}: {str(exc)[:80]}>"

    got = {v for v in resolved.values() if v and not v.startswith("<error")}
    all_ok = len(got) == 1 and EXPECTED_CHANNEL_ID in got
    record(
        "E2E-1 频道解析（4 种形态归一）",
        all_ok,
        f"期望 {EXPECTED_CHANNEL_ID}；实得 {sorted(got) if got else '(无)'}；"
        + " | ".join(f"{k.split('/')[-1]}->{v or '<empty>'}" for k, v in resolved.items()),
    )

    # 用归一后的 canonical ID 作为后续步骤的输入（adapter 的真实做法）
    channel = EXPECTED_CHANNEL_ID

    # ---------- E2E-2 作品枚举 ----------
    c = YouTubeCollector(api_key=api_key, fetch_transcript=False)
    items = await c._fetch(channel_id=channel)
    items = items if isinstance(items, list) else []
    with_ids = [i for i in items if (i.get("metadata") or {}).get("video_id")]
    record(
        "E2E-2 作品枚举",
        bool(with_ids),
        f"返回 {len(items)} 条，其中带 video_id {len(with_ids)} 条",
    )
    if not with_ids:
        return 1

    # ---------- E2E-3 字幕正文 ----------
    target = with_ids[0]["metadata"]["video_id"]
    c2 = YouTubeCollector(api_key=api_key, fetch_transcript=True)
    fetched = await c2._fetch(channel_id=channel)
    fetched = fetched if isinstance(fetched, list) else []
    sample = next((i for i in fetched if (i.get("metadata") or {}).get("video_id") == target), None)
    if sample is None:
        record("E2E-3 字幕正文", False, "首条视频未取到正文")
    else:
        body = sample.get("content") or ""
        src = (sample.get("metadata") or {}).get("transcript_source")
        ok = len(body) >= MIN_TRANSCRIPT_CHARS and src == "subtitle"
        record(
            "E2E-3 字幕正文",
            ok,
            f"正文 {len(body)} 字（阈值 {MIN_TRANSCRIPT_CHARS}），transcript_source={src}",
        )

    # ---------- E2E-4 探测幂等 ----------
    snaps = []
    for _ in range(3):
        cc = YouTubeCollector(api_key=api_key, fetch_transcript=False)
        out = await cc._fetch(channel_id=channel)
        out = out if isinstance(out, list) else []
        snaps.append({(i.get("metadata") or {}).get("video_id") for i in out})
    record(
        "E2E-4 探测幂等",
        snaps[0] == snaps[1] == snaps[2],
        f"三次探测结果集合一致={snaps[0] == snaps[1] == snaps[2]}，条数={[len(s) for s in snaps]}",
    )

    # ---------- E2E-5 单条入库内容可用 ----------
    body = (sample or {}).get("content") or ""
    usable = bool(body.strip())
    record(
        "E2E-5 单条入库内容可用",
        usable,
        f"正文去空白后长度={len(body.strip())}",
    )

    # ---------- 汇总 ----------
    print("\n" + "=" * 70)
    failed = [n for n, ok, _ in results if not ok]
    if failed:
        print(f"结论: P0 冒烟未通过（{len(failed)} 项失败）-> 不要开始写实现，先修依赖/权限。")
        print("失败项: " + ", ".join(failed))
    else:
        print("结论: P0 冒烟全通过 -> 依赖、权限、字幕链路均可用，可以开始实现。")
        print("提醒: 打包产物仍不分发 Python 依赖（python-bridge 直接 spawn 系统 python），")
        print("      发布前需确认目标机器已 pip install content-aggregator，")
        print("      或按方案 §16.1 的回退路径改为本仓自实现。")
    print("=" * 70)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))