"""Wan local video generation."""

from __future__ import annotations

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
    WAN_VARIANTS,
    estimate_local_runtime,
    generate_local_video,
    local_generation_status,
    local_install_instructions,
)


class WanVideo(BaseTool):
    name = "wan_video"
    version = "0.1.0"
    tier = ToolTier.GENERATE
    capability = "video_generation"
    provider = "wan"
    stability = ToolStability.EXPERIMENTAL
    execution_mode = ExecutionMode.SYNC
    determinism = Determinism.STOCHASTIC
    runtime = ToolRuntime.LOCAL_GPU

    install_instructions = local_install_instructions()

    capabilities = ["text_to_video", "image_to_video", "model_selection"]
    best_for = [
        "best quality-to-VRAM ratio for local generation",
        "local pipelines that still want image-to-video support",
    ]
    not_good_for = ["CPU-only machines", "instant iteration on low-end hardware"]


    resource_profile = ResourceProfile(cpu_cores=2, ram_mb=16000, vram_mb=8000, disk_mb=4000, network_required=False)
    idempotency_key_fields = ["prompt", "model_variant", "operation", "seed"]

    def get_status(self) -> ToolStatus:
        return local_generation_status()

    def estimate_cost(self, inputs: dict[str, Any]) -> float:
        return 0.0

    def estimate_runtime(self, inputs: dict[str, Any]) -> float:
        variant = WAN_VARIANTS.get(inputs.get("model_variant", "wan2.1-1.3b"), WAN_VARIANTS["wan2.1-1.3b"])
        return estimate_local_runtime(variant["speed"])

    def execute(self, inputs: dict[str, Any]) -> ToolResult:
        if self.get_status() != ToolStatus.AVAILABLE:
            return ToolResult(success=False, error="Wan local video generation is unavailable. " + self.install_instructions)
        start = time.time()
        try:
            result = generate_local_video(tool_name=self.name, variants=WAN_VARIANTS, default_variant="wan2.1-1.3b", inputs=inputs)
        except Exception as exc:
            return ToolResult(success=False, error=f"Wan video generation failed: {exc}")
        result.duration_seconds = round(time.time() - start, 2)
        return result

