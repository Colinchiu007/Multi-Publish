"""Content templates API — 官方内容模板库管理（admin）。"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from middleware.auth import get_current_user, require_admin
from services import content_template_service

router = APIRouter(prefix="/api/v1/content-templates", tags=["content-templates"])


@router.get("")
async def list_content_templates(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    items = await content_template_service.list_content_templates(db)
    return {"items": items, "count": len(items)}


@router.post("")
async def create_content_template(
    body: dict,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_admin),
):
    try:
        return await content_template_service.create_content_template(db, body, user.get("username", "unknown"))
    except content_template_service.ContentTemplateExists as e:
        raise HTTPException(409, str(e))
    except content_template_service.ContentTemplateError as e:
        raise HTTPException(400, str(e))


@router.put("/{template_id}")
async def update_content_template(
    template_id: str,
    body: dict,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_admin),
):
    try:
        return await content_template_service.update_content_template(db, template_id, body, user.get("username", "unknown"))
    except KeyError:
        raise HTTPException(404, "模板不存在")
    except content_template_service.ContentTemplateError as e:
        raise HTTPException(400, str(e))


@router.delete("/{template_id}")
async def delete_content_template(
    template_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_admin),
):
    ok = await content_template_service.delete_content_template(db, template_id)
    if not ok:
        raise HTTPException(404, "模板不存在")
    return {"ok": True}
