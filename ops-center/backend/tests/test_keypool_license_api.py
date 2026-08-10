"""Tests for ops-center 官方 Key 池配额/成本概览 + 许可证管理。"""
import os
import sys
import tempfile

import pytest
import pytest_asyncio

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

os.environ["OPS_DB_PATH"] = os.path.join(tempfile.gettempdir(), "ops_keypool_license_test.db")
os.environ["OPS_CONFIG_OUTPUT_DIR"] = os.path.join(tempfile.gettempdir(), "ops_keypool_license_configs")
os.environ["OPS_SECRET_KEY"] = "test-secret"
os.environ["OPS_JWT_SECRET"] = "test-secret"
os.environ["OPS_CATALOG_API_KEY"] = "catalog-test-key"

import models  # noqa: F401
from config import settings


@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    from database import engine, Base, async_session

    settings.catalog_api_key = os.environ.get("OPS_CATALOG_API_KEY", "catalog-test-key")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with async_session() as db:
        from services.key_service import ensure_official_key_columns
        await ensure_official_key_columns(db)
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


def _normal_headers():
    from datetime import datetime, timedelta, timezone
    from jose import jwt

    payload = {"sub": "u1", "username": "u1", "role": "user", "exp": datetime.now(timezone.utc) + timedelta(hours=1)}
    token = jwt.encode(payload, settings.get_jwt_secret(), algorithm=settings.jwt_algorithm)
    return {"Authorization": f"Bearer {token}"}


# ─── 官方 Key 池增强 ─────────────────────────────────────

@pytest.mark.asyncio
async def test_official_key_new_fields_and_summary():
    async with _client() as client:
        h = _admin_headers()
        # 创建带配额/告警的官方 Key
        r = await client.put("/api/v1/secrets/openai-test", json={
            "provider": "openai", "name": "OpenAI Test", "api_key": "sk-test-1234",
            "rate_per_minute": 30, "daily_limit": 1000, "alert_threshold_cost": 5.0, "note": "测试",
        }, headers=h)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["rate_per_minute"] == 30
        assert data["daily_limit"] == 1000
        assert data["alert_threshold_cost"] == 5.0
        assert data["note"] == "测试"

        # 非法值 400
        assert (await client.put("/api/v1/secrets/openai-bad", json={"provider": "openai", "api_key": "x", "rate_per_minute": -1}, headers=h)).status_code == 400
        assert (await client.put("/api/v1/secrets/openai-bad", json={"provider": "openai", "api_key": "x", "rate_per_minute": 1.5}, headers=h)).status_code == 400
        assert (await client.put("/api/v1/secrets/openai-bad", json={"provider": "openai", "api_key": "x", "daily_limit": 0}, headers=h)).status_code == 400
        assert (await client.put("/api/v1/secrets/openai-bad", json={"provider": "openai", "api_key": "x", "alert_threshold_cost": -1}, headers=h)).status_code == 400

        # 概览（非 admin 403）
        assert (await client.get("/api/v1/secrets/summary", headers=_normal_headers())).status_code == 403
        s = (await client.get("/api/v1/secrets/summary", headers=h)).json()
        assert s["total"] >= 1
        assert s["active"] >= 1
        assert "cost_total" in s
        assert "cost_by_provider" in s


# ─── 许可证管理 ──────────────────────────────────────────

@pytest.mark.asyncio
async def test_license_crud_and_validation():
    async with _client() as client:
        h = _admin_headers()
        # 签发
        r = await client.post("/api/v1/licenses", json={"plan": "pro", "device_limit": 3, "expires_at": "2099-12-31T00:00:00Z", "note": "年付"}, headers=h)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["license_key"].startswith("MP-")
        assert len(data["license_key"]) == 22  # MP- + 4x4 + 3 连字符
        assert data["plan"] == "pro"
        assert data["status"] == "active"
        key = data["license_key"]

        # 校验失败
        assert (await client.post("/api/v1/licenses", json={"plan": "", "device_limit": 1}, headers=h)).status_code == 400
        assert (await client.post("/api/v1/licenses", json={"plan": "pro", "device_limit": 0}, headers=h)).status_code == 400
        assert (await client.post("/api/v1/licenses", json={"plan": "enterprise", "device_limit": 1}, headers=h)).status_code == 400

        # 列表 + 禁用（吊销）
        lst = (await client.get("/api/v1/licenses", headers=h)).json()
        assert any(i["license_key"] == key for i in lst["items"])
        lic_id = next(i["id"] for i in lst["items"] if i["license_key"] == key)
        r = await client.put(f"/api/v1/licenses/{lic_id}", json={"plan": "pro", "device_limit": 3, "expires_at": "2099-12-31T00:00:00Z", "status": "disabled"}, headers=h)
        assert r.status_code == 200 and r.json()["status"] == "disabled"

        # 删除
        assert (await client.delete(f"/api/v1/licenses/{lic_id}", headers=h)).status_code == 200
        assert (await client.delete(f"/api/v1/licenses/{lic_id}", headers=h)).status_code == 404

        # 非 admin 403
        assert (await client.post("/api/v1/licenses", json={"plan": "pro", "device_limit": 1}, headers=_normal_headers())).status_code == 403
        assert (await client.get("/api/v1/licenses", headers=_normal_headers())).status_code == 403


@pytest.mark.asyncio
async def test_license_key_uniqueness_and_expired_derivation():
    async with _client() as client:
        h = _admin_headers()
        # 过期派生：expires_at 在过去 → 状态 expired
        r = await client.post("/api/v1/licenses", json={"plan": "trial", "device_limit": 1, "expires_at": "2020-01-01T00:00:00Z"}, headers=h)
        assert r.status_code == 200
        assert r.json()["status"] == "expired"

        # 唯一性：生成 key 不重复（多次签发 key 各不相同）
        keys = set()
        for _ in range(10):
            rr = await client.post("/api/v1/licenses", json={"plan": "free", "device_limit": 1}, headers=h)
            assert rr.status_code == 200
            keys.add(rr.json()["license_key"])
        assert len(keys) == 10
