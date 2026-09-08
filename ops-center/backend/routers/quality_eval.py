"""QualityEval API — content quality evaluation endpoints."""
from __future__ import annotations

import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from middleware.auth import get_current_user
from services.quality.service import QualityEvalService

router = APIRouter(prefix="/api/v1/quality-eval", tags=["quality-eval"])
logger = logging.getLogger("ops-center.quality-eval")


@router.post("/evaluate")
async def evaluate(body: dict, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    """Evaluate a single piece of content and persist the record."""
    content = (body.get("content") or "").strip()
    if not content:
        raise HTTPException(400, "content 不能为空")
    if len(content) < 20:
        raise HTTPException(400, "内容过短，至少需要 20 个字符")
    try:
        record = await QualityEvalService.evaluate_and_save(
            db,
            content=content,
            original_content=body.get("original_content") or "",
            style=body.get("style") or "通用",
            length=body.get("length") or "keep",
            platform=body.get("platform") or "通用",
            title=body.get("title") or "",
            created_by=user.get("username") or user.get("sub") or "unknown",
        )
        return record
    except Exception as e:
        logger.exception("evaluate failed")
        raise HTTPException(500, f"评估失败: {e}")


@router.get("/records")
async def get_records(
    limit: int = Query(100, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Get the latest evaluation records."""
    return {"items": await QualityEvalService.get_recent_records(db, limit)}


@router.get("/stats")
async def get_stats(
    limit: int = Query(100, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Get average evaluation statistics for the latest N records."""
    return await QualityEvalService.get_average_stats(db, limit)
