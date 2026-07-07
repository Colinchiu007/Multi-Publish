"""
多平台一键发布 — 顶层模块
"""

from multi_publish.account_store import AccountStore
from multi_publish.core import PublisherManager, PublishScheduler, TaskQueue
from multi_publish.core.data_sync import DataSyncService, SyncType
from multi_publish.core.downloader import DownloadManager, DownloadResult
from multi_publish.core.progress import ProgressEvent, ProgressReporter, PublishStage
from multi_publish.core.query_worker import QueryWorker, QueryWorkerFactory
from multi_publish.core.task_scheduler import StateQueryScheduler, StateQueryTask
from multi_publish.crypto import CredentialCrypto, get_crypto
from multi_publish.models import PlatformAccount, PlatformType, PublishResult, PublishTask, TaskStatus

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
    # 新增
    "QueryWorker",
    "QueryWorkerFactory",
    "StateQueryScheduler",
    "StateQueryTask",
    "ProgressReporter",
    "ProgressEvent",
    "PublishStage",
    "DownloadManager",
    "DownloadResult",
    "DataSyncService",
    "SyncType",
    # 存储
    "AccountStore",
]
