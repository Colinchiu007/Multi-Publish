"""平台发布器注册表 — 支持运行时发现与插件化加载"""

from __future__ import annotations

import importlib
import json
import os

from loguru import logger

from multi_publish.models import PlatformType
from multi_publish.publishers.base import BasePublisher

_DEFAULT_REGISTRY: dict[str, str] = {
    "douyin": "multi_publish.publishers.douyin:DouyinPublisher",
    "wechat_mp": "multi_publish.publishers.wechat_mp:WeChatPublisher",
    "xiaohongshu": "multi_publish.publishers.xiaohongshu:XiaoHongShuPublisher",
    "bilibili": "multi_publish.publishers.bilibili:BilibiliPublisher",
}


class PlatformRegistry:
    """平台注册表 — 管理发布器类的注册与发现"""

    def __init__(self, config_path: str | None = None):
        self._config_path = config_path or self._default_config_path()
        self._entries: dict[str, str] = {}
        self._cache: dict[str, type[BasePublisher]] = {}
        self._loaded = False

    @staticmethod
    def _default_config_path() -> str:
        return os.path.join(os.path.dirname(__file__), "platforms.json")

    def load(self):
        if self._loaded:
            return
        if os.path.exists(self._config_path):
            try:
                with open(self._config_path) as f:
                    data = json.load(f)
                self._entries = data
                logger.info(f"平台注册表已加载: {len(data)} 个平台 (来自 {self._config_path})")
            except Exception as e:
                logger.warning(f"加载 platforms.json 失败: {e}")
                self._entries = dict(_DEFAULT_REGISTRY)
        else:
            logger.info(f"使用内置默认注册表 ({len(_DEFAULT_REGISTRY)} 个平台)")
            self._entries = dict(_DEFAULT_REGISTRY)
        self._loaded = True

    def reload(self):
        self._loaded = False
        self._cache.clear()
        self.load()

    def register(self, platform_key: str, entry_point: str):
        self._entries[platform_key] = entry_point
        self._cache.pop(platform_key, None)
        logger.info(f"平台已注册: {platform_key} → {entry_point}")

    def unregister(self, platform_key: str):
        self._entries.pop(platform_key, None)
        self._cache.pop(platform_key, None)

    def get(self, platform: PlatformType) -> type[BasePublisher]:
        self.load()
        key = platform.value
        if key in self._cache:
            return self._cache[key]
        entry_point = self._entries.get(key)
        if not entry_point:
            raise ValueError(f"平台 '{key}' 未注册")
        cls = self._import_class(entry_point)
        self._cache[key] = cls
        return cls

    def get_by_key(self, key: str) -> type[BasePublisher]:
        try:
            pt = PlatformType(key)
            return self.get(pt)
        except ValueError:
            pass
        self.load()
        entry_point = self._entries.get(key)
        if not entry_point:
            raise ValueError(f"平台 '{key}' 未注册")
        return self._import_class(entry_point)

    def is_supported(self, platform: PlatformType) -> bool:
        self.load()
        return platform.value in self._entries

    def list_platforms(self) -> list[str]:
        self.load()
        return list(self._entries.keys())

    def list_as_enum(self) -> list[PlatformType]:
        self.load()
        result = []
        for key in self._entries:
            try:
                result.append(PlatformType(key))
            except ValueError:
                pass
        return result

    def count(self) -> int:
        self.load()
        return len(self._entries)

    def scan_publishers_package(self, package_path: str | None = None) -> list[str]:
        self.load()
        scan_dir = package_path or os.path.dirname(__file__)
        discovered = []
        for fname in os.listdir(scan_dir):
            if not fname.endswith(".py") or fname.startswith("_"):
                continue
            module_name = fname[:-3]
            if module_name in self._entries:
                continue
            possible_class_names = [
                f"{module_name.title().replace('_', '')}Publisher",
                f"{''.join(w.capitalize() for w in module_name.split('_'))}Publisher",
            ]
            for class_name in possible_class_names:
                entry_point = f"multi_publish.publishers.{module_name}:{class_name}"
                try:
                    cls = self._import_class(entry_point)
                    if issubclass(cls, BasePublisher) and cls is not BasePublisher:
                        self._entries[module_name] = entry_point
                        self._cache[module_name] = cls
                        discovered.append(module_name)
                        break
                except Exception:
                    continue
        return discovered

    @staticmethod
    def _import_class(entry_point: str) -> type:
        module_path, class_name = entry_point.split(":", 1)
        module = importlib.import_module(module_path)
        return getattr(module, class_name)

    def to_dict(self) -> dict[str, str]:
        self.load()
        return dict(self._entries)


registry = PlatformRegistry()
