"""Tests for key_service — encrypt, decrypt, mask, CRUD."""
import os
import sys
import pytest
import pytest_asyncio
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ["OPS_DB_PATH"] = os.path.join(tempfile.gettempdir(), "ops_test.db")
os.environ["OPS_ENCRYPTION_KEY"] = "test-fernet-key-32-bytes-xxxxxx=="
os.environ["OPS_SECRET_KEY"] = "test-secret"
os.environ["OPS_JWT_SECRET"] = "test-secret"

import models  # noqa: F401

from cryptography.fernet import Fernet


@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    from database import engine, Base, async_session
    from models import OfficialKey
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


class TestEncryption:
    """Encrypt / decrypt / mask."""

    def test_encrypt_decrypt_roundtrip(self):
        from services.key_service import encrypt_key, decrypt_key
        original = "sk-test-key-12345"
        encrypted = encrypt_key(original)
        assert encrypted != original
        assert len(encrypted) > 20
        decrypted = decrypt_key(encrypted)
        assert decrypted == original

    def test_mask_key(self):
        from services.key_service import mask_key
        assert mask_key("sk-abc123def456") == "sk-a***f456"
        assert mask_key("short") == "***"  # < 6 chars
        assert mask_key("ab") == "***"  # too short
        assert mask_key("") == "***"

    def test_encrypt_different_keys_produce_different_output(self):
        from services.key_service import encrypt_key
        e1 = encrypt_key("key-aaa")
        e2 = encrypt_key("key-bbb")
        assert e1 != e2


class TestKeyCRUD:
    """Create, read, update, delete official keys."""

    @pytest.mark.asyncio
    async def test_create_key(self):
        from database import async_session
        from services.key_service import create_key

        async with async_session() as db:
            key = await create_key(db, id="openai-gpt4o", provider="openai",
                                   name="OpenAI GPT-4o", api_key="sk-test123",
                                   models=["gpt-4o", "gpt-4o-mini"],
                                   tier_access=2, cost_per_1k_tokens=2.5)
            assert key.id == "openai-gpt4o"
            assert key.provider == "openai"
            assert key.api_key != "sk-test123"  # encrypted
            assert key.is_active == 1
            assert key.tier_access == 2

    @pytest.mark.asyncio
    async def test_get_key_masked(self):
        from database import async_session
        from services.key_service import create_key, get_key

        async with async_session() as db:
            await create_key(db, id="test-key", provider="openai",
                           name="Test", api_key="sk-secret-abc", models=["gpt-4o"])
            result = await get_key(db, "test-key", reveal=False)
            assert result["id"] == "test-key"
            assert result["api_key"] != "sk-secret-abc"  # masked
            assert "***" in result["api_key"]

    @pytest.mark.asyncio
    async def test_get_key_revealed(self):
        from database import async_session
        from services.key_service import create_key, get_key

        async with async_session() as db:
            await create_key(db, id="reveal-key", provider="openai",
                           name="Test", api_key="sk-secret-xyz", models=["gpt-4o"])
            result = await get_key(db, "reveal-key", reveal=True)
            assert result["api_key"] == "sk-secret-xyz"  # plaintext

    @pytest.mark.asyncio
    async def test_list_keys(self):
        from database import async_session
        from services.key_service import create_key, list_keys

        async with async_session() as db:
            await create_key(db, id="k1", provider="openai", name="O1",
                           api_key="sk-aaa", models=["gpt-4o"])
            await create_key(db, id="k2", provider="doubao", name="D1",
                           api_key="sk-bbb", models=["doubao-pro"], tier_access=2)

            keys = await list_keys(db)
            assert len(keys) == 2
            # All masked
            for k in keys:
                assert "***" in k["api_key"]

            # Filter by provider
            keys_openai = await list_keys(db, provider="openai")
            assert len(keys_openai) == 1

    @pytest.mark.asyncio
    async def test_update_key(self):
        from database import async_session
        from services.key_service import create_key, update_key, get_key

        async with async_session() as db:
            await create_key(db, id="upd-key", provider="openai",
                           name="Old", api_key="sk-old", models=["gpt-4o"])
            updated = await update_key(db, "upd-key", api_key="sk-new",
                                       is_active=0, tier_access=3)
            assert updated.api_key != "sk-old"  # re-encrypted
            result = await get_key(db, "upd-key", reveal=True)
            assert result["api_key"] == "sk-new"
            assert result["is_active"] == 0
            assert result["tier_access"] == 3

    @pytest.mark.asyncio
    async def test_delete_key(self):
        from database import async_session
        from services.key_service import create_key, delete_key, list_keys

        async with async_session() as db:
            await create_key(db, id="del-key", provider="openai",
                           name="X", api_key="sk-xxx", models=["gpt-4o"])
            assert await delete_key(db, "del-key") is True
            keys = await list_keys(db)
            assert len(keys) == 0
            assert await delete_key(db, "nonexistent") is False

    @pytest.mark.asyncio
    async def test_get_active_keys_for_tier(self):
        from database import async_session
        from services.key_service import create_key, get_active_keys_for_tier

        async with async_session() as db:
            await create_key(db, id="free-key", provider="openai",
                           name="Free", api_key="sk-free", models=["gpt-4o-mini"],
                           tier_access=1, priority=2)
            await create_key(db, id="pro-key", provider="openai",
                           name="Pro", api_key="sk-pro", models=["gpt-4o"],
                           tier_access=3, priority=1)
            await create_key(db, id="inactive", provider="openai",
                           name="Off", api_key="sk-off", models=["gpt-4o"],
                           is_active=0)

            # Free user (tier 1) should only see tier_access <= 1 active keys
            free_keys = await get_active_keys_for_tier(db, "openai", user_tier=1)
            assert len(free_keys) == 1
            assert free_keys[0].id == "free-key"

            # Pro user (tier 3) should see all active keys for their tier
            pro_keys = await get_active_keys_for_tier(db, "openai", user_tier=3)
            assert len(pro_keys) == 2  # free-key + pro-key (both active)
            # Sorted by priority (pro-key first)
            assert pro_keys[0].id == "pro-key"
