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
        "created_at": key.created_at,
        "updated_at": key.updated_at,
        "is_masked": not reveal,
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
