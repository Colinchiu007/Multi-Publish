"""Redemption codes API — 兑换码签发/吊销/查询（admin）。"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from database import get_db
from middleware.auth import require_admin
from services import redemption_code_service

router = APIRouter(prefix="/api/v1/redemption-codes", tags=["redemption-codes"])


@router.post("/batch")
async def create_batch(
    body: dict,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_admin),
):
    try:
        return await redemption_code_service.generate_batch(db, body, user.get("username", "unknown"), settings.redemption_secret)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get("")
async def list_redemption_codes(
    plan: str | None = Query(None),
    status: str | None = Query(None),
    limit: int = Query(100, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_admin),
):
    return await redemption_code_service.list_codes(db, plan=plan, status=status, limit=limit, offset=offset)


@router.put("/{code}/revoke")
async def revoke_redemption_code(
    code: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_admin),
):
    ok = await redemption_code_service.revoke_code(db, code)
    if not ok:
        raise HTTPException(404, "兑换码不存在")
    return {"ok": True, "code": redemption_code_service._mask(code)}


@router.delete("/{code}")
async def delete_redemption_code(
    code: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_admin),
):
    ok = await redemption_code_service.delete_code(db, code)
    if not ok:
        raise HTTPException(404, "兑换码不存在")
    return {"ok": True}
