"""Tests for publisher_manager.py — PublisherManager class."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from multi_publish.core.publisher_manager import PublisherManager
from multi_publish.models import PlatformType


@pytest.fixture
def manager():
    return PublisherManager(data_dir="/tmp/test_data")

@pytest.fixture
def mock_registry():
    with patch("multi_publish.core.publisher_manager.registry") as mock:
        mock.is_supported.return_value = True
        mock.list_as_enum.return_value = [PlatformType.BILIBILI]
        mock.list_platforms.return_value = ["bilibili"]
        yield mock


class TestInit:
    def test_default_initialization(self):
        pm = PublisherManager()
        assert pm.data_dir == "./data"
        assert pm._publishers == {}
        assert pm.precheck_enabled is False
        assert pm._precheck_engine is None

    def test_custom_data_dir(self):
        pm = PublisherManager(data_dir="/custom/path")
        assert pm.data_dir == "/custom/path"


class TestPrecheck:
    def test_disable_precheck(self):
        pm = PublisherManager()
        pm.precheck_enabled = True
        pm._precheck_engine = MagicMock()
        pm.disable_precheck()
        assert pm.precheck_enabled is False
        assert pm._precheck_engine is None

    def test_get_precheck_status_disabled(self):
        pm = PublisherManager()
        status = pm.get_precheck_status()
        assert status["enabled"] is False
        assert status["available"] is False
        assert "未启用" in status["message"]

    def test_get_precheck_status_enabled(self):
        pm = PublisherManager()
        pm._precheck_engine = MagicMock()
        pm.precheck_enabled = True
        status = pm.get_precheck_status()
        assert status["enabled"] is True
        assert status["available"] is False
        assert "TikHub" in status["message"]


class TestRegistryDelegation:
    def test_is_supported(self, manager, mock_registry):
        result = manager.is_supported(PlatformType.BILIBILI)
        assert result is True
        mock_registry.is_supported.assert_called_once_with(PlatformType.BILIBILI)

    def test_get_available_platforms(self, manager, mock_registry):
        result = manager.get_available_platforms()
        assert result == [PlatformType.BILIBILI]
        mock_registry.list_as_enum.assert_called_once()

    def test_refresh_platforms(self, manager, mock_registry):
        manager.refresh_platforms()
        mock_registry.reload.assert_called_once()
        mock_registry.scan_publishers_package.assert_called_once()


class TestGetOrCreate:
    @pytest.mark.asyncio
    @patch("multi_publish.core.publisher_manager.registry")

    @pytest.mark.asyncio
    @patch("multi_publish.core.publisher_manager.PublisherConfig")
    async def test_unsupported_platform_raises(self, mock_config, mock_registry, manager):
        mock_registry.is_supported.return_value = False
        with pytest.raises(ValueError, match="不支持的平台"):
            await manager.get_or_create(PlatformType.BILIBILI)

    @patch("multi_publish.core.publisher_manager.registry")
    @pytest.mark.asyncio
    @patch("multi_publish.core.publisher_manager.PublisherConfig")
    async def test_caches_publisher_instance(self, mock_config, mock_registry, manager):
        mock_registry.is_supported.return_value = True
        mock_cls = MagicMock()
        mock_instance = AsyncMock()
        mock_cls.return_value = mock_instance
        mock_registry.get.return_value = mock_cls

        p1 = await manager.get_or_create(PlatformType.BILIBILI)
        p2 = await manager.get_or_create(PlatformType.BILIBILI)
        assert p1 is p2  # Same instance from cache
        assert mock_cls.call_count == 1  # Created only once


class TestCloseAll:
    @pytest.mark.asyncio
    @patch("multi_publish.core.publisher_manager.registry")
    async def test_close_all_clears_publishers(self, mock_registry, manager):
        mock_pub = AsyncMock()
        manager._publishers["test_key"] = mock_pub
        await manager.close_all()
        mock_pub.close.assert_awaited_once()
        assert manager._publishers == {}
