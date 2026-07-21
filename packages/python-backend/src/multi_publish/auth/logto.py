"""Logto OIDC Access Token 验证。

该模块只接受 RS256 + JWKS，禁止把 JWT decode 当作验证，也不允许对称算法降级。
"""

from __future__ import annotations

import base64
import asyncio
import json
import math
import time
from dataclasses import dataclass, field
from typing import Any, Callable
from urllib.parse import urlparse

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.asymmetric.rsa import RSAPublicNumbers
from fastapi import HTTPException, Request


_LOCAL_HOSTS = frozenset({"localhost", "127.0.0.1", "::1"})


def _parse_secure_url(value: str, error_code: str):
    if not isinstance(value, str):
        raise AuthError(error_code)
    parsed = urlparse(value)
    if parsed.scheme not in {"https", "http"} or not parsed.hostname or parsed.username or parsed.password:
        raise AuthError(error_code)
    try:
        parsed.port
    except ValueError as exc:
        raise AuthError(error_code) from exc
    if parsed.scheme != "https" and parsed.hostname.lower() not in _LOCAL_HOSTS:
        raise AuthError(error_code)
    return parsed


def _origin(parsed):
    host = parsed.hostname.lower()
    if ":" in host and not host.startswith("["):
        host = f"[{host}]"
    port = parsed.port
    if port is None:
        port = 443 if parsed.scheme == "https" else 80
    return parsed.scheme, host, port


def _trusted_host(parsed, trusted_hosts: frozenset[str]) -> bool:
    host = parsed.hostname.lower()
    netloc = parsed.netloc.lower()
    return host in trusted_hosts or netloc in trusted_hosts


class AuthError(Exception):
    def __init__(self, code: str, status: int = 401):
        super().__init__(code)
        self.code = code
        self.status = status


def parse_bearer_token(header: str | None) -> str:
    if not isinstance(header, str):
        raise AuthError("AUTH_TOKEN_MISSING")
    parts = header.strip().split()
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1]:
        raise AuthError("AUTH_TOKEN_MISSING")
    return parts[1]


def _decode_part(value: str) -> dict[str, Any]:
    try:
        padded = value + "=" * (-len(value) % 4)
        decoded = base64.urlsafe_b64decode(padded.encode()).decode()
        result = json.loads(decoded)
    except (ValueError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise AuthError("AUTH_TOKEN_INVALID") from exc
    if not isinstance(result, dict):
        raise AuthError("AUTH_TOKEN_INVALID")
    return result


def _audience_matches(actual: Any, expected: str) -> bool:
    return actual == expected or isinstance(actual, list) and expected in actual


def _public_key_from_jwk(jwk: dict[str, Any]):
    if jwk.get("kty") != "RSA" or jwk.get("alg") not in (None, "RS256"):
        raise AuthError("AUTH_KEY_INVALID")
    if jwk.get("use") not in (None, "sig"):
        raise AuthError("AUTH_KEY_INVALID")
    key_ops = jwk.get("key_ops")
    if key_ops is not None and (not isinstance(key_ops, list) or "verify" not in key_ops):
        raise AuthError("AUTH_KEY_INVALID")
    try:
        n = int.from_bytes(base64.urlsafe_b64decode(jwk["n"] + "=" * (-len(jwk["n"]) % 4)), "big")
        e = int.from_bytes(base64.urlsafe_b64decode(jwk["e"] + "=" * (-len(jwk["e"]) % 4)), "big")
        return RSAPublicNumbers(e, n).public_key()
    except (KeyError, ValueError, TypeError) as exc:
        raise AuthError("AUTH_KEY_INVALID") from exc


def verify_logto_jwt(
    token: str,
    *,
    public_key,
    issuer: str,
    audience: str,
    now: int | None = None,
    clock_tolerance: int = 60,
) -> dict[str, Any]:
    parts = token.split(".") if isinstance(token, str) else []
    if len(parts) != 3:
        raise AuthError("AUTH_TOKEN_INVALID")
    header = _decode_part(parts[0])
    claims = _decode_part(parts[1])
    if header.get("alg") != "RS256":
        raise AuthError("AUTH_ALGORITHM_INVALID")
    try:
        signature = base64.urlsafe_b64decode(parts[2] + "=" * (-len(parts[2]) % 4))
        public_key.verify(signature, f"{parts[0]}.{parts[1]}".encode(), padding.PKCS1v15(), hashes.SHA256())
    except Exception as exc:  # cryptography 使用统一异常类型，避免把密钥细节返回调用方
        raise AuthError("AUTH_SIGNATURE_INVALID") from exc
    if claims.get("iss") != issuer:
        raise AuthError("AUTH_ISSUER_INVALID")
    if not _audience_matches(claims.get("aud"), audience):
        raise AuthError("AUTH_AUDIENCE_INVALID")
    current = int(time.time()) if now is None else now
    expires_at = claims.get("exp")
    if type(expires_at) not in (int, float) or not math.isfinite(expires_at) or expires_at <= current - clock_tolerance:
        raise AuthError("AUTH_TOKEN_EXPIRED")
    if "nbf" in claims:
        not_before = claims["nbf"]
        if type(not_before) not in (int, float) or not math.isfinite(not_before) or not_before > current + clock_tolerance:
            raise AuthError("AUTH_TOKEN_NOT_ACTIVE")
    subject = claims.get("sub")
    if not isinstance(subject, str) or not subject:
        raise AuthError("AUTH_SUBJECT_INVALID")
    scope = claims.get("scope", "")
    if isinstance(scope, list):
        scopes = [item for item in scope if isinstance(item, str)]
    elif isinstance(scope, str):
        scopes = scope.split()
    else:
        scopes = []
    return {"subject": subject, "scopes": scopes}


def require_scopes(auth: dict[str, Any], required_scopes: list[str]) -> bool:
    available = set(auth.get("scopes", []))
    if not all(scope in available for scope in required_scopes):
        raise AuthError("AUTH_SCOPE_MISSING", 403)
    return True


@dataclass
class LogtoJwtVerifier:
    issuer: str
    audience: str
    fetcher: Callable[[str], Any] | None = None
    cache_ttl_seconds: int = 300
    unknown_kid_cache_ttl_seconds: int = 30
    forced_refresh_cooldown_seconds: int = 1
    unknown_kid_cache_max: int = 256
    now: Callable[[], int] = lambda: int(time.time())
    trusted_jwks_hosts: frozenset[str] = field(default_factory=frozenset)

    def __post_init__(self):
        self.issuer = self.issuer.rstrip("/")
        _parse_secure_url(self.issuer, "AUTH_ISSUER_INVALID")
        self.trusted_jwks_hosts = frozenset(str(item).lower() for item in self.trusted_jwks_hosts)
        self._discovery: dict[str, Any] | None = None
        self._keys: dict[str, Any] = {}
        self._keys_at = 0
        self._keys_loaded = False
        self._last_forced_refresh_at = 0
        self._refresh_lock = None
        self._refresh_loop = None
        self._unknown_kid_cache: dict[str, int] = {}

    def _get_refresh_lock(self):
        loop = asyncio.get_running_loop()
        if self._refresh_lock is None or self._refresh_loop is not loop:
            self._refresh_lock = asyncio.Lock()
            self._refresh_loop = loop
        return self._refresh_lock

    async def _get_json(self, url: str) -> dict[str, Any]:
        try:
            if self.fetcher:
                response = await self.fetcher(url)
            else:
                import httpx

                async with httpx.AsyncClient(timeout=5) as client:
                    response = await client.get(url)
            if response.status_code < 200 or response.status_code >= 300:
                raise AuthError("AUTH_JWKS_UNAVAILABLE")
        except AuthError:
            raise
        except Exception as exc:
            raise AuthError("AUTH_JWKS_UNAVAILABLE") from exc
        try:
            body = response.json()
        except Exception as exc:
            raise AuthError("AUTH_JWKS_INVALID") from exc
        if not isinstance(body, dict):
            raise AuthError("AUTH_JWKS_INVALID")
        return body

    async def _get_keys(self, force: bool = False) -> dict[str, Any]:
        current = self.now()
        if not force and self._keys_loaded and current - self._keys_at < self.cache_ttl_seconds:
            return self._keys
        async with self._get_refresh_lock():
            current = self.now()
            if not force and self._keys_loaded and current - self._keys_at < self.cache_ttl_seconds:
                return self._keys
            if (
                force
                and self._keys_loaded
                and current - self._last_forced_refresh_at < self.forced_refresh_cooldown_seconds
            ):
                return self._keys
            if self._discovery is None:
                discovery = await self._get_json(f"{self.issuer}/.well-known/openid-configuration")
                jwks_uri = discovery.get("jwks_uri")
                if discovery.get("issuer") != self.issuer or not isinstance(jwks_uri, str):
                    raise AuthError("AUTH_DISCOVERY_INVALID")
                issuer_origin = _origin(_parse_secure_url(self.issuer, "AUTH_DISCOVERY_INVALID"))
                jwks_url = _parse_secure_url(jwks_uri, "AUTH_DISCOVERY_INVALID")
                if _origin(jwks_url) != issuer_origin and not _trusted_host(jwks_url, self.trusted_jwks_hosts):
                    raise AuthError("AUTH_DISCOVERY_INVALID")
                self._discovery = {**discovery, "jwks_uri": jwks_url.geturl()}
            if force:
                self._last_forced_refresh_at = current
            body = await self._get_json(self._discovery["jwks_uri"])
            keys = body.get("keys")
            if not isinstance(keys, list):
                raise AuthError("AUTH_JWKS_INVALID")
            usable_keys: dict[str, Any] = {}
            for key in keys:
                if not isinstance(key, dict) or not isinstance(key.get("kid"), str) or not key.get("kid"):
                    continue
                if key.get("kty") != "RSA" or key.get("alg") not in (None, "RS256"):
                    continue
                if key.get("use") not in (None, "sig"):
                    continue
                key_ops = key.get("key_ops")
                if key_ops is not None and (not isinstance(key_ops, list) or "verify" not in key_ops):
                    continue
                if key["kid"] in usable_keys:
                    continue
                try:
                    usable_keys[key["kid"]] = _public_key_from_jwk(key)
                except AuthError:
                    continue
            self._keys = usable_keys
            self._keys_at = self.now()
            self._keys_loaded = True
            return self._keys

    async def verify(self, token: str) -> dict[str, Any]:
        parts = token.split(".") if isinstance(token, str) else []
        if len(parts) != 3:
            raise AuthError("AUTH_TOKEN_INVALID")
        header = _decode_part(parts[0])
        kid = header.get("kid")
        if header.get("alg") != "RS256" or not isinstance(kid, str):
            raise AuthError("AUTH_ALGORITHM_INVALID")
        if not kid or len(kid) > 128 or any(not (char.isalnum() or char in "._:-") for char in kid):
            raise AuthError("AUTH_KEY_NOT_FOUND")
        current = self.now()
        negative_expiry = self._unknown_kid_cache.get(kid)
        if negative_expiry and negative_expiry > current:
            raise AuthError("AUTH_KEY_NOT_FOUND")
        if negative_expiry:
            self._unknown_kid_cache.pop(kid, None)
        keys = await self._get_keys()
        if kid not in keys:
            keys = await self._get_keys(force=True)
        if kid not in keys:
            if len(self._unknown_kid_cache) >= self.unknown_kid_cache_max:
                self._unknown_kid_cache.pop(next(iter(self._unknown_kid_cache)), None)
            self._unknown_kid_cache[kid] = current + self.unknown_kid_cache_ttl_seconds
            raise AuthError("AUTH_KEY_NOT_FOUND")
        self._unknown_kid_cache.pop(kid, None)
        return verify_logto_jwt(token, public_key=keys[kid], issuer=self.issuer, audience=self.audience, now=self.now())


def create_fastapi_dependency(verifier: LogtoJwtVerifier, required_scopes: list[str] | None = None):
    """创建可挂到 FastAPI 路由的 Logto 验证依赖。"""

    scopes = required_scopes or []

    async def dependency(request: Request):
        try:
            token = parse_bearer_token(request.headers.get("authorization"))
            auth = await verifier.verify(token)
            require_scopes(auth, scopes)
            request.state.auth = auth
            return auth
        except AuthError as exc:
            raise HTTPException(status_code=exc.status, detail=exc.code) from exc

    return dependency
