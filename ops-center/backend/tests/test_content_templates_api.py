"""Tests for ops-center 官方内容模板库管理与运行时下发。"""
import os
import sys
import tempfile
import uuid

import pytest
import pytest_asyncio

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

_RUN_ID = uuid.uuid4().hex[:8]
os.environ["OPS_DB_PATH"] = os.path.join(tempfile.gettempdir(), f"ops_ct_{_RUN_ID}.db")
os.environ["OPS_CONFIG_OUTPUT_DIR"] = os.path.join(tempfile.gettempdir(), f"ops_ct_cfg_{_RUN_ID}")
os.environ["OPS_SECRET_KEY"] = "test-secret"
os.environ["OPS_JWT_SECRET"] = "test-secret"
os.environ["OPS_CATALOG_API_KEY"] = "catalog-test-key"

import models  # noqa: F401
from config import settings


@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    from database import engine, Base, async_session
    from services.content_template_service import ensure_content_templates_seeded

    settings.catalog_api_key = os.environ.get("OPS_CATALOG_API_KEY", "catalog-test-key")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with async_session() as db:
        await ensure_content_templates_seeded(db)
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
async def test_content_templates_crud_seed_and_validation():
    async with _client() as client:
        h = _admin_headers()
        # 种子存在（5 个内置模板）
        lst = (await client.get("/api/v1/content-templates", headers=h)).json()
        ids = [i["id"] for i in lst["items"]]
        assert "preset-weekly" in ids and "preset-daily" in ids and len(ids) >= 5

        # 创建 + 校验
        r = await client.post("/api/v1/content-templates", json={
            "id": "tpl-test", "name": "测试模板", "category": "marketing", "title": "标题",
            "content": "正文内容", "platforms": ["wechat_mp"], "tags": ["test"], "sort_order": 60, "enabled": True,
        }, headers=h)
        assert r.status_code == 200, r.text
        assert r.json()["platforms"] == ["wechat_mp"]

        # 校验：id 字符集 / 空 name / 非字符串数组 / 负数 sort / content 超长
        assert (await client.post("/api/v1/content-templates", json={"id": "BAD ID", "name": "x"}, headers=h)).status_code == 400
        assert (await client.post("/api/v1/content-templates", json={"id": "tpl-x", "name": ""}, headers=h)).status_code == 400
        assert (await client.post("/api/v1/content-templates", json={"id": "tpl-x", "name": "x", "platforms": "not-a-list"}, headers=h)).status_code == 400
        assert (await client.post("/api/v1/content-templates", json={"id": "tpl-x", "name": "x", "platforms": [1, 2]}, headers=h)).status_code == 400
        assert (await client.post("/api/v1/content-templates", json={"id": "tpl-x", "name": "x", "sort_order": -1}, headers=h)).status_code == 400
        assert (await client.post("/api/v1/content-templates", json={"id": "tpl-x", "name": "x", "content": "x" * 20001}, headers=h)).status_code == 400

        # POST 重复 id → 409
        assert (await client.post("/api/v1/content-templates", json={"id": "preset-weekly", "name": "覆盖"}, headers=h)).status_code == 409

        # PUT 部分更新（name/content/enabled）+ 不存在 404
        r = await client.put("/api/v1/content-templates/preset-weekly", json={"name": "周报模板", "enabled": False}, headers=h)
        assert r.status_code == 200 and r.json()["name"] == "周报模板" and r.json()["enabled"] is False
        assert (await client.put("/api/v1/content-templates/nonexistent", json={"name": "x"}, headers=h)).status_code == 404
        assert (await client.delete("/api/v1/content-templates/nonexistent", headers=h)).status_code == 404

        # 权限：非 admin 写 403 / 读 200
        assert (await client.post("/api/v1/content-templates", json={"id": "x", "name": "y"}, headers=_normal_headers())).status_code == 403
        assert (await client.get("/api/v1/content-templates", headers=_normal_headers())).status_code == 200


@pytest.mark.asyncio
async def test_content_templates_runtime_bootstrap_and_soft_delete():
    async with _client() as client:
        h = _admin_headers()
        # 停用 preset-weekly → bootstrap 不含
        await client.put("/api/v1/content-templates/preset-weekly", json={"enabled": False}, headers=h)
        data = (await client.get("/api/v1/runtime/bootstrap", headers={"X-Catalog-Key": "catalog-test-key"})).json()
        tids = [t["id"] for t in data["content_templates"]]
        assert "preset-daily" in tids
        assert "preset-weekly" not in tids
        assert data["content_templates"][0]["builtin"] is True

        # 软删种子 → 重启种子化不复活
        await client.delete("/api/v1/content-templates/preset-product", headers=h)
        from services.content_template_service import ensure_content_templates_seeded
        from database import async_session
        async with async_session() as db:
            await ensure_content_templates_seeded(db)
        lst = (await client.get("/api/v1/content-templates", headers=h)).json()
        assert "preset-product" not in [i["id"] for i in lst["items"]]

        # 软删后可重建
        r = await client.post("/api/v1/content-templates", json={
            "id": "preset-product", "name": "产品发布（重建）", "category": "marketing", "title": "t",
            "content": "c", "platforms": [], "tags": [], "sort_order": 20, "enabled": True,
        }, headers=h)
        assert r.status_code == 200 and r.json()["enabled"] is True
