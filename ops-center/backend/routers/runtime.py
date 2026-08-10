"""Runtime policy API — 运营公告 / 版本发布策略 / 内容安全策略。

- 管理 CRUD 走登录鉴权（require_admin）
- GET /api/v1/runtime/bootstrap 走 X-Catalog-Key（桌面端只读拉取，与模型目录端点同鉴权）
"""
import datetime
import hmac as _hmac

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from database import get_db
from middleware.auth import get_current_user, require_admin
from services import runtime_service

router = APIRouter(tags=["runtime"])


def _require_catalog_key(request: Request) -> None:
    expected = settings.catalog_api_key
    if not expected:
        raise HTTPException(404, "Not found")
    provided = request.headers.get("x-catalog-key", "")
    if not _hmac.compare_digest(provided.encode(), expected.encode()):
        raise HTTPException(401, "目录同步 Key 无效")


# ─── 公告 ────────────────────────────────────────────────

@router.get("/api/v1/announcements")
async def list_announcements(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    items = await runtime_service.list_announcements(db)
    return {"items": items, "count": len(items)}


@router.post("/api/v1/announcements")
async def create_announcement(
    body: dict,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_admin),
):
    try:
        return await runtime_service.upsert_announcement(db, body)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.put("/api/v1/announcements/{announcement_id}")
async def update_announcement(
    announcement_id: int,
    body: dict,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_admin),
):
    try:
        return await runtime_service.upsert_announcement(db, body, announcement_id=announcement_id)
    except KeyError:
        raise HTTPException(404, "公告不存在")
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.delete("/api/v1/announcements/{announcement_id}")
async def delete_announcement(
    announcement_id: int,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_admin),
):
    ok = await runtime_service.delete_announcement(db, announcement_id)
    if not ok:
        raise HTTPException(404, "公告不存在")
    return {"ok": True}


# ─── 版本发布策略 ────────────────────────────────────────

@router.get("/api/v1/update-policy")
async def get_update_policy(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    return await runtime_service.get_update_policy(db)


@router.put("/api/v1/update-policy")
async def put_update_policy(
    body: dict,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_admin),
):
    try:
        return await runtime_service.upsert_update_policy(db, body)
    except ValueError as e:
        raise HTTPException(400, str(e))


# ─── 内容安全策略 ────────────────────────────────────────

@router.get("/api/v1/content-policy")
async def get_content_policy(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    return await runtime_service.get_content_policy(db)


@router.put("/api/v1/content-policy")
async def put_content_policy(
    body: dict,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_admin),
):
    try:
        return await runtime_service.upsert_content_policy(db, body)
    except ValueError as e:
        raise HTTPException(400, str(e))


# ─── 运行时只读 bootstrap（桌面端）────────────────────────

@router.get("/api/v1/runtime/bootstrap")
async def get_runtime_bootstrap(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    _require_catalog_key(request)
    return await runtime_service.get_runtime_bootstrap(db)
