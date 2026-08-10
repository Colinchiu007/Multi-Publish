"""Official Key management service — encrypt, decrypt, mask, CRUD, test connection."""
import json
import datetime
import logging
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from cryptography.fernet import Fernet

from models import OfficialKey
from config import settings

logger = logging.getLogger(__name__)


def _get_fernet() -> Fernet:
    """Get or create Fernet instance from encryption key."""
    import base64, hashlib
    key = settings.encryption_key
    if not key:
        key = Fernet.generate_key().decode()
        settings.encryption_key = key
    try:
        return Fernet(key.encode() if isinstance(key, str) else key)
    except (ValueError, Exception):
        # Derive a valid 32-byte key from the provided key
        derived = hashlib.sha256(key.encode() if isinstance(key, str) else str(key).encode()).digest()
        valid = base64.urlsafe_b64encode(derived).decode()
        settings.encryption_key = valid
        return Fernet(valid.encode())


def encrypt_key(plaintext: str) -> str:
    """Encrypt an API key."""
    fernet = _get_fernet()
    return fernet.encrypt(plaintext.encode()).decode()


def decrypt_key(ciphertext: str) -> str:
    """Decrypt an API key."""
    fernet = _get_fernet()
    return fernet.decrypt(ciphertext.encode()).decode()


def mask_key(key: str) -> str:
    """Mask an API key for display: 'sk-a1b2c3...x8y9' -> 'sk-a***y9'."""
    if not key or len(key) < 6:
        return "***"
    return key[:4] + "***" + key[-4:]


def _model_to_dict(key: OfficialKey, reveal: bool = False) -> dict:
    """Convert OfficialKey model to API-safe dict."""
    return {
        "id": key.id,
        "provider": key.provider,
        "name": key.name,
        "api_key": decrypt_key(key.api_key) if reveal else mask_key(decrypt_key(key.api_key)),
        "base_url": key.base_url,
        "models": json.loads(key.models) if key.models else [],
        "priority": key.priority,
        "is_active": bool(key.is_active),
        "tier_access": key.tier_access,
        "cost_per_1k_tokens": key.cost_per_1k_tokens,
        "expires_at": key.expires_at,
        "rate_per_minute": key.rate_per_minute,
        "daily_limit": key.daily_limit,
        "alert_threshold_cost": key.alert_threshold_cost,
        "note": key.note or "",
        "created_at": key.created_at,
        "updated_at": key.updated_at,
        "is_masked": not reveal,
    }


async def ensure_official_key_columns(db: AsyncSession) -> None:
    """存量库幂等补列（rate_per_minute/daily_limit/alert_threshold_cost/note）。"""

    def _migrate(sync_conn) -> None:
        from sqlalchemy import inspect, text

        inspector = inspect(sync_conn.connection())
        if "official_keys" not in inspector.get_table_names():
            return
        existing = {c["name"] for c in inspector.get_columns("official_keys")}
        adds = {
            "rate_per_minute": "INTEGER",
            "daily_limit": "INTEGER",
            "alert_threshold_cost": "FLOAT",
            "note": "VARCHAR(200) DEFAULT ''",
        }
        for col, ddl in adds.items():
            if col not in existing:
                sync_conn.execute(text(f"ALTER TABLE official_keys ADD COLUMN {col} {ddl}"))

    await db.run_sync(_migrate)


def validate_key_fields(body: dict) -> dict:
    """校验/归一化官方 Key 新字段；非法值抛 ValueError（router 转 400）。"""
    out = {}
    for field in ("rate_per_minute", "daily_limit"):
        v = body.get(field)
        if v is None or str(v).strip() == "":
            out[field] = None
            continue
        if isinstance(v, bool):
            raise ValueError(f"{field} 必须是整数")
        if isinstance(v, float) and not v.is_integer():
            raise ValueError(f"{field} 必须是整数")
        try:
            n = int(v)
        except (TypeError, ValueError):
            raise ValueError(f"{field} 必须是整数")
        if n < 1:
            raise ValueError(f"{field} 必须是正整数或留空")
        out[field] = n
    v = body.get("alert_threshold_cost")
    if v is None or str(v).strip() == "":
        out["alert_threshold_cost"] = None
    else:
        if isinstance(v, bool):
            raise ValueError("alert_threshold_cost 必须是数字")
        try:
            f = float(v)
        except (TypeError, ValueError):
            raise ValueError("alert_threshold_cost 必须是数字")
        if f < 0:
            raise ValueError("alert_threshold_cost 不能为负数")
        out["alert_threshold_cost"] = f
    out["note"] = str(body.get("note") or "").strip()[:200]
    return out


async def pool_summary(db: AsyncSession, days: int = 30) -> dict:
    """官方 Key 池概览：计数/到期/成本（复用 model_usage_daily）/配额达标率。"""
    from sqlalchemy import func
    from models import ModelUsageDaily

    rows = (await db.execute(select(OfficialKey))).scalars().all()
    days = max(1, min(90, int(days)))
    today = datetime.datetime.utcnow().date()
    in30 = (today + datetime.timedelta(days=30)).isoformat()
    active = [k for k in rows if k.is_active == 1]
    expiring = [k for k in active if k.expires_at and k.expires_at <= in30 and (not k.expires_at or k.expires_at >= today.isoformat())]
    expired = [k for k in active if k.expires_at and k.expires_at < today.isoformat()]

    start = (today - datetime.timedelta(days=days - 1)).isoformat()
    cost_rows = (await db.execute(
        select(ModelUsageDaily.provider_id, func.sum(ModelUsageDaily.cost))
        .where(ModelUsageDaily.usage_date >= start)
        .group_by(ModelUsageDaily.provider_id)
    )).all()
    cost_by_provider = {provider: round(float(cost or 0), 4) for provider, cost in cost_rows}

    provider_cost = {}
    for k in rows:
        c = cost_by_provider.get(k.provider, 0.0)
        provider_cost.setdefault(k.provider, 0.0)
        provider_cost[k.provider] += c

    # 配额达标率：有 daily_limit 的活跃 Key 中，其 provider 近 30 天成本已超过 alert_threshold_cost 的比例
    threshold_hit = []
    for k in active:
        if k.alert_threshold_cost is not None and k.alert_threshold_cost > 0:
            if provider_cost.get(k.provider, 0.0) >= k.alert_threshold_cost:
                threshold_hit.append(k.id)
    return {
        "total": len(rows),
        "active": len(active),
        "expiring_30d": len(expiring),
        "expired": len(expired),
        "threshold_hit_keys": threshold_hit,
        "cost_by_provider": provider_cost,
        "cost_total": round(sum(provider_cost.values()), 4),
    }


async def create_key(
    db: AsyncSession,
    id: str,
    provider: str,
    name: str,
    api_key: str,
    models: list[str] | None = None,
    base_url: str = "",
    priority: int = 1,
    is_active: int = 1,
    tier_access: int = 1,
    cost_per_1k_tokens: float = 0.0,
    expires_at: str = "",
    rate_per_minute: int | None = None,
    daily_limit: int | None = None,
    alert_threshold_cost: float | None = None,
    note: str = "",
) -> OfficialKey:
    """Create a new official key."""
    now = datetime.datetime.utcnow().isoformat()
    item = OfficialKey(
        id=id,
        provider=provider,
        name=name,
        api_key=encrypt_key(api_key),
        base_url=base_url,
        models=json.dumps(models or []),
        priority=priority,
        is_active=is_active,
        tier_access=tier_access,
        cost_per_1k_tokens=cost_per_1k_tokens,
        expires_at=expires_at,
        rate_per_minute=rate_per_minute,
        daily_limit=daily_limit,
        alert_threshold_cost=alert_threshold_cost,
        note=note,
        created_at=now,
        updated_at=now,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    logger.info(f"Created official key: {id}")
    return item


async def get_key(db: AsyncSession, key_id: str, reveal: bool = False) -> dict | None:
    """Get a single official key (masked or revealed)."""
    result = await db.execute(select(OfficialKey).where(OfficialKey.id == key_id))
    item = result.scalar_one_or_none()
    if not item:
        return None
    return _model_to_dict(item, reveal=reveal)


async def list_keys(
    db: AsyncSession,
    provider: str | None = None,
    tier_access: int | None = None,
) -> list[dict]:
    """List all official keys, optionally filtered."""
    stmt = select(OfficialKey).order_by(OfficialKey.provider, OfficialKey.priority)
    if provider:
        stmt = stmt.where(OfficialKey.provider == provider)
    if tier_access is not None:
        stmt = stmt.where(OfficialKey.tier_access <= tier_access)
    result = await db.execute(stmt)
    return [_model_to_dict(k, reveal=False) for k in result.scalars().all()]


async def update_key(
    db: AsyncSession,
    key_id: str,
    **kwargs,
) -> OfficialKey | None:
    """Update an official key. Re-encrypts api_key if provided."""
    result = await db.execute(select(OfficialKey).where(OfficialKey.id == key_id))
    item = result.scalar_one_or_none()
    if not item:
        return None

    for field, value in kwargs.items():
        if value is None:
            continue
        if field == "api_key":
            value = encrypt_key(value)
        elif field == "models" and isinstance(value, list):
            value = json.dumps(value)
        setattr(item, field, value)

    item.updated_at = datetime.datetime.utcnow().isoformat()
    await db.commit()
    await db.refresh(item)
    return item


async def delete_key(db: AsyncSession, key_id: str) -> bool:
    """Delete an official key."""
    result = await db.execute(select(OfficialKey).where(OfficialKey.id == key_id))
    item = result.scalar_one_or_none()
    if not item:
        return False
    await db.delete(item)
    await db.commit()
    return True


async def get_active_keys_for_tier(
    db: AsyncSession,
    provider: str,
    user_tier: int,
) -> list[OfficialKey]:
    """Get active keys available for a given user tier, sorted by priority."""
    result = await db.execute(
        select(OfficialKey)
        .where(
            OfficialKey.provider == provider,
            OfficialKey.is_active == 1,
            OfficialKey.tier_access <= user_tier,
        )
        .order_by(OfficialKey.priority)
    )
    return list(result.scalars().all())
