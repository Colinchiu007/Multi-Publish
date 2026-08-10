"""Content template service — 官方内容模板库管理（CRUD/校验/种子/运行时下发）。"""
import datetime
import json
import re

import sqlalchemy as sa
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from models import ContentTemplate

ID_RE = re.compile(r"^[a-z0-9_-]{1,64}$")

# 种子：对齐桌面端 TemplateManager.getPresets()（已存在即跳过，不覆盖运营修改/软删）

SEED_TEMPLATES = [
    {
        "id": 'preset-weekly', "name": 'Weekly Report', "category": 'report',
        "title": 'Weekly Work Report',
        "content": '# Weekly Report\n\n## Tasks Completed\n- \n- \n\n## Next Week Plan\n- \n- \n\n## Issues\n- ',
        "platforms": ['wechat_mp', 'zhihu'], "tags": ['report'], "sort_order": 10,
    },
    {
        "id": 'preset-product', "name": 'Product Launch', "category": 'marketing',
        "title": 'New Product Launch',
        "content": '# New Product Launch\n\nDear users,\n\nWe are excited to announce the launch of [Product Name]!\n\n## Highlights\n- \n- \n\n## How to Get\n- ',
        "platforms": ['wechat_mp', 'weibo', 'xiaohongshu'], "tags": ['product', 'announcement'], "sort_order": 20,
    },
    {
        "id": 'preset-tutorial', "name": 'Tutorial', "category": 'tutorial',
        "title": 'How-To Tutorial',
        "content": '# Tutorial\n\n## Step 1\n- \n\n## Step 2\n- \n\n## Tips\n- ',
        "platforms": ['wechat_mp', 'bilibili'], "tags": ['tutorial'], "sort_order": 30,
    },
    {
        "id": 'preset-event', "name": 'Event Announcement', "category": 'event',
        "title": 'Event Announcement',
        "content": '# Event\n\nTime: \n\nLocation: \n\nRegistration: ',
        "platforms": ['wechat_mp', 'weibo'], "tags": ['event', 'announcement'], "sort_order": 40,
    },
    {
        "id": 'preset-daily', "name": 'Daily Post', "category": 'daily',
        "title": 'Daily Update',
        "content": '# Daily Update\n\nToday:\n- \n- ',
        "platforms": ['wechat_mp', 'weibo', 'xiaohongshu'], "tags": ['daily'], "sort_order": 50,
    },
]



class ContentTemplateError(ValueError):
    """内容模板校验/业务错误基类（400）。"""


class ContentTemplateExists(ContentTemplateError):
    """模板 id 已存在（409）。"""


def _now() -> str:
    return datetime.datetime.utcnow().isoformat()


def _parse_str_list(value, key: str, max_items: int = 50) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except (TypeError, ValueError):
            raise ContentTemplateError(f"{key} 必须是字符串数组")
    if not isinstance(value, list):
        raise ContentTemplateError(f"{key} 必须是字符串数组")
    if len(value) > max_items:
        raise ContentTemplateError(f"{key} 条目过多（≤{max_items}）")
    out = []
    seen = set()
    for item in value:
        if not isinstance(item, str) or not item.strip():
            raise ContentTemplateError(f"{key} 必须是非空字符串数组")
        cleaned = item.strip()
        if len(cleaned) > 200:
            raise ContentTemplateError(f"{key} 条目过长（≤200）")
        if cleaned not in seen:
            seen.add(cleaned)
            out.append(cleaned)
    return out


SEED_IDS = {s["id"] for s in SEED_TEMPLATES}


def _to_dict(row: ContentTemplate) -> dict:
    def _load(v, default):
        try:
            parsed = json.loads(v) if v else []
            return parsed if isinstance(parsed, list) else default
        except (TypeError, ValueError):
            return default

    return {
        "id": row.id, "name": row.name, "category": row.category or "marketing",
        "title": row.title or "", "content": row.content or "",
        "platforms": _load(row.platforms, []), "tags": _load(row.tags, []),
        "enabled": bool(row.enabled), "sort_order": row.sort_order or 0,
        "builtin": row.id in SEED_IDS,
        "updated_at": row.updated_at, "updated_by": row.updated_by or "",
    }


def validate_template(body: dict) -> dict:
    tid = str(body.get("id") or "").strip()
    if not tid:
        raise ContentTemplateError("id 不能为空")
    if not ID_RE.match(tid):
        raise ContentTemplateError("id 只能包含小写字母/数字/下划线/短横线（1-64 位）")
    name = str(body.get("name") or "").strip()
    if not name:
        raise ContentTemplateError("name 不能为空")
    if len(name) > 100:
        raise ContentTemplateError("name 过长（≤100）")
    category = str(body.get("category") or "marketing").strip()
    if len(category) > 40:
        raise ContentTemplateError("category 过长（≤40）")
    title = str(body.get("title") or "").strip()
    if len(title) > 200:
        raise ContentTemplateError("title 过长（≤200）")
    content = str(body.get("content") or "").strip()
    if len(content) > 20000:
        raise ContentTemplateError("content 过长（≤20000）")
    platforms = _parse_str_list(body.get("platforms"), "platforms")
    tags = _parse_str_list(body.get("tags"), "tags")
    sort_order = body.get("sort_order", 0)
    if isinstance(sort_order, bool) or not isinstance(sort_order, int):
        raise ContentTemplateError("sort_order 必须是整数")
    if sort_order < 0:
        raise ContentTemplateError("sort_order 必须为非负整数")
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
        raise ContentTemplateError("enabled 必须是布尔值（true/false/1/0）")
    return {
        "id": tid, "name": name, "category": category, "title": title, "content": content,
        "platforms": json.dumps(platforms, ensure_ascii=False),
        "tags": json.dumps(tags, ensure_ascii=False),
        "enabled": enabled, "sort_order": sort_order,
    }


async def _get(db: AsyncSession, tid: str) -> ContentTemplate | None:
    return (await db.execute(sa.select(ContentTemplate).where(ContentTemplate.id == tid))).scalar_one_or_none()


async def ensure_content_templates_seeded(db: AsyncSession) -> None:
    now = _now()
    for s in SEED_TEMPLATES:
        if await _get(db, s["id"]) is not None:
            continue
        db.add(ContentTemplate(
            id=s["id"], name=s["name"], category=s["category"], title=s["title"], content=s["content"],
            platforms=json.dumps(s["platforms"], ensure_ascii=False),
            tags=json.dumps(s["tags"], ensure_ascii=False),
            enabled=1, sort_order=s.get("sort_order", 0), updated_at=now, updated_by="seed"))
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()


async def list_content_templates(db: AsyncSession) -> list[dict]:
    rows = (await db.execute(
        sa.select(ContentTemplate)
        .where(ContentTemplate.deleted_at.is_(None))
        .order_by(ContentTemplate.sort_order, ContentTemplate.id)
    )).scalars().all()
    return [_to_dict(r) for r in rows]


async def create_content_template(db: AsyncSession, body: dict, updated_by: str) -> dict:
    data = validate_template(body)
    existing = await _get(db, data["id"])
    if existing is not None and existing.deleted_at is None:
        raise ContentTemplateExists(f"模板 {data['id']} 已存在")
    now = _now()
    if existing is not None:
        # 软删后重建：恢复并应用新数据
        for k, v in data.items():
            setattr(existing, k, v)
        existing.deleted_at = None
        existing.enabled = data.get("enabled", 1)
        existing.updated_at = now
        existing.updated_by = updated_by
        row = existing
    else:
        row = ContentTemplate(**data, updated_at=now, updated_by=updated_by)
        db.add(row)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise ContentTemplateExists(f"模板 {data['id']} 已存在")
    await db.refresh(row)
    return _to_dict(row)


async def update_content_template(db: AsyncSession, tid: str, body: dict, updated_by: str) -> dict:
    row = await _get(db, tid)
    if row is None or row.deleted_at is not None:
        raise KeyError(tid)
    merged = _to_dict(row)
    merged.update({k: v for k, v in body.items() if v is not None and k != "id"})
    merged["id"] = tid
    data = validate_template(merged)
    for k, v in data.items():
        setattr(row, k, v)
    row.updated_at = _now()
    row.updated_by = updated_by
    await db.commit()
    await db.refresh(row)
    return _to_dict(row)


async def delete_content_template(db: AsyncSession, tid: str) -> bool:
    row = await _get(db, tid)
    if row is None or row.deleted_at is not None:
        return False
    row.deleted_at = _now()
    row.enabled = 0
    row.updated_at = row.deleted_at
    await db.commit()
    return True


async def list_runtime_content_templates(db: AsyncSession) -> list[dict]:
    rows = (await db.execute(
        sa.select(ContentTemplate)
        .where(ContentTemplate.enabled == 1, ContentTemplate.deleted_at.is_(None))
        .order_by(ContentTemplate.sort_order, ContentTemplate.id)
    )).scalars().all()
    return [_to_dict(r) for r in rows]
