"""baijiahao_fetcher 单元测试 — 百家号纯 HTTP 视频采集通道（2026-09-29）。

覆盖：jsonData mthvideo 解析（结构化主路径）、<video> 标签兜底、纯文字文章 no_video、
haokan.baidu.com 重定向、网络异常分类。
不测真实网络（HTTP GET 经 _http_get 接缝 monkeypatch）。

页面结构依据（2026-09-29 双重实测，见 01-docs/RESEARCH-VIDEO-COLLECT-OPEN-SOURCE-2026-09-29.md §5.2）：
- window.jsonData = {"bsData": {"superlanding": [{"itemData": {"header": 标题, "sections": [{"type": "mthvideo", "content": {...}}]}}]}};window.firstScreenTime = ...
- <video src="http(s)://vd3.bdstatic.com/mda-xxx/...mp4">
"""

import json

import pytest

from multi_publish.aggregation import baijiahao_fetcher
from multi_publish.aggregation.baijiahao_fetcher import (
    BaijiahaoFetchError,
    fetch_baijiahao_video,
)

_MP4_HTTPS = "https://vd3.bdstatic.com/mda-test/360p/h264/1790488350317613594/mda-test.mp4"
_MP4_HTTP = "http://vd3.bdstatic.com/mda-test/360p/h264/1790488350317613594/mda-test.mp4"


def _make_json_data(title="测试文章标题", sections=None):
    if sections is None:
        sections = [{
            "type": "mthvideo",
            "content": {
                "base": {"src": _MP4_HTTP, "mediaId": "mda-test", "long": "01:40"},
                "https": {"file": _MP4_HTTPS, "cover": "https://pic.rmb.bdstatic.com/bjh/news/cover.jpeg"},
            },
        }]
    return {"bsData": {"superlanding": [{"itemType": "article", "itemData": {"header": title, "sections": sections}}]}}


def _make_html(json_data=None, video_tag="", title="测试文章标题"):
    """构造与真实页面同形的 HTML（jsonData 后跟 ;window.firstScreenTime 再 </script>）。"""
    jd = json.dumps(json_data, ensure_ascii=False) if json_data is not None else ""
    script = f"window.jsonData = {jd};window.firstScreenTime = Date.now();" if jd else ""
    return (
        "<!DOCTYPE html><html><head><title>" + title + "</title></head><body>"
        + video_tag
        + "<script>" + script + "</script></body></html>"
    )


def _patch_get(monkeypatch, final_url, html):
    monkeypatch.setattr(baijiahao_fetcher, "_http_get", lambda url, timeout=30: (final_url, html))


class TestFetchBaijiahaoVideo:
    def test_json_data_mthvideo(self, monkeypatch):
        """结构化主路径：jsonData mthvideo sections → https 直链 + 时长 + 标题。"""
        _patch_get(monkeypatch, "https://baijiahao.baidu.com/s?id=1877446299628255783",
                   _make_html(_make_json_data()))
        meta = fetch_baijiahao_video("https://baijiahao.baidu.com/s?id=1877446299628255783")
        assert meta["play_url"] == _MP4_HTTPS
        assert meta["title"] == "测试文章标题"
        assert meta["duration"] == 100.0  # "01:40" → 100 秒
        assert meta["referer"].startswith("https://baijiahao.baidu.com/")

    def test_json_data_https_missing_falls_back_to_base_src(self, monkeypatch):
        """https.file 缺失 → 回退 base.src（http 直链）。"""
        sections = [{
            "type": "mthvideo",
            "content": {"base": {"src": _MP4_HTTP, "mediaId": "mda-test", "long": "00:30"}},
        }]
        _patch_get(monkeypatch, "https://baijiahao.baidu.com/s?id=1", _make_html(_make_json_data(sections=sections)))
        meta = fetch_baijiahao_video("https://baijiahao.baidu.com/s?id=1")
        assert meta["play_url"] == _MP4_HTTP
        assert meta["duration"] == 30.0

    def test_duration_hms_format(self, monkeypatch):
        """时长支持 HH:MM:SS 形态。"""
        sections = [{
            "type": "mthvideo",
            "content": {"base": {"src": _MP4_HTTP, "long": "01:02:03"}},
        }]
        _patch_get(monkeypatch, "https://baijiahao.baidu.com/s?id=1", _make_html(_make_json_data(sections=sections)))
        meta = fetch_baijiahao_video("https://baijiahao.baidu.com/s?id=1")
        assert meta["duration"] == 3723.0

    def test_video_tag_fallback(self, monkeypatch):
        """jsonData 缺失/无 mthvideo → <video src> 标签兜底（标题取 <title>，时长未知为 0）。"""
        html = _make_html(json_data=None, video_tag=f'<video class="_2sxee" preload="none" src="{_MP4_HTTP}"></video>')
        _patch_get(monkeypatch, "https://baijiahao.baidu.com/s?id=1", html)
        meta = fetch_baijiahao_video("https://baijiahao.baidu.com/s?id=1")
        assert meta["play_url"] == _MP4_HTTP
        assert meta["title"] == "测试文章标题"
        assert meta["duration"] == 0.0

    def test_plain_text_article_no_video(self, monkeypatch):
        """纯文字文章（sections 无 mthvideo、无 video 标签）→ no_video 错误。"""
        sections = [{"type": "text", "content": {"base": {"text": "正文内容"}}}]
        _patch_get(monkeypatch, "https://baijiahao.baidu.com/s?id=1", _make_html(_make_json_data(sections=sections)))
        with pytest.raises(BaijiahaoFetchError) as exc_info:
            fetch_baijiahao_video("https://baijiahao.baidu.com/s?id=1")
        assert exc_info.value.code == "no_video"

    def test_haokan_redirect_rejected(self, monkeypatch):
        """纯视频百家号链接 302 到 haokan.baidu.com（好看视频）→ 专属错误，不误报 no_video。"""
        _patch_get(monkeypatch, "https://haokan.baidu.com/v?pd=1", _make_html(_make_json_data()))
        with pytest.raises(BaijiahaoFetchError) as exc_info:
            fetch_baijiahao_video("https://baijiahao.baidu.com/s?id=1877582293125962418")
        assert exc_info.value.code == "haokan"
        assert "好看视频" in exc_info.value.message

    def test_network_error_fetch_failed(self, monkeypatch):
        """HTTP GET 异常 → fetch_failed（含原始异常信息）。"""
        def boom(url, timeout=30):
            raise OSError("connection reset")
        monkeypatch.setattr(baijiahao_fetcher, "_http_get", boom)
        with pytest.raises(BaijiahaoFetchError) as exc_info:
            fetch_baijiahao_video("https://baijiahao.baidu.com/s?id=1")
        assert exc_info.value.code == "fetch_failed"

    def test_mbd_domain_accepted(self, monkeypatch):
        """mbd.baidu.com 移动分享页同样可解析（跟随重定向到最终页）。"""
        _patch_get(monkeypatch, "https://baijiahao.baidu.com/s?id=1", _make_html(_make_json_data()))
        meta = fetch_baijiahao_video("https://mbd.baidu.com/newspage/data/xxx")
        assert meta["play_url"] == _MP4_HTTPS


class TestExtractJsonData:
    def test_brace_balanced_extraction(self):
        """花括号配平提取：JSON 内含嵌套大括号与字符串内花括号均正确终止。"""
        data = {"bsData": {"superlanding": [{"itemData": {"header": "含}花括号{的标题"}}]}}
        html = "xx window.jsonData = " + json.dumps(data, ensure_ascii=False) + ";window.firstScreenTime = 1;"
        parsed = baijiahao_fetcher._extract_json_data(html)
        assert parsed == data

    def test_missing_returns_none(self):
        assert baijiahao_fetcher._extract_json_data("<html>无 jsonData</html>") is None

    def test_invalid_json_returns_none(self):
        assert baijiahao_fetcher._extract_json_data("window.jsonData = {不是JSON;window.x = 1;") is None


class TestParseDuration:
    def test_mmss(self):
        assert baijiahao_fetcher._parse_duration("01:40") == 100.0

    def test_hhmmss(self):
        assert baijiahao_fetcher._parse_duration("01:02:03") == 3723.0

    def test_invalid_returns_zero(self):
        assert baijiahao_fetcher._parse_duration("") == 0.0
        assert baijiahao_fetcher._parse_duration("abc") == 0.0
        assert baijiahao_fetcher._parse_duration(None) == 0.0
