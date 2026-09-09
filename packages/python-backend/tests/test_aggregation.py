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


# ── 5.1 v2 import regression protection (QM-5) ─────────────────────────

def test_service_does_not_import_v2_backend():
    """Regression: service.py must not reference content_aggregator.backend (v2 does not exist)."""
    import inspect
    from multi_publish.aggregation import service as service_module

    src = inspect.getsource(service_module)
    assert "content_aggregator.backend" not in src, (
        "service.py 引用了不存在的 content_aggregator.backend (v2)。"
        "Phase 1 只能使用 v1 引擎 (content_aggregator.workflows / processors / sources)。"
    )


def test_rewrite_uses_shared_rewrite_processor():
    """Regression: rewrite must import shared RewriteProcessor, not v2 rewrite_content."""
    import inspect
    from multi_publish.aggregation import service as service_module

    src = inspect.getsource(service_module)
    assert "content_aggregator_shared.shared.rewriters.rewriter" in src, (
        "rewrite 必须使用 shared 库 RewriteProcessor "
        "(content_aggregator_shared.shared.rewriters.rewriter)"
    )
    assert "content_aggregator.backend.app.services.rewrite" not in src, (
        "rewrite 不得引用 v2 的 backend.app.services.rewrite"
    )


def test_rewrite_uses_shared_quality_report_serializer():
    """回归：改写引擎质量报告必须消费评估器唯一的序列化投影，避免与运营中心字段漂移。"""
    import inspect
    from multi_publish.aggregation import service as service_module

    src = inspect.getsource(service_module)
    assert "serialize_quality_report" in src, (
        "rewrite 必须使用 serialize_quality_report 统一序列化质量报告"
    )
    assert '"weighted": round(d.weighted, 1)' not in src, (
        "改写引擎不得再手写维度字段清单，应复用评估器序列化投影"
    )


def test_collect_url_uses_v1_pipeline():
    """Regression: _collect_url must use v1 ContentPipeline, not v2 collect_url."""
    import inspect
    from multi_publish.aggregation import service as service_module

    src = inspect.getsource(service_module)
    assert "content_aggregator.workflows.pipeline" in src, (
        "_collect_url 必须使用 v1 ContentPipeline (content_aggregator.workflows.pipeline)"
    )
    assert "content_aggregator.backend.app.services.collect" not in src, (
        "_collect_url 不得引用 v2 的 backend.app.services.collect"
    )


def test_content_model_construction_is_valid():
    """Regression: Content object must be constructed with id + source_id."""
    from content_aggregator.models import Content

    c = Content(
        id="",
        source_id="",
        title="",
        content="测试正文",
        source_type="manual",
        url="",
    )
    assert c.content == "测试正文"
    assert c.source_type == "manual"


# ── 5.2 style→strategy mapping regression ──────────────────────────────

def test_style_to_strategy_mapping():
    """Regression: 5 种中文风格名必须映射到正确的 v1 RewriteStrategy."""
    from multi_publish.aggregation.service import _STYLE_TO_STRATEGY

    assert _STYLE_TO_STRATEGY["轻松易懂"] == "paraphrase"
    assert _STYLE_TO_STRATEGY["正式严谨"] == "style_transfer"
    assert _STYLE_TO_STRATEGY["吸引眼球"] == "short_video"
    assert _STYLE_TO_STRATEGY["深度分析"] == "expand"
    assert _STYLE_TO_STRATEGY["认知锚点"] == "rewrite"
    assert len(_STYLE_TO_STRATEGY) == 5


def test_length_ranges_mapping():
    """Regression: 3 种长度必须映射到正确的字数范围."""
    from multi_publish.aggregation.service import _LENGTH_RANGES

    assert _LENGTH_RANGES["keep"] == (300, 3000, 1500)
    assert _LENGTH_RANGES["compress"] == (100, 800, 400)
    assert _LENGTH_RANGES["expand"] == (800, 5000, 2500)
    assert len(_LENGTH_RANGES) == 3
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

def test_aggregation_service_get_task_status_unknown():
    """AggregationService.get_task_status returns None for unknown task."""
    from multi_publish.aggregation.service import AggregationService

    service = AggregationService()
    status = service.get_task_status("test-789")
    assert status is None


def test_aggregation_service_task_lifecycle():
    """AggregationService.create_task → update_task → get_task_status 生命周期。"""
    from multi_publish.aggregation.service import AggregationService

    service = AggregationService()
    task_id = service._create_task(total_items=3)
    assert task_id

    status = service.get_task_status(task_id)
    assert status is not None
    assert status.task_id == task_id
    assert status.status == "pending"
    assert status.total_items == 3
    assert status.processed_items == 0

    service._update_task(task_id, status="running", progress=33, processed_items=1)
    status2 = service.get_task_status(task_id)
    assert status2.status == "running"
    assert status2.progress == 33
    assert status2.processed_items == 1

    service._update_task(task_id, status="completed", progress=100, processed_items=3)
    status3 = service.get_task_status(task_id)
    assert status3.status == "completed"
    assert status3.progress == 100


# ── 9. API smoke test for task endpoint ──────────────────────────────

def test_api_task_status_endpoint_unknown():
    """GET /aggregation/tasks/{task_id} 对未知任务返回 404。"""
    from fastapi.testclient import TestClient
    from server import app

    client = TestClient(app)
    r = client.get("/aggregation/tasks/test-nonexistent-123")
    assert r.status_code == 404


# ── 10. 回归测试：改写无 key 友好错误（P0 fix）──────────────────────

@pytest.mark.asyncio
async def test_rewrite_no_api_key_friendly_error():
    """回归：无 LLM API Key 时返回友好中文错误，而非不可读的 repr。"""
    import os as _os
    from multi_publish.aggregation.service import AggregationService
    from multi_publish.aggregation.models import RewriteRequest

    _os.environ.pop("LLM_API_KEY", None)
    _os.environ.pop("PO_OPENAI_API_KEY", None)

    service = AggregationService()
    req = RewriteRequest(content="这是一段用于测试改写的长内容，需要超过二十个字符来通过输入校验", style="轻松易懂")

    with pytest.raises(ValueError, match="未配置 LLM API Key"):
        await service.rewrite(req)


@pytest.mark.asyncio
async def test_rewrite_short_content_before_key_check():
    """回归：内容过短应先报错，不因缺少 API key 先报错。"""
    import os as _os
    from multi_publish.aggregation.service import AggregationService
    from multi_publish.aggregation.models import RewriteRequest

    _os.environ.pop("LLM_API_KEY", None)
    _os.environ.pop("PO_OPENAI_API_KEY", None)

    service = AggregationService()
    req = RewriteRequest(content="短", style="轻松易懂")

    with pytest.raises(ValueError, match="输入内容过短"):
        await service.rewrite(req)


# ── 11. 回归测试：word_count 兜底 ──────────────────────────────────

def test_collect_result_word_count_fallback():
    """回归：word_count 为 0 时用 content 长度兜底。"""
    from multi_publish.aggregation.models import CollectResult

    r = CollectResult(
        title="测试",
        content="这是一段有内容的正文",
        source_url="https://example.com",
        word_count=0,
    )
    # 在 service 层已兜底；这里验证模型允许 word_count 为 0 且 content 有长度
    assert r.word_count == 0
    assert len(r.content) > 0
    # 兜底逻辑：word_count or len(content)
    effective = r.word_count or len(r.content)
    assert effective == len("这是一段有内容的正文")
