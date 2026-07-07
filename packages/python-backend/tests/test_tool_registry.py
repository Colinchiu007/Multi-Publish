"""Tests for ToolRegistry."""

import pytest

from multi_publish.video_creation.base_tool import BaseTool, ToolStability, ToolTier
from multi_publish.video_creation.tool_registry import ToolRegistry


class _TestTool(BaseTool):
    name = "test_tool"
    tier = ToolTier.CORE
    stability = ToolStability.PRODUCTION

    async def execute(self, **kwargs):
        pass


class _TestToolB(BaseTool):
    name = "tool_b"
    tier = ToolTier.ENHANCE
    stability = ToolStability.BETA

    async def execute(self, **kwargs):
        pass


class TestToolRegistry:
    def test_init_empty(self):
        reg = ToolRegistry()
        assert reg._tools == {}

    def test_register_tool(self):
        reg = ToolRegistry()
        t = _TestTool()
        reg.register(t)
        assert reg.get("test_tool") is t

    def test_register_empty_name_raises(self):
        reg = ToolRegistry()

        class NoName(BaseTool):
            name = ""

            async def execute(self, **kwargs):
                pass

        with pytest.raises(ValueError, match="non-empty name"):
            reg.register(NoName())

    def test_get_returns_tool(self):
        reg = ToolRegistry()
        tool = _TestTool()
        reg.register(tool)
        assert reg.get("test_tool") is tool

    def test_get_unknown_returns_none(self):
        reg = ToolRegistry()
        assert reg.get("nonexistent") is None

    def test_list_tools_returns_objects(self):
        reg = ToolRegistry()
        t1, t2 = _TestTool(), _TestToolB()
        reg.register(t1)
        reg.register(t2)
        names = [t.name for t in reg.list_tools()]
        assert "test_tool" in names
        assert "tool_b" in names

    def test_clear(self):
        reg = ToolRegistry()
        reg.register(_TestTool())
        reg.clear()
        assert reg._tools == {}

    def test_filter_by_tier(self):
        reg = ToolRegistry()
        reg.register(_TestTool())
        reg.register(_TestToolB())
        cores = [t.name for t in reg.list_tools(tier=ToolTier.CORE)]
        assert "test_tool" in cores
        assert "tool_b" not in cores

    def test_list_length(self):
        reg = ToolRegistry()
        reg.register(_TestTool())
        reg.register(_TestToolB())
        assert len(reg.list_tools()) == 2
