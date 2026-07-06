"""MiniMax (Hailuo AI) video generation via fal.ai API.

Rewards prompt craft — follows camera directions well and produces high-texture footage.
"""

from __future__ import annotations

import os
import time
from pathlib import Path
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


class MiniMaxVideo(BaseTool):
    name = "minimax_video"
    version = "0.1.0"
    tier = ToolTier.GENERATE
    capability = "video_generation"
    provider = "minimax"
    stability = ToolStability.EXPERIMENTAL
    execution_mode = ExecutionMode.SYNC
    determinism = Determinism.STOCHASTIC
    runtime = ToolRuntime.API

    dependencies = []
    install_instructions = (
        "Set FAL_KEY to your fal.ai API key.\n"
        "  Get one at https://fal.ai/dashboard/keys"
    )

    capabilities = ["text_to_video", "image_to_video"]
    best_for = [
        "prompt-following with camera directions (framing, motion, composition)",
        "high-texture footage with minimal hallucination",
        "cost-effective video generation",
    ]
    not_good_for = ["offline generation", "very long clips"]


    resource_profile = ResourceProfile(
        cpu_cores=1, ram_mb=512, vram_mb=0, disk_mb=500, network_required=True
    )
    idempotency_key_fields = ["prompt", "model_variant", "operation"]

    def _get_api_key(self) -> str | None:
        return os.environ.get("FAL_KEY") or os.environ.get("FAL_AI_API_KEY")

    def get_status(self) -> ToolStatus:
        if self._get_api_key():
            return ToolStatus.AVAILABLE
        return ToolStatus.UNAVAILABLE

    def estimate_cost(self, inputs: dict[str, Any]) -> float:
        variant = inputs.get("model_variant", "hailuo-02/pro")
        if "pro" in variant:
            return 0.15
        if "fast" in variant:
            return 0.08
        return 0.10  # standard

    def estimate_runtime(self, inputs: dict[str, Any]) -> float:
        variant = inputs.get("model_variant", "hailuo-02/pro")
        if "fast" in variant:
            return 30.0
        return 60.0

    def execute(self, inputs: dict[str, Any]) -> ToolResult:
        api_key = self._get_api_key()
        if not api_key:
            return ToolResult(
                success=False,
                error="FAL_KEY not set. " + self.install_instructions,
            )

        import httpx

        start = time.time()
        operation = inputs.get("operation", "text_to_video")
        variant = inputs.get("model_variant", "hailuo-02/pro")

        # Build fal.ai model path
        if operation == "text_to_video":
            model_path = f"minimax/{variant}/text-to-video"
            if variant == "video-01":
                model_path = "minimax/video-01"
        else:
            model_path = f"minimax/{variant}/image-to-video"
            if variant == "video-01":
                model_path = "minimax/video-01/image-to-video"

        payload: dict[str, Any] = {"prompt": inputs["prompt"]}
        if operation == "image_to_video" and inputs.get("image_url"):
            payload["image_url"] = inputs["image_url"]

        headers = {
            "Authorization": f"Key {api_key}",
            "Content-Type": "application/json",
        }

        try:
            # Submit to queue API (async) — sync endpoint times out for video gen
            submit_resp = httpx.post(
                f"https://queue.fal.run/fal-ai/{model_path}",
                headers=headers,
                json=payload,
                timeout=30,
            )
            submit_resp.raise_for_status()
            queue_data = submit_resp.json()
            status_url = queue_data["status_url"]
            response_url = queue_data["response_url"]

            # Poll until complete
            while True:
                time.sleep(5)
                status_resp = httpx.get(status_url, headers=headers, timeout=15)
                status_resp.raise_for_status()
                status = status_resp.json().get("status", "UNKNOWN")
                if status == "COMPLETED":
                    break
                if status in ("FAILED", "CANCELLED"):
                    return ToolResult(
                        success=False,
                        error=f"MiniMax video generation {status.lower()}",
                    )

            # Fetch result
            result_resp = httpx.get(response_url, headers=headers, timeout=30)
            result_resp.raise_for_status()
            data = result_resp.json()

            video_url = data["video"]["url"]
            video_response = httpx.get(video_url, timeout=120)
            video_response.raise_for_status()

            output_path = Path(inputs.get("output_path", "minimax_output.mp4"))
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_bytes(video_response.content)

        except Exception as e:
            return ToolResult(success=False, error=f"MiniMax video generation failed: {e}")

        return ToolResult(
            success=True,
            data={
                "provider": "minimax",
                "model": f"fal-ai/{model_path}",
                "prompt": inputs["prompt"],
                "output": str(output_path),
            },
            artifacts=[str(output_path)],
            cost_usd=self.estimate_cost(inputs),
            duration_seconds=round(time.time() - start, 2),
            model=f"fal-ai/{model_path}",
        )
