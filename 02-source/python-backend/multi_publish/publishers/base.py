"""
基础发布器接口

所有平台发布器必须继承此类并实现抽象方法。
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any

from multi_publish.models import PlatformType, PublishResult


@dataclass
class PublisherConfig:
    """发布器配置基类"""
    platform: PlatformType


class BasePublisher(ABC):
    """
    基础发布器

    所有平台发布器必须实现以下接口：
    - initialize(): 初始化资源（如浏览器实例、API 客户端）
    - publish(): 发布内容
    - check_auth(): 检查认证状态
    - close(): 关闭资源
    """

    @property
    @abstractmethod
    def platform(self) -> PlatformType:
        """返回发布器对应的平台类型"""
        pass

    async def initialize(self):
        """
        初始化资源

        子类可重写此方法初始化特定资源（如 Playwright 浏览器、HTTP 客户端等）
        """
        pass

    @abstractmethod
    async def publish(self, title: str, content: str, **kwargs) -> PublishResult:
        """
        发布内容到平台

        Args:
            title: 文章标题
            content: 文章内容（Markdown 格式）
            **kwargs: 平台特定参数
                - cover_image: 封面图路径/URL
                - tags: 标签列表
                - category: 分类
                - summary: 摘要
                - draft: 是否发布为草稿

        Returns:
            PublishResult: 发布结果
        """
        pass

    @abstractmethod
    async def check_auth(self) -> bool:
        """
        检查认证状态

        Returns:
            True 如果认证有效，False 如果需要重新登录
        """
        pass

    async def close(self):
        """
        关闭资源

        子类可重写此方法清理特定资源
        """
        pass
