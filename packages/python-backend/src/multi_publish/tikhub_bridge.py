"""TikHubBridge — TikHub SDK 桥接层（已注释：付费 API 暂不使用）

保留类结构作为文档参考和未来扩展点。
启用时需要：pip install tikhub + 有效的 API key。
"""

from __future__ import annotations
from typing import Any, Optional

__all__ = ["TikHubBridge", "TikHubBridgeError"]


class TikHubBridgeError(Exception):
    """TikHubBridge 操作异常"""
    pass


class TikHubBridge:
    """TikHub SDK 桥接适配器（当前禁用）

    启用方式：
        1. pip install tikhub
        2. 实例化时传入有效的 api_key
        3. available 返回 True
    """

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or ""
        self._client: Any = None

    @property
    def available(self) -> bool:
        """TikHub 付费 API 已禁用"""
        return False

    @property
    def supported_platforms(self) -> list[str]:
        return []

    def is_platform_supported(self, platform: str) -> bool:
        return False

    def get_resource(self, platform: str) -> Any:
        raise TikHubBridgeError(
            "TikHub 付费 API 暂未启用。需要时请取消注释 tikhub_bridge.py 中的实现，"
            "并配置有效的 API key。"
        )

    async def async_get_resource(self, platform: str) -> Any:
        raise TikHubBridgeError(
            "TikHub 付费 API 暂未启用。"
        )
