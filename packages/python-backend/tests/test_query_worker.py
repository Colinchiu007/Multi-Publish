"""Tests for QueryWorker — real API v4"""

import pytest

from multi_publish.core.query_worker import (
    AccountOverview,
    AuditStatus,
    ContentItem,
    QueryWorker,
    QueryWorkerFactory,
)


class WeiboWorker(QueryWorker):
    @property
    def platform(self):
        return "weibo"

    # --- 实现 QueryWorker 抽象方法 ---
    async def get_user_info(self) -> dict:
        return {"code": 0, "nickName": "测试用户", "fansCount": 100}

    async def check_account_alive(self) -> int:
        return 0  # 有效

    async def check_audit_status(self, publish_id="", content_type="article", proxy=None):
        return AuditStatus(publish_id="pub_123", status="published", msg="通过")

    async def delete_content(self, doc_id="", publish_id="", proxy=None):
        return {"code": 0, "msg": "删除成功"}

    async def search_topic(self, keyword="", proxy=None, limit=10):
        return [{"id": "tech", "name": "科技", "hot": 100}]

    # --- 向后兼容的旧方法别名(供旧测试使用) ---
    async def get_account_overview(self, cookie: str = "", callback=None):
        info = await self.get_user_info()
        return AccountOverview(fans_count=info.get("fansCount", 0), total_published=50)

    async def get_content_list(self, cookie: str = "", callback=None):
        return [ContentItem(id="1", title="测试")]

    async def get_topic_list(self):
        return await self.search_topic()


@pytest.fixture(autouse=True)
def clean_registry():
    QueryWorkerFactory._registry = {}
    yield


def test_factory_create():
    QueryWorkerFactory._registry["weibo"] = WeiboWorker
    worker = QueryWorkerFactory.create("weibo", "test_cookie")
    assert isinstance(worker, WeiboWorker)
    assert worker.platform == "weibo"


def test_factory_unregistered():
    with pytest.raises(ValueError, match="不支持的平台"):
        QueryWorkerFactory.create("nonexistent", "")


@pytest.mark.asyncio
async def test_mock_get_overview():
    w = WeiboWorker("test_cookie")
    overview = await w.get_account_overview()
    assert overview.fans_count == 100
    assert overview.total_published == 50
    assert isinstance(overview, AccountOverview)


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
async def test_mock_search_topic():
    w = WeiboWorker("test_cookie")
    topics = await w.search_topic(keyword="科技")
    assert len(topics) >= 1
    assert topics[0]["id"] == "tech"


@pytest.mark.asyncio
async def test_mock_new_interface():
    """测试新的 QueryWorker 抽象接口"""
    w = WeiboWorker("test_cookie")
    user_info = await w.get_user_info()
    assert user_info["code"] == 0
    assert user_info["nickName"] == "测试用户"

    alive = await w.check_account_alive()
    assert alive == 0

    result = await w.delete_content(doc_id="doc_123")
    assert result["code"] == 0


def test_platform_property():
    w = WeiboWorker("test_cookie")
    assert w.platform == "weibo"


@pytest.mark.asyncio
async def test_supports_check():
    QueryWorkerFactory._registry["weibo"] = WeiboWorker
    assert QueryWorkerFactory.supports("weibo") is True
    assert QueryWorkerFactory.supports("nonexistent") is False
    platforms = QueryWorkerFactory.list_supported()
    assert "weibo" in platforms
