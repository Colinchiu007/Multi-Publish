"""ComfyUI image generation via a local or remote ComfyUI server.

Simplified adapter - connects to a running ComfyUI server without
the OpenMontage-specific client library. Requires manual workflow setup.
Adapted from OpenMontage tools/graphics/comfyui_image.py.
"""
from __future__ import annotations

import json
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


class ComfyUIImage(BaseTool):
    name = "comfyui_image"
    version = "0.1.0"
    tier = ToolTier.GENERATE
    capability = "image_generation"
    provider = "comfyui"
    stability = ToolStability.EXPERIMENTAL
    execution_mode = ExecutionMode.SYNC
    determinism = Determinism.SEEDED
    runtime = ToolRuntime.LOCAL_GPU

    dependencies = []
    install_instructions = (
        "Start a ComfyUI server and set COMFYUI_SERVER_URL "
        "(default http://localhost:8188).\n"
        "See https://github.com/comfyanonymous/ComfyUI for setup."
    )

    capabilities = ["text_to_image"]
    best_for = [
        "local GPU generation without API costs",
        "full control over sampling via custom ComfyUI workflows",
    ]
    not_good_for = [
        "setups without a running ComfyUI server",
        "CPU-only machines",
    ]

    resource_profile = ResourceProfile(
        cpu_cores=2, ram_mb=8000, vram_mb=8000, disk_mb=500, network_required=False,
    )
    idempotency_key_fields = ["prompt", "width", "height", "steps", "seed"]

    def _server_url(self) -> str:
        return os.environ.get("COMFYUI_SERVER_URL", "http://localhost:8188").rstrip("/")

    def get_status(self) -> ToolStatus:
        """Check if the ComfyUI server is reachable via the /system/stats endpoint."""
        try:
            import requests
            resp = requests.get(f"{self._server_url()}/system/stats", timeout=5)
            if resp.status_code == 200:
                return ToolStatus.AVAILABLE
        except Exception:
            pass
        return ToolStatus.UNAVAILABLE

    def estimate_cost(self, inputs: dict[str, Any]) -> float:
        return 0.0

    def estimate_runtime(self, inputs: dict[str, Any]) -> float:
        steps = inputs.get("steps", 20)
        return max(10.0, steps * 1.5)

    def _queue_prompt(self, workflow: dict[str, Any], timeout: int = 600) -> dict[str, Any]:
        """Queue a prompt on ComfyUI and wait for completion."""
        import requests

        server = self._server_url()

        # Queue the workflow
        resp = requests.post(
            f"{server}/prompt",
            json={"prompt": workflow},
            timeout=30,
        )
        resp.raise_for_status()
        prompt_info = resp.json()
        prompt_id = prompt_info.get("prompt_id")
        if not prompt_id:
            raise RuntimeError(f"ComfyUI did not return a prompt_id: {resp.text}")

        # Poll for completion
        start_ts = time.time()
        while time.time() - start_ts < timeout:
            status_resp = requests.get(
                f"{server}/history/{prompt_id}",
                timeout=30,
            )
            if status_resp.status_code == 200:
                history = status_resp.json()
                if prompt_id in history:
                    return history[prompt_id]
            time.sleep(1)

        raise TimeoutError(f"ComfyUI prompt {prompt_id} did not complete within {timeout}s")

    def execute(self, inputs: dict[str, Any]) -> ToolResult:
        if self.get_status() != ToolStatus.AVAILABLE:
            return ToolResult(
                success=False,
                error=f"ComfyUI server not reachable at {self._server_url()}. " + self.install_instructions,
            )

        import requests

        start = time.time()
        prompt = inputs["prompt"]
        seed = inputs.get("seed") or int(time.time() * 1000) % (2**32)
        width = inputs.get("width", 1024)
        height = inputs.get("height", 1024)
        steps = inputs.get("steps", 20)
        guidance = inputs.get("guidance", 3.5)
        output_path = Path(inputs.get("output_path", f"comfyui_image_{seed}.png"))
        output_path.parent.mkdir(parents=True, exist_ok=True)

        try:
            # Build a minimal FLUX-compatible workflow for ComfyUI
            # This creates a basic checkpoint-based txt2img pipeline.
            workflow = {
                "3": {
                    "class_type": "KSampler",
                    "inputs": {
                        "seed": seed,
                        "steps": steps,
                        "cfg": guidance,
                        "sampler_name": "euler",
                        "scheduler": "normal",
                        "denoise": 1.0,
                        "model": ["4", 0],
                        "positive": ["6", 0],
                        "negative": ["7", 0],
                        "latent_image": ["5", 0],
                    },
                },
                "4": {
                    "class_type": "CheckpointLoaderSimple",
                    "inputs": {"ckpt_name": inputs.get("checkpoint", "sd_xl_base_1.0.safetensors")},
                },
                "5": {
                    "class_type": "EmptyLatentImage",
                    "inputs": {"width": width, "height": height, "batch_size": 1},
                },
                "6": {
                    "class_type": "CLIPTextEncode",
                    "inputs": {"text": prompt, "clip": ["4", 1]},
                },
                "7": {
                    "class_type": "CLIPTextEncode",
                    "inputs": {"text": inputs.get("negative_prompt", ""), "clip": ["4", 1]},
                },
                "8": {
                    "class_type": "VAEDecode",
                    "inputs": {"samples": ["3", 0], "vae": ["4", 2]},
                },
                "9": {
                    "class_type": "SaveImage",
                    "inputs": {
                        "filename_prefix": output_path.stem,
                        "images": ["8", 0],
                    },
                },
            }

            result = self._queue_prompt(workflow)
            outputs = result.get("outputs", {})

            # Try to download the generated image
            downloaded = False
            for node_id, node_output in outputs.items():
                for img_data in node_output.get("images", []):
                    img_filename = img_data.get("filename")
                    if img_filename:
                        img_resp = requests.get(
                            f"{self._server_url()}/view?filename={img_filename}",
                            timeout=60,
                        )
                        img_resp.raise_for_status()
                        output_path.write_bytes(img_resp.content)
                        downloaded = True
                        break
                if downloaded:
                    break

            if not downloaded:
                return ToolResult(
                    success=False,
                    error="ComfyUI prompt completed but no output image found in result",
                )

        except Exception as e:
            return ToolResult(success=False, error=f"ComfyUI image generation failed: {e}")

        return ToolResult(
            success=True,
            data={
                "provider": "comfyui",
                "model": inputs.get("checkpoint", "unknown"),
                "prompt": prompt,
                "width": width,
                "height": height,
                "steps": steps,
                "guidance": guidance,
                "output": str(output_path),
                "format": "png",
            },
            artifacts=[str(output_path)],
            cost_usd=0.0,
            duration_seconds=round(time.time() - start, 2),
            seed=seed,
            model="comfyui-custom",
        )
