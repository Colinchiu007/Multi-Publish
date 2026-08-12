"""Diagnostics API — 桌面端失败诊断上报 + 运营看板汇总/样本查询。"""
import hmac as _hmac

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from database import get_db
from middleware.auth import require_admin
from services import diagnostics_service

router = APIRouter(tags=["diagnostics"])


def _require_catalog_key(request: Request) -> None:
    expected = settings.catalog_api_key
    if not expected:
        raise HTTPException(404, "Not found")
    provided = request.headers.get("x-catalog-key", "")
    if not _hmac.compare_digest(provided.encode(), expected.encode()):
        raise HTTPException(401, "目录同步 Key 无效")


@router.post("/api/v1/diagnostics/ingest")
async def ingest_diagnostics(
    request: Request,
    body: dict,
    db: AsyncSession = Depends(get_db),
):
    """桌面端脱敏诊断上报（X-Catalog-Key 鉴权，无需登录）。"""
    _require_catalog_key(request)
    try:
        return await diagnostics_service.ingest_diagnostics(db, body)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get("/api/v1/diagnostics/summary")
async def get_diagnostics_summary(
    days: int = Query(30, ge=1, le=90),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_admin),
):
    return await diagnostics_service.diagnostics_summary(db, days=days)


@router.get("/api/v1/diagnostics/samples")
async def get_diagnostics_samples(
    days: int = Query(30, ge=1, le=90),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    stage: str = "",
    failure_type: str = "",
    cause_id: str = "",
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_admin),
):
    return await diagnostics_service.list_diagnostics_samples(
        db, days=days, limit=limit, offset=offset, stage=stage, failure_type=failure_type, cause_id=cause_id
    )
