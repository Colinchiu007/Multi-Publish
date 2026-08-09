"""Tests for OpsCenter model preset catalog API."""
import os
import sys
import tempfile

import pytest
import pytest_asyncio

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Override paths for testing
os.environ["OPS_DB_PATH"] = os.path.join(tempfile.gettempdir(), "ops_model_presets_test.db")
os.environ["OPS_CONFIG_OUTPUT_DIR"] = os.path.join(tempfile.gettempdir(), "ops_mp_test_configs")
os.environ["OPS_SECRET_KEY"] = "test-secret"
os.environ["OPS_JWT_SECRET"] = "test-secret"

# Import models early so Base.metadata knows about them
import models  # noqa: F401


def _admin_token():
    from datetime import datetime, timedelta, timezone
    from jose import jwt
    from config import settings
    payload = {
        "sub": "admin",
        "username": "admin",
        "role": "admin",
        "exp": datetime.now(timezone.utc) + timedelta(hours=1),
    }
    return jwt.encode(payload, settings.get_jwt_secret(), algorithm=settings.jwt_algorithm)


@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    """Create fresh test tables and seed catalog."""
    from database import engine, Base, async_session
    from services.model_preset_service import ensure_catalog_seeded

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with async_session() as db:
        await ensure_catalog_seeded(db)

    yield

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.mark.asyncio
async def test_list_presets_requires_admin():
    from httpx import AsyncClient, ASGITransport
    from main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/v1/model-presets")
        assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_list_presets_returns_catalog():
    from httpx import AsyncClient, ASGITransport
    from main import app

    transport = ASGITransport(app=app)
    headers = {"Authorization": f"Bearer {_admin_token()}"}
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/v1/model-presets", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["count"] > 0
        ids = [p["id"] for p in data["presets"]]
        assert "minimax-multimodal" in ids

        mm = next(p for p in data["presets"] if p["id"] == "minimax-multimodal")
        assert mm["is_multimodal"] is True
        assert set(mm["capabilities"]) == {"llm", "tts", "image", "video"}
        assert mm["capability_models"]["llm"] == "MiniMax-M2.7"
        assert mm["default_model"] == "MiniMax-M2.7"
        assert len(mm["doc_links"]) <= 10

        tts = next(p for p in data["presets"] if p["id"] == "minimax-tts")
        assert tts["default_model"] == "speech-2.8-turbo"


@pytest.mark.asyncio
async def test_update_preset_toggles_visibility_and_links():
    from httpx import AsyncClient, ASGITransport
    from main import app

    transport = ASGITransport(app=app)
    headers = {"Authorization": f"Bearer {_admin_token()}"}
    body = {
        "id": "minimax-tts",
        "name": "MiniMax TTS",
        "category": "tts",
        "base_url": "https://api.minimaxi.com/v1",
        "models": ["speech-2.8-turbo"],
        "doc_links": ["https://platform.minimaxi.com/docs/guides/speech-t2a-async"],
        "is_visible": False,
    }
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.put("/api/v1/model-presets/minimax-tts", json=body, headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["is_visible"] is False
        assert data["doc_links"] == ["https://platform.minimaxi.com/docs/guides/speech-t2a-async"]

        hidden = await client.get("/api/v1/model-presets?include_hidden=false", headers=headers)
        assert all(p["id"] != "minimax-tts" for p in hidden.json()["presets"])


@pytest.mark.asyncio
async def test_doc_links_capped_at_10():
    from httpx import AsyncClient, ASGITransport
    from main import app

    transport = ASGITransport(app=app)
    headers = {"Authorization": f"Bearer {_admin_token()}"}
    body = {
        "id": "test-cap",
        "name": "Cap Test",
        "category": "llm",
        "models": ["m1"],
        "doc_links": [f"https://example.com/{i}" for i in range(11)],
    }
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/api/v1/model-presets", json=body, headers=headers)
        assert resp.status_code == 400


@pytest.mark.asyncio
async def test_multimodal_capability_requires_model_mapping():
    from httpx import AsyncClient, ASGITransport
    from main import app

    transport = ASGITransport(app=app)
    headers = {"Authorization": f"Bearer {_admin_token()}"}
    body = {
        "id": "test-mm",
        "name": "Test MM",
        "category": "multimodal",
        "is_multimodal": True,
        "capabilities": ["llm", "image"],
        "capability_models": {"image": "image-01"},  # llm 缺默认模型
    }
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/api/v1/model-presets", json=body, headers=headers)
        assert resp.status_code == 400
        assert "缺少默认模型" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_create_update_delete_roundtrip():
    from httpx import AsyncClient, ASGITransport
    from main import app

    transport = ASGITransport(app=app)
    headers = {"Authorization": f"Bearer {_admin_token()}"}
    body = {
        "id": "custom-mm",
        "name": "Custom MM",
        "category": "multimodal",
        "is_multimodal": True,
        "models": ["m1", "m2"],
        "capabilities": ["tts"],
        "capability_models": {"tts": "m1"},
        "capability_doc_links": {"tts": ["https://example.com/tts"]},
    }
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/api/v1/model-presets", json=body, headers=headers)
        assert resp.status_code == 200
        assert resp.json()["is_multimodal"] is True

        resp = await client.delete("/api/v1/model-presets/custom-mm", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["deleted"] == "custom-mm"

        resp = await client.get("/api/v1/model-presets/custom-mm", headers=headers)
        assert resp.status_code == 404
