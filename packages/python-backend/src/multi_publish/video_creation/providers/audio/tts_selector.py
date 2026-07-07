"""Capability-level text-to-speech selector that chooses among provider tools.

Adapted from OpenMontage tools/audio/tts_selector.py.
Provider discovery uses the local ToolRegistry.
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


class TTSSelector(BaseTool):
    name = "tts_selector"
    version = "0.2.0"
    tier = ToolTier.VOICE
    capability = "tts"
    provider = "selector"
    stability = ToolStability.BETA
    runtime = ToolRuntime.HYBRID

    dependencies = []
    install_instructions = (
        "No direct setup required. TTSSelector discovers available "
        "TTS providers via the ToolRegistry. Ensure at least one TTS "
        "provider tool is configured with the correct API keys."
    )

    capabilities = [
        "text_to_speech",
        "provider_selection",
    ]
    best_for = [
        "preflight tool selection",
        "user-facing recommendation flows",
    ]
    not_good_for = []

    def _providers(self) -> list[BaseTool]:
        """Discover TTS providers from the registry."""
        return [t for t in registry.list_tools() if t.capability == "tts" and t.name != self.name]

    def get_provider_matrix(self) -> dict[str, dict[str, str]]:
        matrix: dict[str, dict[str, str]] = {}
        for tool in self._providers():
            strength = ", ".join(tool.best_for) if tool.best_for else tool.name
            matrix[tool.provider] = {"tool": tool.name, "strength": strength}
        return matrix

    def get_status(self) -> ToolStatus:
        if any(tool.get_status() == ToolStatus.AVAILABLE for tool in self._providers()):
            return ToolStatus.AVAILABLE
        return ToolStatus.UNAVAILABLE

    def estimate_cost(self, inputs: dict[str, Any]) -> float:
        candidates = self._providers()
        if not candidates:
            return 0.0
        tool = self._select_best_tool(inputs, candidates)
        return tool.estimate_cost(inputs) if tool else 0.0

    def execute(self, inputs: dict[str, Any]) -> ToolResult:
        candidates = self._providers()

        if inputs.get("operation") == "rank":
            return ToolResult(
                success=True,
                data={
                    "rankings": self._serialize_providers(candidates),
                    "provider_matrix": self.get_provider_matrix(),
                },
            )

        tool = self._select_best_tool(inputs, candidates)
        if tool is None:
            return ToolResult(success=False, error="No TTS provider available.")

        result = tool.execute(inputs)
        if result.success:
            result.data.setdefault("selected_tool", tool.name)
            result.data["selected_provider"] = tool.provider
            result.data["selection_reason"] = self._selection_reason(tool)
            result.data["alternatives_considered"] = [
                t.name for t in candidates
                if t.name != tool.name and t.get_status() == ToolStatus.AVAILABLE
            ]
        return result

    def _select_best_tool(self, inputs: dict[str, Any], candidates: list[BaseTool]) -> BaseTool | None:
        preferred = inputs.get("preferred_provider", "auto")
        allowed = set(inputs.get("allowed_providers") or [])

        available = [t for t in candidates if t.get_status() == ToolStatus.AVAILABLE]
        if not available:
            return None

        if allowed:
            filtered = [t for t in available if t.provider in allowed]
            if filtered:
                available = filtered

        if preferred != "auto":
            for t in available:
                if t.provider == preferred:
                    return t

        def _score(t: BaseTool) -> int:
            s = 0
            if t.stability == ToolStability.PRODUCTION:
                s += 100
            elif t.stability == ToolStability.BETA:
                s += 50
            if t.runtime == ToolRuntime.LOCAL:
                s += 10
            return s

        available.sort(key=_score, reverse=True)
        return available[0] if available else None

    @staticmethod
    def _selection_reason(tool: BaseTool) -> str:
        return (
            f"Selected {tool.provider} ({tool.name}) — "
            f"stability: {tool.stability.value}, runtime: {tool.runtime.value}"
        )

    def _serialize_providers(self, candidates: list[BaseTool]) -> list[dict[str, Any]]:
        serialized: list[dict[str, Any]] = []
        for tool in candidates:
            info = tool.get_info()
            serialized.append({
                "name": tool.name,
                "provider": tool.provider,
                "status": str(tool.get_status()),
                "stability": info.get("stability"),
                "best_for": info.get("best_for", []),
            })
        return serialized
