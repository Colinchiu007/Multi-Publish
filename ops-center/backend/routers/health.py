"""System health API — 云服务一键巡检（admin）。"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from middleware.auth import require_admin
from services import health_service

router = APIRouter(tags=["health"])


@router.get("/api/v1/system/health")
async def system_health(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_admin),
):
    return await health_service.run_health_checks(db)
