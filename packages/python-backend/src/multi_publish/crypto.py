"""
凭证加密模块

使用 AES-256 加密存储平台认证凭证。
"""

import base64
import os
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from loguru import logger


class CredentialCrypto:
    """
    凭证加密器

    使用 AES-256（通过 Fernet）加密存储敏感信息。
    密钥派生：PBKDF2-HMAC-SHA256 + 随机盐值
    """

    def __init__(self, master_password: str = ""):
        """
        初始化加密器

        Args:
            master_password: 主密码（用于派生密钥）
                - 如果为空，使用随机生成的密钥（适合开发环境）
                - 如果提供，使用 PBKDF2 派生密钥（适合生产环境）
        """
        if master_password:
            # 从主密码派生密钥
            salt = os.urandom(16)
            kdf = PBKDF2HMAC(
                algorithm=hashes.SHA256(),
                length=32,
                salt=salt,
                iterations=480000,
            )
            key = base64.urlsafe_b64encode(kdf.derive(master_password.encode()))
            self._fernet = Fernet(key)
            self._salt = salt
        else:
            # 使用随机密钥（开发环境）
            self._fernet = Fernet.generate_key()
            self._fernet = Fernet(self._fernet)
            self._salt = None
            logger.warning("使用随机密钥，重启后无法解密已有凭证（开发模式）")

    def encrypt(self, plaintext: str) -> str:
        """
        加密明文

        Args:
            plaintext: 明文字符串

        Returns:
            加密后的 Base64 字符串
        """
        encrypted = self._fernet.encrypt(plaintext.encode())
        return base64.urlsafe_b64encode(encrypted).decode()

    def decrypt(self, ciphertext: str) -> str:
        """
        解密密文

        Args:
            ciphertext: 加密后的 Base64 字符串

        Returns:
            明文字符串
        """
        try:
            decoded = base64.urlsafe_b64decode(ciphertext.encode())
            decrypted = self._fernet.decrypt(decoded)
            return decrypted.decode()
        except Exception as e:
            logger.error(f"解密失败: {e}")
            raise ValueError(f"解密失败: {e}") from e

    def encrypt_dict(self, data: dict) -> dict:
        """
        加密字典中的所有字符串值

        Args:
            data: 包含敏感信息的字典

        Returns:
            加密后的字典
        """
        encrypted = {}
        for key, value in data.items():
            if isinstance(value, str):
                # 检测是否已经是加密格式（enc: 前缀）
                if value.startswith("enc:"):
                    encrypted[key] = value  # 已是加密格式，保持原样
                else:
                    encrypted[key] = f"enc:{self.encrypt(value)}"
            elif isinstance(value, dict):
                encrypted[key] = self.encrypt_dict(value)
            else:
                encrypted[key] = value
        return encrypted

    def decrypt_dict(self, data: dict) -> dict:
        """
        解密字典中的所有加密值

        Args:
            data: 包含加密信息的字典

        Returns:
            解密后的字典
        """
        decrypted = {}
        for key, value in data.items():
            if isinstance(value, str) and value.startswith("enc:"):
                decrypted[key] = self.decrypt(value[4:])  # 去掉 enc: 前缀
            elif isinstance(value, dict):
                decrypted[key] = self.decrypt_dict(value)
            else:
                decrypted[key] = value
        return decrypted


# 全局加密器实例（单例）
_crypto_instance: CredentialCrypto | None = None


def get_crypto(master_password: str = "") -> CredentialCrypto:
    """获取全局加密器实例"""
    global _crypto_instance
    if _crypto_instance is None:
        _crypto_instance = CredentialCrypto(master_password)
    return _crypto_instance
