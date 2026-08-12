"""PromptEval 评测服务 — case/run CRUD、翻译、异步生成→评估流水线、聚合。"""
from __future__ import annotations

import asyncio
import base64
import datetime
import hashlib
import json
import os
import pathlib

from cryptography.fernet import Fernet
from sqlalchemy import select, desc, func
from sqlalchemy.ext.asyncio import AsyncSession

from models import PromptEvalCase, PromptEvalRun, PromptEvalProviderKey
from services import prompt_eval_contract as contract
from services import prompt_eval_generation_service as generation
from services import prompt_eval_translation_service as translation
from services import prompt_eval_evaluation_service as evaluation


def _now() -> str:
    return datetime.datetime.utcnow().isoformat()


def _now_ts() -> float:
    return datetime.datetime.utcnow().timestamp()


def _fernet(secret: str) -> Fernet:
    key = base64.urlsafe_b64encode(hashlib.sha256(secret.encode("utf-8")).digest())
    return Fernet(key)


def encrypt_key(secret: str, value: str) -> str:
    return _fernet(secret).encrypt(value.encode("utf-8")).decode("ascii")


def decrypt_key(secret: str, value: str) -> str:
    return _fernet(secret).decrypt(value.encode("ascii")).decode("utf-8")


# ─── 校验 ───

def validate_case_body(body: dict) -> dict:
    source_text = str(body.get("source_text") or "").strip()
    if not source_text:
        raise ValueError("source_text 不能为空")
    if len(source_text) > contract.MAX_SOURCE_TEXT:
        raise ValueError(f"source_text 不能超过 {contract.MAX_SOURCE_TEXT} 字符")
    prompt_zh = str(body.get("prompt_zh") or "").strip()
    if not prompt_zh:
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
    return {
        "title": str(body.get("title") or "").strip()[:200],
        "source_text": source_text,
        "context": context or None,
        "prompt_zh": prompt_zh,
        "provider": provider,
        "model": model,
        "image_count": image_count,
        "aspect_ratio": aspect_ratio,
    }


def validate_provider_key_body(body: dict) -> dict:
    provider = str(body.get("provider") or "").strip()
    model = str(body.get("model") or "").strip()
    api_key = str(body.get("api_key") or "").strip()
    if not provider or not model or not api_key:
        raise ValueError("provider/model/api_key 均不能为空")
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
        "id": row.id, "title": row.title, "source_text": row.source_text,
        "context": row.context, "prompt_zh": row.prompt_zh, "prompt_en": row.prompt_en,
        "prompt_en_source": row.prompt_en_source, "prompt_en_translated_at": row.prompt_en_translated_at,
        "provider": row.provider, "model": row.model,
        "image_count": row.image_count, "aspect_ratio": row.aspect_ratio,
        "created_by": row.created_by, "created_at": row.created_at, "updated_at": row.updated_at,
    }


async def get_case(db: AsyncSession, case_id: int) -> PromptEvalCase | None:
    return (await db.execute(
        select(PromptEvalCase).where(PromptEvalCase.id == case_id, PromptEvalCase.deleted_at.is_(None))
    )).scalar_one_or_none()


async def list_cases(db: AsyncSession, username: str, admin: bool, limit: int = 50) -> list[dict]:
    stmt = select(PromptEvalCase).where(PromptEvalCase.deleted_at.is_(None)).order_by(desc(PromptEvalCase.id)).limit(min(limit, 200))
    if not admin:
        stmt = stmt.where(PromptEvalCase.created_by == username)
    rows = (await db.execute(stmt)).scalars().all()
    return [case_to_dict(r) for r in rows]


async def soft_delete_case(db: AsyncSession, row: PromptEvalCase) -> None:
    row.deleted_at = _now()
    await db.commit()


def run_to_dict(row: PromptEvalRun) -> dict:
    return {
        "id": row.id, "case_id": row.case_id, "provider": row.provider, "model": row.model,
        "status": row.status, "eval_status": row.eval_status,
        "image_paths": json.loads(row.image_paths) if row.image_paths else [],
        "video_path": row.video_path,
        "overall_score": row.overall_score, "grade": row.grade,
        "dimensions": json.loads(row.dimensions) if row.dimensions else None,
        "problems": json.loads(row.problems) if row.problems else None,
        "optimization_points": json.loads(row.optimization_points) if row.optimization_points else None,
        "error": row.error, "created_by": row.created_by,
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
    data = validate_provider_key_body(body)
    row = (await db.execute(select(PromptEvalProviderKey).where(
        PromptEvalProviderKey.provider == data["provider"], PromptEvalProviderKey.model == data["model"]
    ))).scalar_one_or_none()
    if row:
        row.key_enc = encrypt_key(secret, data["api_key"])
        row.base_url = data["base_url"]
        row.enabled = data["enabled"]
        row.updated_at = _now()
        row.updated_by = username
    else:
        row = PromptEvalProviderKey(provider=data["provider"], model=data["model"],
                                    key_enc=encrypt_key(secret, data["api_key"]),
                                    base_url=data["base_url"], enabled=data["enabled"], updated_by=username)
        db.add(row)
    await db.commit()
    await db.refresh(row)
    return {"provider": row.provider, "model": row.model, "base_url": row.base_url, "enabled": row.enabled}


async def list_provider_keys(db: AsyncSession) -> list[dict]:
    rows = (await db.execute(select(PromptEvalProviderKey).order_by(PromptEvalProviderKey.provider, PromptEvalProviderKey.model))).scalars().all()
    return [{"provider": r.provider, "model": r.model, "base_url": r.base_url, "enabled": r.enabled, "updated_at": r.updated_at} for r in rows]


# ─── 翻译 ───

async def translate_case(db: AsyncSession, row: PromptEvalCase, translate_cfg: dict, http=None) -> dict:
    """LLM 翻译 prompt_zh→prompt_en；幂等缓存（同 prompt_zh 且 7 天内不重复）。"""
    cached = row.prompt_en and row.prompt_en_source == "machine_translation" and row.prompt_en_translated_at
    if cached:
        try:
            ts = datetime.datetime.fromisoformat(row.prompt_en_translated_at).timestamp()
            if _now_ts() - ts < contract.TRANSLATION_CACHE_SECONDS:
                return case_to_dict(row)
        except ValueError:
            pass
    prompt_en = await translation.translate_prompt_zh(translate_cfg, row.prompt_zh, http=http)
    if not prompt_en.strip():
        raise ValueError("翻译结果为空")
    row.prompt_en = prompt_en
    row.prompt_en_source = "machine_translation"
    row.prompt_en_translated_at = _now()
    row.updated_at = _now()
    await db.commit()
    await db.refresh(row)
    return case_to_dict(row)


# ─── run 流水线 ───

async def create_run(db: AsyncSession, row: PromptEvalCase, username: str) -> dict:
    run = PromptEvalRun(case_id=row.id, provider=row.provider, model=row.model, status="queued", created_by=username)
    db.add(run)
    await db.commit()
    await db.refresh(run)
    return run_to_dict(run)


def media_dir() -> pathlib.Path:
    return pathlib.Path(os.environ.get("OPS_PROMPT_EVAL_MEDIA_DIR") or os.path.join(os.environ.get("OPS_CONFIG_OUTPUT_DIR", "/tmp"), "prompt-eval-media"))


async def run_pipeline(db: AsyncSession, run_id: int, case: PromptEvalCase, gen_cfg: dict, eval_cfg: dict, http=None) -> dict:
    """生成 → 评估 异步流水线（失败不静默降级）。"""
    run = await get_run(db, run_id)
    if run is None:
        return {}
    run.status = "processing"
    await db.commit()
    try:
        out_dir = media_dir()
        out_dir.mkdir(parents=True, exist_ok=True)
        images = await generation.generate_images(
            gen_cfg, case.prompt_zh, case.image_count, case.aspect_ratio, str(out_dir), run.id, http=http,
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

    # 评估阶段
    try:
        prompt = evaluation.build_eval_prompt(case.source_text, case.context, case.prompt_zh, case.prompt_en, case.image_count)
        image_data: list[bytes] = []
        for item in images:
            if item.startswith("url:"):
                raise evaluation.EvaluationError("暂不支持评估远程 URL 图片")
            image_data.append((out_dir / item).read_bytes())
        raw = await evaluation.evaluate_images(eval_cfg, prompt, image_data, http=http)
        parsed = evaluation.parse_and_validate(raw, case.image_count)
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


def start_run_pipeline(db_factory, run_id: int, case: PromptEvalCase, gen_cfg: dict, eval_cfg: dict) -> asyncio.Task:
    async def _worker():
        async with db_factory() as db:
            await run_pipeline(db, run_id, case, gen_cfg, eval_cfg)

    return asyncio.create_task(_worker())


# ─── 聚合 ───

async def summary(db: AsyncSession) -> dict:
    rows = (await db.execute(
        select(PromptEvalRun).where(PromptEvalRun.eval_status == "succeeded", PromptEvalRun.overall_score.is_not(None))
    )).scalars().all()
    if not rows:
        return {"recordCount": 0, "averageOverall": 0, "gradeDistribution": {}, "dimensionAverages": [],
                "problemCategories": [], "optimizationPoints": [], "providerComparison": []}
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
    }
