"""Capability-level image selector that routes between generation and stock providers.

Simplified adapter - uses basic heuristic scoring instead of the full
scoring library. Adapted from OpenMontage tools/graphics/image_selector.py.
"""
from __future__ import annotations

from typing import Any

from multi_publish.video_creation.base_tool import (
    BaseTool,
    Determinism,
    ExecutionMode,
    ResourceProfile,
    ToolResult,
    ToolRuntime,
    ToolStability,
    ToolStatus,
    ToolTier,
)


class ImageSelector(BaseTool):
    name = "image_selector"
    version = "0.2.0"
    tier = ToolTier.GENERATE
    capability = "image_generation"
    provider = "selector"
    stability = ToolStability.BETA
    execution_mode = ExecutionMode.SYNC
    determinism = Determinism.DETERMINISTIC
    runtime = ToolRuntime.HYBRID

    dependencies = []

    capabilities = [
        "generate_image", "search_image", "download_image",
        "provider_selection", "text_to_image", "stock_image",
    ]
    best_for = [
        "preflight routing - pick the best image provider for the task",
        "switching between generated and stock images",
        "automatic fallback when preferred provider is unavailable",
    ]
    not_good_for = ["direct execution (use specific provider tools)"]

    resource_profile = ResourceProfile(
        cpu_cores=1, ram_mb=256, vram_mb=0, disk_mb=50, network_required=False,
    )
    idempotency_key_fields = ["prompt", "preferred_provider", "operation"]

    def get_status(self) -> ToolStatus:
        return ToolStatus.AVAILABLE

    def estimate_cost(self, inputs: dict[str, Any]) -> float:
        return 0.0

    def _score_provider(self, tool_name: str, prompt: str) -> float:
        prompt_lower = prompt.lower()

        if tool_name == "flux_image":
            if any(w in prompt_lower for w in ["photo", "photorealistic", "realistic", "cinematic"]):
                return 0.95
            return 0.7
        if tool_name == "openai_image":
            if any(w in prompt_lower for w in ["text", "label", "diagram", "logo", "illustration"]):
                return 0.9
            if any(w in prompt_lower for w in ["complex", "detailed", "high quality"]):
                return 0.85
            return 0.7
        if tool_name == "google_imagen":
            if any(w in prompt_lower for w in ["photo", "realistic", "nature", "landscape"]):
                return 0.85
            return 0.65
        if tool_name == "grok_image":
            if any(w in prompt_lower for w in ["edit", "style", "composite", "transform"]):
                return 0.9
            return 0.6
        if tool_name == "recraft_image":
            if any(w in prompt_lower for w in ["logo", "brand", "vector", "svg", "icon", "text"]):
                return 0.95
            return 0.6
        if tool_name == "pixabay_image":
            if any(w in prompt_lower for w in ["stock", "royalty", "free photo"]):
                return 0.85
            return 0.5
        if tool_name == "pexels_image":
            if any(w in prompt_lower for w in ["photography", "stock photo", "real world"]):
                return 0.85
            return 0.5
        if tool_name == "local_diffusion":
            if any(w in prompt_lower for w in ["offline", "private", "local"]):
                return 0.8
            return 0.4
        if tool_name == "comfyui_image":
            if any(w in prompt_lower for w in ["workflow", "custom", "comfyui", "local gpu"]):
                return 0.85
            return 0.4

        return 0.5

    def select_provider(
        self,
        candidates: list[BaseTool],
        inputs: dict[str, Any],
    ) -> tuple[BaseTool | None, dict[str, Any] | None]:
        prompt = inputs.get("prompt", "")
        preferred = inputs.get("preferred_provider", "auto")
        allowed = inputs.get("allowed_providers", None)

        scored: list[tuple[float, BaseTool]] = []
        for tool in candidates:
            if allowed and tool.provider not in allowed and tool.name not in allowed:
                continue
            score = self._score_provider(tool.name, prompt)
            scored.append((score, tool))

        scored.sort(key=lambda x: x[0], reverse=True)

        if preferred != "auto":
            for score, tool in scored:
                if tool.provider == preferred or tool.name == preferred:
                    return tool, {"score": score, "reasoning": f"Preferred provider: {preferred}"}

        if scored:
            best = scored[0]
            return best[1], {"score": best[0], "reasoning": "Heuristic ranking"}

        return None, None

    def execute(self, inputs: dict[str, Any]) -> ToolResult:
        operation = inputs.get("operation", "generate")

        from multi_publish.video_creation.tool_registry import registry
        image_tools = [t for t in registry.list_tools() if t.capability == "image_generation" and t.provider != "selector"]

        if operation == "rank":
            rankings = []
            for tool in image_tools:
                score = self._score_provider(tool.name, inputs.get("prompt", ""))
                rankings.append({
                    "provider": tool.provider,
                    "tool_name": tool.name,
                    "score": score,
                    "status": str(tool.get_status()),
                })
            rankings.sort(key=lambda x: x["score"], reverse=True)
            return ToolResult(
                success=True,
                data={"rankings": rankings, "total_providers": len(rankings)},
            )

        selected, score_info = self.select_provider(image_tools, inputs)
        if not selected:
            return ToolResult(
                success=False,
                error="No suitable image provider found. Configure an API key or install diffusers.",
            )

        tool_inputs = dict(inputs)
        tool_inputs.pop("operation", None)
        tool_inputs.pop("preferred_provider", None)
        tool_inputs.pop("allowed_providers", None)

        return selected.execute(tool_inputs)
