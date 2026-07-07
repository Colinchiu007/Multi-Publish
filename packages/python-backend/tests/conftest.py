"""Test configuration — add src to Python path"""

import sys
from pathlib import Path

# Add the src directory to the Python path
SRC_DIR = Path(__file__).parent.parent / "src"
sys.path.insert(0, str(SRC_DIR.resolve()))

"""
PROJECT-003 测试套件
"""

import pytest


@pytest.fixture
def sample_article():
    return {
        "title": "测试文章标题",
        "content": "# 测试内容\n\n这是一篇测试文章。",
        "cover_image": None,
        "tags": ["测试", "AI"],
    }


@pytest.fixture
def sample_wechat_config():
    return {
        "app_id": "test_app_id",
        "app_secret": "test_app_secret",
    }
