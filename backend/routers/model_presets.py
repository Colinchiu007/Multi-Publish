"""Model preset catalog API — 预设模型设置 / 多模态能力设置 / 获取模型ID。"""
import datetime
import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from middleware.auth import get_current_user, require_admin
from services import model_preset_service

router = APIRouter(prefix="/api/v1/model-presets", tags=["model-presets"])


@router.get("")
async def list_model_presets(
    category: str | None = None,
    include_hidden: bool = False,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """列出模型预设目录（登录用户可读；含已隐藏需 admin）。

    语义：
    - 运营目录对已登录用户只读可见（前端【模型设置】目录来源）。
    - include_hidden=true（含已隐藏）暴露隐藏项，属于运营管理操作，仅 admin 可用。
    """
    if include_hidden and user.get("role") != "admin":
        raise HTTPException(403, "需要管理员权限才能查看隐藏项")
    presets = await model_preset_service.list_model_presets(db, category=category, include_hidden=include_hidden)
    return {"presets": presets, "count": len(presets)}


@router.get("/{preset_id}")
async def get_model_preset(
    preset_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    row = await model_preset_service.get_model_preset(db, preset_id)
    if row is None:
        raise HTTPException(404, f"Model preset not found: {preset_id}")
    # 隐藏项门禁与列表 include_hidden 语义一致：非 admin 不得读取隐藏预设
    if not row.is_visible and user.get("role") != "admin":
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


@router.post("/{preset_id}/fetch-models")
async def fetch_models(
    preset_id: str,
    body: dict | None = None,
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(require_admin),
):
    """从预设的获取模型ID URL 拉取全部支持的模型 ID（admin-only，SSRF 防护）。

    支持 body.models_url 覆盖（前端「获取模型」按钮使用未保存的表单 URL）；
    成功回写 models/models_url（default_model 若不在新列表则清空），失败不改动已有数据。
    """
    override = (body or {}).get("models_url") if isinstance(body, dict) else None
    try:
        models, default_model, models_url = await model_preset_service.fetch_models_from_url(db, preset_id, override)
    except ValueError as e:
        raise HTTPException(400, str(e))
    row = await model_preset_service.get_model_preset(db, preset_id)
    if row is None:
        # 拉取期间预设被并发删除：不写行、返回 404（避免 AttributeError 500）
        raise HTTPException(404, f"Model preset not found: {preset_id}")
    row.models = json.dumps(models, ensure_ascii=False)
    row.default_model = default_model
    row.models_url = models_url
    row.updated_at = datetime.datetime.utcnow().isoformat()
    await db.commit()
    await db.refresh(row)
    return {"models": models, "default_model": default_model, "count": len(models)}


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
