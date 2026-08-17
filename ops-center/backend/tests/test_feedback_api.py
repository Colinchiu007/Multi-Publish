"""Regression tests for user feedback ingest and admin inspection."""
from __future__ import annotations

import io
import os
import shutil
import sys
import tempfile
import uuid
import zipfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
import pytest_asyncio
from jose import jwt

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

TEST_ROOT = Path(tempfile.gettempdir()) / f"ops-feedback-{os.getpid()}-{uuid.uuid4().hex}"
TEST_ROOT.mkdir(parents=True, exist_ok=True)
os.environ["OPS_DB_PATH"] = str(TEST_ROOT / "feedback.db")
os.environ["OPS_CONFIG_OUTPUT_DIR"] = str(TEST_ROOT / "configs")
os.environ["OPS_FEEDBACK_MEDIA_DIR"] = str(TEST_ROOT / "media")
os.environ["OPS_SECRET_KEY"] = "test-secret"
os.environ["OPS_JWT_SECRET"] = "test-secret"
os.environ["OPS_CATALOG_API_KEY"] = "catalog-test-key"

import models  # noqa: F401,E402
from config import settings  # noqa: E402


@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    from database import Base, engine

    settings.catalog_api_key = "catalog-test-key"
    settings.feedback_media_dir = str(TEST_ROOT / "media")
    settings.feedback_max_message_chars = 10000
    settings.feedback_max_archive_bytes = 25 * 1024 * 1024
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    shutil.rmtree(settings.feedback_media_dir, ignore_errors=True)


def _client():
    from httpx import ASGITransport, AsyncClient
    from main import app

    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


def _token(role: str = "admin") -> str:
    payload = {
        "sub": role,
        "username": role,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=1),
    }
    return jwt.encode(payload, settings.get_jwt_secret(), algorithm=settings.jwt_algorithm)


def _admin_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {_token()}"}


def _user_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {_token('user')}"}


def _zip_bytes() -> bytes:
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_STORED) as archive:
        archive.writestr("app-2026-08-17.log", "[INFO] redacted\n")
    return output.getvalue()


@pytest.mark.asyncio
async def test_feedback_ingest_requires_catalog_key_and_valid_message():
    async with _client() as client:
        assert (await client.post("/api/v1/feedback", data={"message": "hello"})).status_code == 401
        assert (await client.post(
            "/api/v1/feedback", data={"message": "hello"}, headers={"X-Catalog-Key": "wrong"}
        )).status_code == 401
        headers = {"X-Catalog-Key": "catalog-test-key"}
        assert (await client.post("/api/v1/feedback", data={"message": "   "}, headers=headers)).status_code == 400

        settings.feedback_max_message_chars = 4
        assert (await client.post("/api/v1/feedback", data={"message": "hello"}, headers=headers)).status_code == 400

        from database import async_session
        from models import UserFeedback
        from sqlalchemy import select

        async with async_session() as db:
            assert (await db.execute(select(UserFeedback))).scalars().all() == []


@pytest.mark.asyncio
async def test_feedback_ingest_admin_detail_and_attachment_download():
    archive = _zip_bytes()
    async with _client() as client:
        response = await client.post(
            "/api/v1/feedback",
            data={"message": "按钮点击后窗口没有响应", "client_id": "device-1", "app_version": "2.3.53", "platform": "win32"},
            files={"log_archive": ("logs.zip", archive, "application/zip")},
            headers={"X-Catalog-Key": "catalog-test-key"},
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["has_logs"] is True
        feedback_id = body["id"]

        listing = await client.get("/api/v1/feedback", headers=_admin_headers())
        assert listing.status_code == 200
        assert listing.json()["total"] == 1
        assert listing.json()["items"][0]["message_preview"] == "按钮点击后窗口没有响应"

        detail = await client.get(f"/api/v1/feedback/{feedback_id}", headers=_admin_headers())
        assert detail.status_code == 200
        detail_body = detail.json()
        assert detail_body["message"] == "按钮点击后窗口没有响应"
        assert detail_body["attachment"]["extension"] == "zip"
        assert "stored_name" not in detail_body["attachment"]
        assert "path" not in detail_body["attachment"]

        download = await client.get(f"/api/v1/feedback/{feedback_id}/attachment", headers=_admin_headers())
        assert download.status_code == 200
        assert download.content == archive
        assert "feedback-" in download.headers["content-disposition"]


@pytest.mark.asyncio
async def test_feedback_rejects_invalid_archive_and_never_stores_it():
    async with _client() as client:
        response = await client.post(
            "/api/v1/feedback",
            data={"message": "bad log"},
            files={"log_archive": ("logs.zip", b"not-a-zip", "application/zip")},
            headers={"X-Catalog-Key": "catalog-test-key"},
        )
        assert response.status_code == 400
        assert not list(Path(settings.feedback_media_dir).glob("*")) if Path(settings.feedback_media_dir).exists() else True

        response = await client.post(
            "/api/v1/feedback",
            data={"message": "bad extension"},
            files={"log_archive": ("logs.txt", _zip_bytes(), "application/zip")},
            headers={"X-Catalog-Key": "catalog-test-key"},
        )
        assert response.status_code == 400

        response = await client.post(
            "/api/v1/feedback",
            data={"message": "malformed zip"},
            files={"log_archive": ("logs.zip", b"PK\x03\x04not-a-real-zip", "application/zip")},
            headers={"X-Catalog-Key": "catalog-test-key"},
        )
        assert response.status_code == 400


@pytest.mark.asyncio
async def test_feedback_admin_endpoints_hide_existence_from_non_admin():
    async with _client() as client:
        assert (await client.get("/api/v1/feedback")).status_code == 401
        assert (await client.get("/api/v1/feedback", headers=_user_headers())).status_code == 403
        assert (await client.get("/api/v1/feedback/not-found", headers=_user_headers())).status_code == 403
        assert (await client.get("/api/v1/feedback/not-found/attachment", headers=_user_headers())).status_code == 403


@pytest.mark.asyncio
async def test_feedback_unconfigured_catalog_key_fails_closed(monkeypatch):
    async with _client() as client:
        monkeypatch.setattr(settings, "catalog_api_key", "")
        response = await client.post(
            "/api/v1/feedback", data={"message": "hello"}, headers={"X-Catalog-Key": "catalog-test-key"}
        )
        assert response.status_code == 404
