"""
多平台一键发布核心模块

发布器管理器 + 任务队列 + 调度器 + 查询工作器 + 进度上报 + 下载管理 + 数据同步
"""

from .data_sync import DataSyncService, SyncType, get_data_sync_service
from .downloader import DownloadManager, DownloadResult
from .progress import ProgressEvent, ProgressReporter, PublishStage, create_ipc_progress_callback
from .publisher_manager import PublisherManager
from .query_worker import (
    AccountOverview,
    AuditStatus,
    AuditStatusEnum,
    ContentItem,
    LocationInfo,
    MusicInfo,
    QueryWorker,
    QueryWorkerFactory,
    TopicInfo,
)
from .scheduler import PublishScheduler
from .task_queue import PublishTask, TaskQueue, TaskStatus
from .task_scheduler import StateQueryScheduler, StateQueryTask

__all__ = [
    # 原有
    "PublisherManager",
    "TaskQueue",
    "PublishTask",
    "TaskStatus",
    "PublishScheduler",
    # 新增
    "QueryWorker",
    "QueryWorkerFactory",
    "AuditStatus",
    "AuditStatusEnum",
    "AccountOverview",
    "ContentItem",
    "TopicInfo",
    "MusicInfo",
    "LocationInfo",
    "StateQueryScheduler",
    "StateQueryTask",
    "ProgressReporter",
    "ProgressEvent",
    "PublishStage",
    "create_ipc_progress_callback",
    "DownloadManager",
    "DownloadResult",
    "DataSyncService",
    "SyncType",
    "get_data_sync_service",
]
