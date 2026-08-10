"""Publish metrics API — 发布指标上报（X-Catalog-Key）与运营看板（admin）。"""
import hmac as _hmac

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from database import get_db
from middleware.auth import get_current_user, require_admin
from services import publish_metric_service

router = APIRouter(prefix="/api/v1/publish", tags=["publish-metrics"])


def _require_catalog_key(request: Request) -> None:
    expected = settings.catalog_api_key
    if not expected:
        raise HTTPException(404, "Not found")
    provided = request.headers.get("x-catalog-key", "")
    if not _hmac.compare_digest(provided.encode(), expected.encode()):
        raise HTTPException(401, "目录同步 Key 无效")


@router.post("/ingest")
async def ingest_publish_metrics(
    body: dict,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    _require_catalog_key(request)
    try:
        return await publish_metric_service.ingest_publish_metrics(db, body)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get("/summary")
async def get_publish_summary(
    days: int = 30,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_admin),
):
    return await publish_metric_service.publish_summary(db, days=days)
