"""Feedback validation and safe attachment storage."""
from __future__ import annotations

import hashlib
import io
import re
import stat
import uuid
import zipfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from models import FeedbackAttachment, UserFeedback

ZIP_MAGIC = b"PK\x03\x04"
SAFE_CLIENT_ID = re.compile(r"^[A-Za-z0-9._:-]{1,128}$")
SAFE_LOG_NAME = re.compile(r"^app-[0-9]{4}-[0-9]{2}-[0-9]{2}\.log$")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _storage_root() -> Path:
    root = Path(settings.feedback_media_dir).expanduser()
    root.mkdir(parents=True, exist_ok=True)
    return root.resolve()


def _validate_message(value: str) -> str:
    message = str(value or "").strip()
    if not message:
        raise ValueError("反馈内容不能为空")
    if len(message) > settings.feedback_max_message_chars:
        raise ValueError("反馈内容过长")
    return message


def _validate_text(value: str | None, max_length: int, name: str) -> str:
    text = str(value or "").strip()
    if len(text) > max_length:
        raise ValueError(f"{name} 过长")
    return text


async def _read_archive(upload: UploadFile) -> bytes:
    if (upload.filename or "").lower().rsplit(".", 1)[-1:] != ["zip"]:
        raise ValueError("日志附件必须是 zip 文件")
    if upload.content_type not in (None, "", "application/zip", "application/x-zip-compressed", "application/octet-stream"):
        raise ValueError("日志附件类型不受支持")
    data = await upload.read(settings.feedback_max_archive_bytes + 1)
    if len(data) > settings.feedback_max_archive_bytes:
        raise ValueError("日志附件超过大小限制")
    if not data:
        raise ValueError("日志附件为空")
    if not data.startswith(ZIP_MAGIC) and not data.startswith(b"PK\x05\x06"):
        raise ValueError("日志附件格式无效")
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            entries = archive.infolist()
            if not entries:
                raise ValueError("日志附件为空")
            for entry in entries:
                name = entry.filename.replace("\\", "/")
                parts = Path(name).parts
                mode = (entry.external_attr >> 16) & 0o170000
                if (
                    not SAFE_LOG_NAME.fullmatch(name)
                    or name.startswith("/")
                    or "." in parts
                    or ".." in parts
                    or mode in (stat.S_IFDIR, stat.S_IFLNK)
                ):
                    raise ValueError("日志附件包含不受支持的文件")
    except ValueError:
        raise
    except (OSError, zipfile.BadZipFile, zipfile.LargeZipFile):
        raise ValueError("日志附件格式无效")
    return data


def _safe_attachment_path(root: Path, stored_name: str) -> Path:
    candidate = (root / stored_name).resolve()
    if candidate.parent != root or candidate.name != stored_name:
        raise ValueError("附件路径无效")
    return candidate


async def create_feedback(
    db: AsyncSession,
    *,
    message: str,
    client_id: str = "",
    app_version: str = "",
    platform: str = "",
    log_archive: UploadFile | None = None,
) -> dict:
    clean_message = _validate_message(message)
    clean_client = _validate_text(client_id, 128, "client_id")
    if clean_client and not SAFE_CLIENT_ID.fullmatch(clean_client):
        raise ValueError("client_id 格式无效")
    feedback_id = str(uuid.uuid4())
    now = _now()
    row = UserFeedback(
        id=feedback_id,
        message=clean_message,
        client_id_hash=hashlib.sha256(clean_client.encode("utf-8")).hexdigest() if clean_client else "",
        app_version=_validate_text(app_version, 64, "app_version"),
        platform=_validate_text(platform, 32, "platform"),
        status="new",
        created_at=now,
    )
    stored_path: Path | None = None
    try:
        db.add(row)
        if log_archive is not None:
            data = await _read_archive(log_archive)
            root = _storage_root()
            stored_name = f"{uuid.uuid4().hex}.zip"
            stored_path = _safe_attachment_path(root, stored_name)
            with stored_path.open("xb") as handle:
                handle.write(data)
            attachment = FeedbackAttachment(
                feedback_id=feedback_id,
                stored_name=stored_name,
                extension="zip",
                size_bytes=len(data),
                sha256=hashlib.sha256(data).hexdigest(),
                created_at=now,
                expires_at=(datetime.now(timezone.utc) + timedelta(days=30)).isoformat(),
            )
            db.add(attachment)
        await db.commit()
    except Exception:
        await db.rollback()
        if stored_path is not None:
            try:
                stored_path.unlink(missing_ok=True)
            except OSError:
                pass
        raise
    return {"id": feedback_id, "created_at": now, "has_logs": log_archive is not None}


def _attachment_dict(attachment: FeedbackAttachment | None) -> dict | None:
    if attachment is None:
        return None
    return {
        "size_bytes": attachment.size_bytes,
        "sha256": attachment.sha256,
        "extension": attachment.extension,
        "created_at": attachment.created_at,
        "expires_at": attachment.expires_at,
    }


async def list_feedback(db: AsyncSession, limit: int, offset: int) -> dict:
    from sqlalchemy import func
    total = (await db.execute(select(func.count(UserFeedback.id)))).scalar_one()
    rows = (await db.execute(
        select(UserFeedback, FeedbackAttachment)
        .outerjoin(FeedbackAttachment, FeedbackAttachment.feedback_id == UserFeedback.id)
        .order_by(UserFeedback.created_at.desc())
        .offset(offset).limit(limit)
    )).all()
    items = []
    for feedback, attachment in rows:
        preview = feedback.message[:240] + ("..." if len(feedback.message) > 240 else "")
        items.append({
            "id": feedback.id,
            "message_preview": preview,
            "app_version": feedback.app_version,
            "platform": feedback.platform,
            "status": feedback.status,
            "has_logs": attachment is not None,
            "created_at": feedback.created_at,
        })
    return {"items": items, "total": total}


async def get_feedback(db: AsyncSession, feedback_id: str) -> tuple[dict, FeedbackAttachment | None] | None:
    row = (await db.execute(
        select(UserFeedback, FeedbackAttachment)
        .outerjoin(FeedbackAttachment, FeedbackAttachment.feedback_id == UserFeedback.id)
        .where(UserFeedback.id == feedback_id)
    )).first()
    if row is None:
        return None
    feedback, attachment = row
    return ({
        "id": feedback.id,
        "message": feedback.message,
        "app_version": feedback.app_version,
        "platform": feedback.platform,
        "status": feedback.status,
        "created_at": feedback.created_at,
        "attachment": _attachment_dict(attachment),
    }, attachment)


def attachment_path(attachment: FeedbackAttachment) -> Path:
    root = _storage_root()
    path = _safe_attachment_path(root, attachment.stored_name)
    if not path.is_file() or path.is_symlink():
        raise FileNotFoundError("附件不存在")
    return path
