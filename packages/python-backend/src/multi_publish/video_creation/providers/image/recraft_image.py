"""Recraft V4 image generation via fal.ai API.

Best for logos, brand assets, SVG vectors, and images with accurate text rendering.
Adapted from OpenMontage tools/graphics/recraft_image.py.
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


class RecraftImage(BaseTool):
    name = "recraft_image"
    version = "0.1.0"
    tier = ToolTier.GENERATE
    capability = "image_generation"
    provider = "recraft"
    stability = ToolStability.EXPERIMENTAL
    execution_mode = ExecutionMode.SYNC
    determinism = Determinism.STOCHASTIC
    runtime = ToolRuntime.API

    dependencies = []
    install_instructions = (
        "Set FAL_KEY to your fal.ai API key.\n"
        "  Get one at https://fal.ai/dashboard/keys"
    )

    capabilities = ["generate_image", "generate_logo", "generate_vector", "text_to_image"]
    best_for = [
        "logos and brand assets",
        "SVG vector output",
        "images with accurate text rendering",
        "clean professional graphics",
    ]
    not_good_for = ["photorealistic images", "offline generation"]

    resource_profile = ResourceProfile(
        cpu_cores=1, ram_mb=512, vram_mb=0, disk_mb=100, network_required=True
    )
    idempotency_key_fields = ["prompt", "model", "style", "image_size"]

    def _get_api_key(self) -> str | None:
        return os.environ.get("FAL_KEY") or os.environ.get("FAL_AI_API_KEY")

    def get_status(self) -> ToolStatus:
        if self._get_api_key():
            return ToolStatus.AVAILABLE
        return ToolStatus.UNAVAILABLE

    def estimate_cost(self, inputs: dict[str, Any]) -> float:
        model = inputs.get("model", "v4")
        if model == "v4-pro":
            return 0.25
        return 0.04

    def execute(self, inputs: dict[str, Any]) -> ToolResult:
        api_key = self._get_api_key()
        if not api_key:
            return ToolResult(
                success=False,
                error="FAL_KEY not set. " + self.install_instructions,
            )

        import requests

        start = time.time()
        model = inputs.get("model", "v4")
        prompt = inputs["prompt"]

        model_path = f"recraft/v4/text-to-image"
        if model == "v4-pro":
            model_path = "recraft/v4/pro/text-to-image"

        payload: dict[str, Any] = {"prompt": prompt}
        if inputs.get("image_size"):
            payload["image_size"] = inputs["image_size"]
        if inputs.get("style"):
            payload["style"] = inputs["style"]
        if inputs.get("colors"):
            payload["colors"] = inputs["colors"]

        try:
            response = requests.post(
                f"https://fal.run/fal-ai/{model_path}",
                headers={
                    "Authorization": f"Key {api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
                timeout=120,
            )
            response.raise_for_status()
            data = response.json()

            image_url = data["images"][0]["url"]
            image_response = requests.get(image_url, timeout=60)
            image_response.raise_for_status()

            ext = "svg" if inputs.get("style") == "vector_illustration" else "png"
            output_path = Path(inputs.get("output_path", f"generated_image.{ext}"))
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_bytes(image_response.content)

        except Exception as e:
            return ToolResult(success=False, error=f"Recraft generation failed: {e}")

        return ToolResult(
            success=True,
            data={
                "provider": "recraft",
                "model": model,
                "prompt": prompt,
                "output": str(output_path),
            },
            artifacts=[str(output_path)],
            cost_usd=self.estimate_cost(inputs),
            duration_seconds=round(time.time() - start, 2),
            model=f"fal-ai/{model_path}",
        )
