"""Keyword watchlist API — 关键词监测目录管理（admin）。"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from middleware.auth import get_current_user, require_admin
from services import keyword_watchlist_service

router = APIRouter(prefix="/api/v1/keyword-watchlist", tags=["keyword-watchlist"])


@router.get("")
async def list_watchlist(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    items = await keyword_watchlist_service.list_watchlist(db)
    return {"items": items, "count": len(items)}


@router.post("")
async def create_watchlist_entry(
    body: dict,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_admin),
):
    try:
        return await keyword_watchlist_service.create_watchlist_entry(db, body, user.get("username", "unknown"))
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.put("/{entry_id}")
async def update_watchlist_entry(
    entry_id: int,
    body: dict,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_admin),
):
    try:
        return await keyword_watchlist_service.update_watchlist_entry(db, entry_id, body, user.get("username", "unknown"))
    except KeyError:
        raise HTTPException(404, "条目不存在")
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.delete("/{entry_id}")
async def delete_watchlist_entry(
    entry_id: int,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_admin),
):
    ok = await keyword_watchlist_service.delete_watchlist_entry(db, entry_id)
    if not ok:
        raise HTTPException(404, "条目不存在")
    return {"ok": True}
