"""Story2Video 场景上下文规则管理 API（admin 写、登录读）。"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from middleware.auth import get_current_user, require_admin
from services import scene_context_service

router = APIRouter(prefix="/api/v1/scene-context/rules", tags=["scene-context-rules"])


@router.get("")
async def get_rules(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    return await scene_context_service.get_rules(db)


@router.post("/validate")
async def validate_rules(
    body: dict,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    rules = body.get("rules") if isinstance(body, dict) else None
    if not isinstance(rules, dict):
        return {"ok": False, "errors": [{"path": "", "message": "rules 必须是对象"}]}
    return scene_context_service.validate_rules(rules)


@router.put("")
async def save_rules(
    body: dict,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_admin),
):
    try:
        return await scene_context_service.save_rules(db, body, user.get("username", "unknown"))
    except scene_context_service.SceneContextRulesError as e:
        raise HTTPException(400, str(e))


@router.get("/export")
async def export_rules(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    return await scene_context_service.export_rules(db)
