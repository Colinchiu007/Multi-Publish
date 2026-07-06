"""Runway Gen-4 video generation via Runway API.

Highest Elo-rated video generation model — professional quality and control.
Supports Gen-3 Alpha Turbo, Gen-4 Turbo, and Gen-4 Aleph (highest fidelity).
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

_RATIO_MAP = {
    "16:9": "1280:720",
    "9:16": "720:1280",
    "1:1": "720:720",
}

_COST_PER_SECOND = {
    "gen3a_turbo": 0.05,
    "gen4_turbo": 0.05,
    "gen4_aleph": 0.15,
    # Third-party Seedance 2.0 inside Runway (Enterprise/Unlimited, non-US).
    "seedance_2.0": 0.30,
    "seedance_2.0_fast": 0.24,
}

_RUNTIME_SECONDS = {
    "gen3a_turbo": 25.0,
    "gen4_turbo": 30.0,
    "gen4_aleph": 60.0,
    "seedance_2.0": 120.0,
    "seedance_2.0_fast": 60.0,
}

# Single source of truth for the default model. Referenced by both the input
# schema and every code path that reads `model`, so estimate_cost / estimate_runtime
# / execute can never silently diverge from the advertised default again.
_DEFAULT_MODEL = "seedance_2.0"


class RunwayVideo(BaseTool):
    name = "runway_video"
    version = "0.2.0"
    tier = ToolTier.GENERATE
    capability = "video_generation"
    provider = "runway"
    stability = ToolStability.BETA
    execution_mode = ExecutionMode.SYNC
    determinism = Determinism.STOCHASTIC
    runtime = ToolRuntime.API

    dependencies = []
    install_instructions = (
        "Set RUNWAY_API_KEY to your Runway API secret.\n"
        "  Get one at https://dev.runwayml.com/"
    )

    capabilities = ["text_to_video", "image_to_video"]
    best_for = [
        "preferred premium video gen on Runway when Seedance 2.0 model is selected",
        "cinematic trailers, teasers, and high-fidelity clips with native synchronized audio (Seedance 2.0 path)",
        "director-level camera control and multi-shot editing (Seedance 2.0) or Runway Gen-4 professional control",
        "lip-sync from quoted dialogue in prompts (Seedance 2.0)",
        "professional video production",
    ]
    not_good_for = ["budget projects", "offline generation", "very long clips"]


    resource_profile = ResourceProfile(
        cpu_cores=1, ram_mb=512, vram_mb=0, disk_mb=500, network_required=True
    )
    idempotency_key_fields = ["prompt", "model", "operation", "duration"]

    def get_status(self) -> ToolStatus:
        if os.environ.get("RUNWAY_API_KEY") or os.environ.get("RUNWAYML_API_SECRET"):
            return ToolStatus.AVAILABLE
        return ToolStatus.UNAVAILABLE

    def _get_api_key(self) -> str | None:
        return os.environ.get("RUNWAY_API_KEY") or os.environ.get("RUNWAYML_API_SECRET")

    def estimate_cost(self, inputs: dict[str, Any]) -> float:
        model = inputs.get("model", _DEFAULT_MODEL)
        duration = inputs.get("duration", 5)
        return _COST_PER_SECOND.get(model, 0.05) * duration

    def estimate_runtime(self, inputs: dict[str, Any]) -> float:
        model = inputs.get("model", _DEFAULT_MODEL)
        return _RUNTIME_SECONDS.get(model, 30.0)

    def execute(self, inputs: dict[str, Any]) -> ToolResult:
        api_key = self._get_api_key()
        if not api_key:
            return ToolResult(
                success=False,
                error="RUNWAY_API_KEY not set. " + self.install_instructions,
            )

        import httpx

        start = time.time()
        model = inputs.get("model", _DEFAULT_MODEL)
        operation = inputs.get("operation", "text_to_video")
        ratio_friendly = inputs.get("ratio", "16:9")
        ratio_pixels = _RATIO_MAP.get(ratio_friendly, "1280:720")

        task_payload: dict[str, Any] = {
            "model": model,
            "promptText": inputs["prompt"],
            "duration": inputs.get("duration", 5),
            "ratio": ratio_pixels,
            "watermark": inputs.get("watermark", False),
        }
        if operation == "image_to_video" and inputs.get("image_url"):
            task_payload["promptImage"] = inputs["image_url"]

        # Choose endpoint based on operation
        endpoint = (
            "https://api.dev.runwayml.com/v1/image_to_video"
            if operation == "image_to_video"
            else "https://api.dev.runwayml.com/v1/text_to_video"
        )

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "X-Runway-Version": "2024-11-06",
        }

        try:
            # Submit generation task
            submit_response = httpx.post(
                endpoint,
                headers=headers,
                json=task_payload,
                timeout=30,
            )
            submit_response.raise_for_status()
            task_id = submit_response.json()["id"]

            # Poll for completion (max ~5 minutes)
            video_url = None
            for _ in range(60):
                time.sleep(5)
                poll_response = httpx.get(
                    f"https://api.dev.runwayml.com/v1/tasks/{task_id}",
                    headers=headers,
                    timeout=15,
                )
                poll_response.raise_for_status()
                task_data = poll_response.json()
                status = task_data["status"]

                if status == "SUCCEEDED":
                    video_url = task_data["output"][0]
                    break
                if status == "FAILED":
                    failure_code = task_data.get("failureCode", "unknown")
                    return ToolResult(
                        success=False,
                        error=f"Runway generation failed ({failure_code}): {task_data.get('failure', 'unknown error')}",
                    )
                # PENDING, THROTTLED, RUNNING — keep polling

            if not video_url:
                return ToolResult(success=False, error="Runway generation timed out after 5 minutes.")

            # Download video — URLs are ephemeral (expire in 24-48h)
            video_response = httpx.get(video_url, timeout=120)
            video_response.raise_for_status()

            output_path = Path(inputs.get("output_path", "runway_output.mp4"))
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_bytes(video_response.content)

        except Exception as e:
            return ToolResult(success=False, error=f"Runway video generation failed: {e}")

        from multi_publish.video_creation.providers.video._shared import probe_output

        probed = probe_output(output_path)
        return ToolResult(
            success=True,
            data={
                "provider": "runway",
                "model": model,
                "prompt": inputs["prompt"],
                "operation": operation,
                "ratio": ratio_friendly,
                "output": str(output_path),
                "output_path": str(output_path),
                "task_id": task_id,
                "format": "mp4",
                **probed,
            },
            artifacts=[str(output_path)],
            cost_usd=self.estimate_cost(inputs),
            duration_seconds=round(time.time() - start, 2),
            model=model,
        )
