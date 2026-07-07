"""OpenAI GPT Image generation (gpt-image-1 / DALL-E 3).

Adapted from OpenMontage tools/graphics/openai_image.py.
"""

from __future__ import annotations

import base64
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


class OpenAIImage(BaseTool):
    name = "openai_image"
    version = "0.1.0"
    tier = ToolTier.GENERATE
    capability = "image_generation"
    provider = "openai"
    stability = ToolStability.BETA
    execution_mode = ExecutionMode.SYNC
    determinism = Determinism.STOCHASTIC
    runtime = ToolRuntime.API

    dependencies = []
    install_instructions = "Set OPENAI_API_KEY to your OpenAI API key.\n  pip install openai"

    capabilities = ["generate_image", "generate_illustration", "text_to_image"]
    best_for = [
        "complex multi-element compositions",
        "images with text/labels",
        "following detailed instructions accurately",
    ]
    not_good_for = ["offline generation", "budget-constrained projects at high quality"]

    resource_profile = ResourceProfile(cpu_cores=1, ram_mb=512, vram_mb=0, disk_mb=100, network_required=True)
    idempotency_key_fields = ["prompt", "size", "quality", "model"]

    def get_status(self) -> ToolStatus:
        if os.environ.get("OPENAI_API_KEY"):
            return ToolStatus.AVAILABLE
        return ToolStatus.UNAVAILABLE

    def estimate_cost(self, inputs: dict[str, Any]) -> float:
        model = inputs.get("model", "gpt-image-1")
        quality = inputs.get("quality", "high")
        n = inputs.get("n", 1)
        if model == "gpt-image-1":
            cost_map = {"low": 0.011, "medium": 0.042, "high": 0.167, "auto": 0.042}
            return cost_map.get(quality, 0.042) * n
        quality_map = {"standard": 0.04, "hd": 0.08}
        return quality_map.get(quality, 0.04) * n

    def execute(self, inputs: dict[str, Any]) -> ToolResult:
        if not os.environ.get("OPENAI_API_KEY"):
            return ToolResult(
                success=False,
                error="OPENAI_API_KEY not set. " + self.install_instructions,
            )

        from openai import OpenAI

        start = time.time()
        client = OpenAI()
        model = inputs.get("model", "gpt-image-1")
        prompt = inputs["prompt"]
        size = inputs.get("size", "1024x1024")
        n = inputs.get("n", 1)

        try:
            if model == "gpt-image-1":
                quality = inputs.get("quality", "high")
                output_format = inputs.get("output_format", "png")
                response = client.images.generate(
                    model=model,
                    prompt=prompt,
                    size=size,
                    quality=quality,
                    output_format=output_format,
                    n=n,
                )
            else:
                quality = inputs.get("quality", "standard")
                if quality in ("low", "medium", "high", "auto"):
                    quality = "standard"
                response = client.images.generate(
                    model=model,
                    prompt=prompt,
                    size=size,
                    quality=quality,
                    n=1,
                    response_format="b64_json",
                )

            image_data = base64.b64decode(response.data[0].b64_json)
            ext = inputs.get("output_format", "png")
            output_path = Path(inputs.get("output_path", f"generated_image.{ext}"))
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_bytes(image_data)

        except Exception as e:
            return ToolResult(success=False, error=f"OpenAI image generation failed: {e}")

        return ToolResult(
            success=True,
            data={
                "provider": "openai",
                "model": model,
                "prompt": prompt,
                "output": str(output_path),
            },
            artifacts=[str(output_path)],
            cost_usd=self.estimate_cost(inputs),
            duration_seconds=round(time.time() - start, 2),
            model=model,
        )
