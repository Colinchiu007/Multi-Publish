"""Shared auth dependency factories for FastAPI endpoints.

Extracted from server.py to allow routers to use the same auth pattern.
"""

from __future__ import annotations

import os
from typing import Any

from fastapi import HTTPException, Request, Depends

from multi_publish.auth import AuthError, LogtoJwtVerifier, create_fastapi_dependency


def _env_bool(name: str, default: bool = False) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    normalized = value.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    raise ValueError(f"{name} 必须是明确的布尔值（true/false、1/0、yes/no 或 on/off）")


def _logto_issuer() -> str:
    configured = os.environ.get("LOGTO_ISSUER") or os.environ.get("LOGTO_ENDPOINT", "")
    configured = configured.rstrip("/")
    return configured if configured.endswith("/oidc") else f"{configured}/oidc"


def _build_identity_verifier() -> LogtoJwtVerifier | None:
    issuer = _logto_issuer()
    audience = os.environ.get("LOGTO_API_RESOURCE", "").strip()
    if not issuer or issuer == "/oidc" or not audience:
        return None
    trusted_hosts = frozenset(
        item.strip().lower()
        for item in os.environ.get("LOGTO_TRUSTED_JWKS_HOSTS", "").split(",")
        if item.strip()
    )
    try:
        return LogtoJwtVerifier(
            issuer=issuer,
            audience=audience,
            cache_ttl_seconds=max(1, int(os.environ.get("LOGTO_JWKS_CACHE_TTL", "300"))),
            trusted_jwks_hosts=trusted_hosts,
        )
    except (AuthError, ValueError):
        return None


# Module-level cache (shared across all importers)
IDENTITY_AUTH_ENABLED = _env_bool("IDENTITY_AUTH_ENABLED")
IDENTITY_AUTH_REQUIRED = _env_bool("IDENTITY_AUTH_REQUIRED")
IDENTITY_VERIFIER = _build_identity_verifier()


def identity_dependency(required_scopes: list[str]):
    """Factory: create a FastAPI dependency that requires the given scopes.

    Usage:
        _require_publish_read = identity_dependency(["publish:read"])
        @app.get("/api/endpoint", dependencies=[Depends(_require_publish_read)])
    """
    async def dependency(request: Request) -> dict[str, Any] | None:
        if not IDENTITY_AUTH_ENABLED and not IDENTITY_AUTH_REQUIRED:
            return None
        has_token = bool(request.headers.get("authorization"))
        if not IDENTITY_AUTH_REQUIRED and not has_token:
            return None
        if IDENTITY_VERIFIER is None:
            raise HTTPException(status_code=503, detail="AUTH_CONFIG_INVALID")
        return await create_fastapi_dependency(IDENTITY_VERIFIER, required_scopes)(request)

    return dependency


# Pre-built dependencies (matching server.py pattern)
require_publish_read = identity_dependency(["publish:read"])
require_publish_submit = identity_dependency(["publish:submit"])
require_account_manage = identity_dependency(["account:manage"])
