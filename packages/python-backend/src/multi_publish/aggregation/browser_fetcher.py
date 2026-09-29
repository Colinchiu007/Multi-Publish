"""浏览器降级采集 — Playwright 访问视频页并监听平台 API 拿播放地址。

背景：yt-dlp 对抖音报 Fresh cookies needed（2026.8.19 实测），纯 HTTP 通道被风控。
本模块用 Playwright 桌面 Chrome 访问视频页，监听平台 detail API 响应提取
play_addr url_list，带 Referer 下载（已实测：65s 抖音视频全链路 35s 跑通）。

2026-09-29 扩展（collect-video-platforms）：新增小红书配置——匿名直连拿不到笔记数据
（SSR noteDetailMap 为空），须直接导航短链解析后的原始分享 URL（保留 xsec_token），
监听 ``api/sns/web/v1/feed`` 响应，从 ``note_card.video.media.stream`` 各编码分档按
分辨率优先取 master_url；API 未捕获时回退读水合后的 ``window.__INITIAL_STATE__``。

设计约束：
- 懒加载：首次调用才启动浏览器，避免影响 Python 后端启动速度
- 超时兜底：页面加载/API 等待/下载各有独立超时，任一超时抛 BrowserFetchError
- 反爬友好：桌面 Chrome UA + 真实视口 + zh-CN locale，模拟真实用户
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import urllib.request
from pathlib import Path

logger = logging.getLogger(__name__)

# 各平台「浏览器降级」配置：视频页 URL 模板 + 要监听的 API URL 子串 + 响应解析路径
_BROWSER_FETCH_CONFIGS: dict[str, dict] = {
    "douyin": {
        # 从任意抖音 URL 提取视频 ID（/video/{id}、share/video/{id}、?modal_id= 等）
        "id_patterns": [
            r"douyin\.com/video/(\d+)",
            r"douyin\.com/share/video/(\d+)",
            r"douyin\.com/(?:note|user/.*)?\?.*modal_id=(\d+)",
            r"iesdouyin\.com/share/video/(\d+)",
        ],
        "page_url": "https://www.douyin.com/video/{video_id}",
        "api_pattern": "aweme/v1/web/aweme/detail",
        # 响应 JSON 路径：aweme_detail -> video -> play_addr -> url_list
        "play_path": ("aweme_detail", "video", "play_addr", "url_list"),
        "title_path": ("aweme_detail", "desc"),
        "author_path": ("aweme_detail", "author", "nickname"),
        "duration_path": ("aweme_detail", "duration"),  # 毫秒
        "duration_unit_ms": True,
        "referer": "https://www.douyin.com/",
    },
    "xiaohongshu": {
        # 小红书笔记页：直接导航短链解析后的原始 URL（xsec_token 必须保留，
        # 从 ID 重建的页面地址拿不到笔记数据——匿名 SSR noteDetailMap 为空）
        "use_resolved_url": True,
        "id_patterns": [
            r"xiaohongshu\.com/(?:explore|discovery/item)/([0-9a-f]+)",
        ],
        "api_pattern": "api/sns/web/v1/feed",
        "referer": "https://www.xiaohongshu.com/",
    },
}

# 通用桌面 Chrome UA（与 Node 侧 stealth 通道一致的形态）
_DESKTOP_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)

_PAGE_TIMEOUT_MS = 30_000   # 页面加载超时
_API_WAIT_MS = 12_000       # 等待目标 API 响应的超时
_DOWNLOAD_TIMEOUT_SEC = 180 # 视频下载超时


class BrowserFetchError(Exception):
    """浏览器降级采集错误。code: no_browser / fetch_failed / download_failed"""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def extract_video_id(url: str, platform: str) -> str | None:
    """从平台 URL 提取视频 ID（用于构造桌面版视频页地址）。"""
    config = _BROWSER_FETCH_CONFIGS.get(platform)
    if not config:
        return None
    for pattern in config["id_patterns"]:
        m = re.search(pattern, url)
        if m:
            return m.group(1)
    return None


def resolve_short_link(url: str) -> str:
    """解析短链（v.douyin.com/xxx 等）到最终视频页 URL。

    短链 302 到 iesdouyin share 页，Location 含视频 ID；
    不跟随多次重定向（只取一层 Location），避免意外跳转。
    解析失败原样返回，由上层报错。
    """
    try:
        from urllib.parse import urlparse
        host = (urlparse(url).hostname or "").lower()
        if not any(host == d or host.endswith("." + d) for d in ("v.douyin.com", "xhslink.com")):
            return url

        class _NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, req, fp, code, msg, headers, newurl):
                return None

        req = urllib.request.Request(
            url,
            headers={"User-Agent": _DESKTOP_UA},
            method="HEAD",
        )
        opener = urllib.request.build_opener(_NoRedirect)
        try:
            opener.open(req, timeout=10)
            return url  # 无重定向，原样返回
        except urllib.error.HTTPError as e:
            if 300 <= e.code < 400:
                location = e.headers.get("Location") or ""
                if location.startswith(("http://", "https://")):
                    return location
            return url
    except Exception:
        return url


def _dig(data, path: tuple) -> object:
    """按路径逐层取 JSON 嵌套值，任一层缺失返回 None。

    路径元素支持 str（dict 键）与 int（list 下标，2026-09-29 小红书
    ``data.items[0].note_card`` 路径需要）。
    """
    cur = data
    for key in path:
        if isinstance(key, int):
            if not isinstance(cur, list) or not (-len(cur) <= key < len(cur)):
                return None
            cur = cur[key]
        else:
            if not isinstance(cur, dict):
                return None
            cur = cur.get(key)
    return cur


def _extract_xhs_play(stream: dict) -> tuple[str, float]:
    """从小红书 video.media.stream 提取 (播放地址, 时长秒)。

    stream 形如 ``{"h264": [...], "h265": [...], "av1": [...]}``（编码分档 →
    格式列表，每项含 master_url/backupUrls/height/duration(ms)）——分档名不写死
    （MediaCrawler 实测存在 h264/h265/av1/ef4-ef7 多种命名），凡列表皆候选，
    按 height 优先（f2 #214：高分辨率 H.265 码率可能低于 1080p H.264，只按
    码率排会漏高清）取 master_url，缺失时取 backupUrls 首项。
    """
    best_url = ""
    best_height = 0
    best_duration_ms = 0.0
    if not isinstance(stream, dict):
        return "", 0.0
    for entries in stream.values():
        if not isinstance(entries, list):
            continue
        for entry in entries:
            if not isinstance(entry, dict):
                continue
            url = entry.get("master_url") or ""
            if not url and isinstance(entry.get("backupUrls"), list) and entry["backupUrls"]:
                url = str(entry["backupUrls"][0] or "")
            if not url:
                continue
            height = entry.get("height") or 0
            duration_ms = entry.get("duration") or 0
            if height > best_height or (height == best_height and duration_ms > best_duration_ms):
                best_url = str(url)
                best_height = height
                best_duration_ms = duration_ms
    return best_url, (best_duration_ms / 1000.0 if best_duration_ms else 0.0)


def _parse_xhs_payload(raw: str, video_id: str, from_state: bool = False) -> dict:
    """解析小红书 feed API 响应或水合后 __INITIAL_STATE__。

    两种来源共享 ``video.media.stream`` 字段路径（MediaCrawler/xhs/yt-dlp
    三方一致）：
    - feed API（from_state=False）：``data.items[0].note_card``
    - __INITIAL_STATE__（from_state=True）：``note.noteDetailMap.{id}.note``
    """
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        raise BrowserFetchError("fetch_failed", "视频信息解析失败")
    if from_state:
        note = _dig(data, ("note", "noteDetailMap", video_id, "note"))
    else:
        note = _dig(data, ("data", "items", 0, "note_card"))
    if not isinstance(note, dict):
        raise BrowserFetchError("fetch_failed", "未能从页面获取笔记信息")
    play_url, duration = _extract_xhs_play(_dig(note, ("video", "media", "stream")))
    if not play_url:
        raise BrowserFetchError("fetch_failed", "未能获取视频播放地址")
    title = str(note.get("display_title") or note.get("title") or "").strip()
    author = str(_dig(note, ("user", "nickname")) or "").strip()
    return {
        "title": title,
        "author": author,
        "duration": duration,
        "play_url": play_url,
        "referer": "https://www.xiaohongshu.com/",
    }


async def _fetch_via_browser_async(platform: str, page_url: str, video_id: str) -> dict:
    """Playwright 访问视频页，监听 detail API 拿元数据 + 播放地址。

    page_url 由调用方构造：douyin 为 ID 重建的桌面视频页；xiaohongshu 为
    短链解析后的原始分享 URL（保留 xsec_token）。
    """
    config = _BROWSER_FETCH_CONFIGS[platform]
    api_pattern = config["api_pattern"]

    try:
        from playwright.async_api import async_playwright
    except ImportError:
        raise BrowserFetchError(
            "no_browser",
            "浏览器采集组件未安装（playwright），请运行: pip install playwright && playwright install chromium",
        )

    captured: list[str] = []
    state_json: str | None = None
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
        )
        try:
            context = await browser.new_context(
                user_agent=_DESKTOP_UA,
                viewport={"width": 1280, "height": 800},
                locale="zh-CN",
            )
            page = await context.new_page()

            async def on_response(resp):
                if api_pattern in resp.url:
                    try:
                        captured.append(await resp.text())
                    except Exception:
                        pass

            page.on("response", on_response)
            await page.goto(page_url, wait_until="domcontentloaded", timeout=_PAGE_TIMEOUT_MS)
            # 等待 detail API 响应到达（页面加载后异步触发）
            for _ in range(_API_WAIT_MS // 500):
                if captured:
                    break
                await page.wait_for_timeout(500)

            # 小红书：feed API 未捕获时回退读水合后的 __INITIAL_STATE__
            # （SSR 直出的笔记数据，页面 JS 渲染后写入）
            if platform == "xiaohongshu" and not captured:
                try:
                    state_json = await page.evaluate(
                        "() => JSON.stringify(window.__INITIAL_STATE__ || null)"
                    )
                except Exception:
                    state_json = None
                if not state_json or state_json == "null":
                    state_json = None

            if not captured and state_json is None:
                raise BrowserFetchError(
                    "fetch_failed",
                    "未能从页面获取视频信息（平台可能要求登录或链接已失效）",
                )
        finally:
            await browser.close()

    # 响应解析按平台分派：小红书 stream 结构 / 抖音路径式
    if platform == "xiaohongshu":
        return _parse_xhs_payload(
            captured[0] if captured else (state_json or ""),
            video_id,
            from_state=not captured,
        )

    try:
        data = json.loads(captured[0])
    except json.JSONDecodeError:
        raise BrowserFetchError("fetch_failed", "视频信息解析失败")

    urls = _dig(data, config["play_path"]) or []
    if not urls or not isinstance(urls, list):
        raise BrowserFetchError("fetch_failed", "未能获取视频播放地址")

    duration_raw = _dig(data, config["duration_path"])
    duration = 0.0
    if isinstance(duration_raw, (int, float)):
        duration = duration_raw / 1000.0 if config.get("duration_unit_ms") else float(duration_raw)

    return {
        "title": str(_dig(data, config["title_path"]) or "").strip(),
        "author": str(_dig(data, config["author_path"]) or "").strip(),
        "duration": duration,
        "play_url": urls[0],
        "referer": config["referer"],
    }


def fetch_video_via_browser(platform: str, url: str) -> dict:
    """同步入口：浏览器降级采集视频元数据 + 播放地址。

    返回 {title, author, duration, play_url, referer}。
    失败抛 BrowserFetchError（no_browser / fetch_failed / download_failed）。
    """
    config = _BROWSER_FETCH_CONFIGS.get(platform)
    if not config:
        raise BrowserFetchError(
            "fetch_failed",
            f"平台 {platform} 暂不支持浏览器采集通道",
        )
    # 短链先解析到最终页（v.douyin.com/xxx -> iesdouyin share/video/{id}；
    # xhslink.com/xxx -> xiaohongshu.com/discovery/item/{id}?xsec_token=...）
    resolved = resolve_short_link(url)
    # ID 提取同时是导航前的域名校验：短链解析被劫持到任意地址时不匹配
    # 平台 id_patterns，fail closed（防 SSRF）
    video_id = extract_video_id(resolved, platform)
    if not video_id:
        raise BrowserFetchError(
            "fetch_failed",
            "无法从链接提取视频 ID，请粘贴完整的视频分享链接",
        )
    if config.get("use_resolved_url"):
        # 小红书：直接导航解析后的原始 URL（xsec_token 必须保留）
        page_url = resolved
    else:
        page_url = config["page_url"].format(video_id=video_id)
    try:
        return asyncio.run(_fetch_via_browser_async(platform, page_url, video_id))
    except BrowserFetchError:
        raise
    except Exception as e:
        raise BrowserFetchError("fetch_failed", f"浏览器采集失败: {e}")


def download_video_file(play_url: str, referer: str, target: Path) -> None:
    """带 Referer 的视频下载（抖音 CDN 校验 Referer，缺失返回 403）。"""
    req = urllib.request.Request(
        play_url,
        headers={"User-Agent": _DESKTOP_UA, "Referer": referer},
    )
    try:
        with urllib.request.urlopen(req, timeout=_DOWNLOAD_TIMEOUT_SEC) as resp, open(target, "wb") as f:
            while True:
                chunk = resp.read(1024 * 1024)
                if not chunk:
                    break
                f.write(chunk)
    except Exception as e:
        raise BrowserFetchError("download_failed", f"视频下载失败: {e}")
    if not target.exists() or target.stat().st_size == 0:
        raise BrowserFetchError("download_failed", "视频下载失败（文件为空）")
