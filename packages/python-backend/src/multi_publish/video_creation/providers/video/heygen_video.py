"""HeyGen-backed cloud video generation."""

from __future__ import annotations

import os
import time
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
from multi_publish.video_creation.providers.video._shared import (
    HEYGEN_PROVIDERS,
    estimate_quality_cost,
    estimate_speed_runtime,
    generate_heygen_video,
)


class HeyGenVideo(BaseTool):
    name = "heygen_video"
    version = "0.1.0"
    tier = ToolTier.GENERATE
    capability = "video_generation"
    provider = "heygen"
    stability = ToolStability.EXPERIMENTAL
    execution_mode = ExecutionMode.SYNC
    determinism = Determinism.STOCHASTIC
    runtime = ToolRuntime.API

    install_instructions = (
        "Set the HEYGEN_API_KEY environment variable:\n"
        "  set HEYGEN_API_KEY=your_key_here\n"
        "Get a key at https://app.heygen.com/settings/api"
    )

    capabilities = ["text_to_video", "image_to_video", "provider_selection"]
    best_for = [
        "premium cloud video generation without local GPU setup",
        "fast access to VEO, Sora, Kling, Runway, and Seedance providers",
    ]
    not_good_for = [
        "offline or privacy-constrained rendering",
        "free local-first production",
    ]


    resource_profile = ResourceProfile(cpu_cores=1, ram_mb=512, vram_mb=0, disk_mb=500, network_required=True)
    idempotency_key_fields = ["prompt", "provider_variant", "aspect_ratio"]

    def get_status(self) -> ToolStatus:
        return ToolStatus.AVAILABLE if os.environ.get("HEYGEN_API_KEY") else ToolStatus.UNAVAILABLE

    def estimate_cost(self, inputs: dict[str, Any]) -> float:
        meta = HEYGEN_PROVIDERS.get(inputs.get("provider_variant", "veo_3_1"), HEYGEN_PROVIDERS["veo_3_1"])
        return estimate_quality_cost(meta["quality"])

    def estimate_runtime(self, inputs: dict[str, Any]) -> float:
        meta = HEYGEN_PROVIDERS.get(inputs.get("provider_variant", "veo_3_1"), HEYGEN_PROVIDERS["veo_3_1"])
        return estimate_speed_runtime(meta["speed"])

    def execute(self, inputs: dict[str, Any]) -> ToolResult:
        if self.get_status() != ToolStatus.AVAILABLE:
            return ToolResult(success=False, error="HeyGen video generation is unavailable. " + self.install_instructions)
        start = time.time()
        try:
            result = generate_heygen_video(inputs)
        except Exception as exc:
            return ToolResult(success=False, error=f"HeyGen video generation failed: {exc}")
        result.duration_seconds = round(time.time() - start, 2)
        result.cost_usd = self.estimate_cost(inputs)
        return result

