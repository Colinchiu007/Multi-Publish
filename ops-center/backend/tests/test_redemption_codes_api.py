"""Tests for ops-center 兑换码签发/吊销/查询。"""
import hashlib
import hmac as _hmac
import os
import re
import sys
import tempfile
import uuid

import pytest
import pytest_asyncio

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

_RUN_ID = uuid.uuid4().hex[:8]
os.environ["OPS_DB_PATH"] = os.path.join(tempfile.gettempdir(), f"ops_rc_{_RUN_ID}.db")
os.environ["OPS_CONFIG_OUTPUT_DIR"] = os.path.join(tempfile.gettempdir(), f"ops_rc_cfg_{_RUN_ID}")
os.environ["OPS_SECRET_KEY"] = "test-secret"
os.environ["OPS_JWT_SECRET"] = "test-secret"
os.environ["OPS_CATALOG_API_KEY"] = "catalog-test-key"
os.environ["OPS_REDEMPTION_SECRET"] = "test-redemption-secret"

import models  # noqa: F401
from config import settings

CODE_RE = re.compile(r"^MP-[A-Z2-9]{4}-[A-Z2-9]{4}-[0-9A-F]{4}$")


def _expected_sig(payload: str) -> str:
    return _hmac.new(b"test-redemption-secret", payload.encode("utf-8"), hashlib.sha256).hexdigest().upper()[:4]


@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    from database import engine, Base

    settings.catalog_api_key = os.environ.get("OPS_CATALOG_API_KEY", "catalog-test-key")
    settings.redemption_secret = os.environ.get("OPS_REDEMPTION_SECRET", "test-redemption-secret")
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
async def test_redemption_batch_generate_format_and_sig():
    async with _client() as client:
        h = _admin_headers()
        r = await client.post("/api/v1/redemption-codes/batch", json={
            "count": 5, "plan": "pro", "note": "首批",
        }, headers=h)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["count"] == 5
        assert data["batch_id"].startswith("rc_")
        assert len(data["codes"]) == 5
        # 签发响应返回明文（admin），格式与签名须与桌面端 redemption-codes.js 一致
        for code in data["codes"]:
            assert CODE_RE.match(code), code
            parts = code.split("-")
            assert _expected_sig("-".join(parts[:3])) == parts[3]

        # 列表掩码：随机段完全隐藏、仅末组可见；真实签名校验（用 DB 里的原始 code）
        lst = (await client.get("/api/v1/redemption-codes?limit=50", headers=h)).json()
        assert lst["count"] == 5 and lst["total"] == 5
        for item in lst["items"]:
            assert item["code"].startswith("MP-****-****-")
            assert "****" not in item["code"].rsplit("-", 1)[1]  # 末组（签名）可见
            assert item["id"] > 0
        from database import async_session
        from models import RedemptionCode
        async with async_session() as db:
            from sqlalchemy import select
            row = (await db.execute(select(RedemptionCode))).scalars().first()
            code = row.code
        parts = code.split("-")
        assert len(parts) == 4 and parts[0] == "MP"
        assert _expected_sig("-".join(parts[:3])) == parts[3]  # 签名可复算


@pytest.mark.asyncio
async def test_redemption_validation_revoke_delete_permissions():
    async with _client() as client:
        h = _admin_headers()
        # 校验：count / plan / expires_at
        assert (await client.post("/api/v1/redemption-codes/batch", json={"count": 0}, headers=h)).status_code == 400
        assert (await client.post("/api/v1/redemption-codes/batch", json={"count": 201}, headers=h)).status_code == 400
        assert (await client.post("/api/v1/redemption-codes/batch", json={"count": 1.5}, headers=h)).status_code == 400
        assert (await client.post("/api/v1/redemption-codes/batch", json={"count": 1, "plan": "enterprise"}, headers=h)).status_code == 400
        assert (await client.post("/api/v1/redemption-codes/batch", json={"count": 1, "expires_at": "not-a-date"}, headers=h)).status_code == 400
        assert (await client.post("/api/v1/redemption-codes/batch", json={"count": 1, "note": "x" * 201}, headers=h)).status_code == 400
        assert (await client.post("/api/v1/redemption-codes/batch", json={"count": 1, "expires_at": "20270101"}, headers=h)).status_code == 400
        assert (await client.get("/api/v1/redemption-codes?limit=0", headers=h)).status_code == 422

        r = await client.post("/api/v1/redemption-codes/batch", json={"count": 1, "plan": "trial"}, headers=h)
        assert r.status_code == 200
        masked = r.json()["codes"][0]
        sig = masked.rsplit("-", 1)[1]
        # 吊销：按 id 操作
        from database import async_session
        from models import RedemptionCode
        from sqlalchemy import select
        async with async_session() as db:
            row = (await db.execute(select(RedemptionCode))).scalars().first()
            real_id = row.id
        r = await client.put(f"/api/v1/redemption-codes/{real_id}/revoke", headers=h)
        assert r.status_code == 200
        lst = (await client.get("/api/v1/redemption-codes?status=revoked", headers=h)).json()
        assert lst["count"] == 1
        # 吊销不存在 404 / 删除不存在 404 / 非 admin 403
        assert (await client.put("/api/v1/redemption-codes/999999/revoke", headers=h)).status_code == 404
        assert (await client.delete("/api/v1/redemption-codes/999999", headers=h)).status_code == 404
        assert (await client.post("/api/v1/redemption-codes/batch", json={"count": 1}, headers=_normal_headers())).status_code == 403
        assert (await client.get("/api/v1/redemption-codes", headers=_normal_headers())).status_code == 403
        # 删除
        assert (await client.delete(f"/api/v1/redemption-codes/{real_id}", headers=h)).status_code == 200
        lst2 = (await client.get("/api/v1/redemption-codes", headers=h)).json()
        assert lst2["total"] == 0


@pytest.mark.asyncio
async def test_redemption_secret_not_configured_fail_closed():
    async with _client() as client:
        h = _admin_headers()
        old = settings.redemption_secret
        settings.redemption_secret = ""
        try:
            r = await client.post("/api/v1/redemption-codes/batch", json={"count": 1}, headers=h)
            assert r.status_code == 400 and "OPS_REDEMPTION_SECRET" in r.text
        finally:
            settings.redemption_secret = old
