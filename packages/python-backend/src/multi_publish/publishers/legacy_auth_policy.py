"""旧 Python RPA 明文认证持久化的隔离策略。"""

from __future__ import annotations

import os


LEGACY_AUTH_ENV = "MULTI_PUBLISH_ALLOW_LEGACY_PLAINTEXT_AUTH"


def legacy_plaintext_auth_enabled() -> bool:
    """仅在维护人员明确接受风险时开启旧格式兼容。"""
    return os.environ.get(LEGACY_AUTH_ENV, "").strip() == "1"


def require_legacy_plaintext_auth() -> None:
    if not legacy_plaintext_auth_enabled():
        raise RuntimeError("旧 Python 明文认证持久化已停用，请使用桌面端加密账号存储")
