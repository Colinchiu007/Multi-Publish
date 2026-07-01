"""
发布器管理器

统一管理所有平台的发布器实例，支持动态注册、获取、关闭。

使用 PlatformRegistry 实现插件化发现（取代硬编码 PUBLISHER_REGISTRY）：
- 新增平台 -> 在 platforms.json 添加一行
- 热更新 -> 调用 registry.reload()
- 自动发现 -> 调用 registry.scan_publishers_package()
"""

import asyncio
from typing import Any, Callable, Coroutine

from multi_publish.models import PlatformType, PublishPhase
from multi_publish.publishers.base import BasePublisher, PublisherConfig
from multi_publish.publishers.platform_registry import registry


class PublisherManager:
    """
    发布器管理器

    负责：
    1. 通过 PlatformRegistry 动态发现平台发布器
    2. 管理发布器生命周期（创建/关闭）
    3. 批量发布协调
    """

    def __init__(self, data_dir: str = "./data"):
        self.data_dir = data_dir
        self._publishers: dict[PlatformType, BasePublisher] = {}

    def is_supported(self, platform: PlatformType) -> bool:
        """检查平台是否已注册（通过 registry）"""
        return registry.is_supported(platform)

    def get_available_platforms(self) -> list[PlatformType]:
        """获取已注册的可用平台列表"""
        return registry.list_as_enum()

    def refresh_platforms(self):
        """刷新平台列表（热更新用：修改 platforms.json 后调用）"""
        registry.reload()
        registry.scan_publishers_package()

    async def get_or_create(
        self, platform: PlatformType,
        account_id: str | None = None,
        proxy: dict | None = None,  # P2-1
    ) -> BasePublisher:
        """获取已初始化的发布器，未初始化则创建"""
        key = f"{platform.value}_{account_id}" if account_id else platform.value
        # 同一平台但不同账号使用独立实例（per-account browser data 隔离）
        if key not in self._publishers:
            if not registry.is_supported(platform):
                raise ValueError(
                    f"不支持的平台: {platform}，"
                    f"可用平台: {registry.list_platforms()}"
                )
            cls = registry.get(platform)
            config = PublisherConfig(platform=platform, data_dir=self.data_dir, proxy=proxy)
            publisher = cls(config=config, account_id=account_id)
            await publisher.initialize()
            self._publishers[key] = publisher
        return self._publishers[key]

    async def publish_to_platform(
        self,
        platform: PlatformType,
        title: str,
        content: str = "",
        media_paths: list[str] | None = None,
        cover_path: str | None = None,
        tags: list[str] | None = None,
        draft: bool = False,
        account_id: str | None = None,
        proxy: dict | None = None,  # P2-1
        progress_callback: Callable[[PublishPhase, str, int], Coroutine] | None = None,
        **kwargs,
    ):
        """发布到指定平台"""
        publisher = await self.get_or_create(platform, account_id=account_id, proxy=proxy)
        if progress_callback:
            publisher.set_progress_callback(progress_callback)
        result = await publisher.publish(
            title=title, content=content,
            media_paths=media_paths, cover_path=cover_path,
            tags=tags, draft=draft, **kwargs,
        )
        return result

    async def publish_to_platforms(
        self, title: str, content: str = "",
        platforms: list[PlatformType] | None = None,
        media_paths: list[str] | None = None,
        cover_path: str | None = None,
        tags: list[str] | None = None,
        draft: bool = False,
        account_id: str | None = None,
        **kwargs,
    ) -> dict[PlatformType, "PublishResult"]:
        """批量发布到多个平台"""
        from multi_publish.models import PublishResult
        results: dict[PlatformType, PublishResult] = {}
        targets = platforms or self.get_available_platforms()
        for idx, platform in enumerate(targets):
            if idx > 0:
                await asyncio.sleep(2)  # P2-2: 跨平台 2 秒间隔，防平台端限流
            if not self.is_supported(platform):
                results[platform] = PublishResult(
                    success=False, platform=platform.value,
                    error=f"平台 {platform.value} 暂未实现",
                )
                continue
            try:
                result = await self.publish_to_platform(
                    platform=platform, title=title, content=content,
                    media_paths=media_paths, cover_path=cover_path,
                    tags=tags, draft=draft, account_id=account_id, **kwargs,
                )
                results[platform] = result
            except Exception as e:
                results[platform] = PublishResult(
                    success=False, platform=platform.value, error=str(e),
                )
        return results

    async def login_to_platform(self, platform: PlatformType, account_id: str | None = None) -> bool:
        """启动指定平台的登录流程"""
        publisher = await self.get_or_create(platform, account_id=account_id, proxy=proxy)
        return await publisher.login()

    async def get_auth_status(self, platform: PlatformType) -> bool:
        """检查平台认证状态"""
        try:
            publisher = await self.get_or_create(platform)
            return await publisher.check_auth()
        except Exception:
            return False

    async def close_all(self):
        """关闭所有发布器实例"""
        for platform, publisher in self._publishers.items():
            try:
                await publisher.close()
            except Exception:
                pass
        self._publishers.clear()
