"""Platform defs API — 平台发布元数据管理（admin）。"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from middleware.auth import get_current_user, require_admin
from services import platform_def_service

router = APIRouter(prefix="/api/v1/platform-defs", tags=["platform-defs"])


@router.get("")
async def list_platform_defs(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    items = await platform_def_service.list_platform_defs(db)
    return {"items": items, "count": len(items)}


@router.post("")
async def create_platform_def(
    body: dict,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_admin),
):
    try:
        return await platform_def_service.create_platform_def(db, body)
    except platform_def_service.PlatformDefExists as e:
        raise HTTPException(409, str(e))
    except platform_def_service.PlatformDefError as e:
        raise HTTPException(400, str(e))


@router.put("/{def_id}")
async def update_platform_def(
    def_id: str,
    body: dict,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_admin),
):
    try:
        return await platform_def_service.update_platform_def(db, def_id, body)
    except KeyError:
        raise HTTPException(404, "平台不存在")
    except platform_def_service.PlatformDefError as e:
        raise HTTPException(400, str(e))


@router.delete("/{def_id}")
async def delete_platform_def(
    def_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_admin),
):
    ok = await platform_def_service.delete_platform_def(db, def_id)
    if not ok:
        raise HTTPException(404, "平台不存在")
    return {"ok": True}
