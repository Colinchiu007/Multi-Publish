"""统一内容类别 API（2026-10-03）— 热门选题 / 采集库 / 账号标签 的唯一真源。

- 管理接口：GET 走登录鉴权；写操作走 require_admin
- 下发接口：GET /api/v1/runtime/bootstrap（Ed25519 签名，见 routers/runtime.py）
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from middleware.auth import get_current_user, require_admin
from services import content_category_service

router = APIRouter(prefix="/api/v1/content-categories", tags=["content-categories"])


@router.get("")
async def list_content_categories(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    items = await content_category_service.list_categories(db)
    return {
        "items": items,
        "count": len(items),
        "max_items": content_category_service.MAX_CATEGORIES,
        "preset_keys": list(content_category_service.CATALOG_KEYS),
    }


@router.post("")
async def create_content_category(
    body: dict,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_admin),
):
    try:
        return await content_category_service.create_category(
            db, body, updated_by=user.get("username", "admin")
        )
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.put("/{category_key}")
async def update_content_category(
    category_key: str,
    body: dict,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_admin),
):
    try:
        return await content_category_service.update_category(
            db, category_key, body, updated_by=user.get("username", "admin")
        )
    except ValueError as e:
        raise HTTPException(400, str(e))
    except KeyError:
        raise HTTPException(404, f"类别不存在: {category_key}")


@router.delete("/{category_key}")
async def delete_content_category(
    category_key: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_admin),
):
    try:
        await content_category_service.delete_category(
            db, category_key, updated_by=user.get("username", "admin")
        )
    except ValueError as e:
        raise HTTPException(400, str(e))
    except KeyError:
        raise HTTPException(404, f"类别不存在: {category_key}")
    return {"deleted": category_key}


@router.post("/{category_key}/reorder")
async def reorder_content_category(
    category_key: str,
    body: dict | None = None,
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(require_admin),
):
    """排序：action ∈ top/up/down/bottom，点击即持久化；边界幂等返回 noop 不写库。"""
    action = str((body or {}).get("action", "")).strip()
    try:
        result = await content_category_service.reorder_category(db, category_key, action)
    except ValueError as e:
        raise HTTPException(400, str(e))
    if result == "not-found":
        raise HTTPException(404, f"类别不存在: {category_key}")
    items = await content_category_service.list_categories(db)
    return {"items": items, "count": len(items), "result": result}


@router.post("/reset")
async def reset_content_categories(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_admin),
):
    """恢复内置目录默认（名称/说明/排序/启用），自定义类别保留。"""
    items = await content_category_service.reset_categories(
        db, updated_by=user.get("username", "admin")
    )
    return {"items": items, "count": len(items)}
