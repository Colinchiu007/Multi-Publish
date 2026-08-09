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
