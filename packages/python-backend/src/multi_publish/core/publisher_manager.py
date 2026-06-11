"""
发布器管理器

统一管理所有平台的发布器实例，支持动态注册、获取、关闭。
"""

from typing import Type

from multi_publish.models import PlatformType
from multi_publish.publishers.base import BasePublisher


class PublisherManager:
    """
    发布器管理器

    负责：
    1. 动态注册/卸载发布器
    2. 根据平台类型创建发布器实例
    3. 管理发布器生命周期（创建/关闭）
    4. 批量发布协调
    """

    def __init__(self):
        self._publishers: dict[PlatformType, BasePublisher] = {}
        self._publisher_classes: dict[PlatformType, Type[BasePublisher]] = {}

    def register(self, platform: PlatformType, publisher_class: Type[BasePublisher]):
        """注册发布器类"""
        self._publisher_classes[platform] = publisher_class

    def get(self, platform: PlatformType) -> BasePublisher | None:
        """获取已初始化的发布器实例"""
        return self._publishers.get(platform)

    async def ensure_initialized(self, platform: PlatformType, config: dict) -> BasePublisher:
        """确保发布器已初始化，未初始化则创建"""
        if platform not in self._publishers:
            if platform not in self._publisher_classes:
                raise ValueError(f"未知平台: {platform}")
            
            cls = self._publisher_classes[platform]
            publisher = cls(config=config)
            await publisher.initialize()
            self._publishers[platform] = publisher
        
        return self._publishers[platform]

    async def publish_to_platforms(
        self,
        title: str,
        content: str,
        platforms: list[PlatformType],
        **kwargs,
    ) -> dict[PlatformType, "PublishResult"]:
        """
        批量发布到多个平台

        Args:
            title: 文章标题
            content: 文章内容
            platforms: 目标平台列表
            **kwargs: 平台特定参数（如封面图、标签等）

        Returns:
            {platform: PublishResult} 各平台发布结果
        """
        from multi_publish.models import PublishResult

        results: dict[PlatformType, PublishResult] = {}

        for platform in platforms:
            try:
                publisher = await self.ensure_initialized(platform, kwargs.get(f"{platform.value}_config", {}))
                result = await publisher.publish(title, content, **kwargs)
                results[platform] = result
            except Exception as e:
                results[platform] = PublishResult(
                    success=False,
                    platform=platform.value,
                    error=str(e),
                )

        return results

    async def close_all(self):
        """关闭所有发布器实例"""
        for publisher in self._publishers.values():
            try:
                await publisher.close()
            except Exception:
                pass
        self._publishers.clear()

    def get_available_platforms(self) -> list[PlatformType]:
        """获取已注册的可用平台列表"""
        return list(self._publisher_classes.keys())
