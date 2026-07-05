"""发布器管理器

统一管理所有平台的发布器实例，支持动态注册、获取、关闭。
集成 PreCheckEngine 发布前预检（可选）。
"""

import asyncio
from typing import Any, Callable, Coroutine

from multi_publish.models import PlatformType, PublishPhase
from multi_publish.publishers.base import BasePublisher, PublisherConfig
from multi_publish.publishers.platform_registry import registry


class PublisherManager:
    """发布器管理器

    负责：
    1. 通过 PlatformRegistry 动态发现平台发布器
    2. 管理发布器生命周期（创建/关闭）
    3. 批量发布协调
    4. 发布前预检（PreCheckEngine）— 可选
    """

    def __init__(self, data_dir: str = "./data"):
        self.data_dir = data_dir
        self._publishers: dict = {}
        self.precheck_enabled = False
        self._precheck_engine = None

    def enable_precheck(self, api_key: str = ""):
        """开启发布前预检 — 当前已禁用（依赖 TikHub 付费 API）"""
        from multi_publish.tikhub_bridge import TikHubBridge
        from multi_publish.precheck import PreCheckEngine
        bridge = TikHubBridge(api_key=api_key)
        self._precheck_engine = PreCheckEngine(tikhub_bridge=bridge)
        self.precheck_enabled = True
        from loguru import logger
        logger.warning("PreCheck 已启用但不可用：TikHub 付费 API 暂未启用，预检将跳过")

    def disable_precheck(self):
        """关闭发布前预检"""
        self._precheck_engine = None
        self.precheck_enabled = False

    def get_precheck_status(self) -> dict:
        """获取预检状态"""
        if self._precheck_engine:
            return {"enabled": True, "available": False, "message": "TikHub 付费 API 未启用，预检已跳过"}
        return {"enabled": False, "available": False, "message": "预检未启用"}

    def is_supported(self, platform: PlatformType) -> bool:
        return registry.is_supported(platform)

    def get_available_platforms(self) -> list[PlatformType]:
        return registry.list_as_enum()

    def refresh_platforms(self):
        registry.reload()
        registry.scan_publishers_package()

    async def get_or_create(
        self, platform: PlatformType,
        account_id: str | None = None,
        proxy: dict | None = None,
    ) -> BasePublisher:
        key = f"{platform.value}_{account_id}" if account_id else platform.value
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

    async def _run_precheck(self, platform: PlatformType, title: str) -> bool:
        """执行发布前预检，返回 True=通过/False=阻断"""
        if not self._precheck_engine:
            return True
        from multi_publish.precheck import DuplicateCheck
        check = DuplicateCheck(title=title, platform=platform.value)
        result = self._precheck_engine.check_duplicate(check)
        if not result.passed:
            from loguru import logger
            logger.warning(f"预检阻断 [{platform.value}]: {result.message}")
            return False
        return True

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
        proxy: dict | None = None,
        progress_callback: Callable[[PublishPhase, str, int], Coroutine] | None = None,
        **kwargs,
    ):
        """发布到指定平台（含可选预检）"""
        if not await self._run_precheck(platform, title):
            from multi_publish.models import PublishResult
            return PublishResult(
                success=False, platform=platform.value,
                error=f"预检未通过: 平台 {platform.value} 上存在相似内容",
            )

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
        from multi_publish.models import PublishResult
        results: dict[PlatformType, PublishResult] = {}
        targets = platforms or self.get_available_platforms()
        for idx, platform in enumerate(targets):
            if idx > 0:
                await asyncio.sleep(2)
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

    async def login_to_platform(self, platform: PlatformType, account_id: str | None = None, proxy: dict | None = None) -> bool:
        publisher = await self.get_or_create(platform, account_id=account_id, proxy=proxy)
        return await publisher.login()

    async def get_auth_status(self, platform: PlatformType) -> bool:
        try:
            publisher = await self.get_or_create(platform)
            return await publisher.check_auth()
        except Exception:
            return False

    async def close_all(self):
        for platform, publisher in self._publishers.items():
            try:
                await publisher.close()
            except Exception:
                pass
        self._publishers.clear()
