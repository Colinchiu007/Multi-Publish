"""Pipeline dependency service — 流水线所需依赖目录管理（CRUD/校验/种子/软删）。"""
import datetime
import json
import re

import sqlalchemy as sa
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from models import PipelineDependency

PIPELINE_ID_RE = re.compile(r"^[a-z0-9_-]{1,64}$")
MODEL_TYPES = ("llm", "tts", "speech_recognition", "image", "video", "audio", "multimodal")

# 供应商候选（对齐 model-provider-seeds.js 预设目录）
PROVIDERS = {
    "llm": ["anthropic", "openai", "gemini", "openrouter", "doubao-llm", "deepseek", "mimo-llm", "sensenova-llm", "agnes-llm", "opencode-go"],
    "image": ["flux", "dall-e", "recraft", "imagen", "grok-image", "pixabay", "pexels", "local-diffusion", "comfyui", "minimax-image", "agnes-image"],
    "video": ["hunyuan", "cogvideo", "grok-video", "heygen", "kling", "runway", "veo", "wan", "minimax", "agnes-video", "ltx", "seedance", "higgsfield"],
    "tts": ["elevenlabs", "openai-tts", "doubao-tts", "google-tts", "piper", "mimo-tts", "minimax-tts"],
    "speech_recognition": ["whisper", "google-stt", "doubao-stt", "baidu-stt", "local-whisper"],
    "audio": ["suno", "musicgen", "pixabay-music"],
    "multimodal": ["gemini", "openai", "doubao-llm"],
}
DEFAULTS = {
    "llm": "anthropic", "image": "flux", "video": "minimax",
    "tts": "minimax-tts", "speech_recognition": "whisper", "audio": "suno", "multimodal": "gemini",
}

# 种子：对齐 pipeline-engine.js 流水线定义 + 各 stages 文件代码事实
# (pipeline_id, pipeline_name, model_type, required, description)
SEED_DEFS = [
    ("story2video-compose", "Story2Video 文案转视频", "llm", 1, "文案分句/领域增强/提示词优化（prompt-engine 默认 LLM）"),
    ("story2video-compose", "Story2Video 文案转视频", "image", 1, "场景配图生成（generate_assets 阶段）"),
    ("story2video-compose", "Story2Video 文案转视频", "tts", 1, "旁白语音合成（TTS）"),
    ("story2video-compose", "Story2Video 文案转视频", "video", 0, "AI 视频场景（视频+图片轮播混合模式，可选）"),
    ("animated-explainer", "AI 生成解释视频", "llm", 1, "研究/提案/脚本生成"),
    ("animated-explainer", "AI 生成解释视频", "image", 1, "场景配图生成"),
    ("animated-explainer", "AI 生成解释视频", "tts", 1, "旁白语音合成"),
    ("talking-head", "说话头像视频", "speech_recognition", 1, "转写（transcribe）"),
    ("talking-head", "说话头像视频", "video", 1, "头像视频渲染/字幕合成"),
    ("cinematic", "电影感短片", "video", 1, "素材视频渲染"),
    ("animation", "动画视频", "video", 1, "AI 生成动画序列"),
    ("animation", "动画视频", "llm", 1, "动画脚本/分镜生成"),
    ("avatar-spokesperson", "数字人 spokesperson 视频", "video", 1, "数字人视频生成"),
    ("avatar-spokesperson", "数字人 spokesperson 视频", "tts", 1, "数字人口播语音"),
    ("character-animation", "角色动画", "video", 1, "AI 驱动角色表演"),
    ("character-animation", "角色动画", "llm", 1, "角色台词/脚本"),
    ("clip-factory", "视频切片工厂", "video", 1, "长视频切片/精彩片段提取"),
    ("documentary-montage", "纪录蒙太奇", "video", 1, "素材纪录片风格剪辑"),
    ("documentary-montage", "纪录蒙太奇", "llm", 1, "解说文案生成"),
    ("documentary-montage", "纪录蒙太奇", "tts", 1, "解说配音"),
    ("documentary-montage", "纪录蒙太奇", "image", 0, "封面/配图（可选）"),
    ("hybrid", "混合流水线", "video", 1, "AI 生成 + 实拍素材混合"),
    ("hybrid", "混合流水线", "image", 1, "AI 生成画面"),
    ("hybrid", "混合流水线", "tts", 1, "配音"),
    ("hybrid", "混合流水线", "llm", 1, "脚本/文案"),
    ("localization-dub", "本地化配音", "speech_recognition", 1, "原视频转写"),
    ("localization-dub", "本地化配音", "tts", 1, "多语言配音"),
    ("localization-dub", "本地化配音", "llm", 1, "翻译/字幕"),
    ("podcast-repurpose", "播客转视频", "speech_recognition", 1, "播客音频转写"),
    ("podcast-repurpose", "播客转视频", "image", 1, "可视化配图"),
    ("podcast-repurpose", "播客转视频", "audio", 1, "BGM/音乐生成"),
]



def _now() -> str:
    return datetime.datetime.utcnow().isoformat()


def _parse_bool(body: dict, key: str, default: int) -> int:
    v = body.get(key, default)
    if isinstance(v, bool):
        return 1 if v else 0
    if isinstance(v, int) and not isinstance(v, bool) and v in (0, 1):
        return v
    if isinstance(v, str) and v.strip().lower() in ("true", "1"):
        return 1
    if isinstance(v, str) and v.strip().lower() in ("false", "0"):
        return 0
    raise ValueError(f"{key} 必须是布尔值（true/false/1/0）")


def _load_list(v, default):
    try:
        parsed = json.loads(v) if v else []
        return parsed if isinstance(parsed, list) else default
    except (TypeError, ValueError):
        return default


def _to_dict(row: PipelineDependency) -> dict:
    return {
        "id": row.id, "pipeline_id": row.pipeline_id, "pipeline_name": row.pipeline_name or "",
        "model_type": row.model_type, "required": bool(row.required),
        "provider_candidates": _load_list(row.provider_candidates, []),
        "default_provider": row.default_provider or "",
        "description": row.description or "", "enabled": bool(row.enabled),
        "sort_order": row.sort_order or 0,
        "updated_at": row.updated_at, "updated_by": row.updated_by or "",
    }


def validate_entry(body: dict) -> dict:
    pid = str(body.get("pipeline_id") or "").strip()
    if not PIPELINE_ID_RE.match(pid):
        raise ValueError("pipeline_id 只能包含小写字母/数字/下划线/短横线（1-64 位）")
    model_type = str(body.get("model_type") or "").strip()
    if model_type not in MODEL_TYPES:
        raise ValueError(f"model_type 必须是 {'/'.join(MODEL_TYPES)} 之一")
    pipeline_name = str(body.get("pipeline_name") or "").strip()[:100]
    required = _parse_bool(body, "required", 1)
    candidates_raw = body.get("provider_candidates")
    if candidates_raw is None:
        candidates = []
    elif isinstance(candidates_raw, str):
        try:
            candidates_raw = json.loads(candidates_raw)
        except (TypeError, ValueError):
            raise ValueError("provider_candidates 必须是字符串数组")
        # JSON 字符串解析结果必须是数组（null/数字/布尔/对象 → 400，防 500/绕过）
        if not isinstance(candidates_raw, list):
            raise ValueError("provider_candidates 必须是字符串数组")
        candidates = candidates_raw
    elif isinstance(candidates_raw, list):
        candidates = candidates_raw
    else:
        raise ValueError("provider_candidates 必须是字符串数组")
    if len(candidates) > 50:
        raise ValueError("provider_candidates 条目过多（≤50）")
    parsed = []
    for item in candidates:
        if not isinstance(item, str) or not item.strip():
            raise ValueError("provider_candidates 必须是非空字符串数组")
        parsed.append(item.strip()[:64])
    # 去重保序
    seen = set()
    dedup = []
    for c in parsed:
        if c not in seen:
            seen.add(c)
            dedup.append(c)
    default_provider = str(body.get("default_provider") or "").strip()[:64]
    # W2: 候选为空但给了默认值 → 400（PRD「必须在候选内或留空」）
    if default_provider and default_provider not in dedup:
        raise ValueError("default_provider 必须在 provider_candidates 中")
    description = str(body.get("description") or "").strip()[:200]
    sort_order = body.get("sort_order", 0)
    if isinstance(sort_order, bool) or not isinstance(sort_order, int):
        raise ValueError("sort_order 必须是整数")
    if sort_order < 0:
        raise ValueError("sort_order 必须为非负整数")
    enabled = _parse_bool(body, "enabled", 1)
    return {
        "pipeline_id": pid, "pipeline_name": pipeline_name, "model_type": model_type,
        "required": required, "provider_candidates": json.dumps(dedup, ensure_ascii=False),
        "default_provider": default_provider, "description": description,
        "enabled": enabled, "sort_order": sort_order,
    }


async def _get_by_key(db: AsyncSession, pid: str, model_type: str) -> PipelineDependency | None:
    return (await db.execute(sa.select(PipelineDependency).where(
        PipelineDependency.pipeline_id == pid, PipelineDependency.model_type == model_type,
    ))).scalar_one_or_none()


async def _get_by_id(db: AsyncSession, entry_id: int) -> PipelineDependency | None:
    return (await db.execute(sa.select(PipelineDependency).where(PipelineDependency.id == entry_id))).scalar_one_or_none()


async def ensure_pipeline_deps_seeded(db: AsyncSession) -> None:
    now = _now()
    for pid, pname, mtype, required, desc in SEED_DEFS:
        if await _get_by_key(db, pid, mtype) is not None:
            continue  # 已存在（含软删）→ 不覆盖运营修改
        db.add(PipelineDependency(
            pipeline_id=pid, pipeline_name=pname, model_type=mtype, required=required,
            provider_candidates=json.dumps(PROVIDERS[mtype], ensure_ascii=False),
            default_provider=DEFAULTS[mtype], description=desc,
            enabled=1, sort_order=0, updated_at=now, updated_by="seed"))
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()



async def list_dependencies(db: AsyncSession, pipeline_id: str | None = None,
                            model_type: str | None = None) -> list[dict]:
    stmt = sa.select(PipelineDependency).where(PipelineDependency.deleted_at.is_(None))
    if pipeline_id:
        stmt = stmt.where(PipelineDependency.pipeline_id == pipeline_id)
    if model_type:
        stmt = stmt.where(PipelineDependency.model_type == model_type)
    stmt = stmt.order_by(PipelineDependency.pipeline_id, PipelineDependency.model_type)
    rows = (await db.execute(stmt)).scalars().all()
    return [_to_dict(r) for r in rows]


async def create_dependency(db: AsyncSession, body: dict, updated_by: str) -> dict:
    data = validate_entry(body)
    existing = await _get_by_key(db, data["pipeline_id"], data["model_type"])
    if existing is not None and existing.deleted_at is None:
        raise ValueError(f"流水线 {data['pipeline_id']} 的 {data['model_type']} 依赖已存在")
    now = _now()
    if existing is not None:
        # 软删后重建
        for k, v in data.items():
            setattr(existing, k, v)
        existing.deleted_at = None
        existing.updated_at = now
        existing.updated_by = updated_by
        row = existing
    else:
        row = PipelineDependency(**data, updated_at=now, updated_by=updated_by)
        db.add(row)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise ValueError(f"流水线 {data['pipeline_id']} 的 {data['model_type']} 依赖已存在")
    await db.refresh(row)
    return _to_dict(row)


async def update_dependency(db: AsyncSession, entry_id: int, body: dict, updated_by: str) -> dict:
    row = await _get_by_id(db, entry_id)
    if row is None or row.deleted_at is not None:
        raise KeyError(entry_id)
    merged = _to_dict(row)
    merged.update({k: v for k, v in body.items() if v is not None and k != "id"})
    data = validate_entry(merged)
    # pipeline_id/model_type 若被修改，需检查唯一冲突
    if (data["pipeline_id"], data["model_type"]) != (row.pipeline_id, row.model_type):
        other = await _get_by_key(db, data["pipeline_id"], data["model_type"])
        if other is not None and other.id != row.id and other.deleted_at is None:
            raise ValueError(f"流水线 {data['pipeline_id']} 的 {data['model_type']} 依赖已存在")
    for k, v in data.items():
        setattr(row, k, v)
    row.updated_at = _now()
    row.updated_by = updated_by
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise ValueError(f"流水线 {data['pipeline_id']} 的 {data['model_type']} 依赖已存在")
    await db.refresh(row)
    return _to_dict(row)


async def delete_dependency(db: AsyncSession, entry_id: int, updated_by: str) -> bool:
    row = await _get_by_id(db, entry_id)
    if row is None or row.deleted_at is not None:
        return False
    row.deleted_at = _now()
    row.enabled = 0
    row.updated_at = row.deleted_at
    row.updated_by = updated_by
    await db.commit()
    return True
