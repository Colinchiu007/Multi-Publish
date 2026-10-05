"""Rewrite AI taste API — 去 AI 味词库管理（ai-taste-ops-center：CRUD/toggle/import，admin）。"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from middleware.auth import get_current_user, require_admin
from services import rewrite_ai_taste_service

router = APIRouter(prefix="/api/v1/rewrite-ai-taste", tags=["rewrite-ai-taste"])


@router.get("")
async def list_entries(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    items = await rewrite_ai_taste_service.list_entries(db)
    return {"items": items, "count": len(items)}


@router.get("/runtime")
async def runtime_entries(
    db: AsyncSession = Depends(get_db),
):
    """运行时全量词库（免鉴权，供 bootstrap 内部组装使用；含 enabled=0 条目）。"""
    items = await rewrite_ai_taste_service.list_runtime_entries(db)
    return {"items": items, "count": len(items)}


@router.post("")
async def create_entry(
    body: dict,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_admin),
):
    item, err = await rewrite_ai_taste_service.create_entry(db, body, user.get("username", "unknown"))
    if err:
        raise HTTPException(409 if "已存在" in err else 400, err)
    return item


@router.put("/{word}")
async def update_entry(
    word: str,
    body: dict,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_admin),
):
    item, err = await rewrite_ai_taste_service.update_entry(db, word, body, user.get("username", "unknown"))
    if err:
        raise HTTPException(400, err)
    return item


@router.delete("/{word}")
async def delete_entry(
    word: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_admin),
):
    ok, err = await rewrite_ai_taste_service.delete_entry(db, word, user.get("username", "unknown"))
    if not ok:
        raise HTTPException(400, err)
    return {"ok": True}


@router.post("/{word}/toggle")
async def toggle_entry(
    word: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_admin),
):
    item, err = await rewrite_ai_taste_service.toggle_entry(db, word, user.get("username", "unknown"))
    if err:
        raise HTTPException(400, err)
    return item


@router.post("/import")
async def import_entries(
    body: dict,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_admin),
):
    imported, err = await rewrite_ai_taste_service.import_entries(db, body.get("entries"), user.get("username", "unknown"))
    if err:
        raise HTTPException(409 if "冲突" in err else 400, err)
    return {"imported": imported}
