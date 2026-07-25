"""旧 Python RPA 明文认证持久化的隔离策略。"""

from __future__ import annotations

import os


LEGACY_AUTH_ENV = "MULTI_PUBLISH_ALLOW_LEGACY_PLAINTEXT_AUTH"
LEGACY_AUTH_MIGRATION_ENV = "MULTI_PUBLISH_LEGACY_AUTH_MIGRATION"
_PRODUCTION_ENVIRONMENTS = {"production", "prod"}


def _is_production_environment() -> bool:
    """生产运行时绝不允许重新启用旧明文凭据。"""
    return any(
        os.environ.get(name, "").strip().lower() in _PRODUCTION_ENVIRONMENTS
        for name in ("MULTI_PUBLISH_ENV", "APP_ENV", "NODE_ENV")
    )


def legacy_plaintext_auth_enabled() -> bool:
    """仅允许非生产环境的受控迁移临时读取旧格式。"""
    return (
        not _is_production_environment()
        and os.environ.get(LEGACY_AUTH_ENV, "").strip() == "1"
        and os.environ.get(LEGACY_AUTH_MIGRATION_ENV, "").strip() == "1"
    )


def require_legacy_plaintext_auth() -> None:
    if not legacy_plaintext_auth_enabled():
        raise RuntimeError("旧 Python 明文认证持久化已停用，请使用桌面端加密账号存储")
