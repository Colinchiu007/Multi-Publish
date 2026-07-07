"""Tests for PlatformRegistry."""

import json, os, tempfile
import pytest
from multi_publish.publishers.platform_registry import PlatformRegistry
from multi_publish.models import PlatformType


class TestPlatformRegistry:
    def test_default_registry_has_platforms(self):
        reg = PlatformRegistry()
        reg.load()
        assert reg.count() >= 4

    def test_is_supported(self):
        reg = PlatformRegistry()
        assert reg.is_supported(PlatformType.DOUYIN) is True

    def test_load_from_json(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            cfg = os.path.join(tmpdir, "p.json")
            with open(cfg, "w") as f:
                json.dump({"tp": "multi_publish.publishers.base:BasePublisher"}, f)
            reg = PlatformRegistry(config_path=cfg)
            reg.load()
            assert "tp" in reg.list_platforms()

    def test_register_and_unregister(self):
        reg = PlatformRegistry()
        n = reg.count()
        reg.register("mp", "multi_publish.publishers.base:BasePublisher")
        assert reg.count() == n + 1
        reg.unregister("mp")
        assert reg.count() == n

    def test_get_returns_publisher_class(self):
        reg = PlatformRegistry()
        cls = reg.get(PlatformType.DOUYIN)
        from multi_publish.publishers.base import BasePublisher
        assert issubclass(cls, BasePublisher)
        assert cls is not BasePublisher

    def test_get_unknown_raises(self):
        reg = PlatformRegistry()
        with pytest.raises(ValueError):
            reg.get_by_key("nonexistent")

    def test_scan_discovers_nothing_when_all_known(self):
        reg = PlatformRegistry()
        reg._loaded = True
        reg._entries = {}
        d = reg.scan_publishers_package()
        assert isinstance(d, list)
