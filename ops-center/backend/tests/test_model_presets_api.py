"""Tests for OpsCenter model preset catalog API."""
import json
import os
import sys
import tempfile

import pytest
import pytest_asyncio
import socket

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


def _user_token():
    """普通登录用户 token（orchestrator 签发形态：无 role 字段）。"""
    from datetime import datetime, timedelta, timezone
    from jose import jwt
    from config import settings
    payload = {
        "sub": "user-uuid",
        "username": "regular-user",
        "tier": 1,
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
async def test_ensure_catalog_seeded_backfills_missing_rate_per_minute():
    """已存在但 rate_per_minute 为 NULL 的预设行按目录默认值回填（2026-08-13 默认初始值）。"""
    from database import async_session
    from models import ModelPreset
    from sqlalchemy import select
    from services.model_preset_service import ensure_catalog_seeded, PRESET_CATALOG

    async with async_session() as db:
        row = (await db.execute(select(ModelPreset).where(ModelPreset.id == "kling"))).scalar_one()
        assert row.rate_per_minute is not None  # 种子已填
        row.rate_per_minute = None  # 模拟旧目录版本遗留 NULL
        await db.commit()

        await ensure_catalog_seeded(db)

        row2 = (await db.execute(select(ModelPreset).where(ModelPreset.id == "kling"))).scalar_one()
        catalog_rpm = next(i["rate_per_minute"] for i in PRESET_CATALOG if i["id"] == "kling")
        assert row2.rate_per_minute == catalog_rpm


@pytest.mark.asyncio
async def test_ensure_catalog_seeded_keeps_manual_rpm():
    """回填不覆盖运营手工设置过的 rpm（仅补 NULL）。"""
    from database import async_session
    from models import ModelPreset
    from sqlalchemy import select
    from services.model_preset_service import ensure_catalog_seeded

    async with async_session() as db:
        row = (await db.execute(select(ModelPreset).where(ModelPreset.id == "kling"))).scalar_one()
        row.rate_per_minute = 99  # 运营手工值
        await db.commit()

        await ensure_catalog_seeded(db)

        row2 = (await db.execute(select(ModelPreset).where(ModelPreset.id == "kling"))).scalar_one()
        assert row2.rate_per_minute == 99


@pytest.mark.asyncio
async def test_ensure_catalog_seeded_backfills_missing_models_url():
    """已存在但 models_url 为空（旧版本遗留）的预设行按官方清单回填（2026-08-27 新增 Models 端点预置）。"""
    from database import async_session
    from models import ModelPreset
    from sqlalchemy import select
    from services.model_preset_service import ensure_catalog_seeded, OFFICIAL_MODELS_URLS

    async with async_session() as db:
        row = (await db.execute(select(ModelPreset).where(ModelPreset.id == "openai"))).scalar_one()
        assert row.models_url == OFFICIAL_MODELS_URLS["openai"]  # 种子已预置
        row.models_url = ""  # 模拟旧目录版本遗留空值
        await db.commit()

        await ensure_catalog_seeded(db)

        row2 = (await db.execute(select(ModelPreset).where(ModelPreset.id == "openai"))).scalar_one()
        assert row2.models_url == OFFICIAL_MODELS_URLS["openai"]


@pytest.mark.asyncio
async def test_ensure_catalog_seeded_keeps_manual_models_url():
    """回填不覆盖运营手工设置过的 models_url（仅补空值）。"""
    from database import async_session
    from models import ModelPreset
    from sqlalchemy import select
    from services.model_preset_service import ensure_catalog_seeded

    async with async_session() as db:
        row = (await db.execute(select(ModelPreset).where(ModelPreset.id == "openai"))).scalar_one()
        row.models_url = "https://manual.example.com/v1/models"  # 运营手工值
        await db.commit()

        await ensure_catalog_seeded(db)

        row2 = (await db.execute(select(ModelPreset).where(ModelPreset.id == "openai"))).scalar_one()
        assert row2.models_url == "https://manual.example.com/v1/models"


@pytest.mark.asyncio
async def test_ensure_catalog_seeded_skips_customized_base_url():
    """回填不注入与官方 base_url 不一致的自定义行（防止给内网网关代理行塞官方端点）。"""
    from database import async_session
    from models import ModelPreset
    from sqlalchemy import select
    from services.model_preset_service import ensure_catalog_seeded

    async with async_session() as db:
        row = (await db.execute(select(ModelPreset).where(ModelPreset.id == "openai"))).scalar_one()
        row.models_url = ""  # 模拟旧版本遗留空值
        row.base_url = "http://10.0.0.8:8080/v1"  # 运营改指向内部网关
        await db.commit()

        await ensure_catalog_seeded(db)

        row2 = (await db.execute(select(ModelPreset).where(ModelPreset.id == "openai"))).scalar_one()
        assert row2.models_url == ""  # 自定义 base_url 行不得被回填


@pytest.mark.asyncio
async def test_list_presets_requires_authentication():
    """未携带 token 时列表返回 401（未认证）。"""
    from httpx import AsyncClient, ASGITransport
    from main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/v1/model-presets")
        assert resp.status_code == 401


@pytest.mark.asyncio
async def test_list_presets_allows_regular_user():
    """普通登录用户可读运营目录（默认不含隐藏项）。"""
    from httpx import AsyncClient, ASGITransport
    from main import app

    transport = ASGITransport(app=app)
    headers = {"Authorization": f"Bearer {_user_token()}"}
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/v1/model-presets", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["count"] > 0
        # 默认不返回隐藏项（种子目录全部可见，这里至少能读）
        assert all(p["is_visible"] for p in data["presets"])


@pytest.mark.asyncio
async def test_include_hidden_requires_admin():
    """普通用户请求 include_hidden=true 返回 403。"""
    from httpx import AsyncClient, ASGITransport
    from main import app

    transport = ASGITransport(app=app)
    user_headers = {"Authorization": f"Bearer {_user_token()}"}
    admin_headers = {"Authorization": f"Bearer {_admin_token()}"}
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/v1/model-presets?include_hidden=true", headers=user_headers)
        assert resp.status_code == 403

        resp = await client.get("/api/v1/model-presets?include_hidden=true", headers=admin_headers)
        assert resp.status_code == 200


@pytest.mark.asyncio
async def test_hidden_preset_hidden_from_regular_user_list():
    """普通用户列表默认不含隐藏项（先隐藏一项再验证过滤）。"""
    from httpx import AsyncClient, ASGITransport
    from main import app

    transport = ASGITransport(app=app)
    admin_headers = {"Authorization": f"Bearer {_admin_token()}"}
    user_headers = {"Authorization": f"Bearer {_user_token()}"}
    body = {
        "id": "minimax-tts",
        "name": "MiniMax TTS",
        "category": "tts",
        "models": ["speech-2.8-turbo"],
        "is_visible": False,
    }
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await client.put("/api/v1/model-presets/minimax-tts", json=body, headers=admin_headers)

        resp = await client.get("/api/v1/model-presets", headers=user_headers)
        assert resp.status_code == 200
        ids = [p["id"] for p in resp.json()["presets"]]
        assert "minimax-tts" not in ids

        resp = await client.get("/api/v1/model-presets?include_hidden=true", headers=admin_headers)
        assert resp.status_code == 200
        ids = [p["id"] for p in resp.json()["presets"]]
        assert "minimax-tts" in ids


@pytest.mark.asyncio
async def test_hidden_preset_single_get_blocked_for_regular_user():
    """普通用户按 ID 读取隐藏预设返回 404（与 include_hidden 语义一致）。"""
    from httpx import AsyncClient, ASGITransport
    from main import app

    transport = ASGITransport(app=app)
    admin_headers = {"Authorization": f"Bearer {_admin_token()}"}
    user_headers = {"Authorization": f"Bearer {_user_token()}"}
    body = {
        "id": "minimax-tts",
        "name": "MiniMax TTS",
        "category": "tts",
        "models": ["speech-2.8-turbo"],
        "is_visible": False,
    }
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await client.put("/api/v1/model-presets/minimax-tts", json=body, headers=admin_headers)

        resp = await client.get("/api/v1/model-presets/minimax-tts", headers=user_headers)
        assert resp.status_code == 404

        resp = await client.get("/api/v1/model-presets/minimax-tts", headers=admin_headers)
        assert resp.status_code == 200
        assert resp.json()["id"] == "minimax-tts"


@pytest.mark.asyncio
async def test_write_operations_require_admin():
    """新增/编辑/删除模型预设必须 admin（普通用户 403）。"""
    from httpx import AsyncClient, ASGITransport
    from main import app

    transport = ASGITransport(app=app)
    user_headers = {"Authorization": f"Bearer {_user_token()}"}
    body = {
        "id": "user-blocked",
        "name": "User Blocked",
        "category": "llm",
        "models": ["m1"],
    }
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/api/v1/model-presets", json=body, headers=user_headers)
        assert resp.status_code == 403

        resp = await client.put("/api/v1/model-presets/minimax-tts", json=body, headers=user_headers)
        assert resp.status_code == 403

        resp = await client.delete("/api/v1/model-presets/minimax-tts", headers=user_headers)
        assert resp.status_code == 403


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


# ─────────────────────────────────────────────────────────────
# 新增：运营信息字段（models_url / rate_per_minute / limit_per_5h）
# ─────────────────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_save_new_info_fields():
    from httpx import AsyncClient, ASGITransport
    from main import app

    transport = ASGITransport(app=app)
    headers = {"Authorization": f"Bearer {_admin_token()}"}
    body = {
        "id": "info-test",
        "name": "Info Test",
        "category": "llm",
        "base_url": "https://api.example.com/v1",
        "models_url": "https://api.example.com/v1/models",
        "models": ["m1", "m2"],
        "default_model": "m1",
        "rate_per_minute": 30,
        "limit_per_5h": 1000,
    }
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/api/v1/model-presets", json=body, headers=headers)
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["models_url"] == "https://api.example.com/v1/models"
        assert data["rate_per_minute"] == 30
        assert data["limit_per_5h"] == 1000

        resp = await client.get("/api/v1/model-presets/info-test", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["base_url"] == "https://api.example.com/v1"


@pytest.mark.asyncio
async def test_new_info_fields_allow_empty():
    from httpx import AsyncClient, ASGITransport
    from main import app

    transport = ASGITransport(app=app)
    headers = {"Authorization": f"Bearer {_admin_token()}"}
    body = {
        "id": "empty-fields",
        "name": "Empty Fields",
        "category": "tts",
        "models_url": "",
        "rate_per_minute": None,
        "limit_per_5h": "",
    }
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/api/v1/model-presets", json=body, headers=headers)
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["models_url"] == ""
        assert data["rate_per_minute"] is None
        assert data["limit_per_5h"] is None


@pytest.mark.asyncio
async def test_invalid_models_url_rejected():
    from httpx import AsyncClient, ASGITransport
    from main import app

    transport = ASGITransport(app=app)
    headers = {"Authorization": f"Bearer {_admin_token()}"}
    body = {"id": "bad-url", "name": "Bad URL", "category": "llm", "models_url": "ftp://example.com/models"}
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/api/v1/model-presets", json=body, headers=headers)
        assert resp.status_code == 400
        assert "models_url" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_invalid_numbers_rejected():
    from httpx import AsyncClient, ASGITransport
    from main import app

    transport = ASGITransport(app=app)
    headers = {"Authorization": f"Bearer {_admin_token()}"}
    for field, bad in [("rate_per_minute", -1), ("rate_per_minute", "abc"), ("rate_per_minute", 100001),
                       ("limit_per_5h", -5), ("limit_per_5h", 10000001), ("limit_per_5h", 1.5)]:
        body = {"id": "num-test", "name": "Num Test", "category": "llm", field: bad}
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post("/api/v1/model-presets", json=body, headers=headers)
            assert resp.status_code == 400, f"{field}={bad} should fail"
            assert field in resp.json()["detail"]


@pytest.mark.asyncio
async def test_default_model_must_be_in_models():
    from httpx import AsyncClient, ASGITransport
    from main import app

    transport = ASGITransport(app=app)
    headers = {"Authorization": f"Bearer {_admin_token()}"}
    body = {
        "id": "default-mismatch",
        "name": "Default Mismatch",
        "category": "llm",
        "models": ["m1", "m2"],
        "default_model": "not-in-list",
    }
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/api/v1/model-presets", json=body, headers=headers)
        assert resp.status_code == 400
        assert "默认模型 ID 必须在模型列表中" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_unknown_capability_doc_key_rejected():
    from httpx import AsyncClient, ASGITransport
    from main import app

    transport = ASGITransport(app=app)
    headers = {"Authorization": f"Bearer {_admin_token()}"}
    body = {
        "id": "bad-capdoc",
        "name": "Bad Cap Doc",
        "category": "multimodal",
        "is_multimodal": True,
        "capabilities": ["llm"],
        "capability_models": {"llm": "m1"},
        "capability_doc_links": {"hacking": ["https://example.com"]},
    }
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/api/v1/model-presets", json=body, headers=headers)
        assert resp.status_code == 400
        assert "未知的能力文档键" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_multimodal_seven_doc_keys_allowed():
    from httpx import AsyncClient, ASGITransport
    from main import app

    transport = ASGITransport(app=app)
    headers = {"Authorization": f"Bearer {_admin_token()}"}
    caps = ["llm", "image", "video", "tts", "voice_clone", "speech_recognition", "vision"]
    body = {
        "id": "seven-caps",
        "name": "Seven Caps",
        "category": "multimodal",
        "is_multimodal": True,
        "capabilities": caps,
        "capability_models": {c: f"{c}-model" for c in caps},
        "capability_doc_links": {c: [f"https://example.com/{c}"] for c in caps},
    }
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/api/v1/model-presets", json=body, headers=headers)
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert set(data["capability_doc_links"].keys()) == set(caps)



def _fake_async_client(fake_response):
    """构造支持 async with 的 httpx.AsyncClient fake。"""
    from unittest.mock import AsyncMock
    client = AsyncMock()
    client.get = AsyncMock(return_value=fake_response)
    client.__aenter__ = AsyncMock(return_value=client)
    client.__aexit__ = AsyncMock(return_value=False)
    return client
# ─────────────────────────────────────────────────────────────
# 新增：获取模型ID 端点（fetch-models）
# ─────────────────────────────────────────────────────────────
class _FakeResponse:
    def __init__(self, status_code=200, content=None, json_data=None):
        self.status_code = status_code
        if content is None:
            content = json.dumps(json_data if json_data is not None else []).encode("utf-8")
        self.content = content
        self._json = json_data

    def json(self):
        return self._json


@pytest.mark.asyncio
async def test_fetch_models_requires_models_url():
    import socket
    from httpx import AsyncClient, ASGITransport
    from main import app

    transport = ASGITransport(app=app)
    headers = {"Authorization": f"Bearer {_admin_token()}"}
    # 使用未配置 models_url 的自定义预设
    body = {"id": "fetch-nourl", "name": "Fetch NoURL", "category": "llm", "models": [], "default_model": ""}
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await client.post("/api/v1/model-presets", json=body, headers=headers)
        resp = await client.post("/api/v1/model-presets/fetch-nourl/fetch-models", headers=headers)
        assert resp.status_code == 400
        assert "models_url" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_fetch_models_requires_admin():
    from httpx import AsyncClient, ASGITransport
    from main import app

    transport = ASGITransport(app=app)
    user_headers = {"Authorization": f"Bearer {_user_token()}"}
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/api/v1/model-presets/openai/fetch-models", headers=user_headers)
        assert resp.status_code == 403


@pytest.mark.asyncio
async def test_fetch_models_success_contract():
    import json as _json
    from unittest.mock import AsyncMock, patch
    from httpx import AsyncClient, ASGITransport
    from main import app

    transport = ASGITransport(app=app)
    headers = {"Authorization": f"Bearer {_admin_token()}"}
    body = {
        "id": "fetch-ok",
        "name": "Fetch OK",
        "category": "llm",
        "models_url": "https://api.example.com/v1/models",
        "models": ["old-a"],
        "default_model": "old-a",
    }
    fake = _FakeResponse(status_code=200, json_data={"data": [{"id": "new-a"}, {"id": "new-b"}, "", 123]})
    with patch("socket.getaddrinfo", return_value=[(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443))]), \
         patch("httpx.AsyncClient", return_value=_fake_async_client(fake)):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post("/api/v1/model-presets", json=body, headers=headers)
            assert resp.status_code == 200
            resp2 = await client.post("/api/v1/model-presets/fetch-ok/fetch-models", headers=headers)
            assert resp2.status_code == 200, resp2.text
            data = resp2.json()
            assert data["models"] == ["new-a", "new-b"]
            assert data["count"] == 2
            # default_model 不在新列表 → 清空
            assert data["default_model"] == ""

            # 回写已持久化
            got = await client.get("/api/v1/model-presets/fetch-ok", headers=headers)
            assert got.json()["models"] == ["new-a", "new-b"]


@pytest.mark.asyncio
async def test_fetch_models_non_json_rejected():
    from unittest.mock import AsyncMock, patch
    from httpx import AsyncClient, ASGITransport
    from main import app

    transport = ASGITransport(app=app)
    headers = {"Authorization": f"Bearer {_admin_token()}"}
    body = {"id": "fetch-badjson", "name": "Fetch BadJSON", "category": "llm",
            "models_url": "https://api.example.com/v1/models", "models": ["keep"], "default_model": "keep"}
    fake = _FakeResponse(status_code=200, content=b"<html>not json</html>")
    with patch("socket.getaddrinfo", return_value=[(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443))]), \
         patch("httpx.AsyncClient", return_value=_fake_async_client(fake)):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            await client.post("/api/v1/model-presets", json=body, headers=headers)
            resp = await client.post("/api/v1/model-presets/fetch-badjson/fetch-models", headers=headers)
            assert resp.status_code == 400
            assert "JSON" in resp.json()["detail"]
            # 失败不修改已有 models
            got = await client.get("/api/v1/model-presets/fetch-badjson", headers=headers)
            assert got.json()["models"] == ["keep"]


@pytest.mark.asyncio
async def test_fetch_models_redirect_rejected():
    from unittest.mock import AsyncMock, patch
    from httpx import AsyncClient, ASGITransport
    from main import app

    transport = ASGITransport(app=app)
    headers = {"Authorization": f"Bearer {_admin_token()}"}
    body = {"id": "fetch-redirect", "name": "Fetch Redirect", "category": "llm",
            "models_url": "https://api.example.com/v1/models", "models": [], "default_model": ""}
    fake = _FakeResponse(status_code=302, content=b"")
    with patch("socket.getaddrinfo", return_value=[(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443))]), \
         patch("httpx.AsyncClient", return_value=_fake_async_client(fake)):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            await client.post("/api/v1/model-presets", json=body, headers=headers)
            resp = await client.post("/api/v1/model-presets/fetch-redirect/fetch-models", headers=headers)
            assert resp.status_code == 400
            assert "302" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_fetch_models_ssrf_private_ip_rejected():
    import socket
    from unittest.mock import AsyncMock, patch
    from httpx import AsyncClient, ASGITransport
    from main import app

    transport = ASGITransport(app=app)
    headers = {"Authorization": f"Bearer {_admin_token()}"}
    body = {"id": "fetch-ssrf", "name": "Fetch SSRF", "category": "llm",
            "models_url": "https://internal.example.com/v1/models", "models": [], "default_model": ""}
    fake = _FakeResponse(status_code=200, json_data={"models": ["m1"]})
    with patch("socket.getaddrinfo", return_value=[(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("10.0.0.1", 443))]), \
         patch("httpx.AsyncClient", return_value=AsyncMock(get=AsyncMock(return_value=fake))):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            await client.post("/api/v1/model-presets", json=body, headers=headers)
            resp = await client.post("/api/v1/model-presets/fetch-ssrf/fetch-models", headers=headers)
            assert resp.status_code == 400
            assert "私网" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_url_with_userinfo_rejected():
    from httpx import AsyncClient, ASGITransport
    from main import app

    transport = ASGITransport(app=app)
    headers = {"Authorization": f"Bearer {_admin_token()}"}
    body = {"id": "userinfo-url", "name": "Userinfo URL", "category": "llm",
            "models_url": "https://user:pass@api.example.com/v1/models"}
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/api/v1/model-presets", json=body, headers=headers)
        assert resp.status_code == 400
        assert "models_url" in resp.json()["detail"]


# ─────────────────────────────────────────────────────────────
# 新增：目录与桌面端代码事实一致性（预设回填防回退）
# ─────────────────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_catalog_facts_consistency():
    """目录完整性：覆盖全部桌面预设；default ∈ models；rate_per_minute 正整数或空；
    limit_per_5h 无代码事实 → 必须为空；models_url 仅官方清单（OFFICIAL_MODELS_URLS）预置，其余留空（防估算污染）。"""
    from services.model_preset_service import PRESET_CATALOG, OFFICIAL_MODELS_URLS

    assert len(PRESET_CATALOG) >= 50, "预设目录应覆盖桌面端全部预设（>=50）"
    ids = [x["id"] for x in PRESET_CATALOG]
    assert len(ids) == len(set(ids)), "预设 id 必须唯一"
    for item in PRESET_CATALOG:
        assert item.get("name") and item.get("category"), f"{item['id']} 缺少 name/category"
        assert item.get("base_url"), f"{item['id']} base_url 不应为空（本地服务用适配器默认端点）"
        assert item.get("models"), f"{item['id']} models 不应为空"
        dm = item.get("default_model") or ""
        if dm:
            assert dm in item["models"], f"{item['id']} 默认模型不在模型列表"
        rpm = item.get("rate_per_minute")
        assert rpm is None or (isinstance(rpm, int) and rpm >= 1), f"{item['id']} rate_per_minute 非法"
        assert item.get("limit_per_5h") is None, f"{item['id']} limit_per_5h 无代码事实必须为空"
        if item["id"] in OFFICIAL_MODELS_URLS:
            assert item.get("models_url") == OFFICIAL_MODELS_URLS[item["id"]], (
                f"{item['id']} models_url 必须与官方清单 OFFICIAL_MODELS_URLS 一致")
        else:
            assert not item.get("models_url"), f"{item['id']} models_url 无代码事实必须为空"
    # 互斥核对：目录中预置了 models_url 的预设必须与官方清单一一对应
    catalog_prefilled = {x["id"] for x in PRESET_CATALOG if x.get("models_url")}
    assert catalog_prefilled == set(OFFICIAL_MODELS_URLS), "预置 models_url 的预设必须与官方清单一一对应"
    # 与 base_url 的一致性锚定：models_url = base_url 归一 + 显式 path。
    # path 表是对供应商端点契约的显式声明、与 base_url 解耦——base_url 合法变更时只需同步本表，
    # 防止推导式断言把「成对写错的 URL」或「过期 base_url」固化成代码事实。
    OFFICIAL_MODELS_PATHS = {
        "anthropic": "/v1/models",
        "openai": "/models",
        "deepseek": "/models",
        "mimo-llm": "/models",
    }
    catalog_by_id = {x["id"]: x for x in PRESET_CATALOG}
    for pid, path in OFFICIAL_MODELS_PATHS.items():
        base = catalog_by_id[pid]["base_url"].rstrip("/")
        assert OFFICIAL_MODELS_URLS[pid] == base + path, f"{pid} models_url 与 base_url+path 不一致"
    assert set(OFFICIAL_MODELS_PATHS) == set(OFFICIAL_MODELS_URLS), "path 表必须与白名单一一对应"
    # 白名单 URL 安全基线：镜像 fetch 运行时规则（非本机必须 https）+ 无 userinfo + 非私网/本机/保留地址。
    # 注：ipaddress 分支仅拦截字面 IP（白名单目前全是域名，属未来防护）；
    # 域名的真实防护由 fetch 运行时 DNS 解析（_is_private_or_reserved）兜底
    import ipaddress
    from urllib.parse import urlparse

    for pid, url in OFFICIAL_MODELS_URLS.items():
        parsed = urlparse(url)
        assert parsed.scheme in ("http", "https") and parsed.netloc, f"{pid} models_url 必须为 http(s) 地址"
        assert not parsed.username and not parsed.password, f"{pid} models_url 不允许包含 userinfo"
        host = (parsed.hostname or "").lower()
        if host in ("localhost", "127.0.0.1", "::1"):
            assert parsed.scheme == "http", f"{pid} 环回地址应使用 http（镜像 fetch 运行时规则）"
            continue
        assert parsed.scheme == "https", f"{pid} 非本机地址必须使用 https（镜像 fetch 运行时规则）"
        try:
            ip = ipaddress.ip_address(host)
        except ValueError:
            continue  # 域名：不静态断言，交由 fetch 运行时解析防护
        assert not (ip.is_private or ip.is_loopback or ip.is_link_local
                    or ip.is_multicast or ip.is_reserved or ip.is_unspecified), \
            f"{pid} models_url 不得指向私网/本机/保留地址"


@pytest.mark.asyncio
async def test_catalog_minimax_multimodal_facts():
    """MiniMax 多模态能力映射与桌面端一致（代码事实）。"""
    from services.model_preset_service import PRESET_CATALOG

    mm = next(x for x in PRESET_CATALOG if x["id"] == "minimax-multimodal")
    assert mm["base_url"] == "https://api.minimaxi.com/v1"
    assert mm["capabilities"] == ["llm", "tts", "image", "video"]
    assert mm["capability_models"] == {
        "llm": "MiniMax-M2.7", "tts": "speech-2.8-turbo",
        "image": "image-01", "video": "MiniMax-Hailuo-2.3",
    }
    assert mm["default_model"] == "MiniMax-M2.7"
    assert mm["rate_per_minute"] == 20
