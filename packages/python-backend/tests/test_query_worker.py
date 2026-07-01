"""Tests for QueryWorker — real API v4"""
import pytest
from multi_publish.core.query_worker import (
    QueryWorker, QueryWorkerFactory,
    AuditStatus, AccountOverview, ContentItem,
)


class WeiboWorker(QueryWorker):
    @property
    def platform(self):
        return "weibo"
    async def get_account_overview(self, cookie: str = "", callback=None):
        return AccountOverview(fans_count=100, total_published=50)
    async def get_content_list(self, cookie: str = "", callback=None):
        return [ContentItem(id="1", title="测试")]
    async def check_audit_status(self, publish_id="", content_type="article", proxy=None):
        return AuditStatus(publish_id="pub_123", status="published", msg="通过")
    async def get_topic_list(self):
        return [{"id": "tech", "name": "科技"}]


@pytest.fixture(autouse=True)
def clean_registry():
    QueryWorkerFactory._registry = {}
    yield


def test_factory_create():
    QueryWorkerFactory._registry["weibo"] = WeiboWorker
    worker = QueryWorkerFactory.create("weibo", "test_cookie")
    assert isinstance(worker, WeiboWorker)


def test_factory_unregistered():
    with pytest.raises(ValueError, match="不支持的平台"):
        QueryWorkerFactory.create("nonexistent", "")


@pytest.mark.asyncio
async def test_mock_get_overview():
    w = WeiboWorker("test_cookie")
    overview = await w.get_account_overview()
    assert overview.fans_count == 100
    assert overview.total_published == 50


@pytest.mark.asyncio
async def test_mock_get_content_list():
    w = WeiboWorker("test_cookie")
    items = await w.get_content_list()
    assert len(items) == 1


@pytest.mark.asyncio
async def test_mock_check_audit():
    w = WeiboWorker("test_cookie")
    status = await w.check_audit_status(publish_id="pub_123")
    assert status.status == "published"


@pytest.mark.asyncio
async def test_mock_get_topics():
    w = WeiboWorker("test_cookie")
    topics = await w.get_topic_list()
    assert len(topics) == 1


def test_platform_property():
    w = WeiboWorker("test_cookie")
    assert w.platform == "weibo"