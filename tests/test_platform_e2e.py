"""P0-4: Platform E2E tests — platform config & models validation"""
import pytest
from dataclasses import asdict
from multi_publish.models import PlatformType, PublishResult, PublishTask, TaskStatus


class TestPlatformType:
    """Validate PlatformType enum covers expected platforms"""

    EXPECTED_MEMBERS = ["WECHAT_MP", "ZHIHU", "WEIBO", "DOUYIN", "XIAOHONGSHU",
                        "SHIPINHAO", "KUAISHOU", "TOUTIAO", "YOUTUBE", "TIKTOK",
                        "BILIBILI", "BAJIAHAO"]

    def test_all_expected_platforms_exist(self):
        for name in self.EXPECTED_MEMBERS:
            assert hasattr(PlatformType, name), f"Missing platform: {name}"

    def test_no_extra_platforms(self):
        for pt in PlatformType:
            assert pt.name in self.EXPECTED_MEMBERS, f"Unexpected: {pt.name}"

    def test_platform_count(self):
        assert len(PlatformType) == 12

    def test_zhihu_exists(self):
        assert PlatformType.ZHIHU.value == "zhihu"

    def test_wechat_mp_exists(self):
        assert PlatformType.WECHAT_MP.value == "wechat_mp"

    def test_shipinhao_exists(self):
        assert PlatformType.SHIPINHAO.value == "shipinhao"


class TestPublishResult:
    def test_success_result(self):
        r = PublishResult(success=True, platform="weibo", url="https://weibo.com/123")
        assert r.success is True
        assert r.platform == "weibo"

    def test_failure_result(self):
        r = PublishResult(success=False, platform="bilibili", error="Upload failed")
        assert r.success is False
        assert r.error == "Upload failed"

    def test_asdict(self):
        r = PublishResult(success=True, platform="zhihu", url="https://zhihu.com/article/1")
        d = asdict(r)
        assert d["success"] is True
        assert d["platform"] == "zhihu"

    def test_default_error_is_none(self):
        r = PublishResult(success=True, platform="weibo")
        assert r.error is None


class TestPublishTask:
    def test_default_status(self):
        t = PublishTask(id="t1", title="Test", content="Content", platforms=[PlatformType.WEIBO])
        assert t.status == TaskStatus.PENDING
        assert t.retry_count == 0

    def test_is_finished(self):
        t = PublishTask(id="t1", title="T", content="C", platforms=[])
        assert t.is_finished() is False
        t.status = TaskStatus.SUCCESS
        assert t.is_finished() is True