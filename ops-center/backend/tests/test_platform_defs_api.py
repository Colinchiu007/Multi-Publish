"""Tests for ops-center 平台发布元数据管理与下发。"""
import os
import sys
import tempfile
import uuid

import pytest
import pytest_asyncio

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

_RUN_ID = uuid.uuid4().hex[:8]
os.environ["OPS_DB_PATH"] = os.path.join(tempfile.gettempdir(), f"ops_platform_defs_{_RUN_ID}.db")
os.environ["OPS_CONFIG_OUTPUT_DIR"] = os.path.join(tempfile.gettempdir(), f"ops_platform_configs_{_RUN_ID}")
os.environ["OPS_SECRET_KEY"] = "test-secret"
os.environ["OPS_JWT_SECRET"] = "test-secret"
os.environ["OPS_CATALOG_API_KEY"] = "catalog-test-key"

import models  # noqa: F401
from config import settings


@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    from database import engine, Base, async_session
    from services.platform_def_service import ensure_platform_def_seeded

    settings.catalog_api_key = os.environ.get("OPS_CATALOG_API_KEY", "catalog-test-key")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with async_session() as db:
        await ensure_platform_def_seeded(db)
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
async def test_platform_defs_crud_seed_and_validation():
    async with _client() as client:
        h = _admin_headers()
        # 种子存在
        lst = (await client.get("/api/v1/platform-defs", headers=h)).json()
        ids = [i["id"] for i in lst["items"]]
        assert "wechat_mp" in ids and "youtube" in ids

        # 创建 + 校验
        r = await client.post("/api/v1/platform-defs", json={
            "id": "test-platform", "name": "测试平台", "category": "中文",
            "content_category": "VIDEO", "max_title": 50, "max_content": 2000, "has_api": False,
        }, headers=h)
        assert r.status_code == 200, r.text
        assert r.json()["content_category"] == "VIDEO"

        # 非法值 → 400
        assert (await client.post("/api/v1/platform-defs", json={"id": "x", "name": "y", "content_category": "BAD"}, headers=h)).status_code == 400
        assert (await client.post("/api/v1/platform-defs", json={"id": "x", "name": "y", "max_title": -1}, headers=h)).status_code == 400
        assert (await client.post("/api/v1/platform-defs", json={"id": "x", "name": "y", "max_title": 1.5}, headers=h)).status_code == 400
        assert (await client.post("/api/v1/platform-defs", json={"id": "x", "name": "y", "has_api": "banana"}, headers=h)).status_code == 400
        assert (await client.post("/api/v1/platform-defs", json={"id": "x", "name": "y", "enabled": "ture"}, headers=h)).status_code == 400
        # id 字符集：仅小写字母/数字/下划线/短横线
        assert (await client.post("/api/v1/platform-defs", json={"id": "a/b", "name": "y"}, headers=h)).status_code == 400
        assert (await client.post("/api/v1/platform-defs", json={"id": "UPPER", "name": "y"}, headers=h)).status_code == 400
        # category / type 枚举
        assert (await client.post("/api/v1/platform-defs", json={"id": "x", "name": "y", "category": "未知区"}, headers=h)).status_code == 400
        assert (await client.post("/api/v1/platform-defs", json={"id": "x", "name": "y", "type": "weird"}, headers=h)).status_code == 400

        # POST 撞已存在 id → 409（不静默改写）
        r = await client.post("/api/v1/platform-defs", json={"id": "wechat_mp", "name": "覆盖尝试"}, headers=h)
        assert r.status_code == 409, r.text

        # 更新（部分更新）：仅传 name + enabled
        r = await client.put("/api/v1/platform-defs/wechat_mp", json={"name": "微信公众号", "enabled": False}, headers=h)
        assert r.status_code == 200 and r.json()["enabled"] is False and r.json()["name"] == "微信公众号"

        # null 不修改
        before = (await client.get("/api/v1/platform-defs", headers=h)).json()
        wp = next(i for i in before["items"] if i["id"] == "wechat_mp")
        r = await client.put("/api/v1/platform-defs/wechat_mp", json={"max_title": None}, headers=h)
        assert r.status_code == 200 and r.json()["max_title"] == wp["max_title"]

        # 路径 id 优先（body 里的 id 被忽略）
        r = await client.put("/api/v1/platform-defs/wechat_mp", json={"id": "other_id", "name": "公众号"}, headers=h)
        assert r.status_code == 200 and r.json()["id"] == "wechat_mp"

        # 空串清空上限（'' → null）
        r = await client.put("/api/v1/platform-defs/wechat_mp", json={"max_title": ""}, headers=h)
        assert r.status_code == 200 and r.json()["max_title"] is None

        # PUT 不存在 → 404
        assert (await client.put("/api/v1/platform-defs/nonexistent", json={"name": "x"}, headers=h)).status_code == 404
        # DELETE 不存在 → 404
        assert (await client.delete("/api/v1/platform-defs/nonexistent", headers=h)).status_code == 404

        # 权限：非 admin 写 403 / 读 200
        assert (await client.post("/api/v1/platform-defs", json={"id": "x", "name": "y"}, headers=_normal_headers())).status_code == 403
        assert (await client.get("/api/v1/platform-defs", headers=_normal_headers())).status_code == 200


@pytest.mark.asyncio
async def test_platform_defs_runtime_bootstrap():
    async with _client() as client:
        h = _admin_headers()
        # 停用 wechat_mp → bootstrap 不含
        await client.put("/api/v1/platform-defs/wechat_mp", json={"name": "微信公众号", "enabled": False}, headers=h)
        r = await client.get("/api/v1/runtime/bootstrap", headers={"X-Catalog-Key": "catalog-test-key"})
        assert r.status_code == 200
        data = r.json()
        pids = [p["id"] for p in data["platform_defs"]]
        assert "youtube" in pids
        assert "wechat_mp" not in pids  # 已下线
        assert "max_title" in data["platform_defs"][0]
        # bootstrap 缺少 Key 头（已配置 Key）→ 401；未配置 Key → 404 fail-closed
        assert (await client.get("/api/v1/runtime/bootstrap", headers={})).status_code == 401


@pytest.mark.asyncio
async def test_platform_defs_soft_delete_and_reseed():
    async with _client() as client:
        h = _admin_headers()
        # 软删种子平台
        r = await client.delete("/api/v1/platform-defs/wechat_mp", headers=h)
        assert r.status_code == 200
        lst = (await client.get("/api/v1/platform-defs", headers=h)).json()
        assert "wechat_mp" not in [i["id"] for i in lst["items"]]
        # 重启种子不复活
        from services.platform_def_service import ensure_platform_def_seeded
        from database import async_session
        async with async_session() as db:
            await ensure_platform_def_seeded(db)
        lst2 = (await client.get("/api/v1/platform-defs", headers=h)).json()
        assert "wechat_mp" not in [i["id"] for i in lst2["items"]]
        # bootstrap 不含已删除
        data = (await client.get("/api/v1/runtime/bootstrap", headers={"X-Catalog-Key": "catalog-test-key"})).json()
        assert "wechat_mp" not in [p["id"] for p in data["platform_defs"]]
        # 软删后重建：同一 id 可再创建（恢复）
        r = await client.post("/api/v1/platform-defs", json={
            "id": "wechat_mp", "name": "微信公众号（重建）", "category": "中文",
            "content_category": "IMAGE_TEXT", "type": "article", "max_title": 64, "max_content": 20000, "has_api": 0,
        }, headers=h)
        assert r.status_code == 200 and r.json()["enabled"] is True
