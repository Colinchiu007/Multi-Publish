"""Integration tests for video creation pipeline (Phase 0-7)."""

from __future__ import annotations

import pytest

from multi_publish.video_creation import BaseTool, ToolResult, ToolTier, cost_tracker, registry
from multi_publish.video_creation.cost_tracker import CostTracker
from multi_publish.video_creation.tool_registry import ToolRegistry


class TestRegistryIntegration:
    """Verify ToolRegistry can discover all Phase tools."""

    def test_registry_singleton(self):
        assert isinstance(registry, ToolRegistry)

    def test_register_and_list(self):
        r = ToolRegistry()

        # Create a mini test tool
        class TestTool(BaseTool):
            name = "test_integration"
            capability = "test"
            provider = "test"
            tier = ToolTier.CORE

            def execute(self, inputs):
                return ToolResult(success=True)

        t = TestTool()
        r.register(t)
        listed = r.list_tools()
        names = [x.name for x in listed]
        assert "test_integration" in names
        r.clear()

    def test_cost_tracker_singleton(self):
        assert isinstance(cost_tracker, CostTracker)

    def test_tool_tier_enum(self):
        assert ToolTier.CORE.value == "core"
        assert ToolTier.GENERATE.value == "generate"
        assert ToolTier.ANALYZE.value == "analyze"


class TestPipelineLoaderBasic:
    """Verify pipeline loader works (minimal smoke test)."""

    def test_pipeline_loader_imports(self):
        import inspect

        from multi_publish.video_creation.pipeline.loader import load_pipeline

        assert inspect.isfunction(load_pipeline)


class TestAllPhasesImports:
    """Verify every Phase module can be imported."""

    PHASES = {
        "Phase0:base_tool": "multi_publish.video_creation.base_tool",
        "Phase0:tool_registry": "multi_publish.video_creation.tool_registry",
        "Phase0:cost_tracker": "multi_publish.video_creation.cost_tracker",
        "Phase0:config_model": "multi_publish.video_creation.config_model",
        "Phase1:video": "multi_publish.video_creation.providers.video",
        "Phase2:image": "multi_publish.video_creation.providers.image",
        "Phase3:audio": "multi_publish.video_creation.providers.audio",
        "Phase4:analysis": "multi_publish.video_creation.analysis",
        "Phase5:enhancement": "multi_publish.video_creation.enhancement",
        "Phase5:subtitle": "multi_publish.video_creation.subtitle",
        "Phase5:capture": "multi_publish.video_creation.capture",
        "Phase6:pipeline": "multi_publish.video_creation.pipeline.loader",
        "Phase7:character": "multi_publish.video_creation.character.character_animation",
        "Phase7:avatar": "multi_publish.video_creation.avatar",
    }

    @pytest.mark.parametrize("name,module_path", PHASES.items())
    def test_phase_imports(self, name, module_path):
        import importlib

        mod = importlib.import_module(module_path)
        assert mod is not None
