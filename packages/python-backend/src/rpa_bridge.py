"""
RPA Bridge — Python 侧 RPA 执行适配器
接收 Electron 主进程的发布请求，通过 shared_modules rpa_engine 执行
"""
import json
import sys
from pathlib import Path

# 确保 shared_modules 可导入
SHARED_MODULES = Path(__file__).resolve().parent.parent.parent / 'shared_modules'
sys.path.insert(0, str(SHARED_MODULES))

from rpa_engine.base import BaseRPAPublisher
from rpa_engine.browser_pool import BrowserPool
from rpa_engine.cookie_manager import CookieManager


class RPABridge:
    """
    RPA 桥梁 — 统一管理各平台 RPA 发布器
    供 FastAPI 路由或直接调用
    """

    def __init__(self, data_dir: str = None):
        self.pool = BrowserPool()
        self.cookie_mgr = CookieManager(data_dir or "./data")
        self._publishers = {}

    def register_publisher(self, platform: str, publisher_class):
        """注册平台发布器"""
        self._publishers[platform] = publisher_class

    def get_publisher(self, platform: str) -> BaseRPAPublisher:
        """获取平台发布器实例"""
        cls = self._publishers.get(platform)
        if not cls:
            raise ValueError(f"Unsupported platform: {platform}")
        return cls(pool=self.pool, cookie_mgr=self.cookie_mgr)

    def list_platforms(self):
        return list(self._publishers.keys())