"""Modal-hosted LTX video generation."""

from __future__ import annotations

import os
import time

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
from multi_publish.video_creation.providers.video._shared import generate_ltx_modal_video


class LTXVideoModal(BaseTool):
    name = "ltx_video_modal"
    version = "0.1.0"
    tier = ToolTier.GENERATE
    capability = "video_generation"
    provider = "ltx-modal"
    stability = ToolStability.EXPERIMENTAL
    execution_mode = ExecutionMode.SYNC
    determinism = Determinism.STOCHASTIC
    runtime = ToolRuntime.API

    install_instructions = (
        "Set the MODAL_LTX2_ENDPOINT_URL environment variable to your deployed LTX endpoint:\n"
        "  set MODAL_LTX2_ENDPOINT_URL=https://<your-modal-endpoint>"
    )

    capabilities = ["text_to_video", "image_to_video"]
    best_for = ["self-hosted cloud GPU rendering for LTX without local workstation dependence"]
    not_good_for = ["zero-setup local workflows"]

    resource_profile = ResourceProfile(cpu_cores=1, ram_mb=512, vram_mb=0, disk_mb=500, network_required=True)
    idempotency_key_fields = ["prompt", "aspect_ratio", "num_frames", "seed"]

    def get_status(self) -> ToolStatus:
        return ToolStatus.AVAILABLE if os.environ.get("MODAL_LTX2_ENDPOINT_URL") else ToolStatus.UNAVAILABLE

    def estimate_cost(self, inputs: dict[str, object]) -> float:
        return 0.25

    def estimate_runtime(self, inputs: dict[str, object]) -> float:
        return 180.0

    def execute(self, inputs: dict[str, object]) -> ToolResult:
        if self.get_status() != ToolStatus.AVAILABLE:
            return ToolResult(
                success=False, error="Modal LTX video generation is unavailable. " + self.install_instructions
            )
        start = time.time()
        try:
            result = generate_ltx_modal_video(inputs)
        except Exception as exc:
            return ToolResult(success=False, error=f"Modal LTX video generation failed: {exc}")
        result.duration_seconds = round(time.time() - start, 2)
        result.cost_usd = self.estimate_cost(inputs)
        return result
