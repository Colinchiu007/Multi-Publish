"""Tests for OpsCenter content quality evaluation endpoints.

回归保护：修复 service.py 的 sys.path 层级错误（5 个 ".." → 4 个 ".."）。
修复前 POST /api/v1/quality-eval/evaluate 因 ModuleNotFoundError 返回 500。
本测试通过真实 API 调用验证评估器导入路径正确、评估/统计/记录全链路可用。
"""
import os
import sys
import tempfile

import pytest
import pytest_asyncio

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

os.environ["OPS_DB_PATH"] = os.path.join(tempfile.gettempdir(), "ops_quality_eval_test.db")
os.environ["OPS_CONFIG_OUTPUT_DIR"] = os.path.join(tempfile.gettempdir(), "ops_quality_eval_configs")
os.environ["OPS_SECRET_KEY"] = "test-secret"
os.environ["OPS_JWT_SECRET"] = "test-secret"
os.environ["OPS_CATALOG_API_KEY"] = "catalog-test-key"

import models  # noqa: F401
from config import settings


@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    from database import engine, Base

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    from services.quality.service import ensure_quality_eval_table
    await ensure_quality_eval_table()
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


def _client():
    from httpx import AsyncClient, ASGITransport
    from main import app

    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


def _admin_headers():
    from datetime import datetime, timedelta, timezone
    from jose import jwt

    payload = {
        "sub": "admin",
        "username": "admin",
        "role": "admin",
        "exp": datetime.now(timezone.utc) + timedelta(hours=1),
    }
    token = jwt.encode(payload, settings.get_jwt_secret(), algorithm=settings.jwt_algorithm)
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_evaluate_imports_evaluator_and_returns_200():
    """回归：评估端点必须能导入 multi_publish.aggregation.quality（修复 500 错误）。"""
    client = _client()
    try:
        content = (
            "在人工智能迅猛发展的今天，很多人都在担心自己的工作岗位会被AI取代。"
            "说实话，这种担忧不无道理，但我们也不必过度恐慌。"
            "今天我想和大家聊聊，在AI时代，我们到底该如何提升自己的职场竞争力。"
        ) * 3
        r = await client.post(
            "/api/v1/quality-eval/evaluate",
            headers=_admin_headers(),
            json={
                "content": content,
                "original_content": "",
                "title": "AI时代如何提升职场竞争力",
                "platform": "微信",
                "style": "轻松易懂",
            },
        )
        assert r.status_code == 200, f"expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert "overall_score" in data
        assert "grade" in data
        assert "dimensions" in data and len(data["dimensions"]) == 15
        assert data["word_count"] > 0
    finally:
        await client.aclose()


@pytest.mark.asyncio
async def test_evaluate_rejects_short_content():
    client = _client()
    try:
        r = await client.post(
            "/api/v1/quality-eval/evaluate",
            headers=_admin_headers(),
            json={"content": "太短", "platform": "通用"},
        )
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"
    finally:
        await client.aclose()


@pytest.mark.asyncio
async def test_evaluate_requires_auth():
    client = _client()
    try:
        r = await client.post(
            "/api/v1/quality-eval/evaluate",
            json={"content": "这是一篇足够长的测试内容。" * 5},
        )
        assert r.status_code == 401, f"expected 401, got {r.status_code}: {r.text}"
    finally:
        await client.aclose()


@pytest.mark.asyncio
async def test_stats_and_records_return_after_evaluate():
    client = _client()
    try:
        content = "这是第一篇测试文章。内容质量评估机制需要验证统计与记录链路。" * 4
        ev = await client.post(
            "/api/v1/quality-eval/evaluate",
            headers=_admin_headers(),
            json={"content": content, "platform": "通用", "style": "通用"},
        )
        assert ev.status_code == 200

        stats = await client.get("/api/v1/quality-eval/stats?limit=100", headers=_admin_headers())
        assert stats.status_code == 200
        s = stats.json()
        assert s["total"] >= 1
        assert "avg_score" in s

        records = await client.get("/api/v1/quality-eval/records?limit=5", headers=_admin_headers())
        assert records.status_code == 200
        r = records.json()
        assert "items" in r and len(r["items"]) >= 1
    finally:
        await client.aclose()
