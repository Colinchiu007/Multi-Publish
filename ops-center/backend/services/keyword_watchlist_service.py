"""Keyword watchlist service — 关键词监测目录管理（CRUD/校验/软删/运行时下发）。"""
import datetime
import math

import sqlalchemy as sa
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from models import KeywordWatchlist


def _now() -> str:
    return datetime.datetime.utcnow().isoformat()


def _to_dict(row: KeywordWatchlist) -> dict:
    return {
        "id": row.id, "keyword": row.keyword, "category": row.category or "topic",
        "threshold": row.threshold if row.threshold is not None else 2.0,
        "interval_minutes": row.interval_minutes if row.interval_minutes else 360,
        "enabled": bool(row.enabled), "sort_order": row.sort_order or 0,
        "updated_at": row.updated_at, "updated_by": row.updated_by or "",
    }


def validate_entry(body: dict) -> dict:
    keyword = str(body.get("keyword") or "").strip()
    if not keyword or len(keyword) < 2 or len(keyword) > 100:
        raise ValueError("keyword 必须是 2-100 字")
    category = str(body.get("category") or "topic").strip()[:40]
    threshold = body.get("threshold", 2.0)
    if isinstance(threshold, bool) or not isinstance(threshold, (int, float)) or not math.isfinite(threshold) or threshold < 1.0:
        raise ValueError("threshold 必须是 ≥1 的有限数字")
    interval = body.get("interval_minutes", 360)
    if isinstance(interval, bool) or not isinstance(interval, int) or interval < 10 or interval > 10080:
        raise ValueError("interval_minutes 必须是 10-10080 的整数（分钟）")
    enabled = 1 if str(body.get("enabled", 1)).lower() in ("true", "1") else 0
    return {"keyword": keyword, "category": category, "threshold": float(threshold),
            "interval_minutes": int(interval), "enabled": enabled,
            "sort_order": int(body.get("sort_order", 0)) if isinstance(body.get("sort_order", 0), int) and not isinstance(body.get("sort_order", 0), bool) else 0}


async def _get_by_keyword(db: AsyncSession, keyword: str) -> KeywordWatchlist | None:
    return (await db.execute(sa.select(KeywordWatchlist).where(KeywordWatchlist.keyword == keyword))).scalar_one_or_none()


async def _get_by_id(db: AsyncSession, entry_id: int) -> KeywordWatchlist | None:
    return (await db.execute(sa.select(KeywordWatchlist).where(KeywordWatchlist.id == entry_id))).scalar_one_or_none()


async def list_watchlist(db: AsyncSession) -> list[dict]:
    rows = (await db.execute(
        sa.select(KeywordWatchlist).where(KeywordWatchlist.deleted_at.is_(None))
        .order_by(KeywordWatchlist.sort_order, KeywordWatchlist.id)
    )).scalars().all()
    return [_to_dict(r) for r in rows]


async def create_watchlist_entry(db: AsyncSession, body: dict, updated_by: str) -> dict:
    data = validate_entry(body)
    existing = await _get_by_keyword(db, data["keyword"])
    if existing is not None and existing.deleted_at is None:
        raise ValueError(f"关键词 {data['keyword']} 已存在")
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
        row = KeywordWatchlist(**data, updated_at=now, updated_by=updated_by)
        db.add(row)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise ValueError(f"关键词 {data['keyword']} 已存在")
    await db.refresh(row)
    return _to_dict(row)


async def update_watchlist_entry(db: AsyncSession, entry_id: int, body: dict, updated_by: str) -> dict:
    row = await _get_by_id(db, entry_id)
    if row is None or row.deleted_at is not None:
        raise KeyError(entry_id)
    merged = _to_dict(row)
    merged.update({k: v for k, v in body.items() if v is not None and k != "id"})
    data = validate_entry(merged)
    for k, v in data.items():
        setattr(row, k, v)
    row.updated_at = _now()
    row.updated_by = updated_by
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise ValueError(f"关键词 {data['keyword']} 已存在")
    await db.refresh(row)
    return _to_dict(row)


async def delete_watchlist_entry(db: AsyncSession, entry_id: int) -> bool:
    row = await _get_by_id(db, entry_id)
    if row is None or row.deleted_at is not None:
        return False
    row.deleted_at = _now()
    row.enabled = 0
    row.updated_at = row.deleted_at
    await db.commit()
    return True


async def list_runtime_watchlist(db: AsyncSession) -> list[dict]:
    rows = (await db.execute(
        sa.select(KeywordWatchlist).where(KeywordWatchlist.enabled == 1, KeywordWatchlist.deleted_at.is_(None))
        .order_by(KeywordWatchlist.sort_order, KeywordWatchlist.id)
    )).scalars().all()
    return [{
        "keyword": r.keyword, "category": r.category or "topic",
        "threshold": r.threshold if r.threshold is not None else 2.0,
        "interval_minutes": r.interval_minutes if r.interval_minutes else 360,
    } for r in rows]
