"""Tests for ops-center 流水线所需依赖目录。"""
import os
import sys
import tempfile
import uuid

import pytest
import pytest_asyncio

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

_RUN_ID = uuid.uuid4().hex[:8]
os.environ["OPS_DB_PATH"] = os.path.join(tempfile.gettempdir(), f"ops_pd_{_RUN_ID}.db")
os.environ["OPS_CONFIG_OUTPUT_DIR"] = os.path.join(tempfile.gettempdir(), f"ops_pd_cfg_{_RUN_ID}")
os.environ["OPS_SECRET_KEY"] = "test-secret"
os.environ["OPS_JWT_SECRET"] = "test-secret"
os.environ["OPS_CATALOG_API_KEY"] = "catalog-test-key"

import models  # noqa: F401
from config import settings


@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    from database import engine, Base, async_session
    from services.pipeline_dependency_service import ensure_pipeline_deps_seeded

    settings.catalog_api_key = os.environ.get("OPS_CATALOG_API_KEY", "catalog-test-key")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with async_session() as db:
        await ensure_pipeline_deps_seeded(db)
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
async def test_pipeline_deps_seed_crud_validation():
    async with _client() as client:
        h = _admin_headers()
        # 种子：story2video-compose 含 llm/image/tts/video(可选)
        lst = (await client.get("/api/v1/pipeline-dependencies", headers=h)).json()
        assert lst["count"] >= 30
        s2v = [i for i in lst["items"] if i["pipeline_id"] == "story2video-compose"]
        types = {i["model_type"]: i for i in s2v}
        assert "llm" in types and "image" in types and "tts" in types and "video" in types
        assert types["image"]["provider_candidates"]  # 供应商候选非空
        assert types["image"]["default_provider"] in types["image"]["provider_candidates"]
        assert types["video"]["required"] is False  # 可选
        assert types["llm"]["required"] is True

        # 校验：pipeline_id 字符集 / model_type 枚举 / default 不在候选 / 候选类型
        assert (await client.post("/api/v1/pipeline-dependencies", json={"pipeline_id": "BAD ID", "model_type": "llm"}, headers=h)).status_code == 400
        assert (await client.post("/api/v1/pipeline-dependencies", json={"pipeline_id": "x", "model_type": "weird"}, headers=h)).status_code == 400
        assert (await client.post("/api/v1/pipeline-dependencies", json={"pipeline_id": "x", "model_type": "llm", "provider_candidates": ["openai"], "default_provider": "not-in-list"}, headers=h)).status_code == 400
        assert (await client.post("/api/v1/pipeline-dependencies", json={"pipeline_id": "x", "model_type": "llm", "provider_candidates": [1, 2]}, headers=h)).status_code == 400
        # JSON 字符串候选：null/对象/非数组 → 400（防 500/绕过）
        assert (await client.post("/api/v1/pipeline-dependencies", json={"pipeline_id": "x", "model_type": "llm", "provider_candidates": "null"}, headers=h)).status_code == 400
        assert (await client.post("/api/v1/pipeline-dependencies", json={"pipeline_id": "x", "model_type": "llm", "provider_candidates": "{}"}, headers=h)).status_code == 400
        assert (await client.post("/api/v1/pipeline-dependencies", json={"pipeline_id": "x", "model_type": "llm", "provider_candidates": "5"}, headers=h)).status_code == 400
        # 候选 >50 / sort_order 非法 / 候选空但默认值存在 → 400
        assert (await client.post("/api/v1/pipeline-dependencies", json={"pipeline_id": "x", "model_type": "llm", "provider_candidates": ["p%d" % i for i in range(51)]}, headers=h)).status_code == 400
        assert (await client.post("/api/v1/pipeline-dependencies", json={"pipeline_id": "x", "model_type": "llm", "sort_order": -1}, headers=h)).status_code == 400
        assert (await client.post("/api/v1/pipeline-dependencies", json={"pipeline_id": "x", "model_type": "llm", "sort_order": True}, headers=h)).status_code == 400
        assert (await client.post("/api/v1/pipeline-dependencies", json={"pipeline_id": "x", "model_type": "llm", "provider_candidates": [], "default_provider": "anthropic"}, headers=h)).status_code == 400
        # required/enabled 严格布尔
        assert (await client.post("/api/v1/pipeline-dependencies", json={"pipeline_id": "x", "model_type": "llm", "required": "yes"}, headers=h)).status_code == 400

        # 创建 + 重复 400
        r = await client.post("/api/v1/pipeline-dependencies", json={
            "pipeline_id": "screen-demo", "pipeline_name": "屏幕演示录制", "model_type": "llm",
            "required": False, "provider_candidates": ["anthropic", "openai"], "default_provider": "anthropic",
            "description": "字幕/标注可选", "enabled": True,
        }, headers=h)
        assert r.status_code == 200, r.text
        assert r.json()["default_provider"] == "anthropic"
        assert (await client.post("/api/v1/pipeline-dependencies", json={"pipeline_id": "screen-demo", "model_type": "llm"}, headers=h)).status_code == 400
        # 筛选
        only = (await client.get("/api/v1/pipeline-dependencies?pipeline_id=screen-demo", headers=h)).json()
        assert only["count"] == 1

        # 更新 / 404 / 权限
        eid = r.json()["id"]
        r2 = await client.put(f"/api/v1/pipeline-dependencies/{eid}", json={"default_provider": "openai"}, headers=h)
        assert r2.status_code == 200 and r2.json()["default_provider"] == "openai"
        # PUT 改 pipeline_id+model_type 撞已存在 → 400
        s2v_eid = next(i["id"] for i in lst["items"] if i["pipeline_id"] == "story2video-compose" and i["model_type"] == "llm")
        assert (await client.put(f"/api/v1/pipeline-dependencies/{s2v_eid}", json={"pipeline_id": "screen-demo", "model_type": "llm"}, headers=h)).status_code == 400
        assert (await client.put("/api/v1/pipeline-dependencies/999999", json={"default_provider": "x"}, headers=h)).status_code == 404
        assert (await client.delete("/api/v1/pipeline-dependencies/999999", headers=h)).status_code == 404
        assert (await client.post("/api/v1/pipeline-dependencies", json={"pipeline_id": "y", "model_type": "llm"}, headers=_normal_headers())).status_code == 403
        assert (await client.get("/api/v1/pipeline-dependencies", headers=_normal_headers())).status_code == 200


@pytest.mark.asyncio
async def test_pipeline_deps_soft_delete_rebuild():
    async with _client() as client:
        h = _admin_headers()
        # 软删种子 → 不复活；可重建
        lst = (await client.get("/api/v1/pipeline-dependencies", headers=h)).json()
        target = next(i for i in lst["items"] if i["pipeline_id"] == "cinematic")
        await client.delete(f"/api/v1/pipeline-dependencies/{target['id']}", headers=h)
        lst2 = (await client.get("/api/v1/pipeline-dependencies?pipeline_id=cinematic", headers=h)).json()
        assert lst2["count"] == 0
        from services.pipeline_dependency_service import ensure_pipeline_deps_seeded
        from database import async_session
        async with async_session() as db:
            await ensure_pipeline_deps_seeded(db)
        lst3 = (await client.get("/api/v1/pipeline-dependencies?pipeline_id=cinematic", headers=h)).json()
        assert lst3["count"] == 0  # 软删不复活
        # 重建
        r = await client.post("/api/v1/pipeline-dependencies", json={
            "pipeline_id": "cinematic", "pipeline_name": "电影感短片", "model_type": "video",
            "required": True, "provider_candidates": ["minimax", "runway"], "default_provider": "minimax", "enabled": True,
        }, headers=h)
        assert r.status_code == 200 and r.json()["enabled"] is True


def test_provider_catalog_matches_model_preset_catalog():
    """PROVIDERS/DEFAULTS 必须是 ops-center 模型预设目录的子集（防代码事实漂移）。"""
    from services.pipeline_dependency_service import PROVIDERS, DEFAULTS
    from services.model_preset_service import PRESET_CATALOG

    catalog = {}
    for p in PRESET_CATALOG:
        pid = p.get("id")
        cat = p.get("category") or "llm"
        catalog.setdefault(cat, set()).add(pid)
    for mtype, providers in PROVIDERS.items():
        assert providers, f"{mtype} 候选为空"
        for pid in providers:
            # multimodal 候选可来自 llm（多模态能力供应商可能归推理类）；其余按类别归属
            bucket = "multimodal" if mtype == "multimodal" else mtype
            allowed = (catalog.get("multimodal", set()) | catalog.get("llm", set())) if mtype == "multimodal" else catalog.get(bucket, set())
            assert pid in allowed, f"供应商 {pid} 不在模型预设目录 {bucket} 中"
        assert DEFAULTS[mtype] in providers, f"默认 {DEFAULTS[mtype]} 不在 {mtype} 候选中"
