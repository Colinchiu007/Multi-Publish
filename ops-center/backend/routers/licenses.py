"""License API — 官方许可证管理（签发/吊销/列表，admin）。"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from middleware.auth import require_admin
from services import license_service

router = APIRouter(prefix="/api/v1/licenses", tags=["licenses"])


@router.get("")
async def list_licenses(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_admin),
):
    items = await license_service.list_licenses(db)
    return {"items": items, "count": len(items)}


@router.post("")
async def create_license(
    body: dict,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_admin),
):
    try:
        return await license_service.create_license(db, body)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/{license_id}/reveal")
async def reveal_license(
    license_id: int,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_admin),
):
    """查看许可证明文（admin，二次确认场景）。"""
    from models import License
    import sqlalchemy as sa

    row = (await db.execute(sa.select(License).where(License.id == license_id))).scalar_one_or_none()
    if row is None:
        raise HTTPException(404, "许可证不存在")
    return license_service._to_dict(row, reveal=True)


@router.put("/{license_id}")
async def update_license(
    license_id: int,
    body: dict,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_admin),
):
    try:
        result = await license_service.update_license(db, license_id, body)
    except ValueError as e:
        raise HTTPException(400, str(e))
    if result is None:
        raise HTTPException(404, "许可证不存在")
    return result


@router.delete("/{license_id}")
async def delete_license(
    license_id: int,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_admin),
):
    ok = await license_service.delete_license(db, license_id)
    if not ok:
        raise HTTPException(404, "许可证不存在")
    return {"ok": True}
