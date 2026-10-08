"""运营中心远程化韧性服务（2026-10-08 ops-center-resilience）

三块职责，契约见 openspec/changes/ops-center-resilience/design.md：

- ``record_client_ack``：客户端生效回执（V-2）。按 client_id 保留**最新快照**。
- ``record_degradation_event``：断连降级事件（§3）。**流水表**，一轮断连一行。
- ``rollout_summary``：配置生效聚合（§2.6），回答「运营改的配置到底有多少客户端生效了」。

校验原则：这些接口的数据是运营判断「配置是否生效」的唯一依据，脏数据进库会直接
导致运营误判（比拿不到数据更糟）。因此**一律显式 400，绝不静默丢弃**。
"""
import datetime
import json
import logging
import re

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from models import ClientDegradationEvent, RuntimeClientAck

logger = logging.getLogger(__name__)

ACK_TYPES = ("applied", "heartbeat", "recovered")
DEGRADATION_TIERS = ("L1", "L2", "L3", "default")
DEGRADATION_CHANNELS = ("runtime", "entitlement")
FAILURE_KINDS = (
    "timeout", "dns", "network", "http_4xx", "http_5xx",
    "verify_failed", "invalid_payload", "auth_failed",
)

_HASH_RE = re.compile(r"^[0-9a-f]{16}$")

MAX_CLIENT_ID = 64
MAX_CLIENT_VERSION = 32
MAX_ENDPOINT = 200
MAX_BLOCKS = 32
MAX_BLOCK_NAME = 64
MAX_QUEUE_SECONDS = 90 * 24 * 3600


class ValidationError(ValueError):
    """载荷不合法。router 层统一转 400。"""


def _reject(message: str) -> None:
    raise ValidationError(message)


def _require_text(body: dict, key: str, max_len: int, *, required: bool = False) -> str:
    value = body.get(key)
    if value is None:
        if required:
            _reject(f"{key} 必填")
        return ""
    # bool 是 int 的子类不是 str，这里 isinstance(str) 已足够挡住
    if not isinstance(value, str):
        _reject(f"{key} 必须是字符串")
    if len(value) > max_len:
        _reject(f"{key} 长度超过 {max_len}")
    # 空串不等于「没传」：客户端传 degraded_since="" 时若放行，降级事件就没有真实起点，
    # 看板上的断连时长无从计算。required 时空串必须与缺失同等拒绝。
    if required and not value.strip():
        _reject(f"{key} 不得为空")
    return value


def _require_int(body: dict, key: str, *, minimum: int, required: bool = True) -> int:
    value = body.get(key)
    if value is None:
        if required:
            _reject(f"{key} 必填")
        return 0
    # 关键：Python 里 bool 是 int 的子类，isinstance(True, int) 为 True，
    # 不显式排除会让 degraded=True 被当成 version=1 收下
    if isinstance(value, bool) or not isinstance(value, int):
        _reject(f"{key} 必须是整数")
    if value < minimum:
        _reject(f"{key} 不得小于 {minimum}")
    return value


def _require_bool(body: dict, key: str) -> bool:
    value = body.get(key)
    if not isinstance(value, bool):
        _reject(f"{key} 必须是布尔值")
    return value


def _require_iso_datetime(body: dict, key: str, *, required: bool = False) -> str:
    value = _require_text(body, key, 64, required=required)
    if not value:
        return ""
    text = value.replace("Z", "+00:00")
    try:
        datetime.datetime.fromisoformat(text)
    except (ValueError, TypeError):
        _reject(f"{key} 必须是 ISO8601 时间")
    return value


def _require_enum(body: dict, key: str, allowed: tuple, *, required: bool = False) -> str:
    value = _require_text(body, key, 64, required=required)
    if value and value not in allowed:
        _reject(f"{key} 取值非法，允许：{'/'.join(allowed)}")
    return value


def _validate_applied_blocks(value) -> dict:
    if value is None:
        return {}
    if not isinstance(value, dict):
        _reject("applied_blocks 必须是对象")
    if len(value) > MAX_BLOCKS:
        _reject(f"applied_blocks 键数不得超过 {MAX_BLOCKS}")
    out: dict = {}
    for name, count in value.items():
        if not isinstance(name, str) or len(name) > MAX_BLOCK_NAME:
            _reject("applied_blocks 键名非法")
        if isinstance(count, bool) or not isinstance(count, int) or count < 0:
            _reject(f"applied_blocks[{name}] 必须是非负整数")
        out[name] = count
    return out


def _validate_skipped_blocks(value) -> list:
    if value is None:
        return []
    if not isinstance(value, list):
        _reject("skipped_blocks 必须是数组")
    if len(value) > MAX_BLOCKS:
        _reject(f"skipped_blocks 项数不得超过 {MAX_BLOCKS}")
    out = []
    for name in value:
        if not isinstance(name, str) or not name or len(name) > MAX_BLOCK_NAME:
            _reject("skipped_blocks 元素必须是非空字符串")
        out.append(name)
    return out


# ─── §2 生效回执 ─────────────────────────────────────────────────────

async def record_client_ack(db: AsyncSession, body: dict) -> dict:
    """记录客户端生效回执：按 client_id upsert 保留最新一条快照。

    为什么是快照表而不是流水表：生效看板回答的是「**现在**多少客户端在最新版」，
    只需要最新态；历史变化由 client_degradation_events 流水表承担。
    """
    client_id = _require_text(body, "client_id", MAX_CLIENT_ID, required=True)
    if not client_id.strip():
        _reject("client_id 不得为空")
    client_version = _require_text(body, "client_version", MAX_CLIENT_VERSION)
    config_version = _require_int(body, "config_version", minimum=0)

    config_hash = _require_text(body, "config_hash", 16, required=True)
    if not _HASH_RE.match(config_hash):
        _reject("config_hash 必须是 16 位小写十六进制")

    applied_blocks = _validate_applied_blocks(body.get("applied_blocks"))
    skipped_blocks = _validate_skipped_blocks(body.get("skipped_blocks"))
    ack_type = _require_enum(body, "ack_type", ACK_TYPES, required=True)
    degraded = _require_bool(body, "degraded")
    degraded_since = _require_iso_datetime(body, "degraded_since")
    degradation_tier = _require_enum(body, "degradation_tier", DEGRADATION_TIERS)

    if degraded:
        # 降级态必须自证：处于哪一层、从什么时候开始。否则看板上的「降级中」
        # 只是一句无法追责的断言，运营无法据此定位问题。
        if not degradation_tier:
            _reject("degraded=true 时 degradation_tier 必填")
        if not degraded_since:
            _reject("degraded=true 时 degraded_since 必填")

    now = datetime.datetime.utcnow().isoformat()
    row = (await db.execute(
        sa.select(RuntimeClientAck).where(RuntimeClientAck.client_id == client_id)
    )).scalars().first()
    created = row is None
    if created:
        row = RuntimeClientAck(client_id=client_id, first_seen_at=now)
        db.add(row)
    row.config_version = config_version
    row.config_hash = config_hash
    row.client_version = client_version
    row.applied_blocks_json = json.dumps(applied_blocks, ensure_ascii=False, sort_keys=True)
    row.skipped_blocks_json = json.dumps(skipped_blocks, ensure_ascii=False)
    row.degraded = 1 if degraded else 0
    row.degradation_tier = degradation_tier
    row.ack_type = ack_type
    row.degraded_since = degraded_since
    row.last_ack_at = now
    await db.commit()
    return {"ok": True, "client_id": client_id, "created": created}


# ─── §3 断连降级事件 ─────────────────────────────────────────────────

async def record_degradation_event(db: AsyncSession, body: dict) -> dict:
    """记录一轮断连降级事件（恢复后补报写入，design.md §3.4）。"""
    client_id = _require_text(body, "client_id", MAX_CLIENT_ID, required=True)
    if not client_id.strip():
        _reject("client_id 不得为空")
    client_version = _require_text(body, "client_version", MAX_CLIENT_VERSION)
    channel = _require_enum(body, "channel", DEGRADATION_CHANNELS, required=True)
    endpoint = _require_text(body, "endpoint", MAX_ENDPOINT)
    failure_kind = _require_enum(body, "failure_kind", FAILURE_KINDS, required=True)
    consecutive_failures = _require_int(body, "consecutive_failures", minimum=1)
    degraded_since = _require_iso_datetime(body, "degraded_since", required=True)
    recovered_at = _require_iso_datetime(body, "recovered_at")
    offline_seconds = _require_int(body, "offline_seconds", minimum=0)
    serving_tier = _require_enum(body, "serving_tier", DEGRADATION_TIERS, required=True)

    if offline_seconds > MAX_QUEUE_SECONDS:
        _reject("offline_seconds 超出合理范围（>90 天）")

    row = ClientDegradationEvent(
        client_id=client_id,
        client_version=client_version,
        channel=channel,
        endpoint=endpoint,
        failure_kind=failure_kind,
        consecutive_failures=consecutive_failures,
        degraded_since=degraded_since,
        recovered_at=recovered_at,
        offline_seconds=offline_seconds,
        serving_tier=serving_tier,
    )
    db.add(row)
    await db.commit()
    return {"ok": True, "id": row.id}


async def degradation_summary(db: AsyncSession, days: int = 30) -> dict:
    """降级影响面统计：多少用户受断连影响、断了多久、当前还有多少在降级中。"""
    from models import RuntimeClientAck

    since = (datetime.datetime.utcnow() - datetime.timedelta(days=days)).isoformat()
    rows = (await db.execute(
        sa.select(ClientDegradationEvent).where(ClientDegradationEvent.received_at >= since)
    )).scalars().all()

    still_degraded = (await db.execute(
        sa.select(sa.func.count(RuntimeClientAck.client_id)).where(RuntimeClientAck.degraded == 1)
    )).scalar() or 0

    by_kind: dict = {}
    by_tier: dict = {}
    for row in rows:
        by_kind[row.failure_kind] = by_kind.get(row.failure_kind, 0) + 1
        by_tier[row.serving_tier] = by_tier.get(row.serving_tier, 0) + 1

    return {
        "days": days,
        "total_events": len(rows),
        "unique_clients": len({r.client_id for r in rows}),
        "total_offline_seconds": sum(r.offline_seconds for r in rows),
        "max_offline_seconds": max((r.offline_seconds for r in rows), default=0),
        "still_degraded_clients": int(still_degraded),
        "by_failure_kind": by_kind,
        "by_serving_tier": by_tier,
    }


# ─── §2.6 配置生效聚合 ───────────────────────────────────────────────

async def rollout_summary(db: AsyncSession, version: int | None = None, limit: int = 50) -> dict:
    """某个配置版本的生效聚合 + 未确认客户端明细。

    口径（design.md §2.6）：
      total    = 见过面的客户端总数（= 活跃分母）
      acked    = 已确认该版本
      stale    = 仍在更早的版本
      degraded = 处于断连降级中（可能是「已确认」的一部分，故单独统计而非从 acked 扣除）
    """
    rows = (await db.execute(sa.select(RuntimeClientAck))).scalars().all()
    if version is None:
        version = max((r.config_version for r in rows), default=0)

    total = len(rows)
    acked = sum(1 for r in rows if r.config_version == version)
    stale = sum(1 for r in rows if r.config_version < version)
    degraded = sum(1 for r in rows if r.degraded == 1)

    block_hits: dict = {}
    for row in rows:
        if row.config_version != version:
            continue
        try:
            applied = json.loads(row.applied_blocks_json or "{}")
        except (ValueError, TypeError):
            continue
        if isinstance(applied, dict):
            for name in applied:
                block_hits[name] = block_hits.get(name, 0) + 1

    block_rates = {name: (count / total if total else 0.0) for name, count in block_hits.items()}

    unconfirmed = [r for r in rows if r.config_version != version]
    unconfirmed.sort(key=lambda r: r.last_ack_at or "", reverse=True)
    detail = [
        {
            "client_id": r.client_id,
            "client_version": r.client_version,
            "config_version": r.config_version,
            "config_hash": r.config_hash,
            "degraded": bool(r.degraded),
            "degradation_tier": r.degradation_tier or None,
            "ack_type": r.ack_type,
            "last_ack_at": r.last_ack_at,
        }
        for r in unconfirmed[:limit]
    ]

    return {
        "version": version,
        "total": total,
        "acked": acked,
        "stale": stale,
        "degraded": degraded,
        "ack_rate": (acked / total) if total else 0.0,
        "block_rates": block_rates,
        "clients": detail,
    }