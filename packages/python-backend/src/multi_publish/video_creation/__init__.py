"""Video creation engine - unified API.

Combines all Phase 0-7 modules from OpenMontage integration.
Usage:
    from multi_publish.video_creation import create_video, analyze_video, list_providers
"""

from __future__ import annotations

from multi_publish.video_creation.base_tool import BaseTool, ToolResult, ToolTier
from multi_publish.video_creation.tool_registry import ToolRegistry
from multi_publish.video_creation.cost_tracker import CostTracker
from multi_publish.video_creation.config_model import VideoCreationConfig

# Create default registry singleton
registry = ToolRegistry()
cost_tracker = CostTracker()

__all__ = [
    "BaseTool", "ToolResult", "ToolTier",
    "ToolRegistry", "CostTracker", "VideoCreationConfig",
    "registry", "cost_tracker",
]
