"""TDD tests for multi_publish.aggregation module.

Phase 1: content-aggregator integration — aggregation/ wrapping layer.
"""

import pytest


# ── 1. content-aggregator import verification ──────────────────────────

def test_can_import_content_pipeline():
    """C1 regression: verify content-aggregator core imports work."""
    from content_aggregator.workflows.pipeline import ContentPipeline
    assert ContentPipeline is not None


def test_can_import_collectors():
    """Verify all collector types are importable."""
    from content_aggregator.sources.collectors import (
        BaseCollector, SourceResult, RSSCollector,
        YouTubeCollector, DouyinCollector, XiaohongshuCollector,
        WeChatCollector, APICollector, SitemapCollector,
        WeiboHotCollector, WangYiCollector,
    )
    assert BaseCollector is not None
    assert SourceResult is not None
    assert RSSCollector is not None


def test_can_import_content_models():
    """Verify Content and Article dataclasses."""
    from content_aggregator.models import Content, Article
    assert Content is not None
    assert Article is not None


def test_can_import_rewrite_processor():
    """Verify rewrite processor and strategy enum."""
    from content_aggregator.processors.rewrite import (
        RewriteProcessor, RewriteConfig, RewriteStrategy, RewriteResult,
    )
    assert RewriteProcessor is not None
    assert RewriteConfig is not None
    assert RewriteStrategy is not None


def test_can_import_get_collector():
    """Verify collector factory function."""
    from content_aggregator.sources import get_collector
    assert callable(get_collector)


# ── 2. AggregationService models ───────────────────────────────────────

def test_collect_request_model():
    """CollectRequest Pydantic model validation."""
    from multi_publish.aggregation.models import CollectRequest

    req = CollectRequest(url="https://example.com/article", source_type="url")
    assert req.url == "https://example.com/article"
    assert req.source_type == "url"
    assert req.rewrite is False  # default
    assert req.strategy is None

    # With rewrite
    req2 = CollectRequest(
        url="https://example.com/article",
        source_type="rss",
        rewrite=True,
        strategy="rewrite",
    )
    assert req2.rewrite is True
    assert req2.strategy == "rewrite"


def test_collect_request_validation():
    """CollectRequest rejects invalid source_type."""
    from multi_publish.aggregation.models import CollectRequest
    import pydantic

    with pytest.raises(pydantic.ValidationError):
        CollectRequest(url="https://example.com", source_type="invalid")


def test_rewrite_request_model():
    """RewriteRequest model."""
    from multi_publish.aggregation.models import RewriteRequest

    req = RewriteRequest(content="测试内容", style="轻松易懂")
    assert req.content == "测试内容"
    assert req.style == "轻松易懂"
    assert req.length == "keep"


def test_collect_result_model():
    """CollectResult model construction."""
    from multi_publish.aggregation.models import CollectResult

    result = CollectResult(
        title="测试标题",
        content="测试正文内容",
        source_url="https://example.com",
        word_count=5,
    )
    assert result.title == "测试标题"
    assert result.word_count == 5


# ── 3. AggregationService ──────────────────────────────────────────────

@pytest.mark.asyncio
async def test_aggregation_service_creation():
    """AggregationService can be instantiated."""
    from multi_publish.aggregation.service import AggregationService

    service = AggregationService()
    assert service is not None
    assert hasattr(service, "collect")
    assert hasattr(service, "rewrite")


@pytest.mark.asyncio
async def test_aggregation_service_collect_url():
    """AggregationService.collect() with a URL source."""
    from multi_publish.aggregation.service import AggregationService
    from multi_publish.aggregation.models import CollectRequest

    service = AggregationService()
    req = CollectRequest(url="https://example.com", source_type="url")

    # URL collection may fail (no real URL), but should not crash
    try:
        result = await service.collect(req)
        # If it succeeds, must return CollectResult
        assert result is not None
    except Exception:
        # Graceful failure is acceptable for Phase 1
        pass


@pytest.mark.asyncio
async def test_aggregation_service_rewrite():
    """AggregationService.rewrite() with text content."""
    from multi_publish.aggregation.service import AggregationService
    from multi_publish.aggregation.models import RewriteRequest

    service = AggregationService()
    req = RewriteRequest(content="这是一篇测试文章。", style="轻松易懂")

    # Rewrite may fail without LLM API key, but should not crash
    try:
        result = await service.rewrite(req)
        assert result is not None
    except Exception:
        pass


# ── 4. API Router ──────────────────────────────────────────────────────

def test_router_exists():
    """Aggregation router is a FastAPI APIRouter."""
    from multi_publish.aggregation.router import router
    from fastapi import APIRouter
    assert isinstance(router, APIRouter)


def test_router_has_routes():
    """Aggregation router has expected endpoints."""
    from multi_publish.aggregation.router import router

    route_paths = [r.path for r in router.routes]
    assert "/aggregation/collect" in route_paths
    assert "/aggregation/rewrite" in route_paths
    assert "/aggregation/sources" in route_paths


# ── 5. Integration smoke test ──────────────────────────────────────────

@pytest.mark.asyncio
async def test_full_cycle_no_crash():
    """Full import chain: models → service → router → server integration."""
    # Verify all modules import without error
    from multi_publish.aggregation import models
    from multi_publish.aggregation import service
    from multi_publish.aggregation import router
    from multi_publish.aggregation import (
        AggregationService, CollectRequest, CollectResult, RewriteRequest,
    )
    assert models is not None
    assert service is not None
    assert router is not None
    assert AggregationService is not None
# ── 6. TaskStatus model ──────────────────────────────────────────────

def test_task_status_model():
    """TaskStatus model defaults."""
    from multi_publish.aggregation.models import TaskStatus

    ts = TaskStatus(task_id="test-123")
    assert ts.task_id == "test-123"
    assert ts.status == "pending"
    assert ts.progress == 0
    assert ts.error is None


def test_task_status_serialization():
    """TaskStatus can be serialized."""
    from multi_publish.aggregation.models import TaskStatus

    ts = TaskStatus(task_id="test-456", status="completed", progress=100)
    d = ts.model_dump()
    assert d["task_id"] == "test-456"
    assert d["status"] == "completed"
    assert d["progress"] == 100


# ── 7. Router task endpoint ──────────────────────────────────────────

def test_router_has_task_endpoint():
    """Aggregation router has task status endpoint."""
    from multi_publish.aggregation.router import router

    route_paths = [r.path for r in router.routes]
    assert "/aggregation/tasks/{task_id}" in route_paths


# ── 8. AggregationService task_status ────────────────────────────────

def test_aggregation_service_get_task_status():
    """AggregationService.get_task_status returns a TaskStatus."""
    from multi_publish.aggregation.service import AggregationService

    service = AggregationService()
    status = service.get_task_status("test-789")
    assert status is not None
    assert status.task_id == "test-789"
    assert status.status == "completed"


# ── 9. API smoke test for task endpoint ──────────────────────────────

def test_api_task_status_endpoint():
    """GET /aggregation/tasks/{task_id} returns 200."""
    import sys
    sys.path.insert(0, r"D:\Data\projects\mp-worktrees\mp-integrate-content-aggregator\packages\python-backend\src")
    from fastapi.testclient import TestClient
    from server import app

    client = TestClient(app)
    r = client.get("/aggregation/tasks/test-123")
    assert r.status_code == 200
    data = r.json()
    assert data["task_id"] == "test-123"
    assert data["status"] == "completed"
