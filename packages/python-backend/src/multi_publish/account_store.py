"""
账号持久化存储模块

将平台账号配置持久化到 JSON 文件，支持加密存储和自动加载。
"""

import json
import os
from datetime import datetime
from pathlib import Path
from typing import Any

from loguru import logger

from multi_publish.crypto import CredentialCrypto
from multi_publish.models import PlatformAccount, PlatformType


class AccountStore:
    """
    账号持久化存储

    功能：
    1. 将账号配置保存到 JSON 文件（加密敏感字段）
    2. 启动时自动加载已保存的账号
    3. 支持增删改查操作
    4. 使用主密码派生密钥，重启后可解密
    """

    def __init__(
        self,
        storage_path: str | Path,
        master_password: str = "",
    ):
        """
        初始化账号存储

        Args:
            storage_path: 存储文件路径（JSON）
            master_password: 主密码（用于密钥派生）
                - 如果为空，使用随机密钥（开发模式，重启后无法解密）
                - 如果提供，使用 PBKDF2 派生固定密钥（生产模式）
        """
        self.storage_path = Path(storage_path)
        self.master_password = master_password
        self._crypto = CredentialCrypto(master_password)
        self._accounts: dict[str, PlatformAccount] = {}

        # 确保存储目录存在
        self.storage_path.parent.mkdir(parents=True, exist_ok=True)

        # 加载已保存的账号
        self._load()

    @property
    def crypto(self) -> CredentialCrypto:
        """获取加密器实例"""
        return self._crypto

    def _load(self) -> None:
        """从文件加载账号"""
        if not self.storage_path.exists():
            logger.info(f"存储文件不存在: {self.storage_path}，创建新存储")
            self._save()  # 创建空文件
            return

        try:
            with open(self.storage_path, "r", encoding="utf-8") as f:
                data = json.load(f)

            accounts_data = data.get("accounts", [])
            for acc_data in accounts_data:
                # 解密配置
                decrypted_config = self._crypto.decrypt_dict(acc_data.get("config", {}))

                account = PlatformAccount(
                    id=acc_data["id"],
                    platform=PlatformType(acc_data["platform"]),
                    name=acc_data["name"],
                    config=decrypted_config,  # 存储明文配置（运行时）
                    is_active=acc_data.get("is_active", True),
                    last_validated=self._parse_datetime(acc_data.get("last_validated")),
                    created_at=self._parse_datetime(acc_data.get("created_at")) or datetime.now(),
                )
                self._accounts[account.id] = account

            logger.info(f"已加载 {len(self._accounts)} 个账号")

        except Exception as e:
            logger.error(f"加载账号存储失败: {e}，创建新存储")
            self._accounts = {}
            self._save()

    def _save(self) -> None:
        """保存账号到文件"""
        try:
            # 加密配置后保存
            accounts_data = []
            for account in self._accounts.values():
                encrypted_config = self._crypto.encrypt_dict(account.config)
                accounts_data.append({
                    "id": account.id,
                    "platform": account.platform.value,
                    "name": account.name,
                    "config": encrypted_config,  # 加密存储
                    "is_active": account.is_active,
                    "last_validated": account.last_validated.isoformat() if account.last_validated else None,
                    "created_at": account.created_at.isoformat(),
                })

            data = {
                "version": "1.0",
                "updated_at": datetime.now().isoformat(),
                "accounts": accounts_data,
            }

            # 写入文件（原子写入：先写临时文件，再重命名）
            temp_path = self.storage_path.with_suffix(".tmp")
            with open(temp_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            temp_path.replace(self.storage_path)

            logger.debug(f"已保存 {len(accounts_data)} 个账号到 {self.storage_path}")

        except Exception as e:
            logger.error(f"保存账号存储失败: {e}")
            raise

    @staticmethod
    def _parse_datetime(value: str | None) -> datetime | None:
        """解析 ISO 格式日期时间"""
        if not value:
            return None
        try:
            return datetime.fromisoformat(value)
        except ValueError:
            return None

    # ========== CRUD 操作 ==========

    def list_accounts(self, platform: PlatformType | None = None, active_only: bool = False) -> list[PlatformAccount]:
        """列出账号"""
        accounts = list(self._accounts.values())
        if platform:
            accounts = [a for a in accounts if a.platform == platform]
        if active_only:
            accounts = [a for a in accounts if a.is_active]
        return accounts

    def get_account(self, account_id: str) -> PlatformAccount | None:
        """获取单个账号"""
        return self._accounts.get(account_id)

    def add_account(self, account: PlatformAccount) -> PlatformAccount:
        """添加账号"""
        if account.id in self._accounts:
            raise ValueError(f"账号已存在: {account.id}")
        self._accounts[account.id] = account
        self._save()
        logger.info(f"添加账号: {account.name} ({account.platform.value})")
        return account

    def update_account(self, account_id: str, updates: dict[str, Any]) -> PlatformAccount | None:
        """更新账号"""
        account = self._accounts.get(account_id)
        if not account:
            return None

        # 更新字段
        if "name" in updates:
            account.name = updates["name"]
        if "config" in updates:
            # 新配置需要重新加密
            account.config = updates["config"]
        if "is_active" in updates:
            account.is_active = updates["is_active"]
        if "last_validated" in updates:
            account.last_validated = updates["last_validated"]

        self._save()
        logger.info(f"更新账号: {account_id}")
        return account

    def delete_account(self, account_id: str) -> bool:
        """删除账号"""
        if account_id not in self._accounts:
            return False
        del self._accounts[account_id]
        self._save()
        logger.info(f"删除账号: {account_id}")
        return True

    def get_config_for_platform(self, platform: PlatformType) -> dict[str, Any] | None:
        """获取指定平台的账号配置（用于发布器初始化）"""
        accounts = self.list_accounts(platform=platform, active_only=True)
        if not accounts:
            return None
        # 返回第一个活跃账号的配置
        return accounts[0].config
