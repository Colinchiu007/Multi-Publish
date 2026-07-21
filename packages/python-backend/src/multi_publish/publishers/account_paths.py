"""平台账号凭证与浏览器数据的安全路径。"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path


_ACCOUNT_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
_PLATFORM_PATTERN = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")


@dataclass(frozen=True)
class AccountStoragePaths:
    account_dir: Path
    auth_file: Path
    cookie_file: Path
    browser_dir: Path
    browser_check_dir: Path
    legacy_auth_file: Path
    legacy_cookie_file: Path


def validate_account_id(account_id: str | None) -> str:
    """校验账号 ID；无账号的旧版模式使用固定 legacy 命名空间。"""
    if account_id is None:
        return "legacy"
    if not isinstance(account_id, str) or not _ACCOUNT_ID_PATTERN.fullmatch(account_id):
        raise ValueError("账号 ID 格式无效")
    return account_id


def build_account_storage_paths(
    data_dir: str | Path,
    platform: str,
    account_id: str | None,
) -> AccountStoragePaths:
    """构造 ``data/accounts/{platform}/{account_id}`` 下的隔离路径。"""
    if not isinstance(platform, str) or not _PLATFORM_PATTERN.fullmatch(platform):
        raise ValueError("平台标识格式无效")
    safe_account_id = validate_account_id(account_id)
    try:
        root = Path(data_dir).resolve(strict=False)
        accounts_root = (root / "accounts").resolve(strict=False)
        account_dir = (accounts_root / platform / safe_account_id).resolve(strict=False)
        account_dir.relative_to(accounts_root)
    except (OSError, RuntimeError, ValueError) as error:
        raise ValueError("账号目录超出数据根目录") from error
    return AccountStoragePaths(
        account_dir=account_dir,
        auth_file=account_dir / "auth.json",
        cookie_file=account_dir / "cookies.json",
        browser_dir=account_dir / "browser_data",
        browser_check_dir=account_dir / "browser_data_check",
        legacy_auth_file=root / f"auth_{platform}.json",
        legacy_cookie_file=root / f"cookies_{platform}.json",
    )
