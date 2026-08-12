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
        "provider": row.provider, "model": row.model,
        "image_count": row.image_count, "aspect_ratio": row.aspect_ratio,
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
    row.title = data["title"]
    row.source_text = data["source_text"]
    row.context = data["context"]
    row.prompt_zh = data["prompt_zh"]
    row.provider = data["provider"]
    row.model = data["model"]
    row.image_count = data["image_count"]
    row.aspect_ratio = data["aspect_ratio"]
    row.updated_at = _now()
    await db.commit()
    await db.refresh(row)
    return case_to_dict(row)


async def run_owns_media(db: AsyncSession, name: str, username: str, admin: bool) -> bool:
    """媒体授权：文件必须被「当前用户创建或有权限访问的 case」的 run 引用。"""
    runs = (await db.execute(select(PromptEvalRun).where(PromptEvalRun.image_paths.is_not(None)))).scalars().all()
    case_ids = {r.case_id for r in runs if r.image_paths and name in json.loads(r.image_paths)}
    if not case_ids:
        return False
    cases = (await db.execute(select(PromptEvalCase).where(PromptEvalCase.id.in_(case_ids)))).scalars().all()
    return any(admin or c.created_by == username for c in cases)


async def create_run(db: AsyncSession, row: PromptEvalCase, username: str) -> dict:
    run = PromptEvalRun(case_id=row.id, provider=row.provider, model=row.model, status="queued", created_by=username)
    db.add(run)
    await db.commit()
    await db.refresh(run)
    return run_to_dict(run)


def media_dir() -> pathlib.Path:
    return pathlib.Path(os.environ.get("OPS_PROMPT_EVAL_MEDIA_DIR") or os.path.join(os.environ.get("OPS_CONFIG_OUTPUT_DIR", "/tmp"), "prompt-eval-media"))


async def run_pipeline(db: AsyncSession, run_id: int, case: PromptEvalCase, gen_cfg: dict, eval_cfg: dict, http=None) -> dict:
    """生成 → 评估 异步流水线（失败不静默降级）。case 为快照 dict。"""
    run = await get_run(db, run_id)
    if run is None:
        return {}
    run.status = "processing"
    await db.commit()
    try:
        out_dir = media_dir()
        out_dir.mkdir(parents=True, exist_ok=True)
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

    # 评估阶段
    try:
        prompt = evaluation.build_eval_prompt(case["source_text"], case["context"], case["prompt_zh"], case["prompt_en"], case["image_count"])
        image_data: list[bytes] = []
        for item in images:
            image_data.append((out_dir / item).read_bytes())
            if len(image_data[-1]) > 8 * 1024 * 1024:
                raise evaluation.EvaluationError("评估图片超过 8MB 上限")
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
    """后台任务：只传 case_id + 必要字段快照，worker 内重新查库，避免 ORM detached。"""
    snapshot = {
        "source_text": case.source_text, "context": case.context,
        "prompt_zh": case.prompt_zh, "prompt_en": case.prompt_en,
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
    scene_cfg = segmentation.normalize_scene_config(body)
    text = data["source_text"]
    scenes = segmentation.split_to_scenes(text, scene_cfg["target_chars_per_scene"])
    if not scenes:
        raise ValueError("分句结果为空，请检查文案内容")
    if len(scenes) > 50:
        raise ValueError(f"场景数超过上限 50（当前 {len(scenes)}），请调整分句配置")
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

