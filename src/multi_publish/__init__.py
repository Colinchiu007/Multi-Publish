"""
多平台一键发布 — 顶层模块
"""

from multi_publish.crypto import CredentialCrypto, get_crypto
from multi_publish.models import PlatformType, TaskStatus, PublishResult, PublishTask, PlatformAccount
from multi_publish.core import PublisherManager, TaskQueue, PublishScheduler
from multi_publish.account_store import AccountStore

__version__ = "0.1.1"

__all__ = [
    # 加密
    "CredentialCrypto",
    "get_crypto",
    # 模型
    "PlatformType",
    "TaskStatus",
    "PublishResult",
    "PublishTask",
    "PlatformAccount",
    # 核心
    "PublisherManager",
    "TaskQueue",
    "PublishScheduler",
    # 存储
    "AccountStore",
]
