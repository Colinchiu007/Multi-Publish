"""
微博 RPA 发布适配器 — Python 侧接口定义
"""
from typing import Optional


class RPAWeiboPublisher:
    PLATFORM = "weibo"

    def __init__(self, data_dir: Optional[str] = None):
        self.data_dir = data_dir or "./data"

    def get_publish_params(self, article: dict) -> dict:
        return {
            "title": article.get("title", ""),
            "content": article.get("content", ""),
            "platform": self.PLATFORM
        }

    def validate_article(self, article: dict) -> tuple[bool, str]:
        if not article.get("content"):
            return False, "微博内容不能为空"
        content = article.get("content", "").replace("<", "").replace(">", "")
        if len(content) > 2000:
            return False, "微博内容不能超过2000字"
        return True, ""