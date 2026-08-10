"""Tests for ops-center 模型用量上报与看板汇总。"""
import os
import sys
import tempfile

import pytest
import pytest_asyncio

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

os.environ["OPS_DB_PATH"] = os.path.join(tempfile.gettempdir(), "ops_usage_test.db")
os.environ["OPS_CONFIG_OUTPUT_DIR"] = os.path.join(tempfile.gettempdir(), "ops_usage_configs")
os.environ["OPS_SECRET_KEY"] = "test-secret"
os.environ["OPS_JWT_SECRET"] = "test-secret"
os.environ["OPS_CATALOG_API_KEY"] = "catalog-test-key"

import models  # noqa: F401
from config import settings


@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    from database import engine, Base

    settings.catalog_api_key = os.environ.get("OPS_CATALOG_API_KEY", "catalog-test-key")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
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

    payload = {"sub": "admin", "username": "admin", "role": "admin", "exp": datetime.now(timezone.utc) + timedelta(hours=1)}
    token = jwt.encode(payload, settings.get_jwt_secret(), algorithm=settings.jwt_algorithm)
    return {"Authorization": f"Bearer {token}"}


def _item(**over):
    base = {
        "usage_date": "2026-08-10", "client_id": "dev-1", "provider_id": "openai", "category": "llm", "action": "chat",
        "calls": 10, "ok_count": 9, "fail_count": 1, "ratelimit_count": 2, "latency_ms": 5000,
        "tokens_in": 1000, "tokens_out": 500, "cost": 0.12,
        "latency_buckets": {"lt1s": 2, "1to3s": 3, "3to10s": 4, "gt10s": 1},
    }
    base.update(over)
    return base


@pytest.mark.asyncio
async def test_ingest_auth_and_idempotent_accumulate():
    async with _client() as client:
        # 鉴权
        assert (await client.post("/api/v1/usage/ingest", json={"items": []})).status_code == 401
        r = await client.post("/api/v1/usage/ingest", json={"items": [_item()], "batch_id": "b-1"}, headers={"X-Catalog-Key": "catalog-test-key"})
        assert r.status_code == 200, r.text
        assert r.json()["ingested"] == 1

        # 同桶不同批次再次上报 → 累加不重复行
        r = await client.post("/api/v1/usage/ingest", json={"items": [_item(calls=5, ok_count=4)], "batch_id": "b-2"}, headers={"X-Catalog-Key": "catalog-test-key"})
        assert r.status_code == 200
        summary = (await client.get("/api/v1/usage/summary?days=30", headers=_admin_headers())).json()
        assert summary["totals"]["calls"] == 15  # 10 + 5
        assert summary["totals"]["ok"] == 13
        assert summary["totals"]["cost"] == pytest.approx(0.24)

        # 同批次重复提交（超时重试场景）→ duplicate，计数不翻倍
        r = await client.post("/api/v1/usage/ingest", json={"items": [_item(calls=5, ok_count=4)], "batch_id": "b-2"}, headers={"X-Catalog-Key": "catalog-test-key"})
        assert r.status_code == 200
        assert r.json()["duplicate"] is True
        summary = (await client.get("/api/v1/usage/summary?days=30", headers=_admin_headers())).json()
        assert summary["totals"]["calls"] == 15  # 未翻倍


@pytest.mark.asyncio
async def test_ingest_validation():
    async with _client() as client:
        h = {"X-Catalog-Key": "catalog-test-key"}
        # 非法日期 / 负数 / 缺 provider / 超 500 条
        assert (await client.post("/api/v1/usage/ingest", json={"items": [_item(usage_date="2026/08/10")]}, headers=h)).status_code == 400
        assert (await client.post("/api/v1/usage/ingest", json={"items": [_item(calls=-1)]}, headers=h)).status_code == 400
        assert (await client.post("/api/v1/usage/ingest", json={"items": [_item(ok_count=8, fail_count=5, calls=10)]}, headers=h)).status_code == 400
        assert (await client.post("/api/v1/usage/ingest", json={"items": [_item(calls=3.7)]}, headers=h)).status_code == 400
        assert (await client.post("/api/v1/usage/ingest", json={"items": [_item(provider_id="")]}, headers=h)).status_code == 400
        assert (await client.post("/api/v1/usage/ingest", json={"items": [_item()] * 501}, headers=h)).status_code == 400


@pytest.mark.asyncio
async def test_summary_grouping_and_permissions():
    async with _client() as client:
        h = {"X-Catalog-Key": "catalog-test-key"}
        await client.post("/api/v1/usage/ingest", json={
            "items": [
                _item(usage_date="2026-08-09", provider_id="openai", action="chat", calls=10, ok_count=8, fail_count=2),
                _item(usage_date="2026-08-10", provider_id="openai", action="chat", calls=20, ok_count=19, fail_count=1),
                _item(usage_date="2026-08-10", provider_id="minimax-multimodal", action="tts", calls=5, ok_count=5, fail_count=0, cost=0.5),
            ],
            "batch_id": "b-sum-1",
        }, headers=h)

        # 非 admin 403
        assert (await client.get("/api/v1/usage/summary")).status_code == 401
        from datetime import datetime, timedelta, timezone
        from jose import jwt
        normal = jwt.encode({"sub": "u1", "username": "u1", "role": "user", "exp": datetime.now(timezone.utc) + timedelta(hours=1)},
                            settings.get_jwt_secret(), algorithm=settings.jwt_algorithm)
        assert (await client.get("/api/v1/usage/summary", headers={"Authorization": f"Bearer {normal}"})).status_code == 403

        s = (await client.get("/api/v1/usage/summary?days=30", headers=_admin_headers())).json()
        assert s["totals"]["calls"] == 35
        assert s["totals"]["success_rate"] == pytest.approx((8 + 19 + 5) / 35 * 100, abs=0.01)
        assert s["totals"]["active_providers"] == 2
        assert len(s["by_date"]) == 30  # 连续补零
        assert s["by_provider"][0]["provider_id"] == "openai"  # 调用最多在前
        assert len(s["by_action"]) >= 2
