"""PromptEval Workbench API — 提示词评测工作台（读=登录，写=登录/创建者，密钥=admin）。"""
from __future__ import annotations

import os
import pathlib

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from fastapi import Query

from database import async_session, get_db
from middleware.auth import get_current_user, require_admin
from services import prompt_eval_service as service

router = APIRouter(prefix="/api/v1/prompt-eval", tags=["prompt-eval"])


def _secret() -> str:
    return os.environ.get("OPS_SECRET_KEY") or "change-me"


async def _llm_cfg(db) -> dict:
    """中英对照 LLM 配置：优先「模型密钥」表 minimax-llm（运营后台 UI 配置），fallback 环境变量。"""
    row = await service.get_llm_key(db, _secret())
    if row:
        return {"base_url": row["base_url"], "model": row["model"], "api_key": row["api_key"]}
    return {
        "base_url": os.environ.get("OPS_PROMPT_EVAL_LLM_BASE_URL") or "https://api.minimaxi.com/v1",
        "model": os.environ.get("OPS_PROMPT_EVAL_LLM_MODEL") or "MiniMax-M2.7",
        "api_key": os.environ.get("OPS_PROMPT_EVAL_LLM_API_KEY") or "",
    }


async def _vision_cfg(db) -> dict | None:
    """视觉评估配置：优先「模型密钥」表 minimax-vision，fallback 环境变量（仅 api_key）。"""
    row = await service.get_vision_key(db, _secret())
    if row:
        return {"base_url": row["base_url"], "model": row["model"], "api_key": row["api_key"]}
    key = os.environ.get("OPS_PROMPT_EVAL_VISION_API_KEY")
    if not key:
        return None
    return {"base_url": os.environ.get("OPS_PROMPT_EVAL_LLM_BASE_URL") or "https://api.minimaxi.com/v1",
            "model": os.environ.get("OPS_PROMPT_EVAL_VISION_MODEL") or "MiniMax-M2.7", "api_key": key}


def _not_found():
    raise HTTPException(404, "评测不存在")


@router.post("/cases")
async def create_case(body: dict, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    username = user.get("username") or user.get("sub") or "unknown"
    try:
        if body.get("source_mode") == "scene":
            return await service.create_case_scene(db, body, username)
        return await service.create_case(db, body, username)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/cases/{case_id}/translate")
async def translate_case(case_id: int, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    row = await service.get_case(db, case_id)
    if row is None or (row.created_by not in (user.get("username"), user.get("sub"), "unknown") and not _is_admin(user)):
        _not_found()
    try:
        return await service.translate_case(db, row, await _llm_cfg(db))
    except Exception as e:
        raise HTTPException(502, f"翻译失败: {e}")


@router.post("/cases/{case_id}/runs")
async def create_run(case_id: int, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    row = await service.get_case(db, case_id)
    if row is None or not _can_access(row, user):
        _not_found()
    gen_cfg = await service.get_provider_key(db, row.provider, row.model, _secret())
    if gen_cfg is None:
        # 角色感知提示：「模型密钥」菜单仅 admin 可见（App.vue v-if role==='admin'），
        # 非 admin 用户不应被引导到一个不可见的页面——提示区分「自行配置」与「联系管理员」。
        if _is_admin(user):
            raise HTTPException(400, "未配置可用的图片生成模型，请先在侧边栏「模型密钥」（/model-keys）中配置")
        raise HTTPException(400, "未配置可用的图片生成模型，请联系管理员在「模型密钥」中配置")
    vision_cfg = await _vision_cfg(db)
    if vision_cfg is None:
        raise HTTPException(502, "未配置视觉评估模型密钥：请在「模型密钥」添加 minimax-vision 或设置 OPS_PROMPT_EVAL_VISION_API_KEY")
    run = await service.create_run(db, row, user.get("username") or user.get("sub") or "unknown")
    eval_cfg = vision_cfg
    service.start_run_pipeline(async_session, run["id"], row, gen_cfg, eval_cfg)
    return run


@router.get("/cases/{case_id}/runs")
async def list_case_runs(case_id: int, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    """轻量轮询接口：只返回 case 的 runs（不携带 scenes/大文本），供前端场景状态轮询。"""
    row = await service.get_case(db, case_id)
    if row is None or not _can_access(row, user):
        _not_found()
    return {"items": await service.list_runs_for_case(db, case_id)}


@router.get("/runs/{run_id}")
async def get_run(run_id: int, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    run = await service.get_run(db, run_id)
    if run is None:
        _not_found()
    case = await service.get_case(db, run.case_id)
    if case is None or not _can_access(case, user):
        _not_found()
    return service.run_to_dict(run)


@router.get("/cases")
async def list_cases(db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user), limit: int = Query(50, ge=1, le=200)):
    rows = await service.list_cases(db, user.get("username") or user.get("sub") or "unknown", _is_admin(user), limit)
    return {"items": rows, "count": len(rows)}


@router.get("/cases/{case_id}")
async def get_case(case_id: int, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    row = await service.get_case(db, case_id)
    if row is None or not _can_access(row, user):
        _not_found()
    result = {"case": service.case_to_dict(row), "runs": await service.list_runs_for_case(db, case_id)}
    if row.source_mode == "scene":
        result["scenes"] = await service.list_scenes(db, case_id)
    return result


@router.post("/cases/{case_id}/scenes/{scene_id}/translate")
async def translate_scene(case_id: int, scene_id: int, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    row = await service.get_case(db, case_id)
    if row is None or not _can_access(row, user):
        _not_found()
    scene = await service.get_scene(db, scene_id)
    if scene is None or scene.case_id != case_id:
        _not_found()
    try:
        return await service.translate_scene(db, scene, row, await _llm_cfg(db))
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception:
        raise HTTPException(502, "中英对照生成失败，请稍后重试（若持续失败请检查 LLM 密钥配置）")


@router.post("/cases/{case_id}/scenes/{scene_id}/runs")
async def create_scene_run(case_id: int, scene_id: int, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    row = await service.get_case(db, case_id)
    if row is None or not _can_access(row, user):
        _not_found()
    scene = await service.get_scene(db, scene_id)
    if scene is None or scene.case_id != case_id:
        _not_found()
    if not (scene.prompt_zh or "").strip():
        raise HTTPException(400, "该场景尚未生成中英对照，请先点击「重新生成中英对照」")
    gen_cfg = await service.get_provider_key(db, row.provider, row.model, _secret())
    if gen_cfg is None:
        raise HTTPException(400, "未配置可用的图片生成模型，请先在「模型密钥」中配置")
    vision_cfg = await _vision_cfg(db)
    if vision_cfg is None:
        raise HTTPException(502, "未配置视觉评估模型密钥：请在「模型密钥」添加 minimax-vision 或设置 OPS_PROMPT_EVAL_VISION_API_KEY")
    run = await service.create_scene_run(db, scene, row, user.get("username") or user.get("sub") or "unknown")
    eval_cfg = vision_cfg
    service.start_scene_run_pipeline(async_session, run["id"], service.scene_snapshot(scene, row), gen_cfg, eval_cfg)
    return run


@router.put("/cases/{case_id}")
async def update_case(case_id: int, body: dict, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    row = await service.get_case(db, case_id)
    if row is None or not _can_access(row, user):
        _not_found()
    try:
        return await service.update_case(db, row, body)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.delete("/cases/{case_id}")
async def delete_case(case_id: int, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    row = await service.get_case(db, case_id)
    if row is None or not _can_access(row, user):
        _not_found()
    await service.soft_delete_case(db, row)
    return {"ok": True}


@router.get("/summary")
async def summary(db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    return await service.summary(db)


@router.get("/media/{name}")
async def media(name: str, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    # 授权：仅创建者/管理员可访问其评测 run 引用的媒体文件
    owned = await service.run_owns_media(db, os.path.basename(name),
                                         user.get("username") or user.get("sub") or "unknown", _is_admin(user))
    if not owned:
        raise HTTPException(404, "媒体不存在")
    base = service.media_dir().resolve()
    target = (base / os.path.basename(name)).resolve()
    if base != target.parent or not target.is_file():
        raise HTTPException(404, "媒体不存在")
    return FileResponse(target)


@router.get("/providers")
async def list_providers(db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    return {"items": await service.list_provider_keys(db)}


@router.post("/providers/test")
async def test_provider(body: dict, db: AsyncSession = Depends(get_db), user: dict = Depends(require_admin)):
    """测试 provider 密钥连通性（admin）：表单值或已保存密钥均可，不落库。"""
    try:
        return await service.test_provider_connection(db, body, _secret())
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(502, f"连通性测试失败: {e}")


@router.put("/providers")
async def upsert_provider(body: dict, db: AsyncSession = Depends(get_db), user: dict = Depends(require_admin)):
    try:
        return await service.upsert_provider_key(db, body, user.get("username") or "admin", _secret())
    except ValueError as e:
        raise HTTPException(400, str(e))


def _is_admin(user: dict) -> bool:
    return bool(user and user.get("role") == "admin")


def _can_access(case, user: dict) -> bool:
    return _is_admin(user) or (case.created_by in (user.get("username"), user.get("sub"), "unknown"))
