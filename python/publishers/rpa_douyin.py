"""
抖音 RPA 发布适配器 — Python 侧接口定义
"""
from typing import Optional


class RPADouyinPublisher:
    PLATFORM = "douyin"

    def __init__(self, data_dir: Optional[str] = None):
        self.data_dir = data_dir or "./data"

    def get_publish_params(self, article: dict) -> dict:
        return {
            "title": article.get("title", ""),
            "content": article.get("content", ""),
            "platform": self.PLATFORM
        }

    def validate_article(self, article: dict) -> tuple[bool, str]:
        if not article.get("title"):
            return False, "标题不能为空"
        if not article.get("content"):
            return False, "正文不能为空"
        return True, ""