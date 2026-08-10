"""Tests for ops-center 模型目录只读同步端点（桌面端拉取运营配置）。"""
import os
import sys
import tempfile

import pytest
import pytest_asyncio

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

os.environ["OPS_DB_PATH"] = os.path.join(tempfile.gettempdir(), "ops_catalog_test.db")
os.environ["OPS_CONFIG_OUTPUT_DIR"] = os.path.join(tempfile.gettempdir(), "ops_catalog_test_configs")
os.environ["OPS_SECRET_KEY"] = "test-secret"
os.environ["OPS_JWT_SECRET"] = "test-secret"
os.environ["OPS_CATALOG_API_KEY"] = "catalog-test-key"

import models  # noqa: F401
from config import settings


@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    from database import engine, Base, async_session
    from services.model_preset_service import ensure_catalog_seeded, ensure_model_preset_columns

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with async_session() as db:
        await ensure_model_preset_columns(db)
        await ensure_catalog_seeded(db)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


def _client():
    from httpx import AsyncClient, ASGITransport
    from main import app

    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.mark.asyncio
async def test_catalog_correct_key_returns_visible_presets():
    async with _client() as client:
        resp = await client.get("/api/v1/model-presets/catalog", headers={"X-Catalog-Key": "catalog-test-key"})
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["count"] >= 50
        ids = [it["id"] for it in data["items"]]
        assert "minimax-multimodal" in ids
        # 自洽：default ∈ models、限流正整数或空、能力完整
        mm = next(it for it in data["items"] if it["id"] == "minimax-multimodal")
        assert mm["default_model"] in mm["models"]
        assert mm["rate_per_minute"] == 20
        assert mm["capability_models"]["tts"] == "speech-2.8-turbo"
        for it in data["items"]:
            if it["default_model"]:
                assert it["default_model"] in it["models"]
            assert it["rate_per_minute"] is None or it["rate_per_minute"] >= 1
            assert it["limit_per_5h"] is None or it["limit_per_5h"] >= 1


@pytest.mark.asyncio
async def test_catalog_wrong_or_missing_key_401():
    async with _client() as client:
        r1 = await client.get("/api/v1/model-presets/catalog", headers={"X-Catalog-Key": "wrong"})
        assert r1.status_code == 401
        r2 = await client.get("/api/v1/model-presets/catalog")
        assert r2.status_code == 401


@pytest.mark.asyncio
async def test_catalog_not_configured_returns_404(monkeypatch):
    monkeypatch.setattr(settings, "catalog_api_key", "")
    async with _client() as client:
        resp = await client.get("/api/v1/model-presets/catalog", headers={"X-Catalog-Key": "catalog-test-key"})
        assert resp.status_code == 404


@pytest.mark.asyncio
async def test_catalog_excludes_hidden_presets():
    from httpx import AsyncClient, ASGITransport
    from main import app
    from datetime import datetime, timedelta, timezone
    from jose import jwt

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        payload = {"sub": "admin", "username": "admin", "role": "admin", "exp": datetime.now(timezone.utc) + timedelta(hours=1)}
        token = jwt.encode(payload, settings.get_jwt_secret(), algorithm=settings.jwt_algorithm)
        # 隐藏一个预设
        await client.put("/api/v1/model-presets/openai", json={"id": "openai", "name": "OpenAI", "category": "llm",
            "models": ["gpt-4o"], "is_visible": False}, headers={"Authorization": f"Bearer {token}"})
        resp = await client.get("/api/v1/model-presets/catalog", headers={"X-Catalog-Key": "catalog-test-key"})
        assert resp.status_code == 200
        ids = [it["id"] for it in resp.json()["items"]]
        assert "openai" not in ids