"""OpsCenter 安全配置门禁。"""
import datetime as dt

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from jose import jwt
from pydantic import ValidationError

from config import Settings, settings
from middleware.auth import get_current_user


def test_rejects_missing_jwt_secret():
    settings = Settings(_env_file=None, secret_key="", jwt_secret="")

    with pytest.raises(RuntimeError, match="JWT"):
        settings.validate_security()


def test_rejects_public_default_jwt_secret():
    settings = Settings(
        _env_file=None,
        secret_key="dev-secret-change-in-production",
        jwt_secret="",
    )

    with pytest.raises(RuntimeError, match="JWT"):
        settings.validate_security()


def test_accepts_explicit_jwt_secret():
    settings = Settings(
        _env_file=None,
        secret_key="service-secret",
        jwt_secret="explicit-jwt-secret",
    )

    settings.validate_security()
    assert settings.get_jwt_secret() == "explicit-jwt-secret"


def test_rejects_unsupported_jwt_algorithm():
    with pytest.raises(ValidationError):
        Settings(_env_file=None, jwt_algorithm="HS384")


def _credentials(token: str) -> HTTPAuthorizationCredentials:
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)


@pytest.mark.asyncio
async def test_auth_accepts_valid_hs256_token(monkeypatch):
    monkeypatch.setattr(settings, "jwt_secret", "test-jwt-secret")
    monkeypatch.setattr(settings, "secret_key", "")
    token = jwt.encode(
        {
            "user_id": "admin",
            "role": "admin",
            "exp": dt.datetime.now(dt.timezone.utc) + dt.timedelta(minutes=5),
        },
        "test-jwt-secret",
        algorithm="HS256",
    )

    payload = await get_current_user(_credentials(token))

    assert payload["user_id"] == "admin"


@pytest.mark.asyncio
@pytest.mark.parametrize("token_kind", ["tampered", "expired", "hs384"])
async def test_auth_rejects_invalid_jwt(monkeypatch, token_kind):
    monkeypatch.setattr(settings, "jwt_secret", "test-jwt-secret")
    monkeypatch.setattr(settings, "secret_key", "")
    secret = "wrong-secret" if token_kind == "tampered" else "test-jwt-secret"
    expires = (
        dt.datetime.now(dt.timezone.utc) - dt.timedelta(minutes=5)
        if token_kind == "expired"
        else dt.datetime.now(dt.timezone.utc) + dt.timedelta(minutes=5)
    )
    algorithm = "HS384" if token_kind == "hs384" else "HS256"
    token = jwt.encode(
        {"user_id": "admin", "role": "admin", "exp": expires},
        secret,
        algorithm=algorithm,
    )

    with pytest.raises(HTTPException) as error:
        await get_current_user(_credentials(token))

    assert error.value.status_code == 401


@pytest.mark.asyncio
async def test_lifespan_rejects_missing_jwt_before_database_init(monkeypatch):
    import main

    monkeypatch.setattr(main.settings, "jwt_secret", "")
    monkeypatch.setattr(main.settings, "secret_key", "")

    async def unexpected_init():
        raise AssertionError("安全门禁失败时不应初始化数据库")

    monkeypatch.setattr(main, "init_db", unexpected_init)

    with pytest.raises(RuntimeError, match="JWT"):
        async with main.lifespan(main.app):
            pass
