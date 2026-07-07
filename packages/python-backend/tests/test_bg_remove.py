"""Tests for bg_remove.py — get_status + execute error paths."""

from __future__ import annotations

import pytest

from multi_publish.video_creation.enhancement.bg_remove import BgRemove


class TestGetStatus:
    """get_status() checks import availability."""

    def test_rembg_not_installed(self):
        """Without rembg, status is UNAVAILABLE."""
        bg = BgRemove()
        status = bg.get_status()
        from multi_publish.video_creation.base_tool import ToolStatus
        assert status == ToolStatus.UNAVAILABLE


class TestExecuteErrorPaths:
    """execute() error paths — no external deps needed."""

    def test_missing_input(self):
        bg = BgRemove()
        result = bg.execute({"input_path": "/nonexistent/image.png"})
        assert result.success is False
        assert "Input not found" in result.error
