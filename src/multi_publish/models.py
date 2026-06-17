"""
数据模型

平台类型、发布任务、发布结果等核心数据结构。
"""

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any


class PlatformType(Enum):
    """支持的平台类型"""
    WECHAT_MP = "wechat_mp"      # 微信公众号
    ZHIHU = "zhihu"              # 知乎（RPA，待启动）
    WEIBO = "weibo"              # 微博（预留）
    DOUYIN = "douyin"            # 抖音（预留）


class TaskStatus(Enum):
    """任务状态"""
    PENDING = "pending"          # 等待执行
    QUEUED = "queued"            # 已入队
    RUNNING = "running"          # 执行中
    SUCCESS = "success"          # 成功
    FAILED = "failed"            # 失败
    CANCELLED = "cancelled"      # 已取消


@dataclass
class PublishResult:
    """
    发布结果

    Attributes:
        success: 是否成功
        platform: 平台名称
        article_id: 平台文章 ID（如公众号 msg_id）
        url: 发布后的文章链接
        error: 错误信息
        duration: 耗时（秒）
    """
    success: bool
    platform: str
    article_id: str | None = None
    url: str | None = None
    error: str | None = None
    duration: float = 0.0


@dataclass
class PublishTask:
    """
    发布任务

    Attributes:
        id: 任务 ID
        title: 文章标题
        content: 文章内容
        platforms: 目标平台列表
        status: 当前状态
        results: 各平台发布结果
        created_at: 创建时间
        scheduled_at: 定时发布时间（None 表示立即执行）
        retry_count: 重试次数
        max_retries: 最大重试次数
        metadata: 额外元数据（封面图、标签等）
    """
    id: str
    title: str
    content: str
    platforms: list[PlatformType]
    status: TaskStatus = TaskStatus.PENDING
    results: dict[PlatformType, PublishResult] = field(default_factory=dict)
    created_at: datetime = field(default_factory=datetime.now)
    scheduled_at: datetime | None = None
    retry_count: int = 0
    max_retries: int = 3
    metadata: dict[str, Any] = field(default_factory=dict)

    def is_finished(self) -> bool:
        return self.status in (TaskStatus.SUCCESS, TaskStatus.FAILED, TaskStatus.CANCELLED)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "title": self.title,
            "platforms": [p.value for p in self.platforms],
            "status": self.status.value,
            "results": {
                p.value: {
                    "success": r.success,
                    "url": r.url,
                    "error": r.error,
                }
                for p, r in self.results.items()
            },
            "created_at": self.created_at.isoformat(),
            "retry_count": self.retry_count,
        }


@dataclass
class PlatformAccount:
    """
    平台账号配置

    Attributes:
        id: 账号 ID
        platform: 平台类型
        name: 账号名称（显示用）
        config: 认证配置（加密存储）
        is_active: 是否启用
        last_validated: 最后验证时间
        created_at: 创建时间
    """
    id: str
    platform: PlatformType
    name: str
    config: dict[str, Any]  # 加密后的配置
    is_active: bool = True
    last_validated: datetime | None = None
    created_at: datetime = field(default_factory=datetime.now)
