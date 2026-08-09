"""Model preset catalog service — ops-center 预设模型/多模态能力管理。

运营人员在运营后台维护模型预设目录：
  - 控制哪些模型在前端【模型设置】中显示（is_visible）
  - 每个模型可维护最多 10 条技术文档网页链接
  - 多模态模型可手工配置支持的能力、每能力默认模型与每能力文档链接（最多 10 条）
"""
import datetime
import json

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import ModelPreset

MODEL_CATEGORIES = ["llm", "tts", "speech_recognition", "image", "video", "audio", "multimodal"]

MAX_DOC_LINKS = 10

# 种子目录（与 Multi-Publish model-provider-seeds 的预设目录对齐）
PRESET_CATALOG = [
    # ─── 多模态 ─────────────────────────────
    {
        "id": "minimax-multimodal", "name": "MiniMax", "category": "multimodal",
        "base_url": "https://api.minimaxi.com/v1",
        "models": ["speech-2.8-turbo", "image-01", "MiniMax-Hailuo-2.3", "MiniMax-M2.7"], "default_model": "MiniMax-M2.7",
        "is_multimodal": 1,
        "capabilities": ["llm", "tts", "image", "video"],
        "capability_models": {
            "llm": "MiniMax-M2.7", "tts": "speech-2.8-turbo",
            "image": "image-01", "video": "MiniMax-Hailuo-2.3",
        },
        "doc_links": ["https://platform.minimaxi.com/docs/guides/text-generation",
                      "https://platform.minimaxi.com/docs/guides/speech-t2a-async",
                      "https://platform.minimaxi.com/docs/guides/speech-voice-clone",
                      "https://platform.minimaxi.com/docs/guides/image-generation",
                      "https://platform.minimaxi.com/docs/guides/video-generation"],
        "capability_doc_links": {
            "llm": ["https://platform.minimaxi.com/docs/guides/text-generation"],
            "tts": ["https://platform.minimaxi.com/docs/guides/speech-t2a-async",
                    "https://platform.minimaxi.com/docs/guides/speech-voice-clone"],
            "image": ["https://platform.minimaxi.com/docs/guides/image-generation"],
            "video": ["https://platform.minimaxi.com/docs/guides/video-generation"],
        },
    },
    # ─── LLM 推理 ────────────────────────────
    {"id": "openai", "name": "OpenAI", "category": "llm", "base_url": "https://api.openai.com/v1",
     "models": ["gpt-4o", "gpt-4o-mini"], "default_model": "gpt-4o", "doc_links": ["https://platform.openai.com/docs/guides/text-generation"]},
    {"id": "anthropic", "name": "Anthropic", "category": "llm", "base_url": "https://api.anthropic.com/v1",
     "models": ["claude-3-5-sonnet-latest"], "default_model": "claude-3-5-sonnet-latest", "doc_links": ["https://docs.anthropic.com/"]},
    {"id": "deepseek", "name": "DeepSeek", "category": "llm", "base_url": "https://api.deepseek.com/v1",
     "models": ["deepseek-chat", "deepseek-reasoner"], "default_model": "deepseek-chat", "doc_links": ["https://api-docs.deepseek.com/"]},
    {"id": "doubao-llm", "name": "豆包大模型", "category": "llm", "base_url": "https://ark.cn-beijing.volces.com/api/v3",
     "models": ["doubao-pro-32k"], "default_model": "doubao-pro-32k", "doc_links": ["https://www.volcengine.com/docs/82379"]},
    {"id": "gemini", "name": "Gemini", "category": "llm", "base_url": "https://generativelanguage.googleapis.com/v1beta",
     "models": ["gemini-2.0-flash"], "default_model": "gemini-2.0-flash", "doc_links": ["https://ai.google.dev/gemini-api/docs"]},
    {"id": "ollama", "name": "Ollama", "category": "llm", "base_url": "http://localhost:11434/v1",
     "models": ["llama3.1"], "default_model": "llama3.1", "doc_links": ["https://docs.ollama.com/"]},
    # ─── TTS 语音 ────────────────────────────
    {"id": "minimax-tts", "name": "MiniMax TTS", "category": "tts", "base_url": "https://api.minimaxi.com/v1",
     "models": ["speech-2.8-turbo"], "default_model": "speech-2.8-turbo", "doc_links": ["https://platform.minimaxi.com/docs/guides/speech-t2a-async",
                                                    "https://platform.minimaxi.com/docs/guides/speech-voice-clone",
                                                    "https://platform.minimaxi.com/faq/system-voice-id"]},
    {"id": "doubao-tts", "name": "豆包 TTS", "category": "tts", "base_url": "https://openspeech.bytedance.com/api/v1",
     "models": ["doubao-tts"], "default_model": "doubao-tts", "doc_links": ["https://www.volcengine.com/docs/6561"]},
    {"id": "elevenlabs", "name": "ElevenLabs", "category": "tts", "base_url": "https://api.elevenlabs.io/v1",
     "models": ["eleven_multilingual_v2"], "default_model": "eleven_multilingual_v2", "doc_links": ["https://elevenlabs.io/docs/api-reference"]},
    {"id": "openai-tts", "name": "OpenAI TTS", "category": "tts", "base_url": "https://api.openai.com/v1",
     "models": ["tts-1", "tts-1-hd"], "default_model": "tts-1", "doc_links": ["https://platform.openai.com/docs/guides/text-to-speech"]},
    # ─── 语音识别 ────────────────────────────
    {"id": "whisper", "name": "OpenAI Whisper", "category": "speech_recognition", "base_url": "https://api.openai.com/v1",
     "models": ["whisper-1"], "default_model": "whisper-1", "doc_links": ["https://platform.openai.com/docs/guides/speech-to-text"]},
    {"id": "local-whisper", "name": "本地 Whisper", "category": "speech_recognition", "base_url": "http://localhost:8000",
     "models": ["local-whisper"], "default_model": "local-whisper", "doc_links": []},
    # ─── 图片生成 ────────────────────────────
    {"id": "flux", "name": "FLUX", "category": "image", "base_url": "https://api.bfl.ml/v1",
     "models": ["flux-pro"], "default_model": "flux-pro", "doc_links": ["https://docs.bfl.ai/"]},
    {"id": "minimax-image", "name": "MiniMax Image", "category": "image", "base_url": "https://api.minimaxi.com/v1",
     "models": ["image-01"], "default_model": "image-01", "doc_links": ["https://platform.minimaxi.com/docs/guides/image-generation"]},
    {"id": "dall-e", "name": "DALL·E", "category": "image", "base_url": "https://api.openai.com/v1",
     "models": ["dall-e-3"], "default_model": "dall-e-3", "doc_links": ["https://platform.openai.com/docs/guides/images"]},
    {"id": "local-diffusion", "name": "本地 Diffusion", "category": "image", "base_url": "http://127.0.0.1:7860",
     "models": ["sd-xl"], "default_model": "sd-xl", "doc_links": []},
    # ─── 视频生成 ────────────────────────────
    {"id": "minimax", "name": "MiniMax Video", "category": "video", "base_url": "https://api.minimaxi.com/v1",
     "models": ["MiniMax-Hailuo-2.3", "T2V-01", "I2V-01"], "default_model": "MiniMax-Hailuo-2.3", "doc_links": ["https://platform.minimaxi.com/docs/guides/video-generation"]},
    {"id": "kling", "name": "可灵 Kling", "category": "video", "base_url": "https://api.klingai.com/v1",
     "models": ["kling-v1"], "default_model": "kling-v1", "doc_links": ["https://app.klingai.com/global/dev/document-api/"]},
    {"id": "runway", "name": "Runway", "category": "video", "base_url": "https://api.dev.runwayml.com/v1",
     "models": ["gen-3-alpha"], "default_model": "gen-3-alpha", "doc_links": ["https://docs.dev.runwayml.com/"]},
    # ─── 音频生成 ────────────────────────────
    {"id": "suno", "name": "Suno", "category": "audio", "base_url": "https://api.sunoa.ai",
     "models": ["music"], "default_model": "music", "doc_links": ["https://platform.suno.ai/docs/api"]},
    {"id": "musicgen", "name": "MusicGen", "category": "audio", "base_url": "",
     "models": ["musicgen"], "default_model": "musicgen", "doc_links": []},
    {"id": "music-library", "name": "本地音乐库", "category": "audio", "base_url": "",
     "models": ["local-library"], "default_model": "local-library", "doc_links": []},
]


def _validate_doc_links(links, field_name):
    """校验文档链接：最多 MAX_DOC_LINKS 条，且均为 http(s) URL。"""
    if links is None:
        return []
    if not isinstance(links, list):
        raise ValueError(f"{field_name} 必须是数组")
    if len(links) > MAX_DOC_LINKS:
        raise ValueError(f"{field_name} 最多 {MAX_DOC_LINKS} 条")
    result = []
    for link in links:
        text = str(link).strip()
        if text and not (text.startswith("http://") or text.startswith("https://")):
            raise ValueError(f"{field_name} 中的链接必须是 http(s) 地址：{text}")
        if text:
            result.append(text)
    return result


async def ensure_catalog_seeded(db: AsyncSession):
    """INSERT OR IGNORE 风格初始化：仅填充不存在的预设行。"""
    for item in PRESET_CATALOG:
        exists = (await db.execute(select(ModelPreset).where(ModelPreset.id == item["id"]))).scalar_one_or_none()
        if exists:
            continue
        row = ModelPreset(
            id=item["id"],
            name=item["name"],
            category=item["category"],
            base_url=item.get("base_url", ""),
            models=json.dumps(item.get("models", []), ensure_ascii=False),
            default_model=item.get("default_model", ""),
            is_multimodal=int(item.get("is_multimodal", 0)),
            capabilities=json.dumps(item.get("capabilities", []), ensure_ascii=False),
            capability_models=json.dumps(item.get("capability_models", {}), ensure_ascii=False),
            doc_links=json.dumps(item.get("doc_links", []), ensure_ascii=False),
            capability_doc_links=json.dumps(item.get("capability_doc_links", {}), ensure_ascii=False),
            is_visible=1,
        )
        db.add(row)
    await db.commit()


async def list_model_presets(db: AsyncSession, category: str | None = None, include_hidden: bool = False):
    stmt = select(ModelPreset).order_by(ModelPreset.is_multimodal.desc(), ModelPreset.category, ModelPreset.name)
    if category:
        stmt = stmt.where(ModelPreset.category == category)
    if not include_hidden:
        stmt = stmt.where(ModelPreset.is_visible == 1)
    rows = (await db.execute(stmt)).scalars().all()
    return [_to_dict(r) for r in rows]


async def get_model_preset(db: AsyncSession, preset_id: str):
    return (await db.execute(select(ModelPreset).where(ModelPreset.id == preset_id))).scalar_one_or_none()


async def upsert_model_preset(db: AsyncSession, data: dict, updated_by: str = "admin"):
    preset_id = str(data.get("id", "")).strip()
    name = str(data.get("name", "")).strip()
    category = str(data.get("category", "")).strip()
    if not preset_id or not name or not category:
        raise ValueError("id/name/category 为必填项")
    if category not in MODEL_CATEGORIES:
        raise ValueError(f"category 必须是 {MODEL_CATEGORIES} 之一")

    doc_links = _validate_doc_links(data.get("doc_links"), "doc_links")

    capabilities = data.get("capabilities", [])
    capability_models = data.get("capability_models", {}) or {}
    capability_doc_links = data.get("capability_doc_links", {}) or {}
    if not isinstance(capabilities, list):
        raise ValueError("capabilities 必须是数组")
    if not isinstance(capability_models, dict):
        raise ValueError("capability_models 必须是对象")
    if not isinstance(capability_doc_links, dict):
        raise ValueError("capability_doc_links 必须是对象")
    for cap in capabilities:
        if cap not in capability_models:
            raise ValueError(f"能力 {cap} 缺少默认模型（capability_models）")
    normalized_cap_docs = {}
    for cap, links in capability_doc_links.items():
        normalized_cap_docs[cap] = _validate_doc_links(links, f"capability_doc_links.{cap}")

    row = await get_model_preset(db, preset_id)
    now = datetime.datetime.utcnow().isoformat()
    if row is None:
        row = ModelPreset(id=preset_id, created_at=now)
        db.add(row)
    row.name = name
    row.category = category
    row.base_url = str(data.get("base_url", "")).strip()
    row.models = json.dumps(data.get("models", []), ensure_ascii=False)
    row.default_model = str(data.get("default_model", "")).strip()
    row.is_multimodal = 1 if data.get("is_multimodal") else 0
    row.capabilities = json.dumps(capabilities, ensure_ascii=False)
    row.capability_models = json.dumps(capability_models, ensure_ascii=False)
    row.doc_links = json.dumps(doc_links, ensure_ascii=False)
    row.capability_doc_links = json.dumps(normalized_cap_docs, ensure_ascii=False)
    row.is_visible = 0 if data.get("is_visible") is False else 1
    row.updated_at = now
    await db.commit()
    await db.refresh(row)
    return _to_dict(row)


async def delete_model_preset(db: AsyncSession, preset_id: str):
    row = await get_model_preset(db, preset_id)
    if row is None:
        return False
    await db.delete(row)
    await db.commit()
    return True


def _to_dict(row: ModelPreset) -> dict:
    return {
        "id": row.id,
        "name": row.name,
        "category": row.category,
        "base_url": row.base_url or "",
        "models": json.loads(row.models or "[]"),
        "default_model": row.default_model or "",
        "is_multimodal": bool(row.is_multimodal),
        "capabilities": json.loads(row.capabilities or "[]"),
        "capability_models": json.loads(row.capability_models or "{}"),
        "doc_links": json.loads(row.doc_links or "[]"),
        "capability_doc_links": json.loads(row.capability_doc_links or "{}"),
        "is_visible": bool(row.is_visible),
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }
