"""Tests for logging_setup.py ? loguru configuration + decorator.

Tests focus on:
1. get_publisher_logger() ? returns bound logger
2. log_call() decorator ? sync/async wrapping, exception handling
3. _add_module_logger() ? filter logic
"""

from __future__ import annotations

import asyncio
from unittest.mock import MagicMock

import pytest

from multi_publish.core.logging_setup import get_publisher_logger, log_call


class TestGetPublisherLogger:
    """get_publisher_logger() returns a bound logger instance."""

    def test_returns_logger_with_platform_bound(self):
        logger = get_publisher_logger("douyin")
        assert hasattr(logger, "info")
        assert hasattr(logger, "error")
        assert hasattr(logger, "debug")

    def test_different_platforms_return_separate_instances(self):
        d = get_publisher_logger("douyin")
        w = get_publisher_logger("wechat")
        assert d is not w


class TestLogCallDecorator:
    """log_call() wraps with async wrapper ? use asyncio.run()."""

    def test_sync_function_wrapped_as_coroutine(self):
        calls = []
        mock_logger = MagicMock()

        @log_call(logger_instance=mock_logger)
        def my_func(x):
            calls.append(x)
            return x * 2

        # Decorator returns async wrapper: must await
        result = asyncio.run(my_func(21))
        assert result == 42
        assert calls == [21]

    def test_exception_is_re_raised(self):
        mock_logger = MagicMock()

        @log_call(logger_instance=mock_logger)
        def failing_func():
            raise ValueError("test error")

        with pytest.raises(ValueError, match="test error"):
            asyncio.run(failing_func())

        assert mock_logger.error.called

    def test_async_function_works(self):
        mock_logger = MagicMock()
        calls = []

        @log_call(logger_instance=mock_logger)
        async def async_func(x):
            calls.append(x)
            return x + 1

        result = asyncio.run(async_func(5))
        assert result == 6
        assert calls == [5]

    def test_async_exception_is_re_raised(self):
        mock_logger = MagicMock()

        @log_call(logger_instance=mock_logger)
        async def failing_async():
            raise RuntimeError("async error")

        with pytest.raises(RuntimeError, match="async error"):
            asyncio.run(failing_async())

        assert mock_logger.error.called

    def test_preserves_function_metadata(self):
        mock_logger = MagicMock()

        @log_call(logger_instance=mock_logger)
        def my_function():
            """My docstring."""
            pass

        assert my_function.__name__ == "my_function"
        assert my_function.__doc__ == "My docstring."

    def test_custom_logger_instance(self):
        mock_logger = MagicMock()

        @log_call(logger_instance=mock_logger)
        def my_func():
            return "ok"

        result = asyncio.run(my_func())
        assert result == "ok"
        assert mock_logger.info.called
