"""Tests for ops-center 关键词监测目录管理与运行时下发。"""
import os
import sys
import tempfile
import uuid

import pytest
import pytest_asyncio

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

_RUN_ID = uuid.uuid4().hex[:8]
os.environ["OPS_DB_PATH"] = os.path.join(tempfile.gettempdir(), f"ops_kw_{_RUN_ID}.db")
os.environ["OPS_CONFIG_OUTPUT_DIR"] = os.path.join(tempfile.gettempdir(), f"ops_kw_cfg_{_RUN_ID}")
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
async def test_keyword_watchlist_crud_validation_and_permissions():
    async with _client() as client:
        h = _admin_headers()
        # 创建
        r = await client.post("/api/v1/keyword-watchlist", json={
            "keyword": "AI视频", "category": "topic", "threshold": 2.5, "interval_minutes": 360, "enabled": True,
        }, headers=h)
        assert r.status_code == 200, r.text
        assert r.json()["threshold"] == 2.5

        # 校验：keyword 长度 / threshold / interval
        assert (await client.post("/api/v1/keyword-watchlist", json={"keyword": "x"}, headers=h)).status_code == 400
        assert (await client.post("/api/v1/keyword-watchlist", json={"keyword": "重复", "threshold": 0.5}, headers=h)).status_code == 400
        assert (await client.post("/api/v1/keyword-watchlist", json={"keyword": "间隔", "interval_minutes": 5}, headers=h)).status_code == 400
        assert (await client.post("/api/v1/keyword-watchlist", json={"keyword": "间隔", "interval_minutes": 20000}, headers=h)).status_code == 400
        # 重复 keyword → 400
        assert (await client.post("/api/v1/keyword-watchlist", json={"keyword": "AI视频"}, headers=h)).status_code == 400

        # 更新 / 不存在 404
        lst = (await client.get("/api/v1/keyword-watchlist", headers=h)).json()
        eid = lst["items"][0]["id"]
        r = await client.put(f"/api/v1/keyword-watchlist/{eid}", json={"threshold": 3.0, "enabled": False}, headers=h)
        assert r.status_code == 200 and r.json()["threshold"] == 3.0 and r.json()["enabled"] is False
        assert (await client.put("/api/v1/keyword-watchlist/999999", json={"threshold": 2.0}, headers=h)).status_code == 404
        # PUT 改 keyword 撞已存在 → 400（IntegrityError 兜底）
        await client.post("/api/v1/keyword-watchlist", json={"keyword": "第二个词"}, headers=h)
        lst = (await client.get("/api/v1/keyword-watchlist", headers=h)).json()
        eid0 = lst["items"][0]["id"]
        assert (await client.put(f"/api/v1/keyword-watchlist/{eid0}", json={"keyword": "第二个词"}, headers=h)).status_code == 400
        assert (await client.delete("/api/v1/keyword-watchlist/999999", headers=h)).status_code == 404

        # 权限：非 admin 写 403 / 读 200
        assert (await client.post("/api/v1/keyword-watchlist", json={"keyword": "新的"}, headers=_normal_headers())).status_code == 403
        assert (await client.get("/api/v1/keyword-watchlist", headers=_normal_headers())).status_code == 200


@pytest.mark.asyncio
async def test_keyword_watchlist_runtime_and_soft_delete():
    async with _client() as client:
        h = _admin_headers()
        await client.post("/api/v1/keyword-watchlist", json={"keyword": "AI视频", "interval_minutes": 360}, headers=h)
        await client.post("/api/v1/keyword-watchlist", json={"keyword": "直播带货", "enabled": True}, headers=h)

        data = (await client.get("/api/v1/runtime/bootstrap", headers={"X-Catalog-Key": "catalog-test-key"})).json()
        kw = {k["keyword"]: k for k in data["keyword_watchlist"]}
        assert "AI视频" in kw and kw["AI视频"]["interval_minutes"] == 360

        # 停用 → 不下发
        lst = (await client.get("/api/v1/keyword-watchlist", headers=h)).json()
        eid = [i["id"] for i in lst["items"] if i["keyword"] == "直播带货"][0]
        await client.put(f"/api/v1/keyword-watchlist/{eid}", json={"enabled": False}, headers=h)
        data2 = (await client.get("/api/v1/runtime/bootstrap", headers={"X-Catalog-Key": "catalog-test-key"})).json()
        assert "直播带货" not in {k["keyword"] for k in data2["keyword_watchlist"]}

        # 软删 → 不再列出/下发；可重建
        await client.delete(f"/api/v1/keyword-watchlist/{eid}", headers=h)
        lst2 = (await client.get("/api/v1/keyword-watchlist", headers=h)).json()
        assert "直播带货" not in [i["keyword"] for i in lst2["items"]]
        r = await client.post("/api/v1/keyword-watchlist", json={"keyword": "直播带货"}, headers=h)
        assert r.status_code == 200 and r.json()["enabled"] is True


def test_threshold_isfinite_guard():
    """threshold 拒绝 inf/nan（防 bootstrap 序列化 500）——JSON 无法表达，防御针对直接调用路径。"""
    from services.keyword_watchlist_service import validate_entry
    import math
    try:
        validate_entry({"keyword": "测试词", "threshold": float("inf")})
        raise AssertionError("inf 应被拒绝")
    except ValueError:
        pass
    try:
        validate_entry({"keyword": "测试词", "threshold": float("nan")})
        raise AssertionError("nan 应被拒绝")
    except ValueError:
        pass
    assert validate_entry({"keyword": "测试词", "threshold": 2.5})["threshold"] == 2.5
