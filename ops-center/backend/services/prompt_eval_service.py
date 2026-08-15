"""PromptEval 评测服务 — case/run CRUD、翻译、异步生成→评估流水线、聚合。"""
from __future__ import annotations

import asyncio
import base64
import datetime
import logging
import hashlib
import json
import os
import pathlib
import uuid

from cryptography.fernet import Fernet
from sqlalchemy import select, desc, func
from sqlalchemy.ext.asyncio import AsyncSession

from models import PromptEvalCase, PromptEvalRun, PromptEvalProviderKey
from services import prompt_eval_contract as contract
from services import prompt_eval_generation_service as generation
from services import prompt_eval_translation_service as translation
from services import prompt_eval_evaluation_service as evaluation
from services import prompt_eval_engine_client as engine_client
from services import prompt_eval_video_service as video_service

logger = logging.getLogger("ops-center.prompt-eval")


def _now() -> str:
    return datetime.datetime.utcnow().isoformat()


def _now_ts() -> float:
    return datetime.datetime.utcnow().timestamp()


def _fernet(secret: str) -> Fernet:
    key = base64.urlsafe_b64encode(hashlib.sha256(secret.encode("utf-8")).digest())
    return Fernet(key)


def _require_secret(secret: str) -> None:
    if not secret or secret == "change-me" or secret == "dev-secret-change-in-production":
        raise RuntimeError("未配置安全的 OPS_SECRET_KEY，无法加密评测 provider 密钥")


def encrypt_key(secret: str, value: str) -> str:
    _require_secret(secret)
    return _fernet(secret).encrypt(value.encode("utf-8")).decode("ascii")


def decrypt_key(secret: str, value: str) -> str:
    return _fernet(secret).decrypt(value.encode("ascii")).decode("utf-8")


# ─── 校验 ───

def validate_case_body(body: dict, require_prompt_zh: bool = True) -> dict:
    source_text = str(body.get("source_text") or "").strip()
    if not source_text:
        raise ValueError("source_text 不能为空")
    if len(source_text) > contract.MAX_SOURCE_TEXT:
        raise ValueError(f"source_text 不能超过 {contract.MAX_SOURCE_TEXT} 字符")
    prompt_zh = str(body.get("prompt_zh") or "").strip()
    if require_prompt_zh and not prompt_zh:
        raise ValueError("prompt_zh 不能为空")
    if len(prompt_zh) > contract.MAX_PROMPT_ZH:
        raise ValueError(f"prompt_zh 不能超过 {contract.MAX_PROMPT_ZH} 字符")
    context = body.get("context")
    if context is not None:
        if isinstance(context, str):
            context = context.strip()
        else:
            contract.assert_no_sensitive_context(context, "context")
            context = json.dumps(context, ensure_ascii=False)
        if context and len(context) > contract.MAX_CONTEXT:
            raise ValueError(f"context 不能超过 {contract.MAX_CONTEXT} 字符")
    media_type = str(body.get("media_type") or "image").strip()
    if media_type not in contract.MEDIA_TYPES:
        raise ValueError(f"media_type 必须是 {contract.MEDIA_TYPES}")
    if media_type == "video" and str(body.get("source_mode") or "manual").strip() == "scene":
        raise ValueError("场景模式暂不支持视频评测，请使用整 case 手动模式")
    if media_type == "video" and str(body.get("compare_mode") or "single").strip() == "dual":
        raise ValueError("视频评测暂不支持双路对比，请使用单路模式")
    provider = str(body.get("provider") or "").strip()
    if not provider:
        raise ValueError("provider 不能为空")
    model = str(body.get("model") or "").strip()
    if not model:
        raise ValueError("model 不能为空")
    image_count = body.get("image_count", 1)
    if isinstance(image_count, bool) or not isinstance(image_count, int) or not (contract.MIN_IMAGE_COUNT <= image_count <= contract.MAX_IMAGE_COUNT):
        raise ValueError(f"image_count 必须是 {contract.MIN_IMAGE_COUNT}-{contract.MAX_IMAGE_COUNT} 的整数")
    aspect_ratio = str(body.get("aspect_ratio") or "1:1").strip()
    if aspect_ratio not in contract.ASPECT_RATIOS:
        raise ValueError(f"aspect_ratio 必须是 {contract.ASPECT_RATIOS}")
    compare_mode = str(body.get("compare_mode") or "single").strip()
    if compare_mode not in ("single", "dual"):
        raise ValueError("compare_mode 必须是 single 或 dual")
    engine_params = None
    if compare_mode == "dual":
        creative_level = body.get("engine_creative_level")
        if creative_level is None:
            creative_level = body.get("creative_level", 8)
        if not isinstance(creative_level, int) or isinstance(creative_level, bool) or not (1 <= creative_level <= 10):
            raise ValueError("engine creative_level 必须是 1-10 的整数")
        num_candidates = body.get("engine_num_candidates")
        if num_candidates is None:
            num_candidates = body.get("num_candidates", 3)
        if not isinstance(num_candidates, int) or isinstance(num_candidates, bool) or not (1 <= num_candidates <= 5):
            raise ValueError("engine num_candidates 必须是 1-5 的整数")
        engine_params = {
            "creative_level": creative_level,
            "num_candidates": num_candidates,
            "excluded_characters": body.get("engine_excluded_characters") or [],
            "no_swap_pairs": body.get("engine_no_swap_pairs") or [],
        }
    return {
        "title": str(body.get("title") or "").strip()[:200],
        "source_text": source_text,
        "context": context or None,
        "prompt_zh": prompt_zh,
        "media_type": media_type,
        "provider": provider,
        "model": model,
        "image_count": image_count,
        "aspect_ratio": aspect_ratio,
        "compare_mode": compare_mode,
        "engine_params": json.dumps(engine_params, ensure_ascii=False) if engine_params else None,
    }


def validate_provider_key_body(body: dict, existing_key: str | None = None) -> dict:
    provider = str(body.get("provider") or "").strip()
    model = str(body.get("model") or "").strip()
    if not provider or not model:
        raise ValueError("provider/model 均不能为空")
    api_key = str(body.get("api_key") or "").strip()
    if not api_key and not existing_key:
        raise ValueError("api_key 不能为空（新增密钥必须提供）")
    if not api_key and existing_key:
        api_key = existing_key  # 更新时留空保留旧密文
    return {
        "provider": provider[:64],
        "model": model[:128],
        "api_key": api_key,
        "base_url": str(body.get("base_url") or "").strip()[:255],
        "enabled": 1 if str(body.get("enabled", 1)).lower() in ("true", "1") else 0,
    }


# ─── CRUD ───

async def create_case(db: AsyncSession, body: dict, username: str) -> dict:
    data = validate_case_body(body)
    row = PromptEvalCase(**data, created_by=username)
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return case_to_dict(row)


def case_to_dict(row: PromptEvalCase) -> dict:
    return {
        "id": row.id, "title": row.title, "source_mode": row.source_mode, "source_text": row.source_text,
        "context": row.context, "prompt_zh": row.prompt_zh, "prompt_en": row.prompt_en,
        "prompt_en_source": row.prompt_en_source, "prompt_en_translated_at": row.prompt_en_translated_at,
        "media_type": row.media_type or "image",
        "provider": row.provider, "model": row.model,
        "image_count": row.image_count, "aspect_ratio": row.aspect_ratio,
        "compare_mode": row.compare_mode or "single",
        "engine_params": json.loads(row.engine_params) if row.engine_params else None,
        "created_by": row.created_by, "created_at": row.created_at, "updated_at": row.updated_at,
    }


async def get_case(db: AsyncSession, case_id: int) -> PromptEvalCase | None:
    return (await db.execute(
        select(PromptEvalCase).where(PromptEvalCase.id == case_id, PromptEvalCase.deleted_at.is_(None))
    )).scalar_one_or_none()


async def list_cases(db: AsyncSession, username: str, admin: bool, limit: int = 50) -> list[dict]:
    limit = max(1, min(int(limit or 50), 200))
    stmt = select(PromptEvalCase).where(PromptEvalCase.deleted_at.is_(None)).order_by(desc(PromptEvalCase.id)).limit(limit)
    if not admin:
        stmt = stmt.where(PromptEvalCase.created_by == username)
    rows = (await db.execute(stmt)).scalars().all()
    return [case_to_dict(r) for r in rows]


async def soft_delete_case(db: AsyncSession, row: PromptEvalCase) -> None:
    row.deleted_at = _now()
    await db.commit()


def run_to_dict(row: PromptEvalRun) -> dict:
    return {
        "id": row.id, "case_id": row.case_id, "scene_id": row.scene_id, "provider": row.provider, "model": row.model,
        "status": row.status, "eval_status": row.eval_status,
        "image_paths": json.loads(row.image_paths) if row.image_paths else [],
        "video_path": row.video_path,
        "video_frames": json.loads(row.video_frames) if row.video_frames else [],
        "overall_score": row.overall_score, "grade": row.grade,
        "dimensions": json.loads(row.dimensions) if row.dimensions else None,
        "problems": json.loads(row.problems) if row.problems else None,
        "optimization_points": json.loads(row.optimization_points) if row.optimization_points else None,
        "error": row.error, "created_by": row.created_by,
        "prompt_variant": row.prompt_variant or "manual",
        "prompt_source_zh": row.prompt_source_zh,
        "prompt_zh": row.prompt_zh,
        "prompt_en": row.prompt_en,
        "engine_meta": json.loads(row.engine_meta) if row.engine_meta else None,
        "created_at": row.created_at, "completed_at": row.completed_at,
    }


async def get_run(db: AsyncSession, run_id: int) -> PromptEvalRun | None:
    return (await db.execute(select(PromptEvalRun).where(PromptEvalRun.id == run_id))).scalar_one_or_none()


async def list_runs_for_case(db: AsyncSession, case_id: int) -> list[dict]:
    rows = (await db.execute(select(PromptEvalRun).where(PromptEvalRun.case_id == case_id).order_by(desc(PromptEvalRun.id)))).scalars().all()
    return [run_to_dict(r) for r in rows]


# ─── 密钥 ───

async def get_provider_key(db: AsyncSession, provider: str, model: str, secret: str) -> dict | None:
    row = (await db.execute(select(PromptEvalProviderKey).where(
        PromptEvalProviderKey.provider == provider,
        PromptEvalProviderKey.model == model,
        PromptEvalProviderKey.enabled == 1,
    ))).scalar_one_or_none()
    if not row:
        return None
    return {"provider": row.provider, "model": row.model, "api_key": decrypt_key(secret, row.key_enc), "base_url": row.base_url}


async def upsert_provider_key(db: AsyncSession, body: dict, username: str, secret: str) -> dict:
    existing = (await db.execute(select(PromptEvalProviderKey).where(
        PromptEvalProviderKey.provider == str(body.get("provider") or "").strip(),
        PromptEvalProviderKey.model == str(body.get("model") or "").strip(),
    ))).scalar_one_or_none()
    data = validate_provider_key_body(body, decrypt_key(secret, existing.key_enc) if existing else None)
    try:
        if existing:
            existing.key_enc = encrypt_key(secret, data["api_key"])
            existing.base_url = data["base_url"]
            existing.enabled = data["enabled"]
            existing.updated_at = _now()
            existing.updated_by = username
        else:
            row = PromptEvalProviderKey(provider=data["provider"], model=data["model"],
                                        key_enc=encrypt_key(secret, data["api_key"]),
                                        base_url=data["base_url"], enabled=data["enabled"], updated_by=username)
            db.add(row)
        await db.commit()
        if existing:
            await db.refresh(existing)
            row = existing
        else:
            row = (await db.execute(select(PromptEvalProviderKey).where(
                PromptEvalProviderKey.provider == data["provider"], PromptEvalProviderKey.model == data["model"]
            ))).scalar_one()
    except IntegrityError:
        await db.rollback()
        row = (await db.execute(select(PromptEvalProviderKey).where(
            PromptEvalProviderKey.provider == data["provider"], PromptEvalProviderKey.model == data["model"]
        ))).scalar_one()
        row.key_enc = encrypt_key(secret, data["api_key"])
        row.base_url = data["base_url"]
        row.enabled = data["enabled"]
        row.updated_at = _now()
        row.updated_by = username
        await db.commit()
    return {"provider": row.provider, "model": row.model, "base_url": row.base_url, "enabled": row.enabled}


async def list_provider_keys(db: AsyncSession) -> list[dict]:
    rows = (await db.execute(select(PromptEvalProviderKey).order_by(PromptEvalProviderKey.provider, PromptEvalProviderKey.model))).scalars().all()
    return [{"provider": r.provider, "model": r.model, "base_url": r.base_url, "enabled": r.enabled, "updated_at": r.updated_at} for r in rows]


async def get_llm_key(db: AsyncSession, secret: str) -> dict | None:
    """LLM（中英对照优化/翻译）密钥：优先「模型密钥」表 minimax-llm（运营后台 UI 配置），
    fallback 由 router 读环境变量 OPS_PROMPT_EVAL_LLM_*。"""
    row = (await db.execute(select(PromptEvalProviderKey).where(
        PromptEvalProviderKey.provider == "minimax-llm",
        PromptEvalProviderKey.enabled == 1,
    ).order_by(desc(PromptEvalProviderKey.updated_at)))).scalars().first()
    if not row:
        return None
    return {"provider": row.provider, "model": row.model,
            "api_key": decrypt_key(secret, row.key_enc),
            "base_url": row.base_url or "https://api.minimaxi.com/v1"}


VISION_PROVIDERS = ("minimax-vision", "opencode-go-vision")


async def test_provider_connection(db: AsyncSession, body: dict, secret: str,
                                   http: "httpx.AsyncClient | None" = None) -> dict:
    """测试 provider 密钥连通性（不落库、不产生真实生成费用）。

    探测策略（OpenAI 兼容最小请求）：
    1) POST {base}/chat/completions（max_tokens=1）——覆盖 llm/vision/opencode 等 chat 类；
    2) 若返回 404/405 → fallback GET {base}/models —— 覆盖 image 类 provider；
    3) 均不可达 → 报错并提示「请用真实生成验证」。
    api_key/base_url 未提供时回退到已保存密钥（按 provider+model）。
    """
    import httpx

    provider = str(body.get("provider") or "").strip()
    model = str(body.get("model") or "").strip()
    if not provider or not model:
        raise ValueError("provider 与 model 不能为空")
    api_key = str(body.get("api_key") or "").strip()
    base_url = str(body.get("base_url") or "").strip().rstrip("/")
    if not api_key or not base_url:
        row = (await db.execute(select(PromptEvalProviderKey).where(
            PromptEvalProviderKey.provider == provider,
            PromptEvalProviderKey.model == model,
            PromptEvalProviderKey.enabled == 1,
        ))).scalar_one_or_none()
        if row:
            if not api_key:
                api_key = decrypt_key(secret, row.key_enc)
            if not base_url:
                base_url = (row.base_url or "").rstrip("/")
    if not api_key:
        raise ValueError("未提供 API Key（表单未填且未找到已保存密钥）")
    if not base_url:
        base_url = "https://api.minimaxi.com/v1"

    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    own = http is None
    client = http or httpx.AsyncClient(timeout=15)
    try:
        url = f"{base_url}/chat/completions"
        resp = await client.post(url, json={
            "model": model,
            "messages": [{"role": "user", "content": "ping"}],
            "max_tokens": 1,
        }, headers=headers)
        if resp.status_code < 400:
            return {"ok": True, "detail": "连接成功（chat/completions 可达）"}
        if resp.status_code in (404, 405):
            url2 = f"{base_url}/models"
            resp2 = await client.get(url2, headers=headers)
            if resp2.status_code < 400:
                return {"ok": True, "detail": "连接成功（/models 可达）"}
            raise ValueError(
                f"连通性探测失败：chat/completions={resp.status_code}，/models={resp2.status_code}；"
                "该端点可能不支持轻量探测，请改用真实生成/评估验证")
        raise ValueError(f"HTTP {resp.status_code}: {resp.text[:200]}")
    except httpx.HTTPError as e:
        raise ValueError(f"连接失败：{e.__class__.__name__}: {e}")
    finally:
        if own:
            await client.aclose()


async def get_vision_key(db: AsyncSession, secret: str) -> dict | None:
    """视觉评估密钥：依次尝试「模型密钥」表 minimax-vision / opencode-go-vision，
    fallback 环境变量 OPS_PROMPT_EVAL_VISION_API_KEY。评估服务按 OpenAI 兼容
    base_url/model/api_key 调用，provider 仅作密钥槽位。"""
    for provider in VISION_PROVIDERS:
        row = (await db.execute(select(PromptEvalProviderKey).where(
            PromptEvalProviderKey.provider == provider,
            PromptEvalProviderKey.enabled == 1,
        ).order_by(desc(PromptEvalProviderKey.updated_at)))).scalars().first()
        if row:
            return {"provider": row.provider, "model": row.model,
                    "api_key": decrypt_key(secret, row.key_enc),
                    "base_url": row.base_url or "https://api.minimaxi.com/v1"}
    return None


# ─── 翻译 ───

async def translate_case(db: AsyncSession, row: PromptEvalCase, translate_cfg: dict, http=None) -> dict:
    """LLM 翻译 prompt_zh→prompt_en；幂等缓存（同 prompt_zh 且 7 天内不重复）。"""
    cached = row.prompt_en and row.prompt_en_source == "machine_translation" and row.prompt_en_translated_at
    if cached:
        try:
            ts = datetime.datetime.fromisoformat(row.prompt_en_translated_at).timestamp()
            if _now_ts() - ts < contract.TRANSLATION_CACHE_SECONDS and row.prompt_en_cache_zh == row.prompt_zh:
                return case_to_dict(row)
        except ValueError:
            pass
    prompt_en = await translation.translate_prompt_zh(translate_cfg, row.prompt_zh, http=http)
    if not prompt_en.strip():
        raise ValueError("翻译结果为空")
    row.prompt_en = prompt_en
    row.prompt_en_source = "machine_translation"
    row.prompt_en_translated_at = _now()
    row.prompt_en_cache_zh = row.prompt_zh
    row.updated_at = _now()
    await db.commit()
    await db.refresh(row)
    return case_to_dict(row)


# ─── run 流水线 ───


async def update_case(db: AsyncSession, row: PromptEvalCase, body: dict) -> dict:
    """更新 case 的可编辑字段（服务端生成字段 prompt_en 系列不受影响）。"""
    data = validate_case_body(body)
    if "media_type" not in body:
        # 省略 media_type 时保留原值，避免把既有 video case 静默翻回 image
        data["media_type"] = row.media_type or "image"
    if data["media_type"] == "video" and row.source_mode == "scene":
        raise ValueError("场景模式暂不支持视频评测，请使用整 case 手动模式")
    row.title = data["title"]
    row.source_text = data["source_text"]
    row.context = data["context"]
    row.prompt_zh = data["prompt_zh"]
    row.media_type = data["media_type"]
    row.provider = data["provider"]
    row.model = data["model"]
    row.image_count = data["image_count"]
    row.aspect_ratio = data["aspect_ratio"]
    row.compare_mode = data["compare_mode"]
    row.engine_params = data["engine_params"]
    row.updated_at = _now()
    await db.commit()
    await db.refresh(row)
    return case_to_dict(row)


async def run_owns_media(db: AsyncSession, name: str, username: str, admin: bool) -> bool:
    """媒体授权：文件必须被「当前用户创建或有权限访问的 case」的 run 引用。"""
    runs = (await db.execute(select(PromptEvalRun).where(
        PromptEvalRun.image_paths.is_not(None) | PromptEvalRun.video_path.is_not(None) | PromptEvalRun.video_frames.is_not(None)
    ))).scalars().all()
    owned_case_ids: set[int] = set()
    for r in runs:
        refs: list[str] = []
        if r.image_paths:
            refs.extend(json.loads(r.image_paths))
        if r.video_path:
            refs.append(r.video_path)
        if r.video_frames:
            refs.extend(json.loads(r.video_frames))
        if name in refs:
            owned_case_ids.add(r.case_id)
    if not owned_case_ids:
        return False
    cases = (await db.execute(select(PromptEvalCase).where(PromptEvalCase.id.in_(owned_case_ids)))).scalars().all()
    return any(admin or c.created_by == username for c in cases)


async def _persist_engine_error(db: AsyncSession, run_id: int, message: str) -> None:
    """把引擎变体失败标记持久化到 manual run 的 engine_meta（engine_error），刷新/详情仍可见。"""
    run = await db.get(PromptEvalRun, run_id)
    if run is None:
        return
    try:
        meta = json.loads(run.engine_meta) if run.engine_meta else {}
    except (ValueError, TypeError):
        meta = {}
    meta["engine_error"] = message
    run.engine_meta = json.dumps(meta, ensure_ascii=False)
    await db.commit()


def _case_engine_params(row: PromptEvalCase) -> dict:
    """case 引擎参数（dual）：creative_level/num_candidates/excluded/no_swap，非法/缺失回退默认。"""
    defaults = {"creative_level": 8, "num_candidates": 3, "excluded_characters": [], "no_swap_pairs": []}
    if not row.engine_params:
        return defaults
    try:
        params = json.loads(row.engine_params)
    except (ValueError, TypeError):
        return defaults
    return {
        "creative_level": int(params.get("creative_level") or 8),
        "num_candidates": int(params.get("num_candidates") or 3),
        "excluded_characters": list(params.get("excluded_characters") or []),
        "no_swap_pairs": list(params.get("no_swap_pairs") or []),
    }


async def create_run(db: AsyncSession, row: PromptEvalCase, username: str,
                     engine_ctx: dict | None = None, translate_cfg: dict | None = None,
                     http=None) -> dict:
    """创建 run。

    - single（默认）：仅 manual 变体，返回 run dict（既有契约，零行为变化）。
    - dual：派生 manual+engine 两变体（pair_id 同批次配对）。engine 变体同步调用引擎
      （20s 超时 + 1 重试）并落 prompt_zh/prompt_en/engine_meta 快照；引擎失败不创建
      engine 变体、manual 正常创建，返回 engineError（OPS_PROMPT_EVAL_ENGINE_UNAVAILABLE
      或 engine_translate 阶段标记），不静默降级。
    """
    if row.media_type == "video" and row.compare_mode == "dual":
        raise ValueError("视频评测暂不支持双路对比，请使用单路模式")
    if row.compare_mode != "dual":
        run = PromptEvalRun(case_id=row.id, provider=row.provider, model=row.model, status="queued",
                            prompt_variant="manual", prompt_source_zh=row.prompt_zh, created_by=username)
        db.add(run)
        await db.commit()
        await db.refresh(run)
        return run_to_dict(run)

    pair_id = str(uuid.uuid4())
    manual = PromptEvalRun(case_id=row.id, provider=row.provider, model=row.model, status="queued",
                           prompt_variant="manual", prompt_source_zh=row.prompt_zh,
                           engine_meta=json.dumps({"pair_id": pair_id}), created_by=username)
    db.add(manual)
    await db.commit()
    await db.refresh(manual)
    result: dict = {"pair_id": pair_id, "manual": run_to_dict(manual), "engine": None}
    try:
        params = _case_engine_params(row)
        base_url = (engine_ctx or {}).get("base_url") or engine_client.engine_base_url()
        meta = await engine_client.optimize(
            base_url, row.source_text, row.context,
            creative_level=params["creative_level"], num_candidates=params["num_candidates"],
            max_length=500,
            excluded_characters=params["excluded_characters"],
            no_swap_pairs=params["no_swap_pairs"],
            http=http,
        )
        engine_zh = meta["optimized_prompt"]
        prompt_en = ""
        if translate_cfg:
            prompt_en = await translation.translate_prompt_zh(translate_cfg, engine_zh, http=http)
        engine_meta = {
            "pair_id": pair_id,
            "creative_level": params["creative_level"],
            "num_candidates": params["num_candidates"],
            "max_length": 500,
            "excluded_characters": params["excluded_characters"],
            "no_swap_pairs": params["no_swap_pairs"],
            "model_used": meta.get("model_used") or "",
            "tokens_used": meta.get("tokens_used") or 0,
        }
        engine_run = PromptEvalRun(case_id=row.id, provider=row.provider, model=row.model, status="queued",
                                   prompt_variant="engine", prompt_source_zh=row.prompt_zh,
                                   prompt_zh=engine_zh, prompt_en=prompt_en,
                                   engine_meta=json.dumps(engine_meta, ensure_ascii=False),
                                   created_by=username)
        db.add(engine_run)
        await db.commit()
        await db.refresh(engine_run)
        result["engine"] = run_to_dict(engine_run)
        return result
    except engine_client.EngineUnavailableError as e:
        logger.warning("engine variant creation failed for case %s: %s", row.id, e)
        result["engineError"] = f"{engine_client.ENGINE_UNAVAILABLE}: {e}"
        await _persist_engine_error(db, manual.id, result["engineError"])
        return result
    except Exception as e:
        logger.warning("engine variant creation failed (translate) for case %s: %s", row.id, e)
        result["engineError"] = f"engine_translate: {e}"
        await _persist_engine_error(db, manual.id, result["engineError"])
        return result


def variant_snapshot(run: PromptEvalRun, case: PromptEvalCase) -> dict:
    """run 级流水线快照：engine 变体用 run 自身 prompt_zh/prompt_en 快照；manual 优先 run 落库快照
    （prompt_source_zh，case 后续被编辑也不影响历史对比），缺失再回退 case 字段。"""
    if run.prompt_variant == "engine" and run.prompt_zh:
        return {
            "source_text": case.source_text,
            "context": case.context,
            "prompt_zh": run.prompt_zh,
            "prompt_en": run.prompt_en,
            "media_type": case.media_type or "image",
            "image_count": case.image_count,
            "aspect_ratio": case.aspect_ratio,
        }
    return {
        "source_text": case.source_text,
        "context": case.context,
        "prompt_zh": run.prompt_source_zh or case.prompt_zh,
        "prompt_en": run.prompt_en or case.prompt_en,
        "media_type": case.media_type or "image",
        "image_count": case.image_count,
        "aspect_ratio": case.aspect_ratio,
    }


def media_dir() -> pathlib.Path:
    return pathlib.Path(os.environ.get("OPS_PROMPT_EVAL_MEDIA_DIR") or os.path.join(os.environ.get("OPS_CONFIG_OUTPUT_DIR", "/tmp"), "prompt-eval-media"))


async def run_pipeline(db: AsyncSession, run_id: int, case: PromptEvalCase, gen_cfg: dict, eval_cfg: dict, http=None) -> dict:
    """生成 → 评估 异步流水线（失败不静默降级）。case 为快照 dict。"""
    run = await get_run(db, run_id)
    if run is None:
        return {}
    run.status = "processing"
    await db.commit()
    # 统一快照访问（ORM 行 → dict）：生成/评估阶段只使用 case[...] 契约
    if not isinstance(case, dict):
        case = {
            "source_text": case.source_text, "context": case.context,
            "prompt_zh": case.prompt_zh, "prompt_en": case.prompt_en,
            "media_type": case.media_type or "image",
            "image_count": case.image_count, "aspect_ratio": case.aspect_ratio,
        }
    media_type = case.get("media_type", "image")
    try:
        out_dir = media_dir()
        out_dir.mkdir(parents=True, exist_ok=True)
        if media_type == "video":
            result = await video_service.generate_video(gen_cfg, case["prompt_zh"], str(out_dir), run.id, http=http)
            run.video_path = result["video"]
            run.video_frames = json.dumps(result["frames"], ensure_ascii=False)
        else:
            images = await generation.generate_images(
                gen_cfg, case["prompt_zh"], case["image_count"], case["aspect_ratio"], str(out_dir), run.id, http=http,
            )
            run.image_paths = json.dumps(images, ensure_ascii=False)
        run.status = "succeeded"
        run.eval_status = "evaluating"
        await db.commit()
    except Exception as e:
        run.status = "failed"
        run.error = f"generation: {e}"
        run.completed_at = _now()
        await db.commit()
        return run_to_dict(run)

    # 评估阶段（视频用首/中/尾 3 帧作为图片输入）
    try:
        prompt = evaluation.build_eval_prompt(case["source_text"], case["context"], case["prompt_zh"], case["prompt_en"], case["image_count"], media_type=media_type)
        eval_items: list[str] = images if media_type != "video" else list(json.loads(run.video_frames or "[]"))
        if media_type == "video" and len(eval_items) != contract.VIDEO_FRAME_COUNT:
            raise evaluation.EvaluationError(f"视频帧数异常: {len(eval_items)}")
        image_data: list[bytes] = []
        for item in eval_items:
            image_data.append((out_dir / item).read_bytes())
            if len(image_data[-1]) > 8 * 1024 * 1024:
                raise evaluation.EvaluationError("评估图片超过 8MB 上限")
        raw = await evaluation.evaluate_images(eval_cfg, prompt, image_data, http=http)
        parsed = evaluation.parse_and_validate(raw, case["image_count"], media_type=media_type)
        run.overall_score = float(parsed["overall"])
        run.grade = contract.grade_for_score(run.overall_score)
        run.dimensions = json.dumps(parsed["dimensions"], ensure_ascii=False)
        run.problems = json.dumps(parsed["problems"], ensure_ascii=False)
        run.optimization_points = json.dumps(parsed["promptOptimizationPoints"], ensure_ascii=False)
        run.eval_status = "succeeded"
    except Exception as e:
        run.eval_status = "failed"
        run.error = f"evaluation: {e}"
    run.completed_at = _now()
    await db.commit()
    return run_to_dict(run)


def start_run_pipeline(db_factory, run_id: int, case: PromptEvalCase | dict, gen_cfg: dict, eval_cfg: dict) -> asyncio.Task:
    """后台任务：只传 case_id + 必要字段快照，worker 内重新查库，避免 ORM detached。

    case 接受 ORM 行或 dict 快照（dual 变体由 variant_snapshot 生成 dict）。"""
    if isinstance(case, dict):
        snapshot = {k: case.get(k) for k in ("source_text", "context", "prompt_zh", "prompt_en", "media_type", "image_count", "aspect_ratio")}
    else:
        snapshot = {
            "source_text": case.source_text, "context": case.context,
            "prompt_zh": case.prompt_zh, "prompt_en": case.prompt_en,
            "media_type": case.media_type or "image",
            "image_count": case.image_count, "aspect_ratio": case.aspect_ratio,
        }
    import logging
    logger = logging.getLogger("ops-center.prompt-eval")

    async def _worker():
        try:
            async with db_factory() as db:
                await run_pipeline(db, run_id, snapshot, gen_cfg, eval_cfg)
        except Exception as e:
            logger.exception("prompt_eval run %s worker failed", run_id)
            try:
                async with db_factory() as db:
                    run = await get_run(db, run_id)
                    if run and run.status not in ("succeeded", "failed"):
                        run.status = "failed"
                        run.error = f"worker: {e}"
                        run.completed_at = _now()
                        await db.commit()
            except Exception:
                logger.exception("prompt_eval run %s failure persist failed", run_id)

    task = asyncio.create_task(_worker())
    task.add_done_callback(lambda t: None if not t.exception() else logger.error("prompt_eval run %s task exception", run_id))
    return task


# ─── 聚合 ───


def _dual_comparison(rows) -> dict:
    """双路聚合对比：按 engine_meta.pair_id 配对，仅统计 manual+engine 均成功的成对 run。

    输出：pairCount/两路平均分/平均分差/提升率（分母 0 → null）/四维均值差/等级分布差。
    无成对数据 → 空对象（不影响既有聚合输出）。
    """
    pairs: dict[str, dict[str, PromptEvalRun]] = {}
    for r in rows:
        meta = json.loads(r.engine_meta) if r.engine_meta else {}
        pair_id = meta.get("pair_id")
        if not pair_id:
            continue
        pairs.setdefault(pair_id, {})[r.prompt_variant or "manual"] = r
    completed = [p for p in pairs.values() if p.get("manual") and p.get("engine")]
    if not completed:
        return {}
    manual_scores = [p["manual"].overall_score for p in completed]
    engine_scores = [p["engine"].overall_score for p in completed]
    avg_m = sum(manual_scores) / len(manual_scores)
    avg_e = sum(engine_scores) / len(engine_scores)
    improvement = round((avg_e - avg_m) / avg_m * 100, 1) if avg_m else None
    dim_m: dict[str, list[float]] = {}
    dim_e: dict[str, list[float]] = {}
    for p in completed:
        for d in (json.loads(p["manual"].dimensions) if p["manual"].dimensions else []):
            dim_m.setdefault(d["id"], []).append(float(d["score"]))
        for d in (json.loads(p["engine"].dimensions) if p["engine"].dimensions else []):
            dim_e.setdefault(d["id"], []).append(float(d["score"]))
    dimension_diffs = []
    for k in sorted(set(dim_m) | set(dim_e)):
        a = (sum(dim_m[k]) / len(dim_m[k])) if dim_m.get(k) else 0.0
        b = (sum(dim_e[k]) / len(dim_e[k])) if dim_e.get(k) else 0.0
        dimension_diffs.append({"id": k, "manualAverage": round(a, 1), "engineAverage": round(b, 1), "diff": round(b - a, 1)})
    grade_m: dict[str, int] = {}
    grade_e: dict[str, int] = {}
    for p in completed:
        grade_m[p["manual"].grade or "unknown"] = grade_m.get(p["manual"].grade or "unknown", 0) + 1
        grade_e[p["engine"].grade or "unknown"] = grade_e.get(p["engine"].grade or "unknown", 0) + 1
    grade_diff = {
        g: {"manual": grade_m.get(g, 0), "engine": grade_e.get(g, 0), "diff": grade_e.get(g, 0) - grade_m.get(g, 0)}
        for g in sorted(set(grade_m) | set(grade_e))
    }
    return {
        "pairCount": len(completed),
        "manualAverage": round(avg_m, 1),
        "engineAverage": round(avg_e, 1),
        "averageDiff": round(avg_e - avg_m, 1),
        "improvementRate": improvement,
        "dimensionDiffs": dimension_diffs,
        "gradeDistributionDiff": grade_diff,
    }


async def summary(db: AsyncSession) -> dict:
    rows = (await db.execute(
        select(PromptEvalRun).where(PromptEvalRun.eval_status == "succeeded", PromptEvalRun.overall_score.is_not(None))
    )).scalars().all()
    if not rows:
        return {"recordCount": 0, "averageOverall": 0, "gradeDistribution": {}, "dimensionAverages": [],
                "problemCategories": [], "optimizationPoints": [], "providerComparison": [], "dual": {}}
    n = len(rows)
    overall_sum = 0
    grade_dist: dict[str, int] = {}
    dim_map: dict[str, list[float]] = {}
    problem_map: dict[str, int] = {}
    point_map: dict[str, int] = {}
    provider_map: dict[str, list[float]] = {}
    for r in rows:
        overall_sum += r.overall_score
        grade_dist[r.grade or "unknown"] = grade_dist.get(r.grade or "unknown", 0) + 1
        dims = json.loads(r.dimensions) if r.dimensions else []
        for d in dims:
            dim_map.setdefault(d["id"], []).append(float(d["score"]))
        probs = json.loads(r.problems) if r.problems else []
        for p in probs:
            problem_map[p.get("category", "unknown")] = problem_map.get(p.get("category", "unknown"), 0) + 1
        points = json.loads(r.optimization_points) if r.optimization_points else []
        for p in points:
            point_map[p.get("type", "unknown")] = point_map.get(p.get("type", "unknown"), 0) + 1
        key = f"{r.provider}/{r.model}"
        provider_map.setdefault(key, []).append(float(r.overall_score))
    dimension_averages = [
        {"id": k, "average": round(sum(v) / len(v), 1)} for k, v in sorted(dim_map.items(), key=lambda kv: -sum(kv[1]) / len(kv[1]))
    ]
    problem_categories = [{"category": k, "count": v} for k, v in sorted(problem_map.items(), key=lambda kv: -kv[1])]
    optimization_points = [{"type": k, "count": v} for k, v in sorted(point_map.items(), key=lambda kv: -kv[1])]
    provider_comparison = [
        {"provider": k, "average": round(sum(v) / len(v), 1), "count": len(v)}
        for k, v in sorted(provider_map.items(), key=lambda kv: -sum(kv[1]) / len(kv[1]))
    ]
    return {
        "recordCount": n,
        "averageOverall": round(overall_sum / n, 1),
        "gradeDistribution": grade_dist,
        "dimensionAverages": dimension_averages,
        "problemCategories": problem_categories,
        "optimizationPoints": optimization_points,
        "providerComparison": provider_comparison,
        "dual": _dual_comparison(rows),
    }


# ─── 场景层（scene 模式） ───

from models import PromptEvalScene  # noqa: E402
from services import prompt_eval_segmentation as segmentation  # noqa: E402
from services import prompt_eval_scene_context as scene_context_service  # noqa: E402


def scene_to_dict(row: PromptEvalScene) -> dict:
    return {
        "id": row.id, "case_id": row.case_id, "index": row.index, "scene_text": row.scene_text,
        "subtitle_blocks": json.loads(row.subtitle_blocks) if row.subtitle_blocks else [],
        "scene_context": json.loads(row.scene_context) if row.scene_context else {},
        "prompt_zh": row.prompt_zh, "prompt_en": row.prompt_en,
        "prompt_en_source": row.prompt_en_source, "prompt_en_translated_at": row.prompt_en_translated_at,
        "created_at": row.created_at, "updated_at": row.updated_at,
    }


async def create_case_scene(db: AsyncSession, body: dict, username: str) -> dict:
    """scene 模式：整篇文案 + 分句配置 → 分句并创建 case + scenes。"""
    data = validate_case_body(body, require_prompt_zh=False)
    if data["compare_mode"] == "dual":
        raise ValueError("场景模式暂不支持双路对比（compare_mode=dual），请使用单条模式（整 case 手动）")
    scene_cfg = segmentation.normalize_scene_config(body)
    text = data["source_text"]
    scenes = segmentation.split_to_scenes(text, scene_cfg["target_chars_per_scene"])
    if not scenes:
        raise ValueError("分句结果为空，请检查文案内容")
    if len(scenes) > 100:
        raise ValueError(f"场景数超过上限 100（当前 {len(scenes)}），请调整分句配置")
    case = PromptEvalCase(source_mode="scene", title=data["title"], source_text=text,
                          context=data["context"], prompt_zh=data["prompt_zh"], provider=data["provider"],
                          model=data["model"], image_count=data["image_count"],
                          aspect_ratio=data["aspect_ratio"], created_by=username)
    db.add(case)
    await db.flush()
    for idx, scene_text in enumerate(scenes):
        est_duration = round(max(6.0, (len(scene_text) / scene_cfg["target_chars_per_scene"]) * 6.0), 2)
        subtitles = segmentation.segment_subtitles(
            scene_text, est_duration, scene_cfg["subtitle_min_chars"], scene_cfg["subtitle_max_chars"],
            config={"timeCalculationMethod": scene_cfg["subtitle_timing"]})
        ctx = scene_context_service.extract_scene_context(text, scene_text)
        row = PromptEvalScene(case_id=case.id, index=idx, scene_text=scene_text,
                              subtitle_blocks=json.dumps(subtitles, ensure_ascii=False),
                              scene_context=json.dumps(ctx, ensure_ascii=False))
        db.add(row)
    await db.commit()
    await db.refresh(case)
    return {"case": case_to_dict(case), "scenes": await list_scenes(db, case.id)}


async def list_scenes(db: AsyncSession, case_id: int) -> list[dict]:
    rows = (await db.execute(select(PromptEvalScene).where(PromptEvalScene.case_id == case_id).order_by(PromptEvalScene.index))).scalars().all()
    return [scene_to_dict(r) for r in rows]


async def get_scene(db: AsyncSession, scene_id: int) -> PromptEvalScene | None:
    return (await db.execute(select(PromptEvalScene).where(PromptEvalScene.id == scene_id))).scalar_one_or_none()


async def translate_scene(db: AsyncSession, scene: PromptEvalScene, case: PromptEvalCase,
                          translate_cfg: dict, http=None) -> dict:
    """按场景生成中英对照：LLM 优化 prompt_zh + 翻译 prompt_en（machine_translation，幂等 7 天）。"""
    cached = scene.prompt_en and scene.prompt_en_source == "machine_translation" and scene.prompt_en_translated_at
    if cached:
        try:
            ts = datetime.datetime.fromisoformat(scene.prompt_en_translated_at).timestamp()
            if _now_ts() - ts < contract.TRANSLATION_CACHE_SECONDS and scene.prompt_en_cache_zh == scene.prompt_zh:
                return scene_to_dict(scene)
        except ValueError:
            pass
    prompt_zh = await translation.optimize_scene_prompt(
        translate_cfg, case.source_text, scene.scene_text,
        json.dumps(json.loads(scene.scene_context) if scene.scene_context else {}, ensure_ascii=False),
        http=http)
    prompt_en = await translation.translate_prompt_zh(translate_cfg, prompt_zh, http=http)
    if not prompt_zh.strip() or not prompt_en.strip():
        raise ValueError("优化/翻译结果为空")
    scene.prompt_zh = prompt_zh
    scene.prompt_en = prompt_en
    scene.prompt_en_source = "machine_translation"
    scene.prompt_en_translated_at = _now()
    scene.prompt_en_cache_zh = prompt_zh
    scene.updated_at = _now()
    await db.commit()
    await db.refresh(scene)
    return scene_to_dict(scene)


async def create_scene_run(db: AsyncSession, scene: PromptEvalScene, case: PromptEvalCase, username: str) -> dict:
    run = PromptEvalRun(case_id=case.id, scene_id=scene.id, provider=case.provider, model=case.model,
                        status="queued", created_by=username)
    db.add(run)
    await db.commit()
    await db.refresh(run)
    return run_to_dict(run)


def scene_snapshot(scene: PromptEvalScene, case: PromptEvalCase) -> dict:
    return {
        "source_text": scene.scene_text,
        "context": scene.scene_context or "{}",
        "prompt_zh": scene.prompt_zh or case.prompt_zh,
        "prompt_en": scene.prompt_en,
        "image_count": case.image_count,
        "aspect_ratio": case.aspect_ratio,
        "media_type": case.media_type or "image",
    }


def start_scene_run_pipeline(db_factory, run_id: int, scene_snapshot_data: dict, gen_cfg: dict, eval_cfg: dict) -> asyncio.Task:
    """场景 run：worker 重查库后执行生成→评估（快照不含图片，场景变化不影响已提交 run）。"""
    import logging
    logger = logging.getLogger("ops-center.prompt-eval")

    async def _worker():
        try:
            async with db_factory() as db:
                await run_pipeline(db, run_id, scene_snapshot_data, gen_cfg, eval_cfg)
        except Exception as e:
            logger.exception("prompt_eval scene run %s worker failed", run_id)
            try:
                async with db_factory() as db:
                    run = await get_run(db, run_id)
                    if run and run.status not in ("succeeded", "failed"):
                        run.status = "failed"
                        run.error = f"worker: {e}"
                        run.completed_at = _now()
                        await db.commit()
            except Exception:
                logger.exception("prompt_eval scene run %s failure persist failed", run_id)

    task = asyncio.create_task(_worker())
    task.add_done_callback(lambda t: None if not t.exception() else logger.error("prompt_eval scene run %s task exception", run_id))
    return task

