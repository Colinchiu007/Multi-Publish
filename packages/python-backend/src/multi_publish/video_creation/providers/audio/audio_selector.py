"""Top-level audio capability selector.

Chooses the appropriate audio provider tool based on the requested
capability (tts, music_generation, music_search, music_library).
"""

from __future__ import annotations

from typing import Any

from multi_publish.video_creation.base_tool import (
    BaseTool,
    ToolResult,
    ToolRuntime,
    ToolStability,
    ToolStatus,
    ToolTier,
)
from multi_publish.video_creation.tool_registry import registry


class AudioSelector(BaseTool):
    name = "audio_selector"
    version = "0.1.0"
    tier = ToolTier.CORE
    capability = "audio_selection"
    provider = "audio_selector"
    stability = ToolStability.BETA
    runtime = ToolRuntime.HYBRID

    capabilities = [
        "audio_provider_selection",
        "capability_routing",
    ]
    best_for = [
        "routing audio requests to the right provider",
        "querying available audio capabilities",
    ]

    def _providers_by_capability(self, capability: str) -> list[BaseTool]:
        """Discover providers for a given capability from the registry."""
        return [
            t
            for t in registry.list_tools()
            if t.capability == capability and t.name not in ("audio_selector", "tts_selector")
        ]

    def get_capability_summary(self) -> dict[str, Any]:
        """Return a summary of available audio capabilities."""
        caps = {}
        for cap in ("tts", "music_generation", "music_search", "music_library"):
            providers = self._providers_by_capability(cap)
            available = [t for t in providers if t.get_status() == ToolStatus.AVAILABLE]
            caps[cap] = {
                "total": len(providers),
                "available": len(available),
                "providers": [t.provider for t in providers],
                "available_providers": [t.provider for t in available],
            }
        return caps

    def get_status(self) -> ToolStatus:
        caps = self.get_capability_summary()
        if any(v["available"] > 0 for v in caps.values()):
            return ToolStatus.AVAILABLE
        return ToolStatus.UNAVAILABLE

    def execute(self, inputs: dict[str, Any]) -> ToolResult:
        sub_capability = inputs.get("capability", "")
        if not sub_capability:
            return ToolResult(
                success=True,
                data={
                    "audio_selector": True,
                    "capability_summary": self.get_capability_summary(),
                    "message": (
                        "Specify a 'capability' to route: tts, music_generation, music_search, or music_library."
                    ),
                },
            )

        providers = self._providers_by_capability(sub_capability)
        if not providers:
            return ToolResult(
                success=False,
                error=f"No providers found for capability '{sub_capability}'.",
            )

        available = [t for t in providers if t.get_status() == ToolStatus.AVAILABLE]
        if not available:
            return ToolResult(
                success=False,
                error=(
                    f"No available providers for '{sub_capability}'. "
                    f"Found {len(providers)} provider(s) but none available."
                ),
                data={"providers_found": [t.provider for t in providers]},
            )

        # Select the best available provider
        preferred = inputs.get("preferred_provider", "auto")
        if preferred != "auto":
            for t in available:
                if t.provider == preferred:
                    return t.execute(inputs)

        # Default: first available sorted by stability
        def _score(t: BaseTool) -> int:
            s = 0
            if t.stability == ToolStability.PRODUCTION:
                s += 100
            elif t.stability == ToolStability.BETA:
                s += 50
            return s

        available.sort(key=_score, reverse=True)
        selected = available[0]

        result = selected.execute(inputs)
        if result.success:
            result.data["routed_by"] = self.name
            result.data["routed_capability"] = sub_capability
            result.data["selected_provider"] = selected.provider
            result.data["alternatives"] = [t.provider for t in available if t.name != selected.name]

        return result
