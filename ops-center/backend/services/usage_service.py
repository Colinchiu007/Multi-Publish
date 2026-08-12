"""Model usage service — 桌面端脱敏用量上报（ingest）与运营看板汇总（summary）。

ingest：按 (usage_date, client_id, provider_id, action) upsert 累加，幂等（重试不翻倍）。
summary：totals / by_date / by_provider / by_action。
"""
import datetime
import json
import re

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from models import ModelPreset, ModelUsageBatch, ModelUsageDaily

_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
MAX_ITEMS = 500
_LATENCY_KEYS = ("lt1s", "1to3s", "3to10s", "gt10s")


def _now() -> str:
    return datetime.datetime.utcnow().isoformat()


def _validate_item(item: dict) -> dict:
    if not isinstance(item, dict):
        raise ValueError("上报项必须是对象")
    usage_date = str(item.get("usage_date") or "").strip()
    try:
        datetime.date.fromisoformat(usage_date)
    except ValueError:
        raise ValueError("usage_date 必须是合法的 YYYY-MM-DD 日期")
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
        if isinstance(v, bool):
            raise ValueError(f"{key} 必须是整数")
        if isinstance(v, float) and not v.is_integer():
            raise ValueError(f"{key} 必须是整数")
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

    calls = _nonneg_int("calls")
    ok_count = _nonneg_int("ok_count")
    fail_count = _nonneg_int("fail_count")
    if ok_count + fail_count > calls:
        raise ValueError("ok_count + fail_count 不能大于 calls")

    return {
        "usage_date": usage_date,
        "client_id": str(item.get("client_id") or "")[:64],
        "provider_id": provider_id,
        "category": str(item.get("category") or "llm")[:32],
        "action": action,
        "calls": calls,
        "ok_count": ok_count,
        "fail_count": fail_count,
        "ratelimit_count": _nonneg_int("ratelimit_count"),
        "latency_ms": _nonneg_int("latency_ms"),
        "tokens_in": _nonneg_int("tokens_in"),
        "tokens_out": _nonneg_int("tokens_out"),
        "cost": _nonneg_float("cost"),
        "latency_buckets": json.dumps(buckets, ensure_ascii=False),
        # 调度健康度（可选字段，缺失按 0，旧客户端兼容）
        "queued_count": _nonneg_int("queued_count"),
        "cooldown_count": _nonneg_int("cooldown_count"),
        "queue_wait_ms": _nonneg_int("queue_wait_ms"),
        "cooldown_wait_ms": _nonneg_int("cooldown_wait_ms"),
    }


async def ingest_usage(db: AsyncSession, body: dict) -> dict:
    items = body.get("items", []) if isinstance(body, dict) else []
    batch_id = str(body.get("batch_id") or "").strip()[:200]
    if not isinstance(items, list):
        raise ValueError("items 必须是数组")
    if len(items) > MAX_ITEMS:
        raise ValueError(f"单次上报不能超过 {MAX_ITEMS} 条")
    validated = [_validate_item(i) for i in items]
    if not validated:
        return {"ingested": 0}
    client_id = validated[0]["client_id"]
    now = _now()

    async with db.begin():
        # 批次去重：同 (client_id, batch_id) 的重复提交（超时重试）直接跳过，不重复累加
        if batch_id:
            inserted = await db.execute(
                sa.dialects.sqlite.insert(ModelUsageBatch)
                .values(client_id=client_id, batch_id=batch_id, ingested_at=now)
                .on_conflict_do_nothing(index_elements=["client_id", "batch_id"])
            )
            if inserted.rowcount == 0:
                return {"ingested": 0, "duplicate": True}

        # 原子 upsert：INSERT ... ON CONFLICT(唯一键) DO UPDATE 累加
        stmt = sa.dialects.sqlite.insert(ModelUsageDaily).values([
            {
                "usage_date": it["usage_date"], "client_id": it["client_id"],
                "provider_id": it["provider_id"], "category": it["category"], "action": it["action"],
                "calls": it["calls"], "ok_count": it["ok_count"], "fail_count": it["fail_count"],
                "ratelimit_count": it["ratelimit_count"], "latency_ms": it["latency_ms"],
                "tokens_in": it["tokens_in"], "tokens_out": it["tokens_out"], "cost": it["cost"],
                "latency_buckets": it["latency_buckets"],
                "queued_count": it["queued_count"], "cooldown_count": it["cooldown_count"],
                "queue_wait_ms": it["queue_wait_ms"], "cooldown_wait_ms": it["cooldown_wait_ms"],
                "updated_at": now,
            }
            for it in validated
        ])
        stmt = stmt.on_conflict_do_update(
            index_elements=["usage_date", "client_id", "provider_id", "action"],
            set_={
                "calls": ModelUsageDaily.calls + stmt.excluded.calls,
                "ok_count": ModelUsageDaily.ok_count + stmt.excluded.ok_count,
                "fail_count": ModelUsageDaily.fail_count + stmt.excluded.fail_count,
                "ratelimit_count": ModelUsageDaily.ratelimit_count + stmt.excluded.ratelimit_count,
                "latency_ms": ModelUsageDaily.latency_ms + stmt.excluded.latency_ms,
                "tokens_in": ModelUsageDaily.tokens_in + stmt.excluded.tokens_in,
                "tokens_out": ModelUsageDaily.tokens_out + stmt.excluded.tokens_out,
                "cost": ModelUsageDaily.cost + stmt.excluded.cost,
                "queued_count": ModelUsageDaily.queued_count + stmt.excluded.queued_count,
                "cooldown_count": ModelUsageDaily.cooldown_count + stmt.excluded.cooldown_count,
                "queue_wait_ms": ModelUsageDaily.queue_wait_ms + stmt.excluded.queue_wait_ms,
                "cooldown_wait_ms": ModelUsageDaily.cooldown_wait_ms + stmt.excluded.cooldown_wait_ms,
                "updated_at": now,
            },
        )
        await db.execute(stmt)
    return {"ingested": len(validated)}


async def usage_summary(db: AsyncSession, days: int = 30) -> dict:
    days = max(1, min(90, int(days)))
    today = datetime.datetime.utcnow().date()
    start = (today - datetime.timedelta(days=days - 1)).isoformat()
    rows = (await db.execute(
        sa.select(ModelUsageDaily).where(ModelUsageDaily.usage_date >= start)
    )).scalars().all()

    totals = {"calls": 0, "ok": 0, "fail": 0, "ratelimit": 0, "latency_ms": 0, "tokens_in": 0, "tokens_out": 0, "cost": 0.0}
    by_date = {}
    by_provider = {}
    by_action = {}
    # 调度健康度：预算利用率需要 rpm 预算（model_presets 目录）
    rpm_budget = {}
    preset_rows = (await db.execute(sa.select(ModelPreset))).scalars().all()
    for pr in preset_rows:
        if isinstance(pr.rate_per_minute, int) and pr.rate_per_minute >= 1:
            rpm_budget[pr.id] = pr.rate_per_minute
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

        p = by_provider.setdefault(r.provider_id, {
            "calls": 0, "fail": 0, "ratelimit": 0, "cost": 0.0, "latency_ms": 0,
            "queued_count": 0, "cooldown_count": 0, "queue_wait_ms": 0, "cooldown_wait_ms": 0,
        })
        p["calls"] += r.calls or 0
        p["fail"] += r.fail_count or 0
        p["ratelimit"] += r.ratelimit_count or 0
        p["cost"] += r.cost or 0.0
        p["latency_ms"] += r.latency_ms or 0
        p["queued_count"] += r.queued_count or 0
        p["cooldown_count"] += r.cooldown_count or 0
        p["queue_wait_ms"] += r.queue_wait_ms or 0
        p["cooldown_wait_ms"] += r.cooldown_wait_ms or 0

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
        "by_date": [
            {"date": (today - datetime.timedelta(days=i)).isoformat(),
             **by_date.get((today - datetime.timedelta(days=i)).isoformat(), {"calls": 0, "fail": 0, "ok": 0})}
            for i in range(days - 1, -1, -1)
        ],
        "by_provider": [
            {
                "provider_id": k, "calls": v["calls"], "fail": v["fail"], "ratelimit": v["ratelimit"],
                "cost": round(v["cost"], 4),
                "avg_latency_ms": round(v["latency_ms"] / v["calls"], 1) if v["calls"] else 0,
                # 调度健康度（P1）：429 率、排队/冷却事件、预算利用率（实测每分钟调用 ÷ rpm 预算）
                "ratelimit_rate": round(v["ratelimit"] / v["calls"] * 100, 2) if v["calls"] else 0.0,
                "queued_count": v["queued_count"],
                "cooldown_count": v["cooldown_count"],
                "avg_queue_wait_ms": round(v["queue_wait_ms"] / v["queued_count"], 1) if v["queued_count"] else 0,
                "avg_cooldown_wait_ms": round(v["cooldown_wait_ms"] / v["cooldown_count"], 1) if v["cooldown_count"] else 0,
                "rpm_budget": rpm_budget.get(k),
                "utilization": round(v["calls"] / (days * 1440) / rpm_budget[k] * 100, 2)
                if rpm_budget.get(k) else None,
            }
            for k, v in sorted(by_provider.items(), key=lambda kv: -kv[1]["calls"])
        ],
        "by_action": [{"action": k, **v} for k, v in sorted(by_action.items(), key=lambda kv: -kv[1]["calls"])],
    }
