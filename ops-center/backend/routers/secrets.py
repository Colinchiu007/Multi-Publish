"""Official Key management API — secrets CRUD + reveal + test."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from middleware.auth import get_current_user, require_admin
from services import key_service

router = APIRouter(prefix="/api/v1/secrets", tags=["secrets"])


@router.get("")
async def list_secrets(
    provider: str | None = None,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """List all official keys (masked)."""
    keys = await key_service.list_keys(db, provider=provider)
    return {"keys": keys, "count": len(keys)}


@router.get("/summary")
async def get_secrets_summary(
    days: int = 30,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_admin),
):
    """官方 Key 池概览（成本/到期/配额告警）。"""
    return await key_service.pool_summary(db, days=days)


@router.get("/{key_id}")
async def get_secret(
    key_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Get a single official key (masked)."""
    result = await key_service.get_key(db, key_id, reveal=False)
    if not result:
        raise HTTPException(404, f"Key not found: {key_id}")
    return result


@router.put("/{key_id}")
async def upsert_secret(
    key_id: str,
    body: dict,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_admin),
):
    """Create or update an official key."""
    try:
        normalized = key_service.validate_key_fields(body)
    except ValueError as e:
        raise HTTPException(400, str(e))
    existing = await key_service.get_key(db, key_id, reveal=True)
    if existing:
        merged = {**body, **normalized}
        updated = await key_service.update_key(db, key_id, **merged)
        if not updated:
            raise HTTPException(404, f"Key not found: {key_id}")
        return key_service._model_to_dict(updated, reveal=False)
    else:
        models = body.get("models", [])
        if isinstance(models, str):
            import json
            models = json.loads(models)
        item = await key_service.create_key(
            db,
            id=key_id,
            provider=body.get("provider", ""),
            name=body.get("name", key_id),
            api_key=body.get("api_key", ""),
            models=models,
            base_url=body.get("base_url", ""),
            priority=body.get("priority", 1),
            is_active=body.get("is_active", 1),
            tier_access=body.get("tier_access", 1),
            cost_per_1k_tokens=body.get("cost_per_1k_tokens", 0.0),
            expires_at=body.get("expires_at", ""),
            rate_per_minute=normalized.get("rate_per_minute"),
            daily_limit=normalized.get("daily_limit"),
            alert_threshold_cost=normalized.get("alert_threshold_cost"),
            note=normalized.get("note", ""),
        )
        return key_service._model_to_dict(item, reveal=False)


@router.delete("/{key_id}")
async def delete_secret(
    key_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_admin),
):
    """Delete an official key."""
    deleted = await key_service.delete_key(db, key_id)
    if not deleted:
        raise HTTPException(404, f"Key not found: {key_id}")
    return {"status": "deleted", "id": key_id}


@router.post("/{key_id}/reveal")
async def reveal_secret(
    key_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_admin),
):
    """Reveal the plaintext API key (admin only)."""
    result = await key_service.get_key(db, key_id, reveal=True)
    if not result:
        raise HTTPException(404, f"Key not found: {key_id}")
    return result
