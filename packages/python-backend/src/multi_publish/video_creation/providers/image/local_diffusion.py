"""Local Stable Diffusion image generation via diffusers.

Adapted from OpenMontage tools/graphics/local_diffusion.py.
"""
from __future__ import annotations

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


class LocalDiffusion(BaseTool):
    name = "local_diffusion"
    version = "0.1.0"
    tier = ToolTier.GENERATE
    capability = "image_generation"
    provider = "local_diffusion"
    stability = ToolStability.EXPERIMENTAL
    execution_mode = ExecutionMode.SYNC
    determinism = Determinism.SEEDED
    runtime = ToolRuntime.LOCAL_GPU

    dependencies = []
    install_instructions = (
        "Install diffusers for local Stable Diffusion:\n"
        "  pip install diffusers transformers accelerate torch"
    )

    capabilities = ["generate_image", "generate_illustration", "text_to_image"]
    best_for = [
        "offline/air-gapped generation",
        "free image generation (no API cost)",
        "privacy-sensitive workflows",
    ]
    not_good_for = [
        "CPU-only machines (very slow)",
        "highest quality output (API models are better)",
    ]

    resource_profile = ResourceProfile(
        cpu_cores=2, ram_mb=8000, vram_mb=4000, disk_mb=5000, network_required=False
    )
    idempotency_key_fields = ["prompt", "width", "height", "seed", "model"]

    def get_status(self) -> ToolStatus:
        try:
            import diffusers  # noqa: F401
            return ToolStatus.AVAILABLE
        except ImportError:
            return ToolStatus.UNAVAILABLE

    def estimate_cost(self, inputs: dict[str, Any]) -> float:
        return 0.0

    def estimate_runtime(self, inputs: dict[str, Any]) -> float:
        return 30.0

    def execute(self, inputs: dict[str, Any]) -> ToolResult:
        if self.get_status() != ToolStatus.AVAILABLE:
            return ToolResult(
                success=False,
                error="diffusers not installed. " + self.install_instructions,
            )

        import torch
        from diffusers import StableDiffusionPipeline

        start = time.time()
        prompt = inputs["prompt"]
        negative = inputs.get("negative_prompt", "")
        width = inputs.get("width", 512)
        height = inputs.get("height", 512)
        seed = inputs.get("seed")
        model_id = inputs.get("model", "stabilityai/stable-diffusion-2-1-base")
        steps = inputs.get("num_inference_steps", 30)
        guidance = inputs.get("guidance_scale", 7.5)

        try:
            device = "cuda" if torch.cuda.is_available() else "cpu"
            dtype = torch.float16 if device == "cuda" else torch.float32

            pipe = StableDiffusionPipeline.from_pretrained(model_id, torch_dtype=dtype)
            pipe = pipe.to(device)

            generator = None
            if seed is not None:
                generator = torch.Generator(device=device).manual_seed(seed)

            image = pipe(
                prompt,
                negative_prompt=negative,
                width=width,
                height=height,
                num_inference_steps=steps,
                guidance_scale=guidance,
                generator=generator,
            ).images[0]

            output_path = Path(inputs.get("output_path", "generated_image.png"))
            output_path.parent.mkdir(parents=True, exist_ok=True)
            image.save(str(output_path))

        except Exception as e:
            return ToolResult(success=False, error=f"Local diffusion generation failed: {e}")

        return ToolResult(
            success=True,
            data={
                "provider": "local_diffusion",
                "model": model_id,
                "prompt": prompt,
                "output": str(output_path),
            },
            artifacts=[str(output_path)],
            cost_usd=0.0,
            duration_seconds=round(time.time() - start, 2),
            seed=seed,
            model=model_id,
        )
