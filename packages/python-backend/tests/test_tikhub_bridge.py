"""Tests for TikHubBridge stub."""

import pytest

from multi_publish.tikhub_bridge import TikHubBridge, TikHubBridgeError


class TestTikHubBridgeError:
    def test_is_exception(self):
        assert issubclass(TikHubBridgeError, Exception)


class TestTikHubBridge:
    def test_default_init(self):
        b = TikHubBridge()
        assert b.api_key == ""
        assert b._client is None

    def test_init_with_key(self):
        b = TikHubBridge(api_key="sk-xxx")
        assert b.api_key == "sk-xxx"

    def test_available_always_false(self):
        assert TikHubBridge().available is False

    def test_supported_platforms_empty(self):
        assert TikHubBridge().supported_platforms == []

    def test_is_platform_supported_false(self):
        assert TikHubBridge().is_platform_supported("weibo") is False

    def test_get_resource_raises(self):
        with pytest.raises(TikHubBridgeError, match="TikHub"):
            TikHubBridge().get_resource("douyin")

    @pytest.mark.asyncio
    async def test_async_get_resource_raises(self):
        with pytest.raises(TikHubBridgeError, match="TikHub"):
            await TikHubBridge().async_get_resource("xiaohongshu")
