"""
Per-Module 结构化日志 + 轮转（P1-3）

蚁小二风格（log4js DailyRotateFile + winston）：
- 每个平台发布器独立日志文件
- 按日期轮转，保留 15 天
- 3MB 最大文件大小
- 结构化格式

用法:
    from multi_publish.core.logging_setup import setup_logging
    setup_logging(log_dir="./logs")

    然后在各模块中:
    from loguru import logger
    logger.info("消息")  # 自动路由到对应模块的日志文件
"""

import os
import sys
from pathlib import Path
from typing import Optional

from loguru import logger


def setup_logging(log_dir: str | Path = "./logs", level: str = "INFO"):
    """
    配置 loguru 日志系统

    配置内容：
    1. 移除默认 handler
    2. 添加 stderr 终端输出（彩色）
    3. 添加全局轮转日志文件
    4. 添加 per-module 日志文件（按模块名过滤）

    Args:
        log_dir: 日志目录
        level: 日志级别（DEBUG/INFO/WARNING/ERROR）
    """
    log_path = Path(log_dir)
    log_path.mkdir(parents=True, exist_ok=True)

    # 移除默认 handler
    logger.remove()

    # ── 终端输出（彩色、结构化） ──────────────────────────
    logger.add(
        sys.stderr,
        format=(
            "<green>{time:YYYY-MM-DD HH:mm:ss.SSS}</green> "
            "| <level>{level: <8}</level> "
            "| <cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> "
            "| <level>{message}</level>"
        ),
        level=level,
        colorize=True,
        enqueue=True,
    )

    # ── 全局日志（所有消息） ─────────────────────────────
    logger.add(
        log_path / "multi_publish_{time:YYYY-MM-DD}.log",
        format="{time:YYYY-MM-DD HH:mm:ss.SSS} | {level: <8} | {name}:{function}:{line} | {message}",
        rotation="3 MB",       # 3MB 轮转
        retention="15 days",   # 保留 15 天
        compression="gz",      # 压缩归档
        level="DEBUG",
        enqueue=True,
    )

    # ── Per-Module 日志 ──────────────────────────────────
    # 每个平台发布器独立日志文件，通过 logger.bind() 过滤器实现
    module_loggers = {
        "publish_douyin": ["douyin", "DouyinPublisher"],
        "publish_wechat": ["wechat_mp", "WeChatPublisher"],
        "publish_bilibili": ["bilibili"],
        "server": ["server", "uvicorn", "fastapi"],
        "rpa_engine": ["base", "Playwright", "playwright"],
        "publisher_manager": ["publisher_manager", "PlatformRegistry"],
    }

    for log_name, module_keywords in module_loggers.items():
        _add_module_logger(log_path, log_name, module_keywords, level)

    logger.info(f"日志系统初始化完成，日志目录: {log_path.resolve()}")


def _add_module_logger(
    log_path: Path,
    log_name: str,
    module_keywords: list[str],
    level: str = "INFO",
):
    """
    添加 per-module 日志文件

    使用 loguru 的 filter 参数，只记录匹配的模块名。

    Args:
        log_path: 日志目录
        log_name: 日志文件名称
        module_keywords: 模块关键词列表（模块名中包含任一关键词即匹配）
        level: 日志级别
    """
    logger.add(
        log_path / f"{log_name}_{{time:YYYY-MM-DD}}.log",
        format="{time:YYYY-MM-DD HH:mm:ss.SSS} | {level: <8} | {name}:{function}:{line} | {message}",
        rotation="3 MB",
        retention="15 days",
        compression="gz",
        level=level,
        enqueue=True,
        filter=lambda record, kw=module_keywords: any(
            kw in record["name"] for kw in kw
        ),
    )


# ─── 快捷获取 per-module logger ─────────────────────────────

def get_publisher_logger(platform: str):
    """
    获取平台发布器的专用 logger

    Args:
        platform: 平台名称（douyin, wechat_mp, bilibili 等）

    Returns:
        绑定平台标签的 logger 实例
    """
    return logger.bind(platform=platform)


# ─── 装饰器：记录函数调用日志 ──────────────────────────────

def log_call(logger_instance=None):
    """
    函数调用日志装饰器

    自动记录函数名、参数、返回值和执行时间。

    用法:
        @log_call()
        async def publish(self, title, content):
            ...
    """
    def decorator(func):
        import asyncio
        import functools
        import time

        log = logger_instance or logger

        @functools.wraps(func)
        async def async_wrapper(*args, **kwargs):
            start = time.time()
            try:
                result = await func(*args, **kwargs)
                elapsed = time.time() - start
                log.info(f"{func.__name__} 完成 ({elapsed:.2f}s)")
                return result
            except Exception as e:
                elapsed = time.time() - start
                log.error(f"{func.__name__} 失败 ({elapsed:.2f}s): {e}")
                raise

        return async_wrapper
    return decorator
