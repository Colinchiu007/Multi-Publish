"""pytest conftest — shared fixtures."""
import os
import sys
import tempfile
from pathlib import Path

import pytest

# Add the src directory to the Python path
SRC_DIR = Path(__file__).parent.parent / "src"
sys.path.insert(0, str(SRC_DIR.resolve()))
TEST_LOG_DIR = Path(tempfile.gettempdir()) / "multi-publish-pytest-logs"
os.environ.setdefault("MULTI_PUBLISH_LOG_DIR", str(TEST_LOG_DIR))

"""
PROJECT-003 测试套件
"""



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


@pytest.fixture(scope="session", autouse=True)
def close_async_loguru_sinks():
    """测试期间关闭异步日志线程，避免 pytest 退出时等待文件 sink。"""
    from loguru import logger

    logger.remove()
    yield
    logger.complete()
    logger.remove()
