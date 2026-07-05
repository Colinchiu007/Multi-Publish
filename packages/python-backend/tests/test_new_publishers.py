"""Tests for Xiaohongshu, Bilibili publishers — RPA publish, platforms.json, PreCheck."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from multi_publish.publishers.xiaohongshu import XiaoHongShuPublisher
from multi_publish.publishers.bilibili import BilibiliPublisher
from multi_publish.publishers.base import PublisherConfig
from multi_publish.models import PlatformType, PublishPhase, PublishResult
from multi_publish.publishers.platform_registry import PlatformRegistry


class TestXiaoHongShuPublisher:
    def test_publisher_type(self):
        pub = XiaoHongShuPublisher(PublisherConfig(platform=PlatformType.XIAOHONGSHU))
        assert pub.platform == PlatformType.XIAOHONGSHU

    def test_publisher_init(self):
        pub = XiaoHongShuPublisher(PublisherConfig(platform=PlatformType.XIAOHONGSHU))
        assert pub.platform.value == "xiaohongshu"

    def test_default_selectors(self):
        pub = XiaoHongShuPublisher(PublisherConfig(platform=PlatformType.XIAOHONGSHU))
        assert "title_input" in pub.selectors
        assert "publish_button" in pub.selectors
        assert pub.creator_url == "https://creator.xiaohongshu.com/"

    @pytest.mark.asyncio
    async def test_publish_empty_title_error(self):
        pub = XiaoHongShuPublisher(PublisherConfig(platform=PlatformType.XIAOHONGSHU))
        result = await pub.publish("", "")
        assert result.success is False
        assert "标题不能为空" in result.error

    @pytest.mark.asyncio
    async def test_publish_result_structure(self):
        pub = XiaoHongShuPublisher(PublisherConfig(platform=PlatformType.XIAOHONGSHU))
        result = await pub.publish("测试标题", "测试内容")
        assert isinstance(result, PublishResult)
        assert result.platform == "xiaohongshu"

    @pytest.mark.asyncio
    async def test_publish_accepts_media_and_tags(self):
        pub = XiaoHongShuPublisher(PublisherConfig(platform=PlatformType.XIAOHONGSHU))
        result = await pub.publish("测试", "内容", media_paths=["img.jpg"], tags=["标签1"], draft=True)
        assert result is not None

    def test_selectors_cover(self):
        pub = XiaoHongShuPublisher(PublisherConfig(platform=PlatformType.XIAOHONGSHU))
        assert "cover_upload" in pub.selectors
        assert "cover_input" in pub.selectors


class TestBilibiliPublisher:
    def test_publisher_type(self):
        pub = BilibiliPublisher(PublisherConfig(platform=PlatformType.BILIBILI))
        assert pub.platform == PlatformType.BILIBILI

    def test_publisher_init(self):
        pub = BilibiliPublisher(PublisherConfig(platform=PlatformType.BILIBILI))
        assert pub.platform.value == "bilibili"

    def test_default_selectors(self):
        pub = BilibiliPublisher(PublisherConfig(platform=PlatformType.BILIBILI))
        assert "title_input" in pub.selectors
        assert "publish_button" in pub.selectors
        assert pub.creator_url == "https://member.bilibili.com/platform/upload/video"

    @pytest.mark.asyncio
    async def test_publish_empty_title_error(self):
        pub = BilibiliPublisher(PublisherConfig(platform=PlatformType.BILIBILI))
        result = await pub.publish("", "")
        assert result.success is False
        assert "标题不能为空" in result.error

    @pytest.mark.asyncio
    async def test_publish_result_structure(self):
        pub = BilibiliPublisher(PublisherConfig(platform=PlatformType.BILIBILI))
        result = await pub.publish("测试标题", "测试内容")
        assert isinstance(result, PublishResult)
        assert result.platform == "bilibili"

    @pytest.mark.asyncio
    async def test_publish_with_video_and_tags(self):
        pub = BilibiliPublisher(PublisherConfig(platform=PlatformType.BILIBILI))
        result = await pub.publish("测试", "描述", media_paths=["video.mp4"], tags=["游戏"], category="游戏", draft=False)
        assert result is not None

    @pytest.mark.asyncio
    async def test_publish_draft_mode(self):
        pub = BilibiliPublisher(PublisherConfig(platform=PlatformType.BILIBILI))
        result = await pub.publish("测试", "内容", draft=True)
        assert result is not None


class TestPlatformRegistryJSON:
    def test_registry_can_load_json(self):
        import os, json, tempfile
        content = {
            "douyin": "multi_publish.publishers.douyin:DouyinPublisher",
            "xiaohongshu": "multi_publish.publishers.xiaohongshu:XiaoHongShuPublisher",
            "bilibili": "multi_publish.publishers.bilibili:BilibiliPublisher",
        }
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            json.dump(content, f)
            tmp = f.name
        try:
            reg = PlatformRegistry(config_path=tmp)
            reg.load()
            assert reg.is_supported(PlatformType.XIAOHONGSHU)
            assert reg.is_supported(PlatformType.BILIBILI)
            assert reg.count() == 3
        finally:
            os.unlink(tmp)

    def test_registry_fallback_to_default(self):
        reg = PlatformRegistry(config_path="/nonexistent/path.json")
        reg.load()
        assert reg.count() >= 2

    def test_registry_default_has_xiaohongshu_bilibili(self):
        reg = PlatformRegistry(config_path="/nonexistent/path.json")
        reg.load()
        platforms = reg.list_platforms()
        assert "xiaohongshu" in platforms
        assert "bilibili" in platforms


class TestPreCheckControl:
    def test_publisher_manager_has_precheck_flag(self):
        from multi_publish.core.publisher_manager import PublisherManager
        mgr = PublisherManager()
        assert hasattr(mgr, "precheck_enabled")
        assert mgr.precheck_enabled is False

    def test_publisher_manager_get_precheck_status(self):
        from multi_publish.core.publisher_manager import PublisherManager
        mgr = PublisherManager()
        status = mgr.get_precheck_status()
        assert status["enabled"] is False
        assert status["available"] is False

    def test_publisher_manager_enable_disable(self):
        from multi_publish.core.publisher_manager import PublisherManager
        mgr = PublisherManager()
        mgr.enable_precheck()
        assert mgr.precheck_enabled is True
        status = mgr.get_precheck_status()
        assert status["enabled"] is True
        mgr.disable_precheck()
        assert mgr.precheck_enabled is False
