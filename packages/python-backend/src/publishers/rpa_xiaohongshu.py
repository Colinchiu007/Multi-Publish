"""
小红书 RPA 适配器
通过 Playwright 操作 creator.xiaohongshu.com
"""

import json
import logging

logger = logging.getLogger(__name__)


def get_platform_info() -> dict:
    return {
        "id": "xiaohongshu",
        "name": "小红书",
        "url": "https://creator.xiaohongshu.com/",
        "login_method": "扫码登录",
    }


def validate_article(article: dict) -> tuple[bool, str]:
    """校验文章格式"""
    if not article.get("title", "").strip():
        return False, "标题不能为空"
    if len(article["title"]) > 20:
        return False, "标题不能超过20个字"
    return True, ""


def format_for_platform(article: dict) -> dict:
    """格式化文章为小红书适配格式"""
    import re
    plain_text = re.sub(r"<[^>]+>", "", article.get("content", "")).strip()
    max_len = 1000
    if len(plain_text) > max_len:
        plain_text = plain_text[:max_len]
    return {
        "title": article.get("title", "")[:20],
        "content": plain_text,
        "cover_url": article.get("cover_url", ""),
        "platform": "xiaohongshu",
    }