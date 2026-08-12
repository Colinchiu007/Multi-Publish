"""Scheduler verification API — 限流/调度模拟验证、契约校验、验证记录（admin-only）。"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from middleware.auth import require_admin
from services import scheduler_service

router = APIRouter(prefix="/api/v1/scheduler", tags=["scheduler"])


@router.post("/verify")
async def create_verification(
    body: dict,
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(require_admin),
):
    """运行调度模拟（simulated=1）或接收桌面端真实自检上报（simulated=0），落库并返回结果。"""
    try:
        run = await scheduler_service.create_verification_run(db, body)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"code": 0, "run_id": run["id"], **run}


@router.get("/verify")
async def list_verifications(
    preset_id: str | None = None,
    simulated: bool | None = None,
    limit: int = Query(20, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(require_admin),
):
    """验证记录列表（按 created_at 倒序，摘要不含 timeline）。"""
    return {"items": await scheduler_service.list_verification_runs(
        db, preset_id=preset_id, simulated=simulated, limit=limit, offset=offset,
    )}


@router.get("/verify/{run_id}")
async def get_verification(
    run_id: int,
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(require_admin),
):
    """验证记录详情（含 timeline）。"""
    run = await scheduler_service.get_verification_run(db, run_id)
    if not run:
        raise HTTPException(404, "验证记录不存在")
    return run


@router.get("/contract")
async def contract_check(
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(require_admin),
):
    """批量契约校验：预设配置范围 / default∈models / 并发换算。"""
    return {"items": await scheduler_service.contract_check(db)}
