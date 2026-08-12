"""Diagnostics service — 视频创作失败诊断上报（ingest）与运营看板汇总（summary/samples）。

ingest：daily 桶按 (diag_date, client_id, pipeline) upsert 累加（幂等）；
        samples 按 (client_id, run_id) 去重；批次按 (client_id, batch_id) 去重；
        每次 ingest 顺带滚动清理超过 RETENTION_DAYS 的样本。
summary：totals / by_date / by_stage / by_failure_type / by_cause / by_client / env / alerts。
"""
import datetime
import json
from datetime import timezone

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from models import DiagnosticsBatch, DiagnosticsDaily, DiagnosticsSample

_DATE_RE = "^\\d{4}-\\d{2}-\\d{2}$"
MAX_DAILY = 500
MAX_SAMPLES = 200
RETENTION_DAYS = 30
DAILY_RETENTION_DAYS = 90

# 与桌面端 taxonomy / root-cause-map 对齐（fail-closed：未知枚举拒绝该条）
KNOWN_STAGES = {"preflight", "split", "domain_enrich", "optimize", "generate_assets", "compose", "publish", "scene_context", "select_video_scenes", "unknown"}
KNOWN_FAILURE_TYPES = {"validation", "transient", "provider", "infrastructure", "timeout", "resource", "media", "content_policy", "partial_degradation", "unknown"}
KNOWN_SEVERITY = {"blocker", "major", "minor", "info", "unknown"}
KNOWN_RECOVERABILITY = {"retryable", "degradable", "checkpoint", "needs_user_input", "permanent", "unknown"}
KNOWN_STATUS = {"completed", "failed", "cancelled"}

DISK_LOW_BYTES = 5 * 1024 * 1024 * 1024  # 5GB
SIDECAR_CAUSE_IDS = {"sidecar_unavailable", "sidecar_stale_instance"}

# 告警阈值
ALERT_FAILURE_RATE_PCT = 20.0
ALERT_COMPOSE_SHARE = 0.5
ALERT_SIDECAR_SHARE = 0.2


def _now() -> str:
    return datetime.datetime.now(timezone.utc).isoformat()


def _int_nonneg(key: str, item: dict) -> int:
    v = item.get(key)
    if v is None or str(v).strip() == "":
        return 0
    if isinstance(v, bool):
        raise ValueError(f"{key} 必须是整数")
    try:
        n = int(v)
    except (TypeError, ValueError):
        raise ValueError(f"{key} 必须是整数")
    if n < 0:
        raise ValueError(f"{key} 不能为负数")
    return n


def _validate_date(value: str) -> str:
    v = str(value or "").strip()
    if len(v) != 10:
        raise ValueError("diag_date 必须是合法的 YYYY-MM-DD 日期")
    try:
        datetime.date.fromisoformat(v)
    except ValueError:
        raise ValueError("diag_date 必须是合法的 YYYY-MM-DD 日期")
    return v


def _validate_daily(item: dict) -> dict:
    if not isinstance(item, dict):
        raise ValueError("daily 上报项必须是对象")
    diag_date = _validate_date(item.get("diag_date"))
    pipeline = str(item.get("pipeline") or "")[:80]
    if not pipeline:
        raise ValueError("pipeline 不能为空")
    return {
        "diag_date": diag_date,
        "client_id": str(item.get("client_id") or "")[:64],
        "pipeline": pipeline,
        "total_runs": _int_nonneg("total_runs", item),
        "failed_runs": _int_nonneg("failed_runs", item),
        "success_runs": _int_nonneg("success_runs", item),
        "cancelled_runs": _int_nonneg("cancelled_runs", item),
    }


def _validate_sample(sample: dict) -> dict:
    if not isinstance(sample, dict):
        raise ValueError("样本必须是对象")
    run_id = str(sample.get("run_id") or "")[:120]
    if not run_id:
        raise ValueError("run_id 不能为空")
    diag_date = _validate_date(sample.get("diag_date"))
    stage = str(sample.get("stage") or "unknown")
    failure_type = str(sample.get("failure_type") or "unknown")
    severity = str(sample.get("severity") or "unknown")
    recoverability = str(sample.get("recoverability") or "unknown")
    status = str(sample.get("status") or "failed")
    if stage not in KNOWN_STAGES:
        raise ValueError(f"未知 stage: {stage}")
    if failure_type not in KNOWN_FAILURE_TYPES:
        raise ValueError(f"未知 failure_type: {failure_type}")
    if severity not in KNOWN_SEVERITY:
        raise ValueError(f"未知 severity: {severity}")
    if recoverability not in KNOWN_RECOVERABILITY:
        raise ValueError(f"未知 recoverability: {recoverability}")
    if status != "failed":
        raise ValueError("样本 status 必须为 failed")

    # env 白名单：仅保留 disk_free_bytes（数字）与 python_backend（布尔），丢弃一切未知键
    env_raw = sample.get("env") or {}
    env = {}
    if isinstance(env_raw, dict):
        disk = env_raw.get("disk_free_bytes")
        if disk is not None:
            try:
                n = float(disk)
                if n >= 0:
                    env["disk_free_bytes"] = int(n)
            except (TypeError, ValueError):
                pass
        pb = env_raw.get("python_backend")
        if isinstance(pb, bool):
            env["python_backend"] = pb

    return {
        "diag_date": diag_date,
        "client_id": str(sample.get("client_id") or "")[:64],
        "run_id": run_id,
        "pipeline": str(sample.get("pipeline") or "")[:80],
        "status": status,
        "stage": stage,
        "failure_type": failure_type,
        "severity": severity,
        "recoverability": recoverability,
        "cause_id": str(sample.get("cause_id") or "")[:80],
        "duration_ms": _int_nonneg("duration_ms", sample),
        "env_json": json.dumps(env, ensure_ascii=False),
    }


async def ingest_diagnostics(db: AsyncSession, body: dict) -> dict:
    daily = body.get("daily", []) if isinstance(body, dict) else []
    samples = body.get("samples", []) if isinstance(body, dict) else []
    batch_id = str(body.get("batch_id") or "").strip()[:200]
    if not isinstance(daily, list) or not isinstance(samples, list):
        raise ValueError("daily / samples 必须是数组")
    if len(daily) > MAX_DAILY:
        raise ValueError(f"单次上报 daily 不能超过 {MAX_DAILY} 条")
    if len(samples) > MAX_SAMPLES:
        raise ValueError(f"单次上报 samples 不能超过 {MAX_SAMPLES} 条")

    validated_daily = [_validate_daily(i) for i in daily]
    validated_samples = [_validate_sample(s) for s in samples]
    if not validated_daily and not validated_samples:
        return {"ingested": 0, "samples_stored": 0}

    client_id = (validated_daily[0]["client_id"] if validated_daily else validated_samples[0]["client_id"])
    now = _now()

    async with db.begin():
        # 批次去重：同 (client_id, batch_id) 的重复提交（超时重试）直接跳过
        if batch_id:
            parsed_max_id = 0
            try:
                parsed_max_id = max(0, int(str(batch_id).split(":")[-1]))
            except (TypeError, ValueError):
                parsed_max_id = 0
            inserted = await db.execute(
                sa.dialects.sqlite.insert(DiagnosticsBatch)
                .values(client_id=client_id, batch_id=batch_id, max_id=parsed_max_id, ingested_at=now)
                .on_conflict_do_nothing(index_elements=["client_id", "batch_id"])
            )
            if inserted.rowcount == 0:
                # 超时重试：回传该批次已确认的 max_id，桌面端据此推进 watermark，避免新行永久滞留
                acked = (await db.execute(
                    sa.select(DiagnosticsBatch.max_id).where(
                        DiagnosticsBatch.client_id == client_id, DiagnosticsBatch.batch_id == batch_id
                    )
                )).scalar_one_or_none()
                return {"ingested": 0, "samples_stored": 0, "duplicate": True, "acked_max_id": int(acked or 0)}

        # 日聚合桶幂等累加
        if validated_daily:
            stmt = sa.dialects.sqlite.insert(DiagnosticsDaily).values([
                {
                    "diag_date": it["diag_date"], "client_id": it["client_id"], "pipeline": it["pipeline"],
                    "total_runs": it["total_runs"], "failed_runs": it["failed_runs"],
                    "success_runs": it["success_runs"], "cancelled_runs": it["cancelled_runs"],
                    "updated_at": now,
                }
                for it in validated_daily
            ])
            stmt = stmt.on_conflict_do_update(
                index_elements=["diag_date", "client_id", "pipeline"],
                set_={
                    "total_runs": DiagnosticsDaily.total_runs + stmt.excluded.total_runs,
                    "failed_runs": DiagnosticsDaily.failed_runs + stmt.excluded.failed_runs,
                    "success_runs": DiagnosticsDaily.success_runs + stmt.excluded.success_runs,
                    "cancelled_runs": DiagnosticsDaily.cancelled_runs + stmt.excluded.cancelled_runs,
                    "updated_at": now,
                },
            )
            await db.execute(stmt)

        # 样本按 (client_id, run_id) 去重（重复提交跳过）
        samples_stored = 0
        if validated_samples:
            stmt = sa.dialects.sqlite.insert(DiagnosticsSample).values([
                {
                    "diag_date": it["diag_date"], "client_id": it["client_id"], "run_id": it["run_id"],
                    "pipeline": it["pipeline"], "status": it["status"], "stage": it["stage"],
                    "failure_type": it["failure_type"], "severity": it["severity"],
                    "recoverability": it["recoverability"], "cause_id": it["cause_id"],
                    "duration_ms": it["duration_ms"], "env_json": it["env_json"], "created_at": now,
                }
                for it in validated_samples
            ])
            stmt = stmt.on_conflict_do_nothing(index_elements=["client_id", "run_id"])
            result = await db.execute(stmt)
            samples_stored = max(0, (result.rowcount or 0) // 1)

        # 样本保留期滚动清理
        cutoff = (datetime.datetime.utcnow().date() - datetime.timedelta(days=RETENTION_DAYS)).isoformat()
        await db.execute(sa.delete(DiagnosticsSample).where(DiagnosticsSample.diag_date < cutoff))
        daily_cutoff = (datetime.datetime.utcnow().date() - datetime.timedelta(days=DAILY_RETENTION_DAYS)).isoformat()
        await db.execute(sa.delete(DiagnosticsDaily).where(DiagnosticsDaily.diag_date < daily_cutoff))

    return {"ingested": len(validated_daily), "samples_stored": samples_stored}


def _compute_alerts(totals: dict, by_stage: dict, by_cause: dict, env: dict) -> list:
    alerts = []
    if totals["runs"] > 0 and (totals["failed"] / totals["runs"] * 100) > ALERT_FAILURE_RATE_PCT:
        alerts.append({"level": "HIGH", "dimension": "failure_rate", "message": f"整体失败率 {round(totals['failed'] / totals['runs'] * 100, 1)}% 超过阈值"})
    failed_samples_total = sum(by_stage.values())
    if failed_samples_total > 0:
        compose_share = by_stage.get("compose", 0) / failed_samples_total
        if compose_share > ALERT_COMPOSE_SHARE:
            alerts.append({"level": "MEDIUM", "dimension": "stage", "message": f"compose 阶段失败占比 {round(compose_share * 100, 1)}% 过高"})
        sidecar_share = sum(v for k, v in by_cause.items() if k in SIDECAR_CAUSE_IDS) / failed_samples_total
        if sidecar_share > ALERT_SIDECAR_SHARE:
            alerts.append({"level": "MEDIUM", "dimension": "cause", "message": f"sidecar 类根因占比 {round(sidecar_share * 100, 1)}% 过高，请检查后端服务"})
    if env.get("disk_low_count", 0) > 0:
        alerts.append({"level": "LOW", "dimension": "env", "message": f"存在 {env['disk_low_count']} 个磁盘空间不足样本，建议提示用户清理"})
    return alerts


async def diagnostics_summary(db: AsyncSession, days: int = 30) -> dict:
    days = max(1, min(90, int(days)))
    today = datetime.datetime.now(timezone.utc).date()
    start = (today - datetime.timedelta(days=days - 1)).isoformat()

    daily_rows = (await db.execute(
        sa.select(DiagnosticsDaily).where(DiagnosticsDaily.diag_date >= start)
    )).scalars().all()
    sample_rows = (await db.execute(
        sa.select(DiagnosticsSample).where(DiagnosticsSample.diag_date >= start)
    )).scalars().all()

    totals = {"runs": 0, "failed": 0, "success": 0, "cancelled": 0, "failed_duration_ms": 0}
    by_date = {}
    by_client = {}
    for r in daily_rows:
        totals["runs"] += r.total_runs or 0
        totals["failed"] += r.failed_runs or 0
        totals["success"] += r.success_runs or 0
        totals["cancelled"] += r.cancelled_runs or 0
        d = by_date.setdefault(r.diag_date, {"runs": 0, "failed": 0, "success": 0})
        d["runs"] += r.total_runs or 0
        d["failed"] += r.failed_runs or 0
        d["success"] += r.success_runs or 0
        c = by_client.setdefault(r.client_id, {"runs": 0, "failed": 0})
        c["runs"] += r.total_runs or 0
        c["failed"] += r.failed_runs or 0

    by_stage = {}
    by_failure_type = {}
    by_cause = {}
    disk_low_count = 0
    sidecar_down_count = 0
    for s in sample_rows:
        by_stage[s.stage] = by_stage.get(s.stage, 0) + 1
        by_failure_type[s.failure_type] = by_failure_type.get(s.failure_type, 0) + 1
        if s.cause_id:
            by_cause[s.cause_id] = by_cause.get(s.cause_id, 0) + 1
        totals["failed_duration_ms"] += s.duration_ms or 0
        try:
            env = json.loads(s.env_json or "{}")
        except (TypeError, ValueError):
            env = {}
        if env.get("disk_free_bytes") is not None and env["disk_free_bytes"] < DISK_LOW_BYTES:
            disk_low_count += 1
        if env.get("python_backend") is False:
            sidecar_down_count += 1

    failed_count = totals["failed"]
    failure_rate = (failed_count / totals["runs"] * 100) if totals["runs"] else 0.0
    avg_failed_duration_ms = (totals["failed_duration_ms"] / failed_count) if failed_count else 0.0
    env = {
        "disk_low_count": disk_low_count,
        "disk_low_ratio": round(disk_low_count / len(sample_rows), 4) if sample_rows else 0.0,
        "sidecar_down_count": sidecar_down_count,
    }
    alerts = _compute_alerts(totals, by_stage, by_cause, env)

    return {
        "days": days,
        "totals": {
            "runs": totals["runs"],
            "failed": totals["failed"],
            "success": totals["success"],
            "cancelled": totals["cancelled"],
            "failure_rate": round(failure_rate, 2),
            "affected_clients": len(by_client),
            "avg_failed_duration_ms": round(avg_failed_duration_ms, 1),
        },
        "by_date": [
            {"date": (today - datetime.timedelta(days=i)).isoformat(),
             **by_date.get((today - datetime.timedelta(days=i)).isoformat(), {"runs": 0, "failed": 0, "success": 0})}
            for i in range(days - 1, -1, -1)
        ],
        "by_stage": [{"stage": k, "count": v} for k, v in sorted(by_stage.items(), key=lambda kv: -kv[1])],
        "by_failure_type": [{"failure_type": k, "count": v} for k, v in sorted(by_failure_type.items(), key=lambda kv: -kv[1])],
        "by_cause": [{"cause_id": k, "count": v} for k, v in sorted(by_cause.items(), key=lambda kv: -kv[1])],
        "by_client": [{"client_id": k, "runs": v["runs"], "failed": v["failed"]} for k, v in sorted(by_client.items(), key=lambda kv: -kv[1]["failed"])][:20],
        "env": env,
        "alerts": alerts,
    }


async def list_diagnostics_samples(
    db: AsyncSession,
    days: int = 30,
    limit: int = 50,
    offset: int = 0,
    stage: str = "",
    failure_type: str = "",
    cause_id: str = "",
) -> dict:
    days = max(1, min(90, int(days)))
    limit = max(1, min(200, int(limit)))
    offset = max(0, int(offset))
    today = datetime.datetime.now(timezone.utc).date()
    start = (today - datetime.timedelta(days=days - 1)).isoformat()

    conds = [DiagnosticsSample.diag_date >= start]
    if stage:
        conds.append(DiagnosticsSample.stage == stage)
    if failure_type:
        conds.append(DiagnosticsSample.failure_type == failure_type)
    if cause_id:
        conds.append(DiagnosticsSample.cause_id == cause_id)

    total = (await db.execute(sa.select(sa.func.count()).select_from(DiagnosticsSample).where(*conds))).scalar() or 0
    rows = (await db.execute(
        sa.select(DiagnosticsSample).where(*conds)
        .order_by(DiagnosticsSample.id.desc())
        .offset(offset).limit(limit)
    )).scalars().all()

    items = []
    for r in rows:
        try:
            env = json.loads(r.env_json or "{}")
        except (TypeError, ValueError):
            env = {}
        items.append({
            "id": r.id,
            "diag_date": r.diag_date,
            "client_id": r.client_id,
            "run_id": r.run_id,
            "pipeline": r.pipeline,
            "status": r.status,
            "stage": r.stage,
            "failure_type": r.failure_type,
            "severity": r.severity,
            "recoverability": r.recoverability,
            "cause_id": r.cause_id,
            "duration_ms": r.duration_ms,
            "env": env,
            "created_at": r.created_at,
        })
    return {"total": total, "items": items}
