"""Model preset catalog API — 预设模型设置 / 多模态能力设置。"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from middleware.auth import require_admin
from services import model_preset_service

router = APIRouter(prefix="/api/v1/model-presets", tags=["model-presets"])


@router.get("")
async def list_model_presets(
    category: str | None = None,
    include_hidden: bool = True,
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(require_admin),
):
    """列出模型预设目录（可过滤类别 / 是否包含已隐藏项）。"""
    presets = await model_preset_service.list_model_presets(db, category=category, include_hidden=include_hidden)
    return {"presets": presets, "count": len(presets)}


@router.get("/{preset_id}")
async def get_model_preset(
    preset_id: str,
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(require_admin),
):
    row = await model_preset_service.get_model_preset(db, preset_id)
    if row is None:
        raise HTTPException(404, f"Model preset not found: {preset_id}")
    return model_preset_service._to_dict(row)


@router.post("")
async def create_model_preset(
    body: dict,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_admin),
):
    """创建模型预设（校验 doc_links/capability_doc_links 数量与格式）。"""
    try:
        return await model_preset_service.upsert_model_preset(db, body, updated_by=user.get("username", "admin"))
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.put("/{preset_id}")
async def update_model_preset(
    preset_id: str,
    body: dict,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_admin),
):
    body = dict(body)
    body["id"] = preset_id
    try:
        return await model_preset_service.upsert_model_preset(db, body, updated_by=user.get("username", "admin"))
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.delete("/{preset_id}")
async def delete_model_preset(
    preset_id: str,
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(require_admin),
):
    ok = await model_preset_service.delete_model_preset(db, preset_id)
    if not ok:
        raise HTTPException(404, f"Model preset not found: {preset_id}")
    return {"deleted": preset_id}
