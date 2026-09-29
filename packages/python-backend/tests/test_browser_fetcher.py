"""browser_fetcher 单元测试 — 抖音浏览器降级通道（2026-09-19）。

覆盖：视频 ID 提取（多 URL 形态）、短链解析、_dig 嵌套取值、错误分类。
不测真实网络（Playwright 集成由 collect_video 全链路验证）。
"""

import pytest

from multi_publish.aggregation.browser_fetcher import (
    BrowserFetchError,
    _dig,
    extract_video_id,
)


class TestExtractVideoId:
    def test_video_url(self):
        assert extract_video_id("https://www.douyin.com/video/7686432847778982833", "douyin") == "7686432847778982833"

    def test_share_video_url(self):
        assert extract_video_id("https://www.iesdouyin.com/share/video/7686432847778982833/?region=CN", "douyin") == "7686432847778982833"

    def test_modal_id_url(self):
        assert extract_video_id("https://www.douyin.com/?modal_id=7686432847778982833", "douyin") == "7686432847778982833"

    def test_short_link_no_id(self):
        # 短链（v.douyin.com/xxx）本身不含数字 ID，需先经 resolve_short_link
        assert extract_video_id("https://v.douyin.com/vknKdeN_naU/", "douyin") is None

    def test_unknown_platform(self):
        assert extract_video_id("https://www.douyin.com/video/123", "kuaishou") is None


class TestDig:
    def test_nested_path(self):
        data = {"aweme_detail": {"video": {"play_addr": {"url_list": ["https://a", "https://b"]}}}}
        urls = _dig(data, ("aweme_detail", "video", "play_addr", "url_list"))
        assert urls[0] == "https://a"

    def test_missing_path_returns_none(self):
        assert _dig({}, ("a", "b", "c")) is None

    def test_non_dict_returns_none(self):
        assert _dig([1, 2], ("a",)) is None


class TestBrowserFetchError:
    def test_error_structure(self):
        e = BrowserFetchError("no_browser", "playwright 未安装")
        assert e.code == "no_browser"
        assert e.message == "playwright 未安装"


# ── 小红书浏览器降级通道（2026-09-29，collect-video-platforms） ──────────────

class TestXiaohongshuConfig:
    def test_config_exists(self):
        from multi_publish.aggregation.browser_fetcher import _BROWSER_FETCH_CONFIGS
        cfg = _BROWSER_FETCH_CONFIGS["xiaohongshu"]
        # 直接导航解析后的原始 URL（xsec_token 必须保留，不能从 ID 重建页面地址）
        assert cfg.get("use_resolved_url") is True
        assert "api/sns/web/v1/feed" in cfg["api_pattern"]
        assert cfg["referer"] == "https://www.xiaohongshu.com/"

    def test_extract_video_id_xhs(self):
        assert extract_video_id(
            "https://www.xiaohongshu.com/discovery/item/674051740000000007027a15?xsec_token=CBgeL8&xsec_source=app_share",
            "xiaohongshu") == "674051740000000007027a15"
        assert extract_video_id("https://www.xiaohongshu.com/explore/6411cf99000000001300b6d9", "xiaohongshu") == "6411cf99000000001300b6d9"
        # 短链（xhslink.com/xxx）本身不含笔记 ID，需先经 resolve_short_link
        assert extract_video_id("https://xhslink.com/xyz", "xiaohongshu") is None


def _xhs_feed_payload(stream=None):
    """构造 feed API 响应（data.items[0].note_card.video.media.stream）。"""
    if stream is None:
        stream = {
            "h264": [{"master_url": "https://sns-video-h264.xhscdn.com/1.mp4", "height": 720, "duration": 61000}],
            "h265": [{"master_url": "https://sns-video-h265.xhscdn.com/2.mp4", "height": 1080, "duration": 61000}],
        }
    return {"data": {"items": [{"note_card": {
        "display_title": "小红书视频标题",
        "user": {"nickname": "小红书作者"},
        "video": {"media": {"stream": stream}},
    }}]}}


class TestParseXhsPayload:
    def test_feed_response_picks_highest_resolution(self):
        """feed API 响应：多编码分档按分辨率优先取 master_url，时长 ms→s。"""
        from multi_publish.aggregation.browser_fetcher import _parse_xhs_payload
        import json as _json
        meta = _parse_xhs_payload(_json.dumps(_xhs_feed_payload()), "674051740000000007027a15")
        assert meta["play_url"] == "https://sns-video-h265.xhscdn.com/2.mp4"  # 1080p 优先于 720p
        assert meta["duration"] == 61.0
        assert meta["title"] == "小红书视频标题"
        assert meta["author"] == "小红书作者"
        assert meta["referer"] == "https://www.xiaohongshu.com/"

    def test_feed_response_backup_urls_fallback(self):
        """master_url 缺失 → backupUrls 兜底。"""
        from multi_publish.aggregation.browser_fetcher import _parse_xhs_payload
        import json as _json
        stream = {"h264": [{"backupUrls": ["https://backup.xhscdn.com/b.mp4"], "height": 540, "duration": 30000}]}
        meta = _parse_xhs_payload(_json.dumps(_xhs_feed_payload(stream)), "id1")
        assert meta["play_url"] == "https://backup.xhscdn.com/b.mp4"

    def test_initial_state_fallback(self):
        """API 未捕获 → 读水合后 __INITIAL_STATE__（note.noteDetailMap.{id}.note 同一字段路径）。"""
        from multi_publish.aggregation.browser_fetcher import _parse_xhs_payload
        import json as _json
        state = {"note": {"noteDetailMap": {"6411cf99000000001300b6d9": {"note": {
            "title": "状态页标题",
            "user": {"nickname": "状态作者"},
            "video": {"media": {"stream": {
                "h264": [{"master_url": "https://state.xhscdn.com/s.mp4", "height": 720, "duration": 45000}],
            }}},
        }}}}}
        meta = _parse_xhs_payload(_json.dumps(state), "6411cf99000000001300b6d9", from_state=True)
        assert meta["play_url"] == "https://state.xhscdn.com/s.mp4"
        assert meta["title"] == "状态页标题"
        assert meta["duration"] == 45.0

    def test_no_video_stream_raises(self):
        """笔记无视频流（纯图文笔记）→ fetch_failed。"""
        from multi_publish.aggregation.browser_fetcher import _parse_xhs_payload
        import json as _json
        with pytest.raises(BrowserFetchError) as exc_info:
            _parse_xhs_payload(_json.dumps(_xhs_feed_payload(stream={})), "id1")
        assert exc_info.value.code == "fetch_failed"

    def test_invalid_json_raises(self):
        from multi_publish.aggregation.browser_fetcher import _parse_xhs_payload
        with pytest.raises(BrowserFetchError):
            _parse_xhs_payload("not-json", "id1")


class TestDigIntIndex:
    def test_list_index_path(self):
        assert _dig({"data": {"items": [{"a": 1}, {"a": 2}]}}, ("data", "items", 1, "a")) == 2

    def test_list_index_out_of_range(self):
        assert _dig({"data": {"items": [{"a": 1}]}}, ("data", "items", 5, "a")) is None

    def test_int_index_on_non_list(self):
        assert _dig({"data": {"items": "not-list"}}, ("data", "items", 0, "a")) is None
