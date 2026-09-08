"""Rewrite strategy service — 改写策略模板管理（CRUD/校验/种子/运行时下发）。"""
import datetime
import json
import re

import sqlalchemy as sa
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from models import RewriteStrategy

ID_RE = re.compile(r"^[a-z0-9_-]{1,100}$")

VALID_CATEGORIES = {"viral", "marketing", "platform", "style"}

SEED_STRATEGIES = [
    {
        "id": "strategy-viral-storytelling", "name": "故事化爆款策略",
        "description": "以故事化叙事方式改写文案，制造情感共鸣和悬念，适合IP打造和情感类内容",
        "category": "viral",
        "industry": json.dumps(["general", "ip-building", "lifestyle"], ensure_ascii=False),
        "purpose": json.dumps(["engagement", "follower-growth"], ensure_ascii=False),
        "tone": json.dumps(["storytelling", "emotional"], ensure_ascii=False),
        "platforms": json.dumps(["douyin", "xiaohongshu", "wechat_mp"], ensure_ascii=False),
        "system_prompt": "你是一位顶级短视频编剧，擅长用故事化手法抓住观众注意力。你的写作风格：真实、有温度、有态度。禁止使用AI套路用语。",
        "user_prompt_template": "请将以下内容改写为故事化文案：\n\n{content}\n\n要求：\n1. 以悬念或冲突开头，3秒内抓住注意力\n2. 中间制造情感转折或认知冲突\n3. 结尾引发共鸣或行动号召\n\n{knowledgeContext}",
        "post_process_config": json.dumps({"removeAITaste": True, "sensitiveCheck": True, "maxLength": 2000}),
        "sort_order": 10,
    },
    {
        "id": "strategy-ecommerce-convert", "name": "电商转化策略",
        "description": "针对电商场景优化文案，突出卖点、制造紧迫感、引导下单",
        "category": "marketing",
        "industry": json.dumps(["ecommerce", "retail"], ensure_ascii=False),
        "purpose": json.dumps(["conversion", "sales"], ensure_ascii=False),
        "tone": json.dumps(["casual", "persuasive"], ensure_ascii=False),
        "platforms": json.dumps(["douyin", "xiaohongshu", "wechat_mp"], ensure_ascii=False),
        "system_prompt": "你是一位顶级电商文案策划，擅长用精准的卖点描述和情感驱动让用户下单。",
        "user_prompt_template": "请将以下商品/内容改写为电商带货文案：\n\n{content}\n\n要求：\n1. 开头用痛点或场景引发共鸣\n2. 突出3个核心卖点，每个卖点配合使用场景\n3. 制造限时/限量紧迫感\n4. 结尾明确行动号召\n\n{knowledgeContext}",
        "post_process_config": json.dumps({"removeAITaste": True, "sensitiveCheck": True, "maxLength": 1500}),
        "sort_order": 20,
    },
    {
        "id": "strategy-douyin-viral", "name": "抖音爆款口播策略",
        "description": "针对抖音短视频口播文案优化，强调黄金3秒、情绪节奏、互动引导",
        "category": "platform",
        "industry": json.dumps(["general", "entertainment"], ensure_ascii=False),
        "purpose": json.dumps(["engagement", "follower-growth"], ensure_ascii=False),
        "tone": json.dumps(["casual", "humorous"], ensure_ascii=False),
        "platforms": json.dumps(["douyin"], ensure_ascii=False),
        "system_prompt": "你是一位抖音千万粉丝博主的文案策划，擅长写高互动、高完播的口播文案。",
        "user_prompt_template": "请将以下内容改写为抖音口播文案：\n\n{content}\n\n要求：\n1. 黄金3秒：开头必须有钩子\n2. 正文每15-20秒一个信息增量\n3. 多用短句，口语化表达\n4. 结尾引导点赞、评论、关注\n\n{knowledgeContext}",
        "post_process_config": json.dumps({"removeAITaste": True, "sensitiveCheck": True, "maxLength": 800}),
        "sort_order": 30,
    },
    {
        "id": "strategy-xiaohongshu-cz", "name": "小红书种草策略",
        "description": "针对小红书图文种草文案优化，强调真实体验、视觉化描述、标签策略",
        "category": "platform",
        "industry": json.dumps(["ecommerce", "lifestyle", "beauty"], ensure_ascii=False),
        "purpose": json.dumps(["conversion", "engagement"], ensure_ascii=False),
        "tone": json.dumps(["casual", "emotional"], ensure_ascii=False),
        "platforms": json.dumps(["xiaohongshu"], ensure_ascii=False),
        "system_prompt": "你是一位小红书万粉博主，擅长写真实、有温度的种草文案。",
        "user_prompt_template": "请将以下内容改写为小红书种草文案：\n\n{content}\n\n要求：\n1. 以个人真实体验开头\n2. 至少3个使用场景+感受描述\n3. 有对比（之前 vs 现在）\n4. 结尾加3-5个相关标签\n\n{knowledgeContext}",
        "post_process_config": json.dumps({"removeAITaste": True, "sensitiveCheck": True, "maxLength": 1500}),
        "sort_order": 40,
    },
    {
        "id": "strategy-knowledge-dry", "name": "干货知识策略",
        "description": "针对知识分享类内容优化，强调逻辑清晰、信息密度高、可操作性",
        "category": "viral",
        "industry": json.dumps(["education", "technology", "finance"], ensure_ascii=False),
        "purpose": json.dumps(["engagement", "authority-building"], ensure_ascii=False),
        "tone": json.dumps(["formal", "storytelling"], ensure_ascii=False),
        "platforms": json.dumps(["wechat_mp", "bilibili", "zhihu"], ensure_ascii=False),
        "system_prompt": "你是一位领域专家和知识博主，擅长将复杂知识讲得通俗易懂。",
        "user_prompt_template": "请将以下内容改写为干货知识文案：\n\n{content}\n\n要求：\n1. 开头用一个问题或现象引出话题\n2. 正文分2-3个要点，每个要点有理论+案例\n3. 数据或研究支撑每个观点\n4. 结尾给出可操作的建议\n\n{knowledgeContext}",
        "post_process_config": json.dumps({"removeAITaste": True, "sensitiveCheck": True, "maxLength": 3000}),
        "sort_order": 50,
    },
]

SEED_IDS = {s["id"] for s in SEED_STRATEGIES}


class RewriteStrategyError(ValueError):
    """策略校验/业务错误（400）。"""


class RewriteStrategyExists(RewriteStrategyError):
    """策略 id 已存在（409）。"""


def _now() -> str:
    return datetime.datetime.utcnow().isoformat()


def _parse_str_list(value, key: str, max_items: int = 50) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except (TypeError, ValueError):
            raise RewriteStrategyError(f"{key} 必须是字符串数组")
    if not isinstance(value, list):
        raise RewriteStrategyError(f"{key} 必须是字符串数组")
    if len(value) > max_items:
        raise RewriteStrategyError(f"{key} 条目过多（≤{max_items}）")
    out = []
    seen = set()
    for item in value:
        if not isinstance(item, str) or not item.strip():
            raise RewriteStrategyError(f"{key} 必须是非空字符串数组")
        cleaned = item.strip()
        if len(cleaned) > 200:
            raise RewriteStrategyError(f"{key} 条目过长（≤200）")
        if cleaned not in seen:
            seen.add(cleaned)
            out.append(cleaned)
    return out


def _to_dict(row: RewriteStrategy) -> dict:
    def _load_json(v, default):
        try:
            parsed = json.loads(v) if v else default
            return parsed if isinstance(parsed, (list, dict)) else default
        except (TypeError, ValueError):
            return default

    return {
        "id": row.id, "name": row.name, "description": row.description or "",
        "version": row.version or "1.0.0", "category": row.category or "viral",
        "industry": _load_json(row.industry, []),
        "purpose": _load_json(row.purpose, []),
        "tone": _load_json(row.tone, []),
        "platforms": _load_json(row.platforms, []),
        "systemPrompt": row.system_prompt or "",
        "userPromptTemplate": row.user_prompt_template or "",
        "postProcess": _load_json(row.post_process_config, {}),
        "metadata": _load_json(row.extra_metadata, {}),
        "enabled": bool(row.enabled), "sort_order": row.sort_order or 0,
        "builtin": row.id in SEED_IDS,
        "updated_at": row.updated_at, "updated_by": row.updated_by or "",
    }


def validate_strategy(body: dict) -> dict:
    sid = str(body.get("id") or "").strip()
    if not sid:
        raise RewriteStrategyError("id 不能为空")
    if not ID_RE.match(sid):
        raise RewriteStrategyError("id 只能包含小写字母/数字/下划线/短横线（1-100 位）")
    name = str(body.get("name") or "").strip()
    if not name:
        raise RewriteStrategyError("name 不能为空")
    if len(name) > 200:
        raise RewriteStrategyError("name 过长（≤200）")
    description = str(body.get("description") or "").strip()
    if len(description) > 2000:
        raise RewriteStrategyError("description 过长（≤2000）")
    version = str(body.get("version") or "1.0.0").strip()
    if len(version) > 20:
        raise RewriteStrategyError("version 过长（≤20）")
    category = str(body.get("category") or "viral").strip()
    if category not in VALID_CATEGORIES:
        raise RewriteStrategyError(f"category 必须是 {sorted(VALID_CATEGORIES)} 之一")
    industry = _parse_str_list(body.get("industry"), "industry")
    purpose = _parse_str_list(body.get("purpose"), "purpose")
    tone = _parse_str_list(body.get("tone"), "tone")
    platforms = _parse_str_list(body.get("platforms"), "platforms")
    system_prompt = str(body.get("systemPrompt") or body.get("system_prompt") or "").strip()
    if not system_prompt:
        raise RewriteStrategyError("systemPrompt 不能为空")
    if len(system_prompt) > 5000:
        raise RewriteStrategyError("systemPrompt 过长（≤5000）")
    user_prompt_template = str(body.get("userPromptTemplate") or body.get("user_prompt_template") or "").strip()
    if not user_prompt_template:
        raise RewriteStrategyError("userPromptTemplate 不能为空")
    if len(user_prompt_template) > 10000:
        raise RewriteStrategyError("userPromptTemplate 过长（≤10000）")
    post_process_config = body.get("postProcess") or body.get("post_process_config")
    if post_process_config is None:
        pp_str = "{}"
    elif isinstance(post_process_config, dict):
        pp_str = json.dumps(post_process_config, ensure_ascii=False)
    elif isinstance(post_process_config, str):
        try:
            parsed = json.loads(post_process_config)
            if not isinstance(parsed, dict):
                raise RewriteStrategyError("postProcess 必须是 JSON 对象")
            pp_str = json.dumps(parsed, ensure_ascii=False)
        except (TypeError, ValueError):
            raise RewriteStrategyError("postProcess 必须是 JSON 对象")
    else:
        raise RewriteStrategyError("postProcess 必须是 JSON 对象")
    metadata = body.get("metadata")
    if metadata is None:
        meta_str = "{}"
    elif isinstance(metadata, dict):
        meta_str = json.dumps(metadata, ensure_ascii=False)
    elif isinstance(metadata, str):
        try:
            parsed = json.loads(metadata)
            if not isinstance(parsed, dict):
                raise RewriteStrategyError("metadata 必须是 JSON 对象")
            meta_str = json.dumps(parsed, ensure_ascii=False)
        except (TypeError, ValueError):
            raise RewriteStrategyError("metadata 必须是 JSON 对象")
    else:
        raise RewriteStrategyError("metadata 必须是 JSON 对象")
    sort_order = body.get("sort_order", 0)
    if isinstance(sort_order, bool) or not isinstance(sort_order, int):
        raise RewriteStrategyError("sort_order 必须是整数")
    if sort_order < 0:
        raise RewriteStrategyError("sort_order 必须为非负整数")
    raw_enabled = body.get("enabled", 1)
    if isinstance(raw_enabled, bool):
        enabled = 1 if raw_enabled else 0
    elif isinstance(raw_enabled, int) and not isinstance(raw_enabled, bool) and raw_enabled in (0, 1):
        enabled = raw_enabled
    elif isinstance(raw_enabled, str) and raw_enabled.strip().lower() in ("true", "1"):
        enabled = 1
    elif isinstance(raw_enabled, str) and raw_enabled.strip().lower() in ("false", "0"):
        enabled = 0
    else:
        raise RewriteStrategyError("enabled 必须是布尔值（true/false/1/0）")
    return {
        "id": sid, "name": name, "description": description, "version": version,
        "category": category,
        "industry": json.dumps(industry, ensure_ascii=False),
        "purpose": json.dumps(purpose, ensure_ascii=False),
        "tone": json.dumps(tone, ensure_ascii=False),
        "platforms": json.dumps(platforms, ensure_ascii=False),
        "system_prompt": system_prompt,
        "user_prompt_template": user_prompt_template,
        "post_process_config": pp_str,
        "extra_metadata": meta_str,
        "enabled": enabled, "sort_order": sort_order,
    }


async def _get(db: AsyncSession, sid: str) -> RewriteStrategy | None:
    return (await db.execute(
        sa.select(RewriteStrategy).where(RewriteStrategy.id == sid)
    )).scalar_one_or_none()


async def ensure_rewrite_strategies_seeded(db: AsyncSession) -> None:
    now = _now()
    for s in SEED_STRATEGIES:
        if await _get(db, s["id"]) is not None:
            continue
        db.add(RewriteStrategy(
            id=s["id"], name=s["name"], description=s.get("description", ""),
            version=s.get("version", "1.0.0"), category=s.get("category", "viral"),
            industry=s["industry"], purpose=s["purpose"], tone=s["tone"],
            platforms=s["platforms"],
            system_prompt=s["system_prompt"],
            user_prompt_template=s["user_prompt_template"],
            post_process_config=s.get("post_process_config", "{}"),
            extra_metadata=s.get("metadata", "{}"),
            enabled=1, sort_order=s.get("sort_order", 0),
            updated_at=now, updated_by="seed",
        ))
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()


async def list_rewrite_strategies(db: AsyncSession) -> list[dict]:
    rows = (await db.execute(
        sa.select(RewriteStrategy)
        .where(RewriteStrategy.deleted_at.is_(None))
        .order_by(RewriteStrategy.sort_order, RewriteStrategy.id)
    )).scalars().all()
    return [_to_dict(r) for r in rows]


async def create_rewrite_strategy(db: AsyncSession, body: dict, updated_by: str) -> dict:
    data = validate_strategy(body)
    existing = await _get(db, data["id"])
    if existing is not None and existing.deleted_at is None:
        raise RewriteStrategyExists(f"策略 {data['id']} 已存在")
    now = _now()
    if existing is not None:
        for k, v in data.items():
            setattr(existing, k, v)
        existing.deleted_at = None
        existing.enabled = data.get("enabled", 1)
        existing.updated_at = now
        existing.updated_by = updated_by
        row = existing
    else:
        row = RewriteStrategy(**data, updated_at=now, updated_by=updated_by)
        db.add(row)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise RewriteStrategyExists(f"策略 {data['id']} 已存在")
    await db.refresh(row)
    return _to_dict(row)


async def update_rewrite_strategy(db: AsyncSession, sid: str, body: dict, updated_by: str) -> dict:
    row = await _get(db, sid)
    if row is None or row.deleted_at is not None:
        raise KeyError(sid)
    merged = _to_dict(row)
    merged.update({k: v for k, v in body.items() if v is not None and k != "id"})
    merged["id"] = sid
    data = validate_strategy(merged)
    for k, v in data.items():
        setattr(row, k, v)
    row.updated_at = _now()
    row.updated_by = updated_by
    await db.commit()
    await db.refresh(row)
    return _to_dict(row)


async def delete_rewrite_strategy(db: AsyncSession, sid: str) -> bool:
    row = await _get(db, sid)
    if row is None or row.deleted_at is not None:
        return False
    row.deleted_at = _now()
    row.enabled = 0
    row.updated_at = row.deleted_at
    await db.commit()
    return True


async def toggle_rewrite_strategy(db: AsyncSession, sid: str, enabled: bool, updated_by: str) -> dict:
    row = await _get(db, sid)
    if row is None or row.deleted_at is not None:
        raise KeyError(sid)
    row.enabled = 1 if enabled else 0
    row.updated_at = _now()
    row.updated_by = updated_by
    await db.commit()
    await db.refresh(row)
    return _to_dict(row)


async def list_runtime_rewrite_strategies(db: AsyncSession) -> list[dict]:
    rows = (await db.execute(
        sa.select(RewriteStrategy)
        .where(RewriteStrategy.enabled == 1, RewriteStrategy.deleted_at.is_(None))
        .order_by(RewriteStrategy.sort_order, RewriteStrategy.id)
    )).scalars().all()
    return [_to_dict(r) for r in rows]