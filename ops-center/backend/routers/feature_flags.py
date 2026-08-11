"""Feature flags API — 桌面端功能开关管理（admin）。"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from middleware.auth import get_current_user, require_admin
from services import feature_flag_service

router = APIRouter(prefix="/api/v1/feature-flags", tags=["feature-flags"])


@router.get("")
async def list_feature_flags(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    items = await feature_flag_service.list_feature_flags(db)
    return {"items": items, "count": len(items)}


@router.post("")
async def create_feature_flag(
    body: dict,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_admin),
):
    try:
        return await feature_flag_service.create_feature_flag(db, body, user.get("username", "unknown"))
    except feature_flag_service.FeatureFlagExists as e:
        raise HTTPException(409, str(e))
    except feature_flag_service.FeatureFlagError as e:
        raise HTTPException(400, str(e))


@router.put("/{key}")
async def update_feature_flag(
    key: str,
    body: dict,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_admin),
):
    try:
        return await feature_flag_service.update_feature_flag(db, key, body, user.get("username", "unknown"))
    except KeyError:
        raise HTTPException(404, "开关不存在")
    except feature_flag_service.FeatureFlagError as e:
        raise HTTPException(400, str(e))


@router.delete("/{key}")
async def delete_feature_flag(
    key: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_admin),
):
    ok = await feature_flag_service.delete_feature_flag(db, key)
    if not ok:
        raise HTTPException(404, "开关不存在")
    return {"ok": True}
