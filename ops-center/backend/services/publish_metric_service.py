"""Publish metric service — 发布指标日聚合（ingest/汇总，运营看板）。"""
import datetime
import re

import sqlalchemy as sa
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from models import PublishMetricDaily, PublishReportBatch

_PLATFORM_RE = re.compile(r"^[A-Za-z0-9_.-]{1,64}$")
MAX_ITEMS = 500


def _now() -> str:
    return datetime.datetime.utcnow().isoformat()


def _validate_item(item: dict) -> tuple[dict | None, str | None]:
    """逐条校验：返回 (有效数据, 错误信息)；非法条目由调用方跳过并记录原因。"""
    if not isinstance(item, dict):
        return None, "上报项必须是对象"
    date = str(item.get("date") or "").strip()
    try:
        datetime.date.fromisoformat(date)
    except (TypeError, ValueError):
        return None, "date 必须是真实日期 YYYY-MM-DD"
    platform = str(item.get("platform") or "").strip()
    if not _PLATFORM_RE.match(platform):
        return None, "platform 必须是字母/数字/点/下划线/短横线（1-64 位）"

    def _nonneg_int(key):
        v = item.get(key, 0)
        if v is None:
            return 0
        if isinstance(v, bool):
            return None
        if isinstance(v, float):
            if not v.is_integer() or v < 0:
                return None
            return int(v)
        if isinstance(v, int):
            if v < 0:
                return None
            return v
        return None

    publish_count = _nonneg_int("publish_count")
    ok_count = _nonneg_int("ok_count")
    fail_count = _nonneg_int("fail_count")
    if publish_count is None or ok_count is None or fail_count is None:
        return None, "计数必须是非负整数"
    if publish_count < ok_count + fail_count:
        return None, "publish_count 不能小于 ok+fail 之和"
    return {"date": date, "platform": platform,
            "publish_count": publish_count, "ok_count": ok_count, "fail_count": fail_count}, None


async def ingest_publish_metrics(db: AsyncSession, body: dict) -> dict:
    """按 (日期,客户端,平台) 原子 upsert 累加；批次幂等（client_id+report_id 唯一）。"""
    items = body.get("items")
    if not isinstance(items, list) or not items:
        raise ValueError("items 必须是非空数组")
    if len(items) > MAX_ITEMS:
        raise ValueError(f"items 过多（≤{MAX_ITEMS}）")
    client_id = str(body.get("client_id") or "").strip()[:64]
    report_id = str(body.get("report_id") or "").strip()[:128]
    now = _now()

    # 批次幂等：同一 client_id+report_id 重复上报直接返回（不重复累加）
    if report_id:
        existing_batch = (await db.execute(sa.select(PublishReportBatch).where(
            PublishReportBatch.client_id == client_id,
            PublishReportBatch.report_id == report_id,
        ))).scalar_one_or_none()
        if existing_batch is not None:
            return {"ingested": 0, "already_reported": True, "invalid": [], "invalid_count": 0}

    ingested = 0
    invalid = []
    for raw in items:
        it, err = _validate_item(raw)
        if err is not None:
            invalid.append({"reason": err})
            continue
        # SQLite 原子 upsert：ON CONFLICT DO UPDATE 累加
        stmt = sa.text(
            "INSERT INTO publish_metrics_daily (usage_date, client_id, platform, publish_count, ok_count, fail_count, updated_at) "
            "VALUES (:date, :client_id, :platform, :pc, :oc, :fc, :updated_at) "
            "ON CONFLICT(usage_date, client_id, platform) DO UPDATE SET "
            "publish_count = publish_metrics_daily.publish_count + excluded.publish_count, "
            "ok_count = publish_metrics_daily.ok_count + excluded.ok_count, "
            "fail_count = publish_metrics_daily.fail_count + excluded.fail_count, "
            "updated_at = excluded.updated_at"
        )
        await db.execute(stmt, {
            "date": it["date"], "client_id": client_id, "platform": it["platform"],
            "pc": it["publish_count"], "oc": it["ok_count"], "fc": it["fail_count"], "updated_at": now,
        })
        ingested += 1

    if report_id:
        db.add(PublishReportBatch(client_id=client_id, report_id=report_id, ingested_at=now))
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        # 批次唯一冲突：视为已上报（幂等）
        return {"ingested": 0, "already_reported": True, "invalid": invalid, "invalid_count": len(invalid)}
    return {"ingested": ingested, "already_reported": False, "invalid": invalid, "invalid_count": len(invalid)}


async def publish_summary(db: AsyncSession, days: int = 30) -> dict:
    n = max(1, min(days, 90))
    since = (datetime.date.today() - datetime.timedelta(days=n - 1)).isoformat()
    rows = (await db.execute(
        sa.select(PublishMetricDaily).where(PublishMetricDaily.usage_date >= since)
    )).scalars().all()

    totals = {"publish_count": 0, "ok_count": 0, "fail_count": 0, "success_rate": 0.0, "clients": 0, "platforms": 0}
    by_date: dict[str, dict] = {}
    by_platform: dict[str, dict] = {}
    clients = set()
    for r in rows:
        totals["publish_count"] += r.publish_count
        totals["ok_count"] += r.ok_count
        totals["fail_count"] += r.fail_count
        clients.add(r.client_id)
        bd = by_date.setdefault(r.usage_date, {"date": r.usage_date, "publish_count": 0, "ok_count": 0, "fail_count": 0})
        bd["publish_count"] += r.publish_count
        bd["ok_count"] += r.ok_count
        bd["fail_count"] += r.fail_count
        bp = by_platform.setdefault(r.platform or "unknown", {"platform": r.platform or "unknown", "publish_count": 0, "ok_count": 0, "fail_count": 0, "success_rate": 0.0})
        bp["publish_count"] += r.publish_count
        bp["ok_count"] += r.ok_count
        bp["fail_count"] += r.fail_count

    totals["clients"] = len(clients)
    totals["platforms"] = len(by_platform)
    if totals["publish_count"] > 0:
        totals["success_rate"] = round(totals["ok_count"] / totals["publish_count"] * 100, 1)
    for bp in by_platform.values():
        if bp["publish_count"] > 0:
            bp["success_rate"] = round(bp["ok_count"] / bp["publish_count"] * 100, 1)

    return {
        "days": n,
        "totals": totals,
        "by_date": sorted(by_date.values(), key=lambda d: d["date"]),
        "by_platform": sorted(by_platform.values(), key=lambda p: -p["publish_count"]),
    }
