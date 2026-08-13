"""scheduler_service — 限流/调度验证：模拟落库、历史查询、契约校验。"""
import datetime
import json

import sqlalchemy as sa
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import ModelPreset, SchedulerVerificationRun
from services import scheduler_simulator


async def ensure_scheduler_verification_table(db: AsyncSession):
    """幂等建表（新表独立，无存量数据迁移）。"""
    await db.execute(sa.text(
        "CREATE TABLE IF NOT EXISTS scheduler_verification_runs ("
        "id INTEGER PRIMARY KEY AUTOINCREMENT,"
        "preset_id VARCHAR, rpm INTEGER NOT NULL, max_concurrent INTEGER NOT NULL,"
        "limit_per_5h INTEGER, request_count INTEGER NOT NULL,"
        "request_duration_ms INTEGER DEFAULT 0, arrival_interval_ms INTEGER DEFAULT 0,"
        "inject_429_at INTEGER, exceed_5h INTEGER DEFAULT 0,"
        "simulated INTEGER DEFAULT 1, engine VARCHAR DEFAULT 'python-simulator',"
        "client_id VARCHAR DEFAULT '', metrics_json TEXT DEFAULT '{}',"
        "assertions_json TEXT DEFAULT '[]', timeline_json TEXT DEFAULT '[]',"
        "status VARCHAR DEFAULT 'completed',"
        "created_at VARCHAR, created_by VARCHAR DEFAULT '')"
    ))
    await db.commit()


def _to_run_dict(row: SchedulerVerificationRun, with_timeline: bool = False) -> dict:
    d = {
        "id": row.id,
        "preset_id": row.preset_id,
        "rpm": row.rpm,
        "max_concurrent": row.max_concurrent,
        "limit_per_5h": row.limit_per_5h,
        "request_count": row.request_count,
        "request_duration_ms": row.request_duration_ms,
        "arrival_interval_ms": row.arrival_interval_ms,
        "inject_429_at": row.inject_429_at,
        "exceed_5h": bool(row.exceed_5h),
        "simulated": bool(row.simulated),
        "engine": row.engine,
        "client_id": row.client_id,
        "metrics": json.loads(row.metrics_json or "{}"),
        "assertions": json.loads(row.assertions_json or "[]"),
        "status": row.status,
        "created_at": row.created_at,
        "created_by": row.created_by,
    }
    if with_timeline:
        d["timeline"] = json.loads(row.timeline_json or "[]")
    return d


def _validate_run_payload(body: dict) -> dict:
    """运行参数校验：直接委托模拟器 _validate；preset_id/client_id/engine 为记录字段。"""
    sim_params = {
        "rpm": body.get("rpm"),
        "max_concurrent": body.get("max_concurrent"),
        "limit_per_5h": body.get("limit_per_5h"),
        "request_count": body.get("request_count"),
        "request_duration_ms": body.get("request_duration_ms", 0),
        "arrival_interval_ms": body.get("arrival_interval_ms", 0),
        "inject_429_at": body.get("inject_429_at"),
        "exceed_5h": bool(body.get("exceed_5h", False)),
    }
    cfg = scheduler_simulator._validate(sim_params)
    return {
        "config": cfg,
        "preset_id": (str(body["preset_id"]).strip() if body.get("preset_id") else None),
        "simulated": int(bool(body.get("simulated", True))),
        "engine": str(body.get("engine", "python-simulator")).strip()[:64] or "python-simulator",
        "client_id": str(body.get("client_id", "")).strip()[:128],
        "created_by": str(body.get("created_by", "admin")).strip()[:64] or "admin",
    }


async def create_verification_run(db: AsyncSession, body: dict) -> dict:
    parsed = _validate_run_payload(body)
    if parsed["simulated"]:
        result = scheduler_simulator.simulate(parsed["config"])
    else:
        # 桌面端真实自检上报：优先使用上报的 metrics/assertions/timeline（engine=real-governor 结果），
        # 不再用模拟器重算覆盖，保证「验证记录」里真实自检数据保真。
        metrics = body.get("metrics")
        timeline = body.get("timeline")
        if not isinstance(metrics, dict) or not isinstance(timeline, list):
            raise ValueError("simulated=false 上报必须携带 metrics 与 timeline")
        required_metrics = (
            "total_duration_ms", "throughput_per_min", "max_concurrent_observed",
            "max_queue_wait_ms", "rate_limited_count", "cooldown_count", "quota_exceeded_count",
        )
        missing = [k for k in required_metrics if k not in metrics]
        if missing:
            raise ValueError("上报 metrics 缺少字段: " + ", ".join(missing))
        assertions = body.get("assertions")
        if assertions is not None and not isinstance(assertions, list):
            raise ValueError("assertions 必须是数组")
        result = {
            "metrics": metrics,
            "assertions": assertions if isinstance(assertions, list) else [],
            "timeline": timeline,
            "config": parsed["config"],
        }
    now = datetime.datetime.utcnow().isoformat()
    row = SchedulerVerificationRun(
        preset_id=parsed["preset_id"],
        rpm=result["config"]["rpm"],
        max_concurrent=result["config"]["max_concurrent"],
        limit_per_5h=result["config"]["limit_per_5h"],
        request_count=result["config"]["request_count"],
        request_duration_ms=result["config"]["request_duration_ms"],
        arrival_interval_ms=result["config"]["arrival_interval_ms"],
        inject_429_at=result["config"]["inject_429_at"],
        exceed_5h=int(result["config"]["exceed_5h"]),
        simulated=parsed["simulated"],
        engine=parsed["engine"],
        client_id=parsed["client_id"],
        metrics_json=json.dumps(result["metrics"], ensure_ascii=False),
        assertions_json=json.dumps(result["assertions"], ensure_ascii=False),
        timeline_json=json.dumps(result["timeline"], ensure_ascii=False),
        status="completed",
        created_at=now,
        created_by=parsed["created_by"],
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _to_run_dict(row, with_timeline=True)


async def list_verification_runs(
    db: AsyncSession, preset_id: str | None = None, simulated: bool | None = None,
    limit: int = 20, offset: int = 0,
) -> list[dict]:
    stmt = select(SchedulerVerificationRun)
    if preset_id:
        stmt = stmt.where(SchedulerVerificationRun.preset_id == preset_id)
    if simulated is not None:
        stmt = stmt.where(SchedulerVerificationRun.simulated == int(simulated))
    stmt = stmt.order_by(SchedulerVerificationRun.created_at.desc()).limit(limit).offset(offset)
    rows = (await db.execute(stmt)).scalars().all()
    return [_to_run_dict(r) for r in rows]


async def get_verification_run(db: AsyncSession, run_id: int) -> dict | None:
    row = (await db.execute(
        select(SchedulerVerificationRun).where(SchedulerVerificationRun.id == run_id)
    )).scalar_one_or_none()
    if not row:
        return None
    return _to_run_dict(row, with_timeline=True)


async def contract_check(db: AsyncSession) -> list[dict]:
    """批量契约校验：范围、default∈models、并发换算（与桌面端 clamp(round(rpm/10),1,4) 一致）。"""
    rows = (await db.execute(
        select(ModelPreset).where(ModelPreset.is_visible == 1).order_by(ModelPreset.category, ModelPreset.name)
    )).scalars().all()
    out = []
    for row in rows:
        models = json.loads(row.models or "[]")
        rpm = row.rate_per_minute
        limit5h = row.limit_per_5h
        rules = []
        rules.append({
            "rule": "rate_per_minute 范围",
            "pass": rpm is None or (isinstance(rpm, int) and 1 <= rpm <= scheduler_simulator.MAX_RPM),
            "actual": rpm, "expected": "空 或 [1,100000]",
        })
        rules.append({
            "rule": "limit_per_5h 范围",
            "pass": limit5h is None or (isinstance(limit5h, int) and 1 <= limit5h <= scheduler_simulator.MAX_LIMIT_PER_5H),
            "actual": limit5h, "expected": "空 或 [1,10000000]",
        })
        rules.append({
            "rule": "default_model ∈ models",
            "pass": (not row.default_model) or (row.default_model in models),
            "actual": row.default_model, "expected": "空 或 ∈ models",
        })
        mc = scheduler_simulator.clamp_concurrency(rpm) if isinstance(rpm, int) and rpm >= 1 else None
        rules.append({
            "rule": "并发换算 clamp(round(rpm/10),1,4)",
            "pass": mc is not None,
            "actual": mc, "expected": "rpm 有值时应可换算",
        })
        out.append({
            "preset_id": row.id,
            "name": row.name,
            "category": row.category,
            "rpm": rpm,
            "limit_per_5h": limit5h,
            "max_concurrent": mc,
            "rules": rules,
        })
    return out
