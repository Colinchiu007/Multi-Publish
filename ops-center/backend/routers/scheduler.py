"""Scheduler verification API — 限流/调度模拟验证、契约校验、验证记录。

鉴权：GET 列表/详情/契约 admin-only；POST /verify 双通道：
- simulated=true（运营后台模拟）→ admin JWT；
- simulated=false（桌面端真实自检上报）→ X-Catalog-Key（== OPS_CATALOG_API_KEY，与 usage/ingest 同模式）或 admin JWT。
"""
import hmac as _hmac

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from database import get_db
from middleware.auth import get_current_user_optional, require_admin
from services import scheduler_service

router = APIRouter(prefix="/api/v1/scheduler", tags=["scheduler"])


def _require_report_catalog_key(request: Request) -> None:
    """桌面端上报通道：X-Catalog-Key == OPS_CATALOG_API_KEY（未配置 → 404 fail-closed，Key 错误 → 401）。"""
    expected = settings.catalog_api_key
    if not expected:
        raise HTTPException(404, "Not found")
    provided = request.headers.get("x-catalog-key", "")
    if not _hmac.compare_digest(provided.encode(), expected.encode()):
        raise HTTPException(401, "目录同步 Key 无效")


@router.post("/verify")
async def create_verification(
    request: Request,
    body: dict,
    db: AsyncSession = Depends(get_db),
    user: dict | None = Depends(get_current_user_optional),
):
    """运行调度模拟（simulated=1，admin）或接收桌面端真实自检上报（simulated=0，X-Catalog-Key 或 admin），落库并返回结果。"""
    simulated = bool(body.get("simulated", True))
    has_catalog_key = "x-catalog-key" in request.headers
    if has_catalog_key:
        _require_report_catalog_key(request)
        if simulated:
            raise HTTPException(403, "目录同步 Key 仅允许桌面端自检上报（simulated=false）")
    else:
        if user is None:
            raise HTTPException(401, "未提供认证令牌")
        if user.get("role") != "admin":
            raise HTTPException(403, "需要管理员权限")
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

