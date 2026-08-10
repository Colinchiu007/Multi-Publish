"""Pipeline dependencies API — 流水线所需依赖目录管理（admin）。"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from middleware.auth import get_current_user, require_admin
from services import pipeline_dependency_service

router = APIRouter(prefix="/api/v1/pipeline-dependencies", tags=["pipeline-dependencies"])


@router.get("")
async def list_dependencies(
    pipeline_id: str | None = Query(None),
    model_type: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    items = await pipeline_dependency_service.list_dependencies(db, pipeline_id=pipeline_id, model_type=model_type)
    return {"items": items, "count": len(items)}


@router.post("")
async def create_dependency(
    body: dict,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_admin),
):
    try:
        return await pipeline_dependency_service.create_dependency(db, body, user.get("username", "unknown"))
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.put("/{entry_id}")
async def update_dependency(
    entry_id: int,
    body: dict,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_admin),
):
    try:
        return await pipeline_dependency_service.update_dependency(db, entry_id, body, user.get("username", "unknown"))
    except KeyError:
        raise HTTPException(404, "条目不存在")
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.delete("/{entry_id}")
async def delete_dependency(
    entry_id: int,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_admin),
):
    ok = await pipeline_dependency_service.delete_dependency(db, entry_id, user.get("username", "unknown"))
    if not ok:
        raise HTTPException(404, "条目不存在")
    return {"ok": True}
