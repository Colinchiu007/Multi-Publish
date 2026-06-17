"""
知乎 RPA 发布 — Python 侧适配器
供 FastAPI server.py 调用，但实际 RPA 由 Node.js Playwright 执行
此文件提供 Python 端的接口定义 + 辅助函数
"""
from typing import Optional, List
from pathlib import Path


class RPAZhihuPublisher:
    """
    知乎 RPA 发布器
    注意：实际 Playwright 控制由 Electron Node.js 侧执行
    此 Python 类提供：
    - API 发布接口定义
    - 参数验证与转换
    - 发布结果解析
    """

    PLATFORM = "zhihu"

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
            "topics": article.get("topics", []),
            "save_as_draft": article.get("save_as_draft", False),
            "platform": self.PLATFORM
        }

    def validate_article(self, article: dict) -> tuple[bool, str]:
        """验证文章必填字段"""
        if not article.get("title"):
            return False, "标题不能为空"
        if not article.get("content"):
            return False, "正文不能为空"
        return True, ""

    def format_publish_result(self, raw_result: dict) -> dict:
        """
        将 Node.js RPA 返回的原始结果格式化为统一格式
        """
        success = raw_result.get("success", False)
        url = raw_result.get("url", "")
        article_id = raw_result.get("mediaId", "")
        is_draft = raw_result.get("draft", False)

        return {
            "platform": self.PLATFORM,
            "success": success,
            "url": url,
            "article_id": article_id,
            "is_draft": is_draft,
            "message": "草稿已保存" if is_draft else "文章已发布" if success else "发布失败"
        }

    def extract_article_id(self, url: str) -> Optional[str]:
        """从知乎文章 URL 中提取文章 ID"""
        import re
        match = re.search(r'/p/([a-zA-Z0-9]+)', url)
        return match.group(1) if match else None
