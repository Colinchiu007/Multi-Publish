"""
平台发布器注册表 — 支持运行时发现与插件化加载

设计（参考蚁小二的 yixiaoer-rpa 热更新机制）：
  1. platforms.json 作为外部配置，列出所有已注册平台
  2. 格式 "module_path:ClassName" = 标准 Python entry_point 风格
  3. 新增平台只需在 json 中添加一行，无需修改 Python 代码
  4. 自动扫描 publishers/ 目录发现未注册的平台模块

使用示例：
  from multi_publish.publishers.platform_registry import registry

  # 获取发布器类
  cls = registry.get("douyin")
  publisher = cls(config)

  # 注册新平台（运行时）
  registry.register("kuaishou", "my_plugin.kuaishou:KuaiShouPublisher")

  # 列出所有平台
  registry.list_platforms()
"""

from __future__ import annotations

import importlib
import json
import os
import pkgutil
from pathlib import Path
from typing import Type

from loguru import logger

from multi_publish.models import PlatformType
from multi_publish.publishers.base import BasePublisher


# ─── 默认注册表（硬编码兜底） ─────────────────────────────────
# 当 platforms.json 不存在时使用此字典
# 格式: {platform_type_value: "module_path:ClassName"}

_DEFAULT_REGISTRY: dict[str, str] = {
    "douyin": "multi_publish.publishers.douyin:DouyinPublisher",
    "wechat_mp": "multi_publish.publishers.wechat_mp:WeChatPublisher",
}


class PlatformRegistry:
    """
    平台注册表 — 管理发布器类的注册与发现

    职责：
    - 从 platforms.json 加载注册信息
    - 按需延迟导入（import 只在首次 get 时发生）
    - 运行时注册新平台（add / register）
    - 自动扫描 publishers/ 目录发现新模块
    """

    def __init__(self, config_path: str | None = None):
        self._config_path = config_path or self._default_config_path()
        self._entries: dict[str, str] = {}   # platform_key → "module:Class"
        self._cache: dict[str, Type[BasePublisher]] = {}  # platform_key → class
        self._loaded = False

    # ── 加载 ─────────────────────────────────────────────

    @staticmethod
    def _default_config_path() -> str:
        """platforms.json 默认位置：与本文件同目录"""
        return os.path.join(os.path.dirname(__file__), "platforms.json")

    def load(self):
        """
        加载注册表配置

        加载顺序（高优先级优先）：
        1. 外部 platforms.json（用户自定义，可热更新）
        2. 硬编码 _DEFAULT_REGISTRY（兜底）
        """
        if self._loaded:
            return

        # 尝试从文件加载
        if os.path.exists(self._config_path):
            try:
                with open(self._config_path) as f:
                    data = json.load(f)
                self._entries = data
                logger.info(f"平台注册表已加载: {len(data)} 个平台 (来自 {self._config_path})")
            except Exception as e:
                logger.warning(f"加载 platforms.json 失败: {e}，使用默认注册表")
                self._entries = dict(_DEFAULT_REGISTRY)
        else:
            logger.info(f"platforms.json 不存在，使用内置默认注册表 ({len(_DEFAULT_REGISTRY)} 个平台)")
            self._entries = dict(_DEFAULT_REGISTRY)

        self._loaded = True

    def reload(self):
        """重新加载配置（热更新用：修改 platforms.json 后调用）"""
        self._loaded = False
        self._cache.clear()
        self.load()

    # ── 注册 ─────────────────────────────────────────────

    def register(self, platform_key: str, entry_point: str):
        """
        注册一个平台发布器（运行时调用）

        Args:
            platform_key: 平台标识（如 "douyin", "kuaishou"）
            entry_point: 类路径（如 "my_plugin.kuaishou:KuaiShouPublisher"）
        """
        self._entries[platform_key] = entry_point
        # 清除缓存，下次 get 会重新加载
        self._cache.pop(platform_key, None)
        logger.info(f"平台已注册: {platform_key} → {entry_point}")

    def unregister(self, platform_key: str):
        """注销一个平台"""
        self._entries.pop(platform_key, None)
        self._cache.pop(platform_key, None)
        logger.info(f"平台已注销: {platform_key}")

    # ── 获取 ─────────────────────────────────────────────

    def get(self, platform: PlatformType) -> Type[BasePublisher]:
        """
        获取平台发布器类（延迟导入）

        Args:
            platform: 平台类型枚举

        Returns:
            发布器类（BasePublisher 子类）

        Raises:
            ValueError: 平台未注册或导入失败
        """
        self.load()
        key = platform.value

        # 检查缓存
        if key in self._cache:
            return self._cache[key]

        # 查找 entry_point
        entry_point = self._entries.get(key)
        if not entry_point:
            raise ValueError(
                f"平台 '{key}' 未注册。可用平台: {', '.join(self._entries.keys())}"
            )

        # 延迟导入
        try:
            cls = self._import_class(entry_point)
            self._cache[key] = cls
            return cls
        except Exception as e:
            raise ValueError(f"加载平台 '{key}' 失败 ({entry_point}): {e}")

    def get_by_key(self, key: str) -> Type[BasePublisher]:
        """
        通过字符串 key 获取发布器类

        Args:
            key: 平台标识字符串（如 "douyin"）

        Returns:
            发布器类
        """
        # 先尝试转为 PlatformType
        try:
            pt = PlatformType(key)
            return self.get(pt)
        except ValueError:
            pass

        # 直接查找
        self.load()
        entry_point = self._entries.get(key)
        if not entry_point:
            raise ValueError(f"平台 '{key}' 未注册")
        try:
            return self._import_class(entry_point)
        except Exception as e:
            raise ValueError(f"加载平台 '{key}' 失败: {e}")

    # ── 查询 ─────────────────────────────────────────────

    def is_supported(self, platform: PlatformType) -> bool:
        """检查平台是否已注册"""
        self.load()
        return platform.value in self._entries

    def list_platforms(self) -> list[str]:
        """列出所有已注册的平台 key"""
        self.load()
        return list(self._entries.keys())

    def list_as_enum(self) -> list[PlatformType]:
        """列出所有已注册的平台枚举"""
        self.load()
        result = []
        for key in self._entries:
            try:
                result.append(PlatformType(key))
            except ValueError:
                pass  # 跳过不在枚举中的 key（可能是外部插件）
        return result

    def count(self) -> int:
        """已注册平台数量"""
        self.load()
        return len(self._entries)

    # ── 自动发现 ─────────────────────────────────────────

    def scan_publishers_package(self, package_path: str | None = None) -> list[str]:
        """
        扫描 publishers 目录，自动注册未列出的平台模块

        命名约定：
        - 文件名匹配 "{platform_key}.py"（如 douyin.py → "douyin"）
        - 文件中包含 class {PlatformKey}Publisher(BasePublisher)
        - 自动推断 entry_point = "path.to.module:{PlatformKey}Publisher"

        Returns:
            新发现的平台 key 列表
        """
        self.load()
        scan_dir = package_path or os.path.dirname(__file__)
        discovered = []

        for fname in os.listdir(scan_dir):
            if not fname.endswith(".py") or fname.startswith("_"):
                continue
            module_name = fname[:-3]  # 去掉 .py

            # 跳过已注册的
            if module_name in self._entries:
                continue

            # 尝试推断 entry_point
            # 文件: kuaishou.py → class KuaiShouPublisher
            # 文件: weibo.py → class WeiboPublisher
            possible_class_names = [
                f"{module_name.title().replace('_', '')}Publisher",   # douyin → DouyinPublisher
                f"{''.join(w.capitalize() for w in module_name.split('_'))}Publisher",  # wechat_mp → WechatMpPublisher
            ]

            # 尝试导入
            for class_name in possible_class_names:
                entry_point = f"multi_publish.publishers.{module_name}:{class_name}"
                try:
                    cls = self._import_class(entry_point)
                    if issubclass(cls, BasePublisher) and cls is not BasePublisher:
                        self._entries[module_name] = entry_point
                        self._cache[module_name] = cls
                        discovered.append(module_name)
                        logger.info(f"自动发现平台: {module_name} → {entry_point}")
                        break
                except Exception:
                    continue

        return discovered

    # ── 内部工具 ─────────────────────────────────────────

    @staticmethod
    def _import_class(entry_point: str) -> Type:
        """
        从 entry_point 字符串导入类

        "multi_publish.publishers.douyin:DouyinPublisher"
          → from multi_publish.publishers.douyin import DouyinPublisher
        """
        module_path, class_name = entry_point.split(":", 1)
        module = importlib.import_module(module_path)
        return getattr(module, class_name)

    def to_dict(self) -> dict[str, str]:
        """导出当前注册表（用于持久化）"""
        self.load()
        return dict(self._entries)


# ─── 全局单例 ─────────────────────────────────────────────
# 应用整个后端共享同一个注册表实例

registry = PlatformRegistry()