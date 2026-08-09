"""Tests for OpsCenter env consistency check API."""
import os
import sys
import tempfile

import pytest
import pytest_asyncio

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

os.environ["OPS_DB_PATH"] = os.path.join(tempfile.gettempdir(), "ops_env_test.db")
os.environ["OPS_CONFIG_OUTPUT_DIR"] = os.path.join(tempfile.gettempdir(), "ops_env_test_configs")
os.environ["OPS_SECRET_KEY"] = "test-secret"
os.environ["OPS_JWT_SECRET"] = "test-secret"

import models  # noqa: F401


def _user_token():
    from datetime import datetime, timedelta, timezone
    from jose import jwt
    from config import settings
    payload = {
        "sub": "user-uuid",
        "username": "regular-user",
        "tier": 1,
        "exp": datetime.now(timezone.utc) + timedelta(hours=1),
    }
    return jwt.encode(payload, settings.get_jwt_secret(), algorithm=settings.jwt_algorithm)


@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    from database import engine, Base
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.mark.asyncio
async def test_consistency_unknown_when_unset(monkeypatch):
    """进程内未配置任何 JWT secret 时，一致性检查返回 unknown 而非失败。"""
    from httpx import AsyncClient, ASGITransport
    from main import app

    for var in ("PO_SECRET_KEY", "TS_SECRET_KEY"):
        monkeypatch.delenv(var, raising=False)

    transport = ASGITransport(app=app)
    headers = {"Authorization": f"Bearer {_user_token()}"}
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/v1/env", headers=headers)
        assert resp.status_code == 200
        checks = resp.json()["checks"]
        jwt_check = next(c for c in checks if c["check"] == "JWT Secret alignment")
        assert jwt_check["status"] == "unknown"
        assert jwt_check["passed"] is None
        assert jwt_check["variables"] == {"PO_SECRET_KEY": False, "TS_SECRET_KEY": False}


@pytest.mark.asyncio
async def test_consistency_ok_when_aligned(monkeypatch):
    """配置了相同的 JWT secret 时返回 ok。"""
    from httpx import AsyncClient, ASGITransport
    from main import app

    monkeypatch.setenv("PO_SECRET_KEY", "same-secret")
    monkeypatch.setenv("TS_SECRET_KEY", "same-secret")

    transport = ASGITransport(app=app)
    headers = {"Authorization": f"Bearer {_user_token()}"}
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/v1/env", headers=headers)
        assert resp.status_code == 200
        checks = resp.json()["checks"]
        jwt_check = next(c for c in checks if c["check"] == "JWT Secret alignment")
        assert jwt_check["status"] == "ok"
        assert jwt_check["passed"] is True


@pytest.mark.asyncio
async def test_consistency_mismatch_when_different(monkeypatch):
    """配置了不同 JWT secret 时返回 mismatch 且 passed=False。"""
    from httpx import AsyncClient, ASGITransport
    from main import app

    monkeypatch.setenv("PO_SECRET_KEY", "secret-a")
    monkeypatch.setenv("TS_SECRET_KEY", "secret-b")

    transport = ASGITransport(app=app)
    headers = {"Authorization": f"Bearer {_user_token()}"}
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/v1/env", headers=headers)
        assert resp.status_code == 200
        checks = resp.json()["checks"]
        jwt_check = next(c for c in checks if c["check"] == "JWT Secret alignment")
        assert jwt_check["status"] == "mismatch"
        assert jwt_check["passed"] is False


@pytest.mark.asyncio
async def test_consistency_partial_when_one_configured(monkeypatch):
    """只配置了部分 JWT secret 时返回 partial 且 passed=False（避免假绿）。"""
    from httpx import AsyncClient, ASGITransport
    from main import app

    monkeypatch.setenv("PO_SECRET_KEY", "secret-a")
    monkeypatch.delenv("TS_SECRET_KEY", raising=False)

    transport = ASGITransport(app=app)
    headers = {"Authorization": f"Bearer {_user_token()}"}
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/v1/env", headers=headers)
        assert resp.status_code == 200
        checks = resp.json()["checks"]
        jwt_check = next(c for c in checks if c["check"] == "JWT Secret alignment")
        assert jwt_check["status"] == "partial"
        assert jwt_check["passed"] is False


@pytest.mark.asyncio
async def test_env_requires_authentication():
    """未携带 token 时 env 接口返回 401。"""
    from httpx import AsyncClient, ASGITransport
    from main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/v1/env")
        assert resp.status_code == 401
