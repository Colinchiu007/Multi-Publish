"""Tests for scheduler verification API (rate-limit verifier)."""
import os
import sys
import tempfile

import pytest
import pytest_asyncio

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

os.environ["OPS_DB_PATH"] = os.path.join(tempfile.gettempdir(), "ops_scheduler_test.db")
os.environ["OPS_CONFIG_OUTPUT_DIR"] = os.path.join(tempfile.gettempdir(), "ops_scheduler_configs")
os.environ["OPS_SECRET_KEY"] = "test-secret"
os.environ["OPS_JWT_SECRET"] = "test-secret"

import models  # noqa: F401
from database import Base, engine
from main import app


def _admin_token():
    from datetime import datetime, timedelta, timezone
    from jose import jwt
    from config import settings
    payload = {"sub": "admin", "username": "admin", "role": "admin",
               "exp": datetime.now(timezone.utc) + timedelta(hours=1)}
    return jwt.encode(payload, settings.get_jwt_secret(), algorithm=settings.jwt_algorithm)


def _user_token():
    from datetime import datetime, timedelta, timezone
    from jose import jwt
    from config import settings
    payload = {"sub": "user-uuid", "username": "regular-user", "tier": 1,
               "exp": datetime.now(timezone.utc) + timedelta(hours=1)}
    return jwt.encode(payload, settings.get_jwt_secret(), algorithm=settings.jwt_algorithm)


@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.mark.asyncio
async def test_scheduler_requires_admin():
    from httpx import AsyncClient, ASGITransport
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.get("/api/v1/scheduler/verify", headers={"Authorization": "Bearer " + _user_token()})
        assert r.status_code == 403
        r = await c.get("/api/v1/scheduler/contract", headers={"Authorization": "Bearer " + _user_token()})
        assert r.status_code == 403
        r = await c.post("/api/v1/scheduler/verify", json={"rpm": 20, "request_count": 5},
                         headers={"Authorization": "Bearer " + _user_token()})
        assert r.status_code == 403


@pytest.mark.asyncio
async def test_create_verification_and_fetch():
    from httpx import AsyncClient, ASGITransport
    h = {"Authorization": "Bearer " + _admin_token()}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.post("/api/v1/scheduler/verify",
                         json={"preset_id": "minimax-tts", "rpm": 20, "limit_per_5h": None,
                               "request_count": 10, "request_duration_ms": 100, "arrival_interval_ms": 0},
                         headers=h)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["code"] == 0
        assert data["run_id"] > 0
        assert data["metrics"]["max_concurrent_observed"] <= 2
        assert len(data["timeline"]) == 10
        assert any(a["name"] == "no_rate_limited" and a["pass"] for a in data["assertions"])
        # 详情取回
        d = await c.get(f"/api/v1/scheduler/verify/{data['run_id']}", headers=h)
        assert d.status_code == 200
        assert len(d.json()["timeline"]) == 10
        # 列表
        lst = await c.get("/api/v1/scheduler/verify?preset_id=minimax-tts", headers=h)
        assert lst.status_code == 200
        assert lst.json()["items"][0]["id"] == data["run_id"]


@pytest.mark.asyncio
async def test_invalid_params_400():
    from httpx import AsyncClient, ASGITransport
    h = {"Authorization": "Bearer " + _admin_token()}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        for bad in (
            {"rpm": 0, "request_count": 5},
            {"rpm": 20, "request_count": 0},
            {"rpm": 20, "request_count": 5, "request_duration_ms": -1},
            {"rpm": 20, "request_count": 5, "inject_429_at": 99},
        ):
            r = await c.post("/api/v1/scheduler/verify", json=bad, headers=h)
            assert r.status_code == 400, (bad, r.text)


@pytest.mark.asyncio
async def test_self_check_report_stored_as_simulated_0():
    from httpx import AsyncClient, ASGITransport
    h = {"Authorization": "Bearer " + _admin_token()}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.post("/api/v1/scheduler/verify",
                         json={"rpm": 6, "max_concurrent": 1, "request_count": 8,
                               "request_duration_ms": 50, "simulated": False,
                               "engine": "real-governor", "client_id": "dev-1",
                               "inject_429_at": 4},
                         headers=h)
        assert r.status_code == 200
        data = r.json()
        assert data["simulated"] is False
        assert data["engine"] == "real-governor"
        assert data["client_id"] == "dev-1"
        assert data["metrics"]["cooldown_count"] >= 1


@pytest.mark.asyncio
async def test_contract_check():
    import json
    from sqlalchemy import select
    from database import async_session
    from models import ModelPreset
    from httpx import AsyncClient, ASGITransport

    # 自插一条已知预设：minimax-multimodal rpm=20 -> max_concurrent=2
    async with async_session() as db:
        db.add(ModelPreset(
            id="minimax-multimodal", name="MiniMax", category="multimodal",
            base_url="https://api.minimaxi.com/v1",
            models=json.dumps(["MiniMax-M2.7", "speech-2.8-turbo"]),
            default_model="MiniMax-M2.7",
            rate_per_minute=20, limit_per_5h=None, is_visible=1,
        ))
        await db.commit()

    h = {"Authorization": "Bearer " + _admin_token()}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.get("/api/v1/scheduler/contract", headers=h)
        assert r.status_code == 200
        items = r.json()["items"]
        assert len(items) == 1
        mm = items[0]
        assert mm["preset_id"] == "minimax-multimodal"
        assert mm["max_concurrent"] == 2
        assert all("rules" in x and len(x["rules"]) >= 3 for x in items)


@pytest.mark.asyncio
async def test_verify_detail_404():
    from httpx import AsyncClient, ASGITransport
    h = {"Authorization": "Bearer " + _admin_token()}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.get("/api/v1/scheduler/verify/999999", headers=h)
        assert r.status_code == 404
