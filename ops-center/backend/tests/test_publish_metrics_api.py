"""Tests for ops-center 发布指标上报与运营看板。"""
import os
import sys
import tempfile
import uuid

import pytest
import pytest_asyncio

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

_RUN_ID = uuid.uuid4().hex[:8]
os.environ["OPS_DB_PATH"] = os.path.join(tempfile.gettempdir(), f"ops_pm_{_RUN_ID}.db")
os.environ["OPS_CONFIG_OUTPUT_DIR"] = os.path.join(tempfile.gettempdir(), f"ops_pm_cfg_{_RUN_ID}")
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


@pytest.mark.asyncio
async def test_publish_ingest_validation_and_idempotent_accumulate():
    async with _client() as client:
        key = {"X-Catalog-Key": "catalog-test-key"}
        # 上报成功
        r = await client.post("/api/v1/publish/ingest", json={
            "client_id": "dev-1", "items": [{"date": "2026-08-11", "platform": "wechat_mp", "publish_count": 5, "ok_count": 4, "fail_count": 1}],
        }, headers=key)
        assert r.status_code == 200 and r.json()["ingested"] == 1

        # 同桶再报 → 累加（服务端 upsert 累加；幂等由客户端水印防重）
        r = await client.post("/api/v1/publish/ingest", json={
            "client_id": "dev-1", "items": [{"date": "2026-08-11", "platform": "wechat_mp", "publish_count": 3, "ok_count": 2, "fail_count": 1}],
        }, headers=key)
        assert r.status_code == 200
        s = (await client.get("/api/v1/publish/summary?days=30", headers=_admin_headers())).json()
        assert s["totals"]["publish_count"] == 8
        assert s["totals"]["ok_count"] == 6

        # 逐条校验：非法条目跳过（200 + invalid_count）；结构错误整批 400；无 key 401
        assert (await client.post("/api/v1/publish/ingest", json={"client_id": "d", "items": [{"date": "2026-8-1", "platform": "x", "publish_count": 1, "ok_count": 1, "fail_count": 0}]}, headers=key)).json()["invalid_count"] == 1
        assert (await client.post("/api/v1/publish/ingest", json={"client_id": "d", "items": [{"date": "2026-08-11", "platform": "BAD ID", "publish_count": 1, "ok_count": 1, "fail_count": 0}]}, headers=key)).json()["invalid_count"] == 1
        assert (await client.post("/api/v1/publish/ingest", json={"client_id": "d", "items": [{"date": "2026-08-11", "platform": "x", "publish_count": -1, "ok_count": 1, "fail_count": 0}]}, headers=key)).json()["invalid_count"] == 1
        assert (await client.post("/api/v1/publish/ingest", json={"client_id": "d", "items": [{"date": "2026-08-11", "platform": "x", "publish_count": 1, "ok_count": 2, "fail_count": 0}]}, headers=key)).json()["invalid_count"] == 1
        assert (await client.post("/api/v1/publish/ingest", json={"client_id": "d"}, headers=key)).status_code == 400
        assert (await client.post("/api/v1/publish/ingest", json={"client_id": "d", "items": [{"date": "2026-08-11", "platform": "x", "publish_count": 1, "ok_count": 1, "fail_count": 0}]}, headers={})).status_code == 401
        # summary 非 admin 403
        assert (await client.get("/api/v1/publish/summary", headers={})).status_code in (401, 403)


@pytest.mark.asyncio
async def test_publish_ingest_per_item_skip_and_batch_idempotent():
    async with _client() as client:
        key = {"X-Catalog-Key": "catalog-test-key"}
        # 逐条校验：非法条目跳过并在 invalid 中返回，合法条目仍入库
        r = await client.post("/api/v1/publish/ingest", json={
            "client_id": "dev-2", "report_id": "dev-2:2026-08-11:2026-08-11",
            "items": [
                {"date": "2026-08-11", "platform": "wechat_mp", "publish_count": 2, "ok_count": 2, "fail_count": 0},
                {"date": "2026-02-30", "platform": "x", "publish_count": 1, "ok_count": 1, "fail_count": 0},
                {"date": "2026-08-11", "platform": "BAD PLATFORM", "publish_count": 1, "ok_count": 1, "fail_count": 0},
                {"date": "2026-08-11", "platform": "x", "publish_count": 1.9, "ok_count": 1, "fail_count": 0},
            ],
        }, headers=key)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["ingested"] == 1
        assert data["invalid_count"] == 3
        s = (await client.get("/api/v1/publish/summary?days=30", headers=_admin_headers())).json()
        assert s["totals"]["publish_count"] == 2

        # 批次幂等：同 report_id 重复上报不累加
        r2 = await client.post("/api/v1/publish/ingest", json={
            "client_id": "dev-2", "report_id": "dev-2:2026-08-11:2026-08-11",
            "items": [{"date": "2026-08-11", "platform": "wechat_mp", "publish_count": 2, "ok_count": 2, "fail_count": 0}],
        }, headers=key)
        assert r2.status_code == 200 and r2.json()["already_reported"] is True
        s2 = (await client.get("/api/v1/publish/summary?days=30", headers=_admin_headers())).json()
        assert s2["totals"]["publish_count"] == 2  # 未翻倍
