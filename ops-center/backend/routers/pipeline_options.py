"""Pipeline option control API (2026-08-31) — 视频创作流水线选项显示/隐藏与默认值。"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from middleware.auth import get_current_user, require_admin
from services import pipeline_option_service

router = APIRouter(prefix="/api/v1/pipeline-options", tags=["pipeline-options"])

@router.get("")
async def list_options(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    return {"items": await pipeline_option_service.list_options(db)}

@router.put("")
async def upsert_options(
    body: dict,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_admin),
):
    try:
        items = body.get("items", [])
        if not isinstance(items, list):
            raise HTTPException(400, "items must be a list")
        updated_by = user.get("username", "")
        result = await pipeline_option_service.upsert_options(db, items, updated_by=updated_by)
        return {"items": result, "count": len(result)}
    except ValueError as e:
        raise HTTPException(400, str(e))