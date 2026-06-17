"""
微信公众号 RPA 发布 — Python 侧适配器
供 FastAPI server.py 调用，但实际 RPA 由 Node.js Playwright 执行
此文件提供 Python 端的接口定义 + 辅助函数
"""
from typing import Optional
from pathlib import Path

# 尝试导入 shared_modules
try:
    from rpa_engine.base import BaseRPAPublisher
    from rpa_engine.cookie_manager import CookieManager
    from wechat_mp.models import PlatformType, PublishResult
    HAS_SHARED = True
except ImportError:
    HAS_SHARED = False


class RPAWeChatMPPublisher:
    """
    微信公众号 RPA 发布器
    注意：实际 Playwright 控制由 Electron Node.js 侧执行
    此 Python 类提供：
    - API 发布 (通过 shared_modules.wechat_mp.publisher)
    - RPA 发布接口定义
    """

    PLATFORM = "wechat_mp"

    def __init__(self, data_dir: Optional[str] = None):
        self.data_dir = data_dir or str(Path("./data").resolve())

    def get_publish_params(self, article: dict) -> dict:
        """
        将前端文章格式转换为 RPA 参数
        """
        return {
            "title": article.get("title", ""),
            "content": article.get("content", ""),
            "cover_url": article.get("cover_url", ""),
            "author": article.get("author", ""),
            "platform": self.PLATFORM
        }

    def validate_article(self, article: dict) -> tuple[bool, str]:
        """验证文章必填字段"""
        if not article.get("title"):
            return False, "标题不能为空"
        if not article.get("content"):
            return False, "正文不能为空"
        return True, ""