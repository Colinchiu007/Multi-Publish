"""百家号纯 HTTP 视频采集 — 解析文章页内嵌 JSON 取 mp4 直链（2026-09-29）。

背景：yt-dlp 无百家号 extractor；调研实测（2026-09-29 双重独立验证，见
01-docs/RESEARCH-VIDEO-COLLECT-OPEN-SOURCE-2026-09-29.md §5.2）百家号文章页静态 HTML
即含全部视频信息，普通 HTTP GET + HTML 解析即可，无需 Playwright、无需登录、无需签名：

- 结构化主路径：``window.jsonData = {"bsData": {"superlanding": [{"itemData":
  {"header": 标题, "sections": [{"type": "mthvideo", "content": {...}}]}}]}}``
  （JSON 后跟 ``;window.firstScreenTime = Date.now();`` 再 ``</script>``，
  直接锚定 ``</script>`` 的正则会匹配失败，须花括号配平提取）
  - mthvideo 项：``content.https.file``（https mp4 直链）/ ``content.base.src``（http 兜底）/
    ``content.base.long``（时长 "01:40"）/ ``content.https.cover``（封面）
- 标签兜底：``<video src="http(s)://vd3.bdstatic.com/mda-xxx/...mp4">``（标题取 ``<title>``）

边界：纯视频类百家号链接会 302 到 haokan.baidu.com（好看视频）——如实报专属错误，
不误报 no_video（前端按 no_video 回退图文，haokan 不是图文页）。
"""

from __future__ import annotations

import json
import logging
import re
import urllib.request

logger = logging.getLogger(__name__)

# 桌面 UA：移动端 UA 会拿到无 <video> 标签的移动版页面（2026-09-29 实测），
# 桌面 UA 下 jsonData 与 video 标签均在
_DESKTOP_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)

_HTTP_TIMEOUT_SEC = 30

# <video src="...mp4"> 标签兜底（属性顺序不敏感）
_VIDEO_TAG_RE = re.compile(r"<video[^>]+src=[\"']([^\"']+)[\"']", re.I)
# <title> 兜底标题
_TITLE_TAG_RE = re.compile(r"<title>([^<]*)</title>", re.I)


class BaijiahaoFetchError(Exception):
    """百家号采集错误。code: no_video / haokan / fetch_failed"""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def _http_get(url: str, timeout: int = _HTTP_TIMEOUT_SEC) -> tuple[str, str]:
    """GET 返回 (最终 URL, HTML)。urllib 自动跟随 302（mbd/haokan 重定向落地）。"""
    req = urllib.request.Request(url, headers={"User-Agent": _DESKTOP_UA})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.geturl(), resp.read().decode("utf-8", "errors=replace")


def _parse_duration(text: str | None) -> float:
    """"01:40" / "01:02:03" → 秒；非法/缺失返回 0。"""
    if not text:
        return 0.0
    parts = str(text).strip().split(":")
    if not all(p.isdigit() for p in parts) or not 1 <= len(parts) <= 3:
        return 0.0
    try:
        nums = [int(p) for p in parts]
    except ValueError:
        return 0.0
    while len(nums) < 3:
        nums.insert(0, 0)
    h, m, s = nums
    return float(h * 3600 + m * 60 + s)


def _extract_json_data(html: str) -> dict | None:
    """花括号配平提取 ``window.jsonData = {...}``（容忍字符串内大括号与嵌套）。"""
    m = re.search(r"window\.jsonData\s*=\s*\{", html)
    if not m:
        return None
    start = m.end() - 1  # 指向 '{'
    depth = 0
    in_str = False
    escape = False
    for i in range(start, len(html)):
        ch = html[i]
        if in_str:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(html[start:i + 1])
                except json.JSONDecodeError:
                    return None
    return None


def _extract_mthvideo_section(json_data: dict) -> dict | None:
    """取 superlanding[0].itemData.sections 中首个 type=mthvideo 项的 content。"""
    try:
        sections = (
            json_data["bsData"]["superlanding"][0]["itemData"].get("sections") or []
        )
    except (KeyError, IndexError, TypeError, AttributeError):
        return None
    for section in sections:
        if isinstance(section, dict) and section.get("type") == "mthvideo":
            content = section.get("content")
            if isinstance(content, dict):
                return content
    return None


def fetch_baijiahao_video(url: str) -> dict:
    """同步入口：解析百家号文章页取视频元数据 + mp4 直链。

    返回 ``{title, author, duration, play_url, referer}``。
    失败抛 BaijiahaoFetchError（no_video / haokan / fetch_failed）。
    """
    try:
        final_url, html = _http_get(url)
    except Exception as e:  # noqa: BLE001 — urllib 异常族统一归 fetch_failed
        raise BaijiahaoFetchError("fetch_failed", f"百家号页面获取失败: {e}") from e

    # 纯视频类百家号链接 302 到好看视频（实测 2026-09-29）——专属错误，勿误报 no_video
    if "haokan.baidu.com" in (final_url or ""):
        raise BaijiahaoFetchError(
            "haokan",
            "该链接为好看视频专链，暂不支持自动采集，请更换图文内嵌视频的百家号文章链接",
        )

    title = ""
    play_url = ""
    duration = 0.0

    # ① 结构化主路径：window.jsonData 的 mthvideo sections
    json_data = _extract_json_data(html)
    if json_data is not None:
        try:
            title = str(
                json_data["bsData"]["superlanding"][0]["itemData"].get("header") or ""
            ).strip()
        except (KeyError, IndexError, TypeError, AttributeError):
            title = ""
        content = _extract_mthvideo_section(json_data)
        if content:
            https_file = content.get("https") or {}
            base = content.get("base") or {}
            play_url = str(https_file.get("file") or base.get("src") or "").strip()
            duration = _parse_duration(base.get("long"))

    # ② 标签兜底：<video src>（jsonData 缺失或无 mthvideo 时）
    if not play_url:
        m = _VIDEO_TAG_RE.search(html)
        if m:
            play_url = m.group(1).strip()

    if not play_url:
        raise BaijiahaoFetchError(
            "no_video",
            "该链接不含视频，已按图文采集",
        )

    if not title:
        m = _TITLE_TAG_RE.search(html)
        if m:
            title = m.group(1).strip()

    return {
        "title": title,
        "author": "",
        "duration": duration,
        "play_url": play_url,
        "referer": "https://baijiahao.baidu.com/",
    }
