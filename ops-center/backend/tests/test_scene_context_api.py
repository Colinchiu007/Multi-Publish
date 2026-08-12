"""Tests for ops-center Story2Video 场景上下文规则管理 API。"""
import os
import sys
import tempfile
import uuid

import pytest
import pytest_asyncio

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

_RUN_ID = uuid.uuid4().hex[:8]
os.environ["OPS_DB_PATH"] = os.path.join(tempfile.gettempdir(), f"ops_scene_context_{_RUN_ID}.db")
os.environ["OPS_CONFIG_OUTPUT_DIR"] = os.path.join(tempfile.gettempdir(), f"ops_sc_configs_{_RUN_ID}")
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
async def test_scene_context_rules_get_template_when_unconfigured():
    from services.scene_context_service import load_template

    template = load_template()
    async with _client() as c:
        resp = await c.get("/api/v1/scene-context/rules", headers=_admin_headers())
    assert resp.status_code == 200
    data = resp.json()
    assert data["source"] == "template"
    assert data["version"] == 0
    assert data["rules"]["version"] == template["version"]
    assert len(data["rules"]["dynasty"]) >= 16


@pytest.mark.asyncio
async def test_scene_context_rules_validate_endpoint():
    from services.scene_context_service import load_template

    template = load_template()
    async with _client() as c:
        ok = await c.post("/api/v1/scene-context/rules/validate", json={"rules": template}, headers=_admin_headers())
        bad = await c.post("/api/v1/scene-context/rules/validate", json={"rules": {"version": 1, "dynasty": [{"name": "x"}]}}, headers=_admin_headers())
    assert ok.status_code == 200 and ok.json()["ok"] is True
    assert bad.status_code == 200 and bad.json()["ok"] is False
    assert any(e["path"].startswith("dynasty[0]") for e in bad.json()["errors"])


@pytest.mark.asyncio
async def test_scene_context_rules_save_admin_and_persist():
    from services.scene_context_service import load_template

    template = load_template()
    custom = dict(template)
    custom["culture"] = list(template["culture"]) + [{"keywords": ["测试文明"], "culture": "测试文明", "regions": []}]
    async with _client() as c:
        saved = await c.put("/api/v1/scene-context/rules", json={"rules": custom}, headers=_admin_headers())
        fetched = await c.get("/api/v1/scene-context/rules", headers=_admin_headers())
        exported = await c.get("/api/v1/scene-context/rules/export", headers=_admin_headers())
    assert saved.status_code == 200
    assert saved.json()["version"] == 1
    assert saved.json()["source"] == "db"
    assert saved.json()["updated_by"] == "admin"
    assert fetched.json()["version"] == 1
    assert any(r["culture"] == "测试文明" for r in fetched.json()["rules"]["culture"])
    assert exported.status_code == 200
    assert exported.json()["version"] == 1
    assert "story-context-rules.json" in exported.json()["note"]


@pytest.mark.asyncio
async def test_scene_context_rules_save_requires_admin():
    from services.scene_context_service import load_template

    template = load_template()
    async with _client() as c:
        resp = await c.put("/api/v1/scene-context/rules", json={"rules": template}, headers=_normal_headers())
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_scene_context_rules_save_invalid_rejected():
    async with _client() as c:
        resp = await c.put("/api/v1/scene-context/rules", json={"rules": {"version": 1, "dynasty": [{"name": "x"}]}}, headers=_admin_headers())
    assert resp.status_code == 400
    assert "校验失败" in resp.json()["detail"]
