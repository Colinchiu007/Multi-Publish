"""Tests for OpsCenter sync endpoints — Stage -1.4 auth hardening."""
import os
import sys
import tempfile

import pytest
import pytest_asyncio

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

os.environ["OPS_DB_PATH"] = os.path.join(tempfile.gettempdir(), "ops_sync_test.db")
os.environ["OPS_CONFIG_OUTPUT_DIR"] = os.path.join(tempfile.gettempdir(), "ops_sync_configs")
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

    payload = {
        "sub": "admin",
        "username": "admin",
        "role": "admin",
        "exp": datetime.now(timezone.utc) + timedelta(hours=1),
    }
    token = jwt.encode(payload, settings.get_jwt_secret(), algorithm=settings.jwt_algorithm)
    return {"Authorization": f"Bearer {token}"}


def _user_headers():
    from datetime import datetime, timedelta, timezone
    from jose import jwt

    payload = {
        "sub": "user1",
        "username": "user1",
        "role": "user",
        "exp": datetime.now(timezone.utc) + timedelta(hours=1),
    }
    token = jwt.encode(payload, settings.get_jwt_secret(), algorithm=settings.jwt_algorithm)
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_sync_status_no_auth_returns_401():
    client = _client()
    try:
        r = await client.get("/api/v1/sync/status")
        assert r.status_code == 401, f"expected 401, got {r.status_code}: {r.text}"
    finally:
        await client.aclose()


@pytest.mark.asyncio
async def test_sync_status_non_admin_returns_403():
    client = _client()
    try:
        r = await client.get("/api/v1/sync/status", headers=_user_headers())
        assert r.status_code == 403, f"expected 403 for non-admin, got {r.status_code}: {r.text}"
    finally:
        await client.aclose()


@pytest.mark.asyncio
async def test_sync_status_admin_returns_200():
    client = _client()
    try:
        r = await client.get("/api/v1/sync/status", headers=_admin_headers())
        assert r.status_code == 200, f"expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert "projects" in data
    finally:
        await client.aclose()
