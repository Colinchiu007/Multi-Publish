"""Tests for ops-center 运行时策略 API（公告/版本发布/内容安全 + runtime/bootstrap + Ed25519 签名）。"""
import base64
import copy
import os
import sys
import tempfile

import pytest
import pytest_asyncio

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

os.environ["OPS_DB_PATH"] = os.path.join(tempfile.gettempdir(), "ops_runtime_policy_test.db")
os.environ["OPS_CONFIG_OUTPUT_DIR"] = os.path.join(tempfile.gettempdir(), "ops_runtime_policy_configs")
os.environ["OPS_SECRET_KEY"] = "test-secret"
os.environ["OPS_JWT_SECRET"] = "test-secret"
os.environ["OPS_CATALOG_API_KEY"] = "catalog-test-key"

# DEV 签名密钥对（2026-09-02 生成）：与 apps/desktop/electron/services/ops-center-sync.js
# 内置默认公钥 / ops-center-sync.test.js DEV 密钥对 / backend/.env.example DEV 私钥完全一致，
# 用于双端交叉验证 canonical JSON + Ed25519 签名。
os.environ["OPS_RUNTIME_SIGNING_PRIVATE_KEY"] = (
    "-----BEGIN PRIVATE KEY-----\n"
    "MC4CAQAwBQYDK2VwBCIEIMEaqZBFhrl/hpieWHhYoaG6Dn+Juchfx4/2s0dXok0S\n"
    "-----END PRIVATE KEY-----"
)
# 模块级常量：与 .env.example / ops-center-sync.js 内置公钥配对（2026-09-02 生成）。
# pytest 收集按字母序导入（test_platform_defs_* 在前），先被导入的模块会提前实例化
# config.settings 单例，靠 os.environ 注入的关键字对后导入的模块不可见；
# 因此 fixture 中必须对 settings.runtime_signing_private_key 直接赋值（与 catalog_api_key 同模式）。
DEV_RUNTIME_PRIVATE_KEY = (
    "-----BEGIN PRIVATE KEY-----\n"
    "MC4CAQAwBQYDK2VwBCIEIMEaqZBFhrl/hpieWHhYoaG6Dn+Juchfx4/2s0dXok0S\n"
    "-----END PRIVATE KEY-----"
)

import models  # noqa: F401
from config import settings


@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    from database import engine, Base, async_session

    settings.catalog_api_key = os.environ.get("OPS_CATALOG_API_KEY", "catalog-test-key")
    settings.runtime_signing_private_key = DEV_RUNTIME_PRIVATE_KEY
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with async_session() as db:
        from services.runtime_service import get_content_policy, get_update_policy
        if await get_update_policy(db) is None:
            from services.runtime_service import upsert_update_policy
            await upsert_update_policy(db, {"enabled": False})
        if await get_content_policy(db) is None:
            from services.runtime_service import upsert_content_policy
            await upsert_content_policy(db, {"enabled": False, "word_list": []})
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


# ─── 公告 CRUD ───────────────────────────────────────────

@pytest.mark.asyncio
async def test_announcement_crud_and_validation():
    async with _client() as client:
        h = _admin_headers()
        # 创建
        r = await client.post("/api/v1/announcements", json={
            "title": "维护公告", "content": "今晚 00:00 系统维护", "severity": "maintenance",
            "active_from": "", "active_until": "", "sort_order": 1,
        }, headers=h)
        assert r.status_code == 200, r.text
        item = r.json()
        assert item["id"] > 0
        assert item["severity"] == "maintenance"
        aid = item["id"]

        # 列表
        r = await client.get("/api/v1/announcements", headers=h)
        assert r.status_code == 200
        assert any(i["id"] == aid for i in r.json()["items"])

        # 校验失败：空标题 / 非法 severity / 时间倒挂
        assert (await client.post("/api/v1/announcements", json={"title": "", "content": "x"}, headers=h)).status_code == 400
        assert (await client.post("/api/v1/announcements", json={"title": "x", "severity": "urgent"}, headers=h)).status_code == 400
        assert (await client.post("/api/v1/announcements", json={
            "title": "x", "active_from": "2026-08-11T00:00:00", "active_until": "2026-08-10T00:00:00",
        }, headers=h)).status_code == 400

        # 更新 + 删除
        r = await client.put(f"/api/v1/announcements/{aid}", json={"title": "改", "content": "c", "severity": "info"}, headers=h)
        assert r.status_code == 200 and r.json()["title"] == "改"
        assert (await client.delete(f"/api/v1/announcements/{aid}", headers=h)).status_code == 200
        assert (await client.delete(f"/api/v1/announcements/{aid}", headers=h)).status_code == 404


# ─── 版本发布策略 ────────────────────────────────────────

@pytest.mark.asyncio
async def test_update_policy_upsert_and_validation():
    async with _client() as client:
        h = _admin_headers()
        r = await client.put("/api/v1/update-policy", json={
            "min_version": "2.3.53", "force_version": "2.3.50", "gray_ratio": 50, "enabled": True, "note": "灰度",
        }, headers=h)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["min_version"] == "2.3.53"
        assert data["gray_ratio"] == 50
        assert data["enabled"] is True

        # 幂等 upsert：再次保存仍是单条
        r = await client.put("/api/v1/update-policy", json={"gray_ratio": 30, "enabled": True}, headers=h)
        assert r.status_code == 200 and r.json()["gray_ratio"] == 30

        # 校验：非法版本 / force < min / gray 越界
        assert (await client.put("/api/v1/update-policy", json={"min_version": "abc"}, headers=h)).status_code == 400
        assert (await client.put("/api/v1/update-policy", json={"min_version": "2.3.50", "force_version": "2.3.53"}, headers=h)).status_code == 400
        assert (await client.put("/api/v1/update-policy", json={"gray_ratio": 101}, headers=h)).status_code == 400


# ─── 内容安全策略 ────────────────────────────────────────

@pytest.mark.asyncio
async def test_content_policy_upsert_and_validation():
    async with _client() as client:
        h = _admin_headers()
        r = await client.put("/api/v1/content-policy", json={
            "name": "默认", "word_list": ["赌场", "赌场", "毒品"], "replacement": "***", "enabled": True,
        }, headers=h)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["word_list"] == ["赌场", "毒品"]  # 去重
        assert data["replacement"] == "***"
        assert data["enabled"] is True

        assert (await client.put("/api/v1/content-policy", json={"word_list": "not-json"}, headers=h)).status_code == 400
        assert (await client.put("/api/v1/content-policy", json={"replacement": "x" * 20}, headers=h)).status_code == 400


# ─── runtime/bootstrap ───────────────────────────────────

@pytest.mark.asyncio
async def test_runtime_bootstrap_auth_and_active_filter():
    async with _client() as client:
        h = _admin_headers()
        # 造数据：1 条活动 maintenance 公告 + 1 条停用 + 1 条过期
        await client.post("/api/v1/announcements", json={"title": "维护", "content": "维护中", "severity": "maintenance", "sort_order": 1}, headers=h)
        await client.post("/api/v1/announcements", json={"title": "停用", "content": "x", "severity": "info", "enabled": False}, headers=h)
        await client.post("/api/v1/announcements", json={
            "title": "过期", "content": "x", "severity": "info",
            "active_until": "2020-01-01T00:00:00",
        }, headers=h)
        await client.put("/api/v1/update-policy", json={"min_version": "2.3.50", "gray_ratio": 100, "enabled": True}, headers=h)
        await client.put("/api/v1/content-policy", json={"word_list": ["测试词"], "enabled": True}, headers=h)

        # 鉴权
        assert (await client.get("/api/v1/runtime/bootstrap")).status_code == 401
        assert (await client.get("/api/v1/runtime/bootstrap", headers={"X-Catalog-Key": "wrong"})).status_code == 401
        # 带 +08:00 偏移的活动公告：应被归一化为 UTC 后命中窗口
        await client.post("/api/v1/announcements", json={
            "title": "偏移窗口", "content": "x", "severity": "info",
            "active_from": "2026-01-01T00:00:00+08:00", "active_until": "2099-12-31T00:00:00+08:00",
        }, headers=h)

        r = await client.get("/api/v1/runtime/bootstrap", headers={"X-Catalog-Key": "catalog-test-key"})
        assert r.status_code == 200, r.text
        data = r.json()
        titles = [a["title"] for a in data["announcements"]]
        assert "偏移窗口" in titles  # 时区偏移被归一化，窗口命中
        assert "维护" in titles  # 只含活动公告
        assert data["update_policy"]["min_version"] == "2.3.50"
        assert data["content_policy"]["word_list"] == ["测试词"]
        assert data["synced_at"]



# ─── runtime/bootstrap Ed25519 签名（Stage -1.6）───

DEV_RUNTIME_PUBLIC_KEY = (
    "-----BEGIN PUBLIC KEY-----\n"
    "MCowBQYDK2VwAyEAr6a4g942N23o31XNIcwFGX9VhSu2jlGA9dT1bfJIDpg=\n"
    "-----END PUBLIC KEY-----"
)


def _verify_bootstrap_signature(data: dict) -> bool:
    """用配对公钥对 bootstrap 响应的 Ed25519 签名验签（与桌面端 verifyRuntimeSignature 对齐）。"""
    from cryptography.hazmat.primitives import serialization
    from services.runtime_service import canonical_json

    rest = {k: v for k, v in data.items() if k != "signature"}
    canonical = canonical_json(rest).encode("utf-8")
    pub = serialization.load_pem_public_key(DEV_RUNTIME_PUBLIC_KEY.encode("utf-8"))
    try:
        pub.verify(base64.b64decode(data["signature"]), canonical)
        return True
    except Exception:
        return False


def test_canonical_json_fixed_vectors():
    """canonical_json 固定向量（与桌面端 canonicalJson 完全一致，双端交叉验证）。"""
    from services.runtime_service import canonical_json

    assert canonical_json({"b": 2, "a": 1, "c": [3]}) == '{"a":1,"b":2,"c":[3]}'
    assert canonical_json({"标题": "维护"}) == '{"标题":"维护"}'
    assert canonical_json({"o": {"x": False, "y": None, "z": []}}) == '{"o":{"x":false,"y":null,"z":[]}}'
    assert canonical_json([1, 2.5, -3]) == "[1,2.5,-3]"


@pytest.mark.asyncio
async def test_runtime_bootstrap_ed25519_signature():
    """bootstrap 响应带 Ed25519 签名，用配对公钥验签通过；篡改任意字段即验签失败。"""
    async with _client() as client:
        h = _admin_headers()
        await client.put("/api/v1/update-policy", json={"min_version": "2.3.50", "gray_ratio": 100, "enabled": True}, headers=h)
        r = await client.get("/api/v1/runtime/bootstrap", headers={"X-Catalog-Key": "catalog-test-key"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert "signature" in data
        assert _verify_bootstrap_signature(copy.deepcopy(data))
        # 篡改任一业务字段后验签必须失败（桌面端将整体拒绝应用）
        tampered = copy.deepcopy(data)
        tampered["update_policy"]["min_version"] = "9.9.9"
        assert not _verify_bootstrap_signature(tampered)


@pytest.mark.asyncio
async def test_runtime_bootstrap_signing_not_configured_404():
    """签名私钥未配置 → bootstrap 404 fail-closed（弱配置显式暴露）。"""
    original = settings.runtime_signing_private_key
    settings.runtime_signing_private_key = ""
    try:
        async with _client() as client:
            r = await client.get("/api/v1/runtime/bootstrap", headers={"X-Catalog-Key": "catalog-test-key"})
            assert r.status_code == 404
            assert "签名" in r.text
    finally:
        settings.runtime_signing_private_key = original


@pytest.mark.asyncio
async def test_runtime_bootstrap_signing_invalid_key_500():
    """签名私钥非法（非 Ed25519 PEM）→ 500 显式报错，绝不降级为未签名响应。"""
    original = settings.runtime_signing_private_key
    settings.runtime_signing_private_key = "not-a-valid-pem"
    try:
        async with _client() as client:
            r = await client.get("/api/v1/runtime/bootstrap", headers={"X-Catalog-Key": "catalog-test-key"})
            assert r.status_code == 500
            assert "签名私钥" in r.text
    finally:
        settings.runtime_signing_private_key = original
