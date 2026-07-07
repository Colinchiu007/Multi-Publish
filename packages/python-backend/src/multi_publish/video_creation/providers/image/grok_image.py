"""xAI Grok image generation and editing.

Adapted from OpenMontage tools/graphics/grok_image.py.
"""

from __future__ import annotations

import base64
import mimetypes
import os
import time
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

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


def _file_to_data_uri(path_str: str) -> str:
    path = Path(path_str)
    if not path.exists():
        raise FileNotFoundError(f"Input file not found: {path}")
    mime_type, _ = mimetypes.guess_type(path.name)
    if not mime_type:
        mime_type = "application/octet-stream"
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime_type};base64,{encoded}"


def _normalize_image_input(url_value: str | None, path_value: str | None) -> dict[str, str] | None:
    if url_value:
        return {"url": url_value, "type": "image_url"}
    if path_value:
        return {"url": _file_to_data_uri(path_value), "type": "image_url"}
    return None


class GrokImage(BaseTool):
    name = "grok_image"
    version = "0.1.0"
    tier = ToolTier.GENERATE
    capability = "image_generation"
    provider = "grok"
    stability = ToolStability.BETA
    execution_mode = ExecutionMode.SYNC
    determinism = Determinism.STOCHASTIC
    runtime = ToolRuntime.API

    dependencies = []
    install_instructions = "Set XAI_API_KEY to your xAI API key.\n  Get one from the xAI developer console"

    capabilities = [
        "generate_image",
        "edit_image",
        "text_to_image",
        "image_to_image",
        "style_transfer",
    ]
    best_for = [
        "single-image edits and style transfers",
        "multi-image compositing into one generated frame",
        "general-purpose image generation with aspect ratio control",
    ]
    not_good_for = ["offline generation", "strict seeded reproducibility"]

    resource_profile = ResourceProfile(cpu_cores=1, ram_mb=512, vram_mb=0, disk_mb=100, network_required=True)
    idempotency_key_fields = ["prompt", "generation_mode", "model", "aspect_ratio", "resolution", "n"]

    def get_status(self) -> ToolStatus:
        if os.environ.get("XAI_API_KEY"):
            return ToolStatus.AVAILABLE
        return ToolStatus.UNAVAILABLE

    @staticmethod
    def _input_image_count(inputs: dict[str, Any]) -> int:
        count = 0
        if inputs.get("image_url") or inputs.get("image_path"):
            count += 1
        count += len(inputs.get("image_urls") or [])
        count += len(inputs.get("image_paths") or [])
        return count

    def estimate_cost(self, inputs: dict[str, Any]) -> float:
        n = inputs.get("n", 1)
        return 0.05 * n

    def _build_payload(self, inputs: dict[str, Any]) -> tuple[str, dict[str, Any]]:
        prompt = inputs["prompt"]
        payload: dict[str, Any] = {"model": inputs.get("model", "grok-imagine-image")}

        # The prompt field for xAI text-to-image or edit is "prompt"
        payload["prompt"] = prompt

        if "image_url" in inputs or "image_path" in inputs or "image_urls" in inputs or "image_paths" in inputs:
            mode = "edit"
        else:
            mode = "generate"

        if inputs.get("generation_mode"):
            mode = inputs["generation_mode"]

        if inputs.get("aspect_ratio"):
            payload["aspect_ratio"] = inputs["aspect_ratio"]
        if inputs.get("resolution"):
            payload["resolution"] = inputs["resolution"]
        if inputs.get("n"):
            payload["n"] = inputs["n"]

        primary_image = _normalize_image_input(inputs.get("image_url"), inputs.get("image_path"))
        extra_images = [{"url": url, "type": "image_url"} for url in (inputs.get("image_urls") or [])]
        extra_images.extend(
            {"url": _file_to_data_uri(path), "type": "image_url"} for path in (inputs.get("image_paths") or [])
        )

        if primary_image or extra_images:
            mode = "edit"

        if mode == "edit":
            endpoint = "https://api.x.ai/v1/images/edits"
            if primary_image and not extra_images:
                payload["image"] = primary_image
            else:
                images: list[dict[str, str]] = []
                if primary_image:
                    images.append(primary_image)
                images.extend(extra_images)
                if not images:
                    raise ValueError("Edit mode requires image_url/image_path or image_urls/image_paths")
                payload["images"] = images
        else:
            endpoint = "https://api.x.ai/v1/images/generations"

        return endpoint, payload

    @staticmethod
    def _infer_extension(url: str) -> str:
        suffix = Path(urlparse(url).path).suffix.lower()
        if suffix in {".png", ".jpg", ".jpeg", ".webp"}:
            return suffix
        return ".png"

    @staticmethod
    def _output_paths(output_path: str | None, count: int, extension: str) -> list[Path]:
        if not output_path:
            stem = "grok_image"
            return [Path(f"{stem}_{idx + 1}{extension}") for idx in range(count)]

        path = Path(output_path)
        suffix = path.suffix or extension
        if count == 1:
            return [path if path.suffix else path.with_suffix(suffix)]

        base = path.with_suffix("") if path.suffix else path
        return [base.parent / f"{base.name}_{idx + 1}{suffix}" for idx in range(count)]

    def execute(self, inputs: dict[str, Any]) -> ToolResult:
        api_key = os.environ.get("XAI_API_KEY")
        if not api_key:
            return ToolResult(
                success=False,
                error="XAI_API_KEY not set. " + self.install_instructions,
            )

        import requests

        start = time.time()
        try:
            endpoint, payload = self._build_payload(inputs)
            response = requests.post(
                endpoint,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
                timeout=180,
            )
            response.raise_for_status()
            data = response.json()

            items = data.get("data", [])
            if not items:
                return ToolResult(success=False, error="xAI returned no image outputs")

            extension = ".png"
            first_url = items[0].get("url")
            if first_url:
                extension = self._infer_extension(first_url)

            output_paths = self._output_paths(inputs.get("output_path"), len(items), extension)
            artifacts: list[str] = []
            outputs: list[str] = []

            for item, output_path in zip(items, output_paths, strict=False):
                output_path.parent.mkdir(parents=True, exist_ok=True)
                if item.get("b64_json"):
                    output_path.write_bytes(base64.b64decode(item["b64_json"]))
                else:
                    image_url = item.get("url")
                    if not image_url:
                        return ToolResult(success=False, error="xAI image output missing url")
                    download = requests.get(image_url, timeout=120)
                    download.raise_for_status()
                    output_path.write_bytes(download.content)
                artifacts.append(str(output_path))
                outputs.append(str(output_path))

        except Exception as e:
            return ToolResult(success=False, error=f"Grok image generation failed: {e}")

        primary_output = outputs[0]
        return ToolResult(
            success=True,
            data={
                "provider": "grok",
                "model": payload["model"],
                "prompt": inputs["prompt"],
                "generation_mode": inputs.get("generation_mode", "generate"),
                "output": primary_output,
                "outputs": outputs,
                "images_generated": len(outputs),
            },
            artifacts=artifacts,
            cost_usd=self.estimate_cost(inputs),
            duration_seconds=round(time.time() - start, 2),
            model=payload["model"],
        )
