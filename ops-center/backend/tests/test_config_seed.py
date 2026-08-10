"""Tests for ops-center 启动种子：项目注册 + 功能开关导入（修复 FeatureFlags 404）。"""
import os
import sys
import tempfile

import pytest
import pytest_asyncio

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

os.environ["OPS_DB_PATH"] = os.path.join(tempfile.gettempdir(), "ops_seed_test.db")
os.environ["OPS_CONFIG_OUTPUT_DIR"] = os.path.join(tempfile.gettempdir(), "ops_seed_test_configs")
os.environ["OPS_SECRET_KEY"] = "test-secret"
os.environ["OPS_JWT_SECRET"] = "test-secret"

import models  # noqa: F401
from config import settings

FIXTURE_YAML = """features:
  article_auto_fetch:
    enabled: true
    tier: 2
  pipeline_v2:
    enabled: true
    tier: 2
    description: Block 引擎版视频管线
  premium_content:
    enabled: false
    tier: 3
"""


def _admin_token():
    from datetime import datetime, timedelta, timezone
    from jose import jwt

    payload = {
        "sub": "admin", "username": "admin", "role": "admin",
        "exp": datetime.now(timezone.utc) + timedelta(hours=1),
    }
    return jwt.encode(payload, settings.get_jwt_secret(), algorithm=settings.jwt_algorithm)


@pytest_asyncio.fixture(autouse=True)
async def setup_db(monkeypatch, tmp_path):
    from database import engine, Base, async_session
    from services.config_seed_service import ensure_feature_gates_seeded, ensure_projects_seeded

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    src = tmp_path / "feature_gates.yaml"
    src.write_text(FIXTURE_YAML, encoding="utf-8")
    monkeypatch.setattr(settings, "feature_gates_source", str(src))

    async with async_session() as db:
        await ensure_projects_seeded(db)
        await ensure_feature_gates_seeded(db)

    yield

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


def _client():
    from httpx import AsyncClient, ASGITransport
    from main import app

    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.mark.asyncio
async def test_projects_seeded_and_listed():
    async with _client() as client:
        resp = await client.get("/api/v1/config/projects", headers={"Authorization": f"Bearer {_admin_token()}"})
        assert resp.status_code == 200, resp.text
        codes = [p["code"] for p in resp.json()["projects"]]
        assert "platform-orchestrator" in codes
        assert len(codes) >= 6


@pytest.mark.asyncio
async def test_feature_flags_loaded_for_platform_orchestrator():
    async with _client() as client:
        resp = await client.get(
            "/api/v1/config/platform-orchestrator?category=feature_flag",
            headers={"Authorization": f"Bearer {_admin_token()}"},
        )
        assert resp.status_code == 200, resp.text
        items = resp.json().get("items", [])
        assert len(items) == 3
        keys = {it["key"] for it in items}
        assert keys == {"article_auto_fetch", "pipeline_v2", "premium_content"}
        pm = next(it for it in items if it["key"] == "premium_content")
        assert "enabled" in pm.get("value", "") and "tier" in pm.get("value", "")


@pytest.mark.asyncio
async def test_seed_idempotent(monkeypatch, tmp_path):
    from database import async_session
    from services.config_seed_service import ensure_feature_gates_seeded, ensure_projects_seeded

    src = tmp_path / "feature_gates2.yaml"
    src.write_text(FIXTURE_YAML, encoding="utf-8")
    monkeypatch.setattr(settings, "feature_gates_source", str(src))

    async with async_session() as db:
        assert await ensure_projects_seeded(db) == 0  # 已存在 → 0 新增
        assert await ensure_feature_gates_seeded(db) == 0  # 已导入 → 0 新增


@pytest.mark.asyncio
async def test_missing_source_skips_without_error(monkeypatch, tmp_path):
    from database import async_session
    from services.config_seed_service import ensure_feature_gates_seeded

    monkeypatch.setattr(settings, "feature_gates_source", str(tmp_path / "not-exists.yaml"))
    async with async_session() as db:
        assert await ensure_feature_gates_seeded(db) == 0