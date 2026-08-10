"""Model preset catalog service — ops-center 预设模型/多模态能力管理。

运营人员在运营后台维护模型预设目录：
  - 控制哪些模型在前端【模型设置】中显示（is_visible）
  - 每个模型可维护最多 10 条技术文档网页链接
  - 多模态模型可手工配置支持的能力、每能力默认模型与每能力文档链接（最多 10 条）
  - 运营信息字段：端口URL(base_url)、获取模型ID URL(models_url)、默认模型ID(default_model)、
    接口技术文档URL(doc_links)、每分钟连接次数(rate_per_minute)、5小时限额次数(limit_per_5h)；允许为空，按类型校验。
"""
import datetime
import ipaddress
import json
import re
import socket

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import ModelPreset

MODEL_CATEGORIES = ["llm", "tts", "speech_recognition", "image", "video", "audio", "multimodal"]

MAX_DOC_LINKS = 10
MAX_URL_LENGTH = 500
MAX_MODELS = 500
MAX_RATE_PER_MINUTE = 100000
MAX_LIMIT_PER_5H = 10000000

# 多模态模型按能力展示的技术文档 URL 输入框（7 类固定能力）
MULTIMODAL_DOC_CAPABILITIES = [
    "llm",              # 文字推理接口
    "image",            # 图片生成
    "video",            # 视频生成
    "tts",              # TTS语音生成
    "voice_clone",      # TTS语音克隆
    "speech_recognition",  # 语音识别
    "vision",           # 视觉识别
]
# capability_doc_links 允许的键（含兼容旧数据的 audio）
ALLOWED_DOC_KEYS = set(MULTIMODAL_DOC_CAPABILITIES) | {"audio"}

_HTTP_URL_RE = re.compile(r"^https?://[^\s]+$", re.IGNORECASE)


def _validate_optional_url(value, field_name):
    """校验可空 URL：空返回 ''；非空必须为 http(s)，含主机名、无 userinfo、长度受限。"""
    from urllib.parse import urlparse
    if value is None:
        return ""
    text = str(value).strip()
    if not text:
        return ""
    if len(text) > MAX_URL_LENGTH:
        raise ValueError(f"{field_name} 长度不能超过 {MAX_URL_LENGTH} 字符")
    if not _HTTP_URL_RE.match(text):
        raise ValueError(f"{field_name} 必须是 http(s) 地址")
    try:
        parsed = urlparse(text)
    except ValueError:
        raise ValueError(f"{field_name} 必须是 http(s) 地址")
    if parsed.scheme not in ("http", "https") or not parsed.netloc or not parsed.hostname:
        raise ValueError(f"{field_name} 必须是 http(s) 地址（含主机名）")
    if parsed.username or parsed.password:
        raise ValueError(f"{field_name} 不允许包含用户名/密码")
    return text


def _validate_optional_positive_int(value, field_name, max_value):
    """校验可空正整数：空/None/'' 返回 None；否则必须是 [1, max_value] 的整数（拒绝 0/负数/小数/布尔/字符串数字之外类型）。"""
    if value is None or (isinstance(value, str) and not value.strip()):
        return None
    if isinstance(value, bool):
        raise ValueError(f"{field_name} 必须是大于等于 1 的整数（允许留空）")
    if isinstance(value, float):
        if not value.is_integer():
            raise ValueError(f"{field_name} 必须是整数（允许留空）")
        value = int(value)
    try:
        num = int(value)
    except (TypeError, ValueError):
        raise ValueError(f"{field_name} 必须是整数（允许留空）")
    if num < 1:
        raise ValueError(f"{field_name} 必须是大于等于 1 的整数（允许留空）")
    if num > max_value:
        raise ValueError(f"{field_name} 不能超过 {max_value}")
    return num


# 种子目录（与 Multi-Publish model-provider-seeds 的预设目录对齐）
PRESET_CATALOG = [
    # ─── 多模态 ─────────────────────────────
    {
        "id": "minimax-multimodal", "name": "MiniMax", "category": "multimodal",
        "base_url": "https://api.minimaxi.com/v1",
        "models_url": "https://api.minimaxi.com/v1/models",
        "models": ["speech-2.8-turbo", "image-01", "MiniMax-Hailuo-2.3", "MiniMax-M2.7"], "default_model": "MiniMax-M2.7",
        "rate_per_minute": 20, "limit_per_5h": 500,
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
     "models_url": "https://api.openai.com/v1/models",
     "models": ["gpt-4o", "gpt-4o-mini"], "default_model": "gpt-4o",
     "rate_per_minute": 120, "limit_per_5h": 3000,
     "doc_links": ["https://platform.openai.com/docs/guides/text-generation"]},
    {"id": "anthropic", "name": "Anthropic", "category": "llm", "base_url": "https://api.anthropic.com/v1",
     "models": ["claude-3-5-sonnet-latest"], "default_model": "claude-3-5-sonnet-latest",
     "rate_per_minute": 60, "limit_per_5h": 1500,
     "doc_links": ["https://docs.anthropic.com/"]},
    {"id": "deepseek", "name": "DeepSeek", "category": "llm", "base_url": "https://api.deepseek.com/v1",
     "models": ["deepseek-chat", "deepseek-reasoner"], "default_model": "deepseek-chat",
     "rate_per_minute": 60, "limit_per_5h": 1500,
     "doc_links": ["https://api-docs.deepseek.com/"]},
    {"id": "doubao-llm", "name": "豆包大模型", "category": "llm", "base_url": "https://ark.cn-beijing.volces.com/api/v3",
     "models": ["doubao-pro-32k"], "default_model": "doubao-pro-32k",
     "rate_per_minute": 60, "limit_per_5h": 1500,
     "doc_links": ["https://www.volcengine.com/docs/82379"]},
    {"id": "gemini", "name": "Gemini", "category": "llm", "base_url": "https://generativelanguage.googleapis.com/v1beta",
     "models": ["gemini-2.0-flash"], "default_model": "gemini-2.0-flash",
     "rate_per_minute": 60, "limit_per_5h": 1500,
     "doc_links": ["https://ai.google.dev/gemini-api/docs"]},
    {"id": "ollama", "name": "Ollama", "category": "llm", "base_url": "http://localhost:11434/v1",
     "models": ["llama3.1"], "default_model": "llama3.1",
     "rate_per_minute": 120, "limit_per_5h": 5000,
     "doc_links": ["https://docs.ollama.com/"]},
    # ─── TTS 语音 ────────────────────────────
    {"id": "minimax-tts", "name": "MiniMax TTS", "category": "tts", "base_url": "https://api.minimaxi.com/v1",
     "models_url": "https://api.minimaxi.com/v1/models",
     "models": ["speech-2.8-turbo"], "default_model": "speech-2.8-turbo",
     "rate_per_minute": 20, "limit_per_5h": 500,
     "doc_links": ["https://platform.minimaxi.com/docs/guides/speech-t2a-async",
                    "https://platform.minimaxi.com/docs/guides/speech-voice-clone",
                    "https://platform.minimaxi.com/faq/system-voice-id"]},
    {"id": "doubao-tts", "name": "豆包 TTS", "category": "tts", "base_url": "https://openspeech.bytedance.com/api/v1",
     "models": ["doubao-tts"], "default_model": "doubao-tts",
     "rate_per_minute": 20, "limit_per_5h": 500,
     "doc_links": ["https://www.volcengine.com/docs/6561"]},
    {"id": "elevenlabs", "name": "ElevenLabs", "category": "tts", "base_url": "https://api.elevenlabs.io/v1",
     "models": ["eleven_multilingual_v2"], "default_model": "eleven_multilingual_v2",
     "rate_per_minute": 20, "limit_per_5h": 500,
     "doc_links": ["https://elevenlabs.io/docs/api-reference"]},
    {"id": "openai-tts", "name": "OpenAI TTS", "category": "tts", "base_url": "https://api.openai.com/v1",
     "models": ["tts-1", "tts-1-hd"], "default_model": "tts-1",
     "rate_per_minute": 30, "limit_per_5h": 800,
     "doc_links": ["https://platform.openai.com/docs/guides/text-to-speech"]},
    # ─── 语音识别 ────────────────────────────
    {"id": "whisper", "name": "OpenAI Whisper", "category": "speech_recognition", "base_url": "https://api.openai.com/v1",
     "models": ["whisper-1"], "default_model": "whisper-1",
     "rate_per_minute": 30, "limit_per_5h": 800,
     "doc_links": ["https://platform.openai.com/docs/guides/speech-to-text"]},
    {"id": "local-whisper", "name": "本地 Whisper", "category": "speech_recognition", "base_url": "http://localhost:8000",
     "models": ["local-whisper"], "default_model": "local-whisper",
     "rate_per_minute": 60, "limit_per_5h": 2000,
     "doc_links": []},
    # ─── 图片生成 ────────────────────────────
    {"id": "flux", "name": "FLUX", "category": "image", "base_url": "https://api.bfl.ml/v1",
     "models": ["flux-pro"], "default_model": "flux-pro",
     "rate_per_minute": 15, "limit_per_5h": 300,
     "doc_links": ["https://docs.bfl.ai/"]},
    {"id": "minimax-image", "name": "MiniMax Image", "category": "image", "base_url": "https://api.minimaxi.com/v1",
     "models_url": "https://api.minimaxi.com/v1/models",
     "models": ["image-01"], "default_model": "image-01",
     "rate_per_minute": 15, "limit_per_5h": 300,
     "doc_links": ["https://platform.minimaxi.com/docs/guides/image-generation"]},
    {"id": "dall-e", "name": "DALL·E", "category": "image", "base_url": "https://api.openai.com/v1",
     "models": ["dall-e-3"], "default_model": "dall-e-3",
     "rate_per_minute": 10, "limit_per_5h": 200,
     "doc_links": ["https://platform.openai.com/docs/guides/images"]},
    {"id": "local-diffusion", "name": "本地 Diffusion", "category": "image", "base_url": "http://127.0.0.1:7860",
     "models": ["sd-xl"], "default_model": "sd-xl",
     "rate_per_minute": 60, "limit_per_5h": 2000,
     "doc_links": []},
    # ─── 视频生成 ────────────────────────────
    {"id": "minimax", "name": "MiniMax Video", "category": "video", "base_url": "https://api.minimaxi.com/v1",
     "models_url": "https://api.minimaxi.com/v1/models",
     "models": ["MiniMax-Hailuo-2.3", "T2V-01", "I2V-01"], "default_model": "MiniMax-Hailuo-2.3",
     "rate_per_minute": 6, "limit_per_5h": 100,
     "doc_links": ["https://platform.minimaxi.com/docs/guides/video-generation"]},
    {"id": "kling", "name": "可灵 Kling", "category": "video", "base_url": "https://api.klingai.com/v1",
     "models": ["kling-v1"], "default_model": "kling-v1",
     "rate_per_minute": 6, "limit_per_5h": 100,
     "doc_links": ["https://app.klingai.com/global/dev/document-api/"]},
    {"id": "runway", "name": "Runway", "category": "video", "base_url": "https://api.dev.runwayml.com/v1",
     "models": ["gen-3-alpha"], "default_model": "gen-3-alpha",
     "rate_per_minute": 6, "limit_per_5h": 100,
     "doc_links": ["https://docs.dev.runwayml.com/"]},
    # ─── 音频生成 ────────────────────────────
    {"id": "suno", "name": "Suno", "category": "audio", "base_url": "https://api.sunoa.ai",
     "models": ["music"], "default_model": "music",
     "rate_per_minute": 6, "limit_per_5h": 100,
     "doc_links": ["https://platform.suno.ai/docs/api"]},
    {"id": "musicgen", "name": "MusicGen", "category": "audio", "base_url": "",
     "models": ["musicgen"], "default_model": "musicgen",
     "doc_links": []},
    {"id": "music-library", "name": "本地音乐库", "category": "audio", "base_url": "",
     "models": ["local-library"], "default_model": "local-library",
     "doc_links": []},
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


async def ensure_model_preset_columns(db: AsyncSession):
    """幂等迁移：为存量 model_presets 表补充新增列（SQLite ALTER TABLE ADD COLUMN）。"""
    import sqlalchemy as sa
    cols = {row[1] for row in (await db.execute(sa.text("PRAGMA table_info(model_presets)"))).fetchall()}
    additions = [
        ("models_url", "VARCHAR DEFAULT ''"),
        ("rate_per_minute", "INTEGER"),
        ("limit_per_5h", "INTEGER"),
    ]
    for name, ddl in additions:
        if name not in cols:
            await db.execute(sa.text(f"ALTER TABLE model_presets ADD COLUMN {name} {ddl}"))
    await db.commit()


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
            models_url=item.get("models_url", ""),
            models=json.dumps(item.get("models", []), ensure_ascii=False),
            default_model=item.get("default_model", ""),
            rate_per_minute=item.get("rate_per_minute"),
            limit_per_5h=item.get("limit_per_5h"),
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
    base_url = _validate_optional_url(data.get("base_url"), "base_url")
    models_url = _validate_optional_url(data.get("models_url"), "models_url")
    rate_per_minute = _validate_optional_positive_int(data.get("rate_per_minute"), "rate_per_minute", MAX_RATE_PER_MINUTE)
    limit_per_5h = _validate_optional_positive_int(data.get("limit_per_5h"), "limit_per_5h", MAX_LIMIT_PER_5H)

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
        if cap not in ALLOWED_DOC_KEYS:
            raise ValueError(f"未知的能力文档键：{cap}（允许：{', '.join(sorted(ALLOWED_DOC_KEYS))}）")
        normalized_cap_docs[cap] = _validate_doc_links(links, f"capability_doc_links.{cap}")

    models = data.get("models", [])
    if not isinstance(models, list):
        raise ValueError("models 必须是数组")
    if len(models) > MAX_MODELS:
        raise ValueError(f"models 最多 {MAX_MODELS} 个")
    normalized_models = []
    for m in models:
        text = str(m).strip()
        if text and text not in normalized_models:
            normalized_models.append(text)

    default_model = str(data.get("default_model", "")).strip()
    if default_model and normalized_models and default_model not in normalized_models:
        raise ValueError("默认模型 ID 必须在模型列表中")

    row = await get_model_preset(db, preset_id)
    now = datetime.datetime.utcnow().isoformat()
    if row is None:
        row = ModelPreset(id=preset_id, created_at=now)
        db.add(row)
    row.name = name
    row.category = category
    row.base_url = base_url
    row.models_url = models_url
    row.models = json.dumps(normalized_models, ensure_ascii=False)
    row.default_model = default_model
    row.rate_per_minute = rate_per_minute
    row.limit_per_5h = limit_per_5h
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


def _is_loopback_host(hostname: str) -> bool:
    host = hostname.strip().lower().rstrip(".")
    if host in ("localhost", "localhost.localdomain"):
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


def _is_private_or_reserved(ip: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False
    # is_private 在不同 Python 版本对 CGNAT(100.64.0.0/10) 覆盖不一致，显式补充
    cgnat = ipaddress.ip_network("100.64.0.0/10", strict=False)
    return (addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_multicast
            or addr.is_reserved or addr.is_unspecified or addr in cgnat)


def _extract_model_ids(payload: object) -> list[str]:
    """从常见模型列表响应中提取字符串模型ID：{models:[...]} / {data:[{id:...}]} / {data:[...]} / 纯数组。"""
    candidates = []
    if isinstance(payload, list):
        candidates = payload
    elif isinstance(payload, dict):
        for key in ("models", "data", "model_ids", "modelIds"):
            if isinstance(payload.get(key), list):
                candidates = payload[key]
                break
        else:
            if isinstance(payload.get("items"), list):
                candidates = payload["items"]
    result = []
    for item in candidates:
        if isinstance(item, str):
            text = item.strip()
        elif isinstance(item, dict) and isinstance(item.get("id"), str):
            text = item["id"].strip()
        else:
            continue
        if text and text not in result:
            result.append(text)
        if len(result) >= MAX_MODELS:
            break
    return result


async def fetch_models_from_url(db: AsyncSession, preset_id: str, models_url_override: str | None = None):
    """从 preset.models_url（或显式覆盖值）拉取支持的模型 ID 列表。

    SSRF 防护 + 超时 + 大小限制 + JSON 契约。
    返回 (models, default_model, models_url)。成功时由调用方负责回写持久化。
    """
    import httpx

    row = await get_model_preset(db, preset_id)
    if row is None:
        raise ValueError(f"Model preset not found: {preset_id}")
    models_url = (models_url_override or row.models_url or "").strip()
    if not models_url:
        raise ValueError("该预设未配置「获取模型ID URL」（models_url）")
    if models_url_override:
        models_url = _validate_optional_url(models_url_override, "models_url")

    try:
        parsed = __import__("urllib.parse", fromlist=["urlparse"]).urlparse(models_url)
    except Exception:
        parsed = None
    if parsed is None or parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise ValueError("获取模型ID URL 必须是 http(s) 地址")

    hostname = (parsed.hostname or "").lower()
    is_loopback = _is_loopback_host(hostname)
    # 非环回主机：仅允许 https，且解析后的地址不得是私网/保留地址（防 SSRF/DNS 重绑定）
    if not is_loopback:
        if parsed.scheme != "https":
            raise ValueError("非本机地址的获取模型ID URL 必须使用 https")
        try:
            resolved = socket.getaddrinfo(hostname, parsed.port or (443 if parsed.scheme == "https" else 80), proto=socket.IPPROTO_TCP)
        except socket.gaierror:
            raise ValueError("无法解析获取模型ID URL 的主机名")
        for entry in resolved:
            ip = entry[4][0]
            if _is_private_or_reserved(ip):
                raise ValueError("获取模型ID URL 解析到私网/保留地址，已拒绝（防 SSRF）")

    headers = {"Accept": "application/json", "User-Agent": "ops-center-model-presets/0.1"}
    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=False) as client:
            resp = await client.get(models_url, headers=headers)
    except httpx.TimeoutException:
        raise ValueError("获取模型ID请求超时（10 秒）")
    except httpx.RequestError as exc:
        raise ValueError(f"获取模型ID请求失败：{exc.__class__.__name__}")

    if resp.status_code < 200 or resp.status_code >= 300:
        raise ValueError(f"获取模型ID请求返回 HTTP {resp.status_code}")

    body = resp.content or b""
    if len(body) > 512 * 1024:
        raise ValueError("获取模型ID响应体超过 512KB，已拒绝")
    try:
        payload = json.loads(body.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        raise ValueError("获取模型ID响应不是合法 JSON")

    models = _extract_model_ids(payload)
    if not models:
        raise ValueError("获取模型ID响应中未找到任何模型ID（支持 {models|data:[...]} 或纯数组）")

    old_default = (row.default_model or "").strip()
    default_model = old_default if old_default in models else ""
    return models, default_model, models_url


def _to_dict(row: ModelPreset) -> dict:
    return {
        "id": row.id,
        "name": row.name,
        "category": row.category,
        "base_url": row.base_url or "",
        "models_url": row.models_url or "",
        "models": json.loads(row.models or "[]"),
        "default_model": row.default_model or "",
        "rate_per_minute": row.rate_per_minute,
        "limit_per_5h": row.limit_per_5h,
        "is_multimodal": bool(row.is_multimodal),
        "capabilities": json.loads(row.capabilities or "[]"),
        "capability_models": json.loads(row.capability_models or "{}"),
        "doc_links": json.loads(row.doc_links or "[]"),
        "capability_doc_links": json.loads(row.capability_doc_links or "{}"),
        "is_visible": bool(row.is_visible),
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }