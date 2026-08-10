"""Tests for ops-center 云服务健康巡检。"""
import os
import sys
import tempfile

import pytest
import pytest_asyncio

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

os.environ["OPS_DB_PATH"] = os.path.join(tempfile.gettempdir(), "ops_health_test.db")
os.environ["OPS_CONFIG_OUTPUT_DIR"] = os.path.join(tempfile.gettempdir(), "ops_health_configs")
os.environ["OPS_SECRET_KEY"] = "test-secret"
os.environ["OPS_JWT_SECRET"] = "test-secret"
os.environ["OPS_CATALOG_API_KEY"] = "catalog-test-key"

import models  # noqa: F401
from config import settings


@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    from database import engine, Base

    settings.catalog_api_key = os.environ.get("OPS_CATALOG_API_KEY", "catalog-test-key")
    settings.health_api_url = ""
    settings.health_logto_url = ""
    settings.health_targets = ""
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


def _normal_headers():
    from datetime import datetime, timedelta, timezone
    from jose import jwt

    payload = {"sub": "u1", "username": "u1", "role": "user", "exp": datetime.now(timezone.utc) + timedelta(hours=1)}
    token = jwt.encode(payload, settings.get_jwt_secret(), algorithm=settings.jwt_algorithm)
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_health_checks_and_permissions():
    async with _client() as client:
        # 非 admin 403
        assert (await client.get("/api/v1/system/health", headers=_normal_headers())).status_code == 403

        # 未配置外部目标 → api/logto skipped，overall ok
        r = await client.get("/api/v1/system/health", headers=_admin_headers())
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["overall"] == "ok"
        by_name = {c["name"]: c for c in data["checks"]}
        assert by_name["ops-center 自身"]["status"] == "ok"
        assert by_name["数据库"]["status"] == "ok"  # 真实 SELECT 1
        assert by_name["存储可写"]["status"] == "ok"
        assert by_name["业务 API"]["status"] == "skipped"
        assert by_name["Logto"]["status"] == "skipped"


@pytest.mark.asyncio
async def test_health_custom_target_and_failure():
    import httpx

    # 本地回环 http 探针：用一个永不接受连接的端口模拟失败
    settings.health_api_url = ""
    settings.health_logto_url = ""
    settings.health_targets = '[{"name": "本地不可达", "url": "http://127.0.0.1:1/health"}]'
    async with _client() as client:
        r = await client.get("/api/v1/system/health", headers=_admin_headers())
        assert r.status_code == 200
        data = r.json()
        by_name = {c["name"]: c for c in data["checks"]}
        assert by_name["本地不可达"]["status"] == "error"
        assert data["overall"] == "error"

    # 非法自定义目标（非 https 外网）被忽略
    settings.health_targets = '[{"name": "bad", "url": "http://example.com/health"}]'
    async with _client() as client:
        r = await client.get("/api/v1/system/health", headers=_admin_headers())
        data = r.json()
        assert all(c["name"] != "bad" for c in data["checks"])

    # 业务 API 配置非法 → error（区分未配置 skipped）
    settings.health_api_url = "ftp://bad"
    settings.health_targets = ""
    async with _client() as client:
        data = (await client.get("/api/v1/system/health", headers=_admin_headers())).json()
        by_name = {c["name"]: c for c in data["checks"]}
        assert by_name["业务 API"]["status"] == "error"
