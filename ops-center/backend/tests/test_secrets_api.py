"""Tests for secrets API endpoints."""
import os
import sys
import pytest
import pytest_asyncio
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ["OPS_DB_PATH"] = os.path.join(tempfile.gettempdir(), "ops_test.db")
os.environ["OPS_ENCRYPTION_KEY"] = "test-key-for-secrets-api-testing=="
os.environ["OPS_SECRET_KEY"] = "test-secret"
os.environ["OPS_JWT_SECRET"] = "test-secret"
os.environ["OPS_JWT_SECRET"] = "test-secret"

import models  # noqa

from jose import jwt
import datetime


def admin_token():
    return jwt.encode({"user_id": "admin", "username": "admin", "role": "admin",
                       "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=1)},
                      "test-secret", algorithm="HS256")


def user_token():
    return jwt.encode({"user_id": "user", "username": "user", "role": "user",
                       "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=1)},
                      "test-secret", algorithm="HS256")


@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    from database import engine, Base
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


class TestSecretsAPI:
    """Secrets CRUD API endpoints."""

    @pytest.mark.asyncio
    async def test_list_secrets_empty(self):
        from httpx import AsyncClient, ASGITransport
        from main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/v1/secrets", headers={"Authorization": f"Bearer {admin_token()}"})
            assert resp.status_code == 200
            assert resp.json()["keys"] == []

    @pytest.mark.asyncio
    async def test_create_and_get_secret(self):
        from httpx import AsyncClient, ASGITransport
        from main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            h = {"Authorization": f"Bearer {admin_token()}"}
            # Create
            resp = await client.put("/api/v1/secrets/openai-gpt4o", json={
                "provider": "openai", "name": "OpenAI GPT-4o",
                "api_key": "sk-test-abc123", "models": ["gpt-4o", "gpt-4o-mini"],
                "tier_access": 2, "cost_per_1k_tokens": 2.5,
            }, headers=h)
            assert resp.status_code == 200
            data = resp.json()
            assert data["id"] == "openai-gpt4o"
            assert data["api_key"] != "sk-test-abc123"  # masked
            assert "***" in data["api_key"]
            assert data["is_masked"] is True

            # Get list
            resp2 = await client.get("/api/v1/secrets", headers=h)
            assert resp2.status_code == 200
            assert len(resp2.json()["keys"]) == 1

    @pytest.mark.asyncio
    async def test_create_secret_without_id_generates_key(self):
        """前端「新增 key」调用 PUT /secrets（无 id）→ 自动生成 key_id，不再 405。"""
        from httpx import AsyncClient, ASGITransport
        from main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            h = {"Authorization": f"Bearer {admin_token()}"}
            # 无尾斜杠（前端 axios 跟随 307 后的最终路径）
            resp = await client.put("/api/v1/secrets", json={
                "provider": "openai", "name": "New Auto Key",
                "api_key": "sk-auto-123", "models": ["gpt-4o"], "tier_access": 1,
            }, headers=h)
            assert resp.status_code == 200, resp.text
            data = resp.json()
            assert data["id"].startswith("openai-")
            assert data["name"] == "New Auto Key"
            assert data["api_key"] != "sk-auto-123"  # masked

            # 尾斜杠（前端实际发出 PUT /secrets/）→ redirect 后同样成功
            resp2 = await client.put("/api/v1/secrets/", json={
                "provider": "anthropic", "name": "Slash Key",
                "api_key": "sk-slash-456", "models": ["claude-3"],
            }, headers=h, follow_redirects=True)
            assert resp2.status_code == 200, resp2.text
            assert resp2.json()["id"].startswith("anthropic-")

            # 列表包含两条新增
            lst = await client.get("/api/v1/secrets", headers=h)
            ids = [k["id"] for k in lst.json()["keys"]]
            assert any(i.startswith("openai-") for i in ids)
            assert any(i.startswith("anthropic-") for i in ids)

            # provider 缺失 → 400
            resp3 = await client.put("/api/v1/secrets", json={"name": "x", "api_key": "sk"},
                                     headers=h)
            assert resp3.status_code == 400

    @pytest.mark.asyncio
    async def test_reveal_secret_requires_admin(self):
        from httpx import AsyncClient, ASGITransport
        from main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Create as admin
            await client.put("/api/v1/secrets/test-key", json={
                "provider": "openai", "name": "Test", "api_key": "sk-secret",
                "models": ["gpt-4o"],
            }, headers={"Authorization": f"Bearer {admin_token()}"})

            # User (non-admin) cannot reveal
            resp = await client.post("/api/v1/secrets/test-key/reveal",
                                     headers={"Authorization": f"Bearer {user_token()}"})
            assert resp.status_code == 403

            # Admin can reveal
            resp = await client.post("/api/v1/secrets/test-key/reveal",
                                     headers={"Authorization": f"Bearer {admin_token()}"})
            assert resp.status_code == 200
            assert resp.json()["api_key"] == "sk-secret"

    @pytest.mark.asyncio
    async def test_delete_secret(self):
        from httpx import AsyncClient, ASGITransport
        from main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            h = {"Authorization": f"Bearer {admin_token()}"}
            await client.put("/api/v1/secrets/del-me", json={
                "provider": "openai", "name": "Delete Me", "api_key": "sk-xxx",
                "models": ["gpt-4o"],
            }, headers=h)

            resp = await client.delete("/api/v1/secrets/del-me", headers=h)
            assert resp.status_code == 200

            resp2 = await client.get("/api/v1/secrets", headers=h)
            assert resp2.json()["keys"] == []

    @pytest.mark.asyncio
    async def test_secrets_require_auth(self):
        from httpx import AsyncClient, ASGITransport
        from main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/v1/secrets")
            assert resp.status_code in (401, 403)
