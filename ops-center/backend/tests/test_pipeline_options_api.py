"""Tests for ops-center 流水线选项控制 API + bootstrap 集成。"""
import os
import sys
import tempfile

import pytest
import pytest_asyncio

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

os.environ["OPS_DB_PATH"] = os.path.join(tempfile.gettempdir(), "ops_pipeline_options_test.db")
os.environ["OPS_CONFIG_OUTPUT_DIR"] = os.path.join(tempfile.gettempdir(), "ops_pipeline_options_configs")
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


# ─── 场景 1：空数据库返回空列表 ───────────────────────────

@pytest.mark.asyncio
async def test_list_empty_returns_empty_items():
    async with _client() as client:
        r = await client.get("/api/v1/pipeline-options", headers=_admin_headers())
        assert r.status_code == 200, r.text
        data = r.json()
        assert "items" in data
        assert isinstance(data["items"], list)


# ─── 场景 2：upsert 创建新选项并列表返回 ───────────────────

@pytest.mark.asyncio
async def test_upsert_create_and_list():
    async with _client() as client:
        h = _admin_headers()
        payload = {
            "items": [
                {"option_key": "basic.resolution", "group": "basic", "field": "resolution",
                 "label": "比例与分辨率", "visible": 1, "default_value": "1920x1080",
                 "description": "", "sort_order": 1},
                {"option_key": "basic.voiceSpeed", "group": "basic", "field": "voiceSpeed",
                 "label": "旁白语速", "visible": 1, "default_value": "1.0",
                 "description": "", "sort_order": 2},
            ]
        }
        r = await client.put("/api/v1/pipeline-options", json=payload, headers=h)
        assert r.status_code == 200, r.text
        saved = r.json()
        assert len(saved["items"]) == 2
        assert saved["items"][0]["option_key"] == "basic.resolution"
        assert saved["items"][0]["visible"] == 1

        # 列表验证
        r2 = await client.get("/api/v1/pipeline-options", headers=h)
        assert r2.status_code == 200
        items = r2.json()["items"]
        assert len(items) == 2
        keys = {it["option_key"] for it in items}
        assert "basic.resolution" in keys
        assert "basic.voiceSpeed" in keys


# ─── 场景 3：upsert 更新已有选项（visible 切换） ───────────

@pytest.mark.asyncio
async def test_upsert_toggle_visibility():
    async with _client() as client:
        h = _admin_headers()
        # 创建
        await client.put("/api/v1/pipeline-options", json={
            "items": [{"option_key": "basic.resolution", "group": "basic", "field": "resolution",
                       "label": "比例与分辨率", "visible": 1, "default_value": "1920x1080",
                       "description": "", "sort_order": 1}]
        }, headers=h)

        # 更新为隐藏
        r = await client.put("/api/v1/pipeline-options", json={
            "items": [{"option_key": "basic.resolution", "group": "basic", "field": "resolution",
                       "label": "比例与分辨率", "visible": 0, "default_value": "1280x720",
                       "description": "", "sort_order": 1}]
        }, headers=h)
        assert r.status_code == 200, r.text
        items = r.json()["items"]
        assert len(items) == 1
        assert items[0]["visible"] == 0
        assert items[0]["default_value"] == "1280x720"


# ─── 场景 4：管理员权限校验 ────────────────────────────────

@pytest.mark.asyncio
async def test_non_admin_denied():
    from datetime import datetime, timedelta, timezone
    from jose import jwt
    async with _client() as client:
        # 非 admin 用户
        payload_user = {"sub": "user1", "username": "user1", "role": "user",
                        "exp": datetime.now(timezone.utc) + timedelta(hours=1)}
        token_user = jwt.encode(payload_user, settings.get_jwt_secret(), algorithm=settings.jwt_algorithm)
        headers_user = {"Authorization": f"Bearer {token_user}"}

        r = await client.get("/api/v1/pipeline-options", headers=headers_user)
        assert r.status_code == 403, r.text

        r = await client.put("/api/v1/pipeline-options", json={"items": []}, headers=headers_user)
        assert r.status_code == 403, r.text


# ─── 场景 5：bootstrap 返回 visibility 和 defaults ─────────

@pytest.mark.asyncio
async def test_bootstrap_includes_pipeline_options():
    async with _client() as client:
        h = _admin_headers()
        # 创建选项（含隐藏）
        await client.put("/api/v1/pipeline-options", json={
            "items": [
                {"option_key": "basic.resolution", "group": "basic", "field": "resolution",
                 "label": "比例与分辨率", "visible": 1, "default_value": "1920x1080",
                 "description": "", "sort_order": 1},
                {"option_key": "basic.voiceSpeed", "group": "basic", "field": "voiceSpeed",
                 "label": "旁白语速", "visible": 0, "default_value": "1.0",
                 "description": "", "sort_order": 2},
            ]
        }, headers=h)

        # bootstrap 接口（无需认证）
        r = await client.get("/api/v1/runtime/bootstrap")
        assert r.status_code == 200, r.text
        data = r.json()
        assert "pipelineOptions" in data
        po = data["pipelineOptions"]
        assert "visibility" in po
        assert "defaults" in po

        # 可见的选项
        assert po["visibility"]["basic.resolution"] == True
        # 隐藏的选项（CRITICAL：必须出现在 map 中且为 false）
        assert "basic.voiceSpeed" in po["visibility"]
        assert po["visibility"]["basic.voiceSpeed"] == False
        # 默认值
        assert po["defaults"]["basic.resolution"] == "1920x1080"
        assert po["defaults"]["basic.voiceSpeed"] == "1.0"


# ─── 场景 6：未认证用户访问 bootstrap 也能获取 pipelineOptions ──

@pytest.mark.asyncio
async def test_bootstrap_no_auth_returns_pipeline_options():
    async with _client() as client:
        r = await client.get("/api/v1/runtime/bootstrap")
        assert r.status_code == 200, r.text
        data = r.json()
        assert "pipelineOptions" in data
        # 未配置时返回空 map
        assert isinstance(data["pipelineOptions"]["visibility"], dict)
        assert isinstance(data["pipelineOptions"]["defaults"], dict)
