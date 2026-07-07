"""Tests for core data models."""

import pytest
from datetime import datetime
from multi_publish.models import (
    PlatformCategory, PlatformType, TaskStatus, PublishMode, PublishPhase,
    AuthData, PublishProgress, PublishResult, PublishTask, ProxyConfig,
    PlatformAccount, PLATFORM_META,
)


class TestPlatformCategory:
    def test_values(self):
        assert PlatformCategory.VIDEO.value == "video"
        assert PlatformCategory.IMAGE_TEXT.value == "image_text"
        assert PlatformCategory.MIXED.value == "mixed"

class TestPlatformType:
    def test_count(self):
        assert len(PlatformType) == 12

    def test_values(self):
        assert PlatformType.DOUYIN.value == "douyin"
        assert PlatformType.XIAOHONGSHU.value == "xiaohongshu"
        assert PlatformType.BILIBILI.value == "bilibili"

class TestTaskStatus:
    def test_values(self):
        assert TaskStatus.PENDING.value == "pending"
        assert TaskStatus.SUCCESS.value == "success"
        assert TaskStatus.FAILED.value == "failed"

class TestPublishMode:
    def test_values(self):
        assert PublishMode.PUBLISH.value == "publish"
        assert PublishMode.DRAFT.value == "draft"

class TestPublishPhase:
    def test_values(self):
        assert PublishPhase.DONE.value == "done"
        assert PublishPhase.FAILED.value == "failed"

class TestPLATFORM_META:
    def test_all_platforms_covered(self):
        for pt in PlatformType:
            assert pt in PLATFORM_META, f"Missing meta for {pt}"
        assert len(PLATFORM_META) == 12

    def test_douyin_has_dual_mode(self):
        dy = PLATFORM_META[PlatformType.DOUYIN]
        assert dy["tech"] == "api_rpa"
        assert dy["category"] == "video"

class TestAuthData:
    def test_defaults(self):
        a = AuthData()
        assert a.cookies == []
        assert a.local_storage == {}
        assert a.is_empty()

    def test_to_dict_roundtrip(self):
        a = AuthData(cookies=[{"name": "sid", "value": "abc"}], local_storage={"key": "val"})
        d = a.to_dict()
        a2 = AuthData.from_dict(d)
        assert a2.cookies == a.cookies
        assert a2.local_storage == a.local_storage

class TestPublishResult:
    def test_success_defaults(self):
        r = PublishResult(success=True, platform="douyin")
        assert r.success
        assert r.platform == "douyin"
        assert r.url is None
        assert r.error is None

    def test_failure(self):
        r = PublishResult(success=False, platform="bilibili", error="upload failed")
        assert not r.success
        assert r.error == "upload failed"

class TestPublishTask:
    def test_defaults(self):
        t = PublishTask(id="t1", platforms=[PlatformType.DOUYIN], content="", title="test")
        assert t.status == TaskStatus.PENDING
        assert t.retry_count == 0

    def test_is_finished(self):
        for s in (TaskStatus.SUCCESS, TaskStatus.FAILED, TaskStatus.CANCELLED):
            t = PublishTask(id="t1", platforms=[PlatformType.DOUYIN], content="", title="t", status=s)
            assert t.is_finished()
        t2 = PublishTask(id="t2", platforms=[PlatformType.DOUYIN], content="", title="t", status=TaskStatus.RUNNING)
        assert not t2.is_finished()

    def test_to_dict(self):
        t = PublishTask(id="t1", platforms=[PlatformType.DOUYIN], content="desc", title="My Video")
        d = t.to_dict()
        assert d["id"] == "t1"
        assert d["platforms"] == ["douyin"]

class TestProxyConfig:
    def test_defaults(self):
        p = ProxyConfig(server="socks5://127.0.0.1:1080")
        assert p.server == "socks5://127.0.0.1:1080"
        assert p.username is None

    def test_to_dict_roundtrip(self):
        p = ProxyConfig(server="http://proxy:8080", username="u", password="p")
        d = p.to_dict()
        p2 = ProxyConfig.from_dict(d)
        assert p2.server == p.server
        assert p2.username == p.username

class TestPlatformAccount:
    def test_defaults(self):
        a = PlatformAccount(id="acc1", platform=PlatformType.DOUYIN, name="My Account", config={})
        assert a.is_active
        assert a.proxy is None
        assert a.last_validated is None

    def test_custom_proxy(self):
        p = ProxyConfig(server="socks5://127.0.0.1:1080")
        a = PlatformAccount(id="acc2", platform=PlatformType.BILIBILI, name="B", config={}, proxy=p)
        assert a.proxy.server == "socks5://127.0.0.1:1080"




