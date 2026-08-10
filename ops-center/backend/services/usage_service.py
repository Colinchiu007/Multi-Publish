"""Model usage service — 桌面端脱敏用量上报（ingest）与运营看板汇总（summary）。

ingest：按 (usage_date, client_id, provider_id, action) upsert 累加，幂等（重试不翻倍）。
summary：totals / by_date / by_provider / by_action。
"""
import datetime
import json
import re

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from models import ModelUsageDaily

_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
MAX_ITEMS = 500
_LATENCY_KEYS = ("lt1s", "1to3s", "3to10s", "gt10s")


def _now() -> str:
    return datetime.datetime.utcnow().isoformat()


def _validate_item(item: dict) -> dict:
    if not isinstance(item, dict):
        raise ValueError("上报项必须是对象")
    usage_date = str(item.get("usage_date") or "").strip()
    if not _DATE_RE.match(usage_date):
        raise ValueError("usage_date 必须是 YYYY-MM-DD")
    provider_id = str(item.get("provider_id") or "").strip()
    action = str(item.get("action") or "").strip()
    if not provider_id or not action:
        raise ValueError("provider_id / action 不能为空")
    if len(provider_id) > 100 or len(action) > 50:
        raise ValueError("provider_id / action 过长")

    def _nonneg_int(key: str) -> int:
        v = item.get(key)
        if v is None or str(v).strip() == "":
            return 0
        try:
            n = int(v)
        except (TypeError, ValueError):
            raise ValueError(f"{key} 必须是整数")
        if n < 0:
            raise ValueError(f"{key} 不能为负数")
        return n

    def _nonneg_float(key: str) -> float:
        v = item.get(key)
        if v is None or str(v).strip() == "":
            return 0.0
        try:
            n = float(v)
        except (TypeError, ValueError):
            raise ValueError(f"{key} 必须是数字")
        if n < 0:
            raise ValueError(f"{key} 不能为负数")
        return n

    buckets_raw = item.get("latency_buckets") or {}
    if isinstance(buckets_raw, str):
        try:
            buckets_raw = json.loads(buckets_raw)
        except json.JSONDecodeError:
            raise ValueError("latency_buckets 必须是 JSON 对象")
    if not isinstance(buckets_raw, dict):
        raise ValueError("latency_buckets 必须是对象")
    buckets = {}
    for k in _LATENCY_KEYS:
        buckets[k] = max(0, int(buckets_raw.get(k, 0) or 0))

    return {
        "usage_date": usage_date,
        "client_id": str(item.get("client_id") or "")[:64],
        "provider_id": provider_id,
        "category": str(item.get("category") or "llm")[:32],
        "action": action,
        "calls": _nonneg_int("calls"),
        "ok_count": _nonneg_int("ok_count"),
        "fail_count": _nonneg_int("fail_count"),
        "ratelimit_count": _nonneg_int("ratelimit_count"),
        "latency_ms": _nonneg_int("latency_ms"),
        "tokens_in": _nonneg_int("tokens_in"),
        "tokens_out": _nonneg_int("tokens_out"),
        "cost": _nonneg_float("cost"),
        "latency_buckets": json.dumps(buckets, ensure_ascii=False),
    }


async def ingest_usage(db: AsyncSession, items: list) -> dict:
    if not isinstance(items, list):
        raise ValueError("items 必须是数组")
    if len(items) > MAX_ITEMS:
        raise ValueError(f"单次上报不能超过 {MAX_ITEMS} 条")
    validated = [_validate_item(i) for i in items]
    if not validated:
        return {"ingested": 0}
    now = _now()
    for item in validated:
        row = (await db.execute(sa.select(ModelUsageDaily).where(
            ModelUsageDaily.usage_date == item["usage_date"],
            ModelUsageDaily.client_id == item["client_id"],
            ModelUsageDaily.provider_id == item["provider_id"],
            ModelUsageDaily.action == item["action"],
        ))).scalar_one_or_none()
        if row is None:
            row = ModelUsageDaily(
                usage_date=item["usage_date"], client_id=item["client_id"],
                provider_id=item["provider_id"], category=item["category"], action=item["action"],
                calls=item["calls"], ok_count=item["ok_count"], fail_count=item["fail_count"],
                ratelimit_count=item["ratelimit_count"], latency_ms=item["latency_ms"],
                tokens_in=item["tokens_in"], tokens_out=item["tokens_out"], cost=item["cost"],
                latency_buckets=item["latency_buckets"], updated_at=now,
            )
            db.add(row)
        else:
            row.calls += item["calls"]
            row.ok_count += item["ok_count"]
            row.fail_count += item["fail_count"]
            row.ratelimit_count += item["ratelimit_count"]
            row.latency_ms += item["latency_ms"]
            row.tokens_in += item["tokens_in"]
            row.tokens_out += item["tokens_out"]
            row.cost += item["cost"]
            old_buckets = {}
            try:
                old_buckets = json.loads(row.latency_buckets or "{}")
            except json.JSONDecodeError:
                old_buckets = {}
            new_buckets = json.loads(item["latency_buckets"] or "{}")
            merged = {}
            for k in _LATENCY_KEYS:
                merged[k] = int(old_buckets.get(k, 0) or 0) + int(new_buckets.get(k, 0) or 0)
            row.latency_buckets = json.dumps(merged, ensure_ascii=False)
            row.updated_at = now
    await db.commit()
    return {"ingested": len(validated)}


async def usage_summary(db: AsyncSession, days: int = 30) -> dict:
    days = max(1, min(90, int(days)))
    start = (datetime.date.today() - datetime.timedelta(days=days - 1)).isoformat()
    rows = (await db.execute(
        sa.select(ModelUsageDaily).where(ModelUsageDaily.usage_date >= start)
    )).scalars().all()

    totals = {"calls": 0, "ok": 0, "fail": 0, "ratelimit": 0, "latency_ms": 0, "tokens_in": 0, "tokens_out": 0, "cost": 0.0}
    by_date = {}
    by_provider = {}
    by_action = {}
    for r in rows:
        totals["calls"] += r.calls or 0
        totals["ok"] += r.ok_count or 0
        totals["fail"] += r.fail_count or 0
        totals["ratelimit"] += r.ratelimit_count or 0
        totals["latency_ms"] += r.latency_ms or 0
        totals["tokens_in"] += r.tokens_in or 0
        totals["tokens_out"] += r.tokens_out or 0
        totals["cost"] += r.cost or 0.0

        d = by_date.setdefault(r.usage_date, {"calls": 0, "fail": 0, "ok": 0})
        d["calls"] += r.calls or 0
        d["fail"] += r.fail_count or 0
        d["ok"] += r.ok_count or 0

        p = by_provider.setdefault(r.provider_id, {"calls": 0, "fail": 0, "ratelimit": 0, "cost": 0.0, "latency_ms": 0})
        p["calls"] += r.calls or 0
        p["fail"] += r.fail_count or 0
        p["ratelimit"] += r.ratelimit_count or 0
        p["cost"] += r.cost or 0.0
        p["latency_ms"] += r.latency_ms or 0

        a = by_action.setdefault(r.action, {"calls": 0, "fail": 0, "ok": 0})
        a["calls"] += r.calls or 0
        a["fail"] += r.fail_count or 0
        a["ok"] += r.ok_count or 0

    success_rate = (totals["ok"] / totals["calls"] * 100) if totals["calls"] else 0.0
    avg_latency = (totals["latency_ms"] / totals["calls"]) if totals["calls"] else 0.0
    return {
        "days": days,
        "totals": {
            "calls": totals["calls"],
            "ok": totals["ok"],
            "fail": totals["fail"],
            "ratelimit": totals["ratelimit"],
            "success_rate": round(success_rate, 2),
            "avg_latency_ms": round(avg_latency, 1),
            "tokens_in": totals["tokens_in"],
            "tokens_out": totals["tokens_out"],
            "cost": round(totals["cost"], 4),
            "active_providers": len(by_provider),
        },
        "by_date": [{"date": k, **v} for k, v in sorted(by_date.items())],
        "by_provider": [
            {"provider_id": k, "calls": v["calls"], "fail": v["fail"], "ratelimit": v["ratelimit"],
             "cost": round(v["cost"], 4), "avg_latency_ms": round(v["latency_ms"] / v["calls"], 1) if v["calls"] else 0}
            for k, v in sorted(by_provider.items(), key=lambda kv: -kv[1]["calls"])
        ],
        "by_action": [{"action": k, **v} for k, v in sorted(by_action.items(), key=lambda kv: -kv[1]["calls"])],
    }
