"""User feedback ingest and admin inspection APIs."""
from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from middleware.auth import require_admin
from routers.diagnostics import _require_catalog_key
from services import feedback_service

router = APIRouter(tags=["feedback"])


@router.post("/api/v1/feedback")
async def ingest_feedback(
    request: Request,
    message: str = Form(...),
    client_id: str = Form(""),
    app_version: str = Form(""),
    platform: str = Form(""),
    log_archive: UploadFile | None = File(None),
    db: AsyncSession = Depends(get_db),
):
    _require_catalog_key(request)
    try:
        return await feedback_service.create_feedback(
            db,
            message=message,
            client_id=client_id,
            app_version=app_version,
            platform=platform,
            log_archive=log_archive,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/api/v1/feedback")
async def list_feedback(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_admin),
):
    return await feedback_service.list_feedback(db, limit, offset)


@router.get("/api/v1/feedback/{feedback_id}")
async def get_feedback(feedback_id: str, db: AsyncSession = Depends(get_db), user: dict = Depends(require_admin)):
    result = await feedback_service.get_feedback(db, feedback_id)
    if result is None:
        raise HTTPException(status_code=404, detail="反馈不存在")
    return result[0]


@router.get("/api/v1/feedback/{feedback_id}/attachment")
async def download_feedback_attachment(feedback_id: str, db: AsyncSession = Depends(get_db), user: dict = Depends(require_admin)):
    result = await feedback_service.get_feedback(db, feedback_id)
    if result is None or result[1] is None:
        raise HTTPException(status_code=404, detail="附件不存在")
    try:
        path = feedback_service.attachment_path(result[1])
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="附件不存在")
    return FileResponse(path, media_type="application/zip", filename=f"feedback-{feedback_id}.zip")
