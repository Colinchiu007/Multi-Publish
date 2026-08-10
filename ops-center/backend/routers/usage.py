"""Model usage API — 桌面端用量上报 + 运营看板汇总。"""
import hmac as _hmac

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from database import get_db
from middleware.auth import require_admin
from services import usage_service

router = APIRouter(tags=["usage"])


def _require_catalog_key(request: Request) -> None:
    expected = settings.catalog_api_key
    if not expected:
        raise HTTPException(404, "Not found")
    provided = request.headers.get("x-catalog-key", "")
    if not _hmac.compare_digest(provided.encode(), expected.encode()):
        raise HTTPException(401, "目录同步 Key 无效")


@router.post("/api/v1/usage/ingest")
async def ingest_usage(
    request: Request,
    body: dict,
    db: AsyncSession = Depends(get_db),
):
    """桌面端脱敏聚合用量上报（X-Catalog-Key 鉴权，无需登录）。"""
    _require_catalog_key(request)
    try:
        items = body.get("items", []) if isinstance(body, dict) else []
        return await usage_service.ingest_usage(db, items)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get("/api/v1/usage/summary")
async def get_usage_summary(
    days: int = 30,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_admin),
):
    return await usage_service.usage_summary(db, days=days)
