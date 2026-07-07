"""Tests for PlatformRegistry."""

import pytest

from multi_publish.models import PlatformType
from multi_publish.publishers.platform_registry import PlatformRegistry


@pytest.fixture
def reg():
    r = PlatformRegistry()
    r._entries = {"douyin": "multi_publish.models:PlatformType", "wechat_mp": "multi_publish.models:TaskStatus"}
    r._loaded = True
    return r


class TestRegistryBasic:
    def test_init_not_loaded(self):
        assert PlatformRegistry()._loaded is False

    def test_load_defaults(self):
        r = PlatformRegistry()
        r.load()
        assert "douyin" in r._entries


class TestRegistryOps:
    def test_register(self, reg):
        reg.register("bilibili", "p:B")
        assert reg._entries["bilibili"] == "p:B"

    def test_unregister(self, reg):
        reg.unregister("douyin")
        assert "douyin" not in reg._entries

    def test_is_supported(self, reg):
        assert reg.is_supported(PlatformType.DOUYIN)
        assert not reg.is_supported(PlatformType.BILIBILI)

    def test_list_platforms(self, reg):
        p = reg.list_platforms()
        assert "douyin" in p and len(p) == 2

    def test_count(self, reg):
        assert reg.count() == 2

    def test_to_dict(self, reg):
        assert len(reg.to_dict()) == 2


class TestRegistryGet:
    def test_get_raises_for_unknown(self, reg):
        with pytest.raises(ValueError):
            reg.get(PlatformType.BILIBILI)

    def test_get_returns_class(self, reg):
        assert reg.get(PlatformType.DOUYIN) is not None

    def test_get_caches(self, reg):
        assert reg.get(PlatformType.DOUYIN) is reg.get(PlatformType.DOUYIN)


class TestImportClass:
    def test_success(self):
        from multi_publish.models import PlatformType

        cls = PlatformRegistry._import_class("multi_publish.models:PlatformType")
        assert cls is PlatformType

    def test_failure(self):
        with pytest.raises((ImportError, AttributeError)):
            PlatformRegistry._import_class("nonexistent:Class")
