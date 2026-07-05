"""PreCheck — 发布前内容预检管线（已注释：依赖 TikHub 付费 API）

保留架构文档，check_duplicate 始终返回 PASS。
启用时需要 TikHubBridge.available == True。
"""

from __future__ import annotations
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Optional

__all__ = ["PreCheckEngine", "DuplicateCheck", "CheckResult", "CheckSeverity"]


class CheckSeverity(Enum):
    PASS = "pass"
    WARN = "warn"
    BLOCK = "block"


@dataclass
class CheckResult:
    """预检结果"""
    passed: bool
    severity: CheckSeverity = CheckSeverity.PASS
    message: str = ""
    details: dict[str, Any] = field(default_factory=dict)


@dataclass
class DuplicateCheck:
    """重复检查配置"""
    title: str
    platform: str
    content_hash: Optional[str] = None
    threshold: float = 0.8


class PreCheckEngine:
    """发布前预检引擎（当前禁用 — 依赖 TikHub 付费 API）

    启用条件：
        1. TikHub SDK 已安装 (pip install tikhub)
        2. TikHub api_key 已配置
        3. TikHubBridge.available == True

    启用后行为：
        使用 TikHub 数据 API 搜索目标平台标题，发现重复则阻断发布。
    """

    def __init__(self, tikhub_bridge):
        from multi_publish.tikhub_bridge import TikHubBridge
        if not isinstance(tikhub_bridge, TikHubBridge):
            raise TypeError("tikhub_bridge must be a TikHubBridge instance")
        self._bridge = tikhub_bridge

    @property
    def available(self) -> bool:
        return False

    def check_duplicate(self, check: DuplicateCheck) -> CheckResult:
        """预检已禁用，始终返回通过"""
        return CheckResult(
            passed=True, severity=CheckSeverity.PASS,
            message="预检已禁用（TikHub 付费 API 未启用）",
        )
