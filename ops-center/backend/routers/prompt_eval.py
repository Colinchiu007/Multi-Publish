"""PromptEval Workbench API — 提示词评测工作台（读=登录，写=登录/创建者，密钥=admin）。"""
from __future__ import annotations

import os
import pathlib

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from database import async_session, get_db
from middleware.auth import get_current_user, require_admin
from services import prompt_eval_service as service

router = APIRouter(prefix="/api/v1/prompt-eval", tags=["prompt-eval"])


def _secret() -> str:
    return os.environ.get("OPS_SECRET_KEY") or "change-me"


def _translate_cfg() -> dict:
    return {
        "base_url": os.environ.get("OPS_PROMPT_EVAL_LLM_BASE_URL") or "https://api.minimaxi.com/v1",
        "model": os.environ.get("OPS_PROMPT_EVAL_LLM_MODEL") or "MiniMax-M2.7",
        "api_key": os.environ.get("OPS_PROMPT_EVAL_LLM_API_KEY") or "",
    }


def _not_found():
    raise HTTPException(404, "评测不存在")


@router.post("/cases")
async def create_case(body: dict, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    try:
        return await service.create_case(db, body, user.get("username") or user.get("sub") or "unknown")
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/cases/{case_id}/translate")
async def translate_case(case_id: int, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    row = await service.get_case(db, case_id)
    if row is None or (row.created_by not in (user.get("username"), user.get("sub"), "unknown") and not _is_admin(user)):
        _not_found()
    try:
        return await service.translate_case(db, row, _translate_cfg())
    except Exception as e:
        raise HTTPException(502, f"翻译失败: {e}")


@router.post("/cases/{case_id}/runs")
async def create_run(case_id: int, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    row = await service.get_case(db, case_id)
    if row is None or (row.created_by not in (user.get("username"), user.get("sub"), "unknown") and not _is_admin(user)):
        _not_found()
    gen_cfg = await service.get_provider_key(db, row.provider, row.model, _secret())
    if gen_cfg is None:
        raise HTTPException(400, "未配置可用的图片生成模型，请先在「模型密钥」中配置")
    run = await service.create_run(db, row, user.get("username") or user.get("sub") or "unknown")
    eval_cfg = {**_translate_cfg(), "api_key": os.environ.get("OPS_PROMPT_EVAL_VISION_API_KEY") or _translate_cfg()["api_key"]}
    service.start_run_pipeline(async_session, run["id"], row, gen_cfg, eval_cfg)
    return run


@router.get("/runs/{run_id}")
async def get_run(run_id: int, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    run = await service.get_run(db, run_id)
    if run is None:
        _not_found()
    return service.run_to_dict(run)


@router.get("/cases")
async def list_cases(db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user), limit: int = 50):
    rows = await service.list_cases(db, user.get("username") or user.get("sub") or "unknown", _is_admin(user), limit)
    return {"items": rows, "count": len(rows)}


@router.get("/cases/{case_id}")
async def get_case(case_id: int, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    row = await service.get_case(db, case_id)
    if row is None or (row.created_by not in (user.get("username"), user.get("sub"), "unknown") and not _is_admin(user)):
        _not_found()
    return {"case": service.case_to_dict(row), "runs": await service.list_runs_for_case(db, case_id)}


@router.delete("/cases/{case_id}")
async def delete_case(case_id: int, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    row = await service.get_case(db, case_id)
    if row is None or (row.created_by not in (user.get("username"), user.get("sub"), "unknown") and not _is_admin(user)):
        _not_found()
    await service.soft_delete_case(db, row)
    return {"ok": True}


@router.get("/summary")
async def summary(db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    return await service.summary(db)


@router.get("/media/{name}")
async def media(name: str, user: dict = Depends(get_current_user)):
    base = service.media_dir().resolve()
    target = (base / os.path.basename(name)).resolve()
    if base != target.parent or not target.is_file():
        raise HTTPException(404, "媒体不存在")
    return FileResponse(target)


@router.get("/providers")
async def list_providers(db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    return {"items": await service.list_provider_keys(db)}


@router.put("/providers")
async def upsert_provider(body: dict, db: AsyncSession = Depends(get_db), user: dict = Depends(require_admin)):
    try:
        return await service.upsert_provider_key(db, body, user.get("username") or "admin", _secret())
    except ValueError as e:
        raise HTTPException(400, str(e))


def _is_admin(user: dict) -> bool:
    return bool(user and (user.get("role") == "admin" or user.get("is_admin")))
