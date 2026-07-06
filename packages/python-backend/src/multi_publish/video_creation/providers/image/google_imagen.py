"""Google Imagen image generation via Gemini/Vertex AI API.

Adapted from OpenMontage tools/graphics/google_imagen.py.
Inline google_credentials helpers to avoid external dependency.
"""
from __future__ import annotations

import base64
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

# Aspect ratio to approximate pixel dimensions (for cost/reporting only)
ASPECT_RATIOS = {
    "1:1": (1024, 1024),
    "3:4": (896, 1152),
    "4:3": (1152, 896),
    "9:16": (768, 1344),
    "16:9": (1344, 768),
}


def _dims_to_aspect_ratio(width: int, height: int) -> str:
    """Convert width/height to the nearest supported aspect ratio."""
    target = width / height
    best = "1:1"
    best_diff = float("inf")
    for ratio, (w, h) in ASPECT_RATIOS.items():
        diff = abs(target - w / h)
        if diff < best_diff:
            best_diff = diff
            best = ratio
    return best


def _service_account_configured() -> bool:
    """Check if service account credentials are available."""
    return bool(os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"))


def _get_access_token() -> tuple[str, str | None]:
    """Get OAuth2 access token from service account JSON."""
    creds_path = os.environ["GOOGLE_APPLICATION_CREDENTIALS"]
    if not os.path.exists(creds_path):
        raise RuntimeError(f"GOOGLE_APPLICATION_CREDENTIALS file not found: {creds_path}")

    with open(creds_path) as f:
        sa_info = json.load(f)

    project_id = sa_info.get("project_id") or os.environ.get("GOOGLE_CLOUD_PROJECT")
    private_key = sa_info.get("private_key")
    client_email = sa_info.get("client_email")
    if not private_key or not client_email:
        raise RuntimeError("Service account JSON missing private_key or client_email")

    import google.auth.transport.requests
    from google.oauth2 import service_account

    credentials = service_account.Credentials.from_service_account_info(
        sa_info,
        scopes=["https://www.googleapis.com/auth/cloud-platform"],
    )
    request = google.auth.transport.requests.Request()
    credentials.refresh(request)
    return str(credentials.token), project_id


class GoogleImagen(BaseTool):
    name = "google_imagen"
    version = "0.1.0"
    tier = ToolTier.GENERATE
    capability = "image_generation"
    provider = "google_imagen"
    stability = ToolStability.BETA
    execution_mode = ExecutionMode.SYNC
    determinism = Determinism.STOCHASTIC
    runtime = ToolRuntime.API

    dependencies = []
    install_instructions = (
        "Auth option A - API key (AI Studio): set GOOGLE_API_KEY (or GEMINI_API_KEY).\n"
        "  Get one at https://aistudio.google.com/apikey\n"
        "Auth option B - service account (Vertex AI): set GOOGLE_APPLICATION_CREDENTIALS\n"
        "  to a service-account JSON key, plus GOOGLE_CLOUD_PROJECT.\n"
        "  Requires the Vertex AI API enabled and billing on the project."
    )

    capabilities = ["generate_image", "generate_illustration", "text_to_image"]
    best_for = [
        "high-quality photorealistic images",
        "Google ecosystem integration",
        "fast generation with multiple aspect ratios",
    ]
    not_good_for = [
        "negative prompt control (not supported)",
        "exact pixel dimensions (uses aspect ratios)",
        "offline generation",
    ]

    resource_profile = ResourceProfile(
        cpu_cores=1, ram_mb=512, vram_mb=0, disk_mb=100, network_required=True
    )
    idempotency_key_fields = ["prompt", "aspect_ratio", "model"]

    def _get_api_key(self) -> str | None:
        return os.environ.get("GOOGLE_API_KEY") or os.environ.get("GEMINI_API_KEY")

    def get_status(self) -> ToolStatus:
        if self._get_api_key() or _service_account_configured():
            return ToolStatus.AVAILABLE
        return ToolStatus.UNAVAILABLE

    def estimate_cost(self, inputs: dict[str, Any]) -> float:
        model = inputs.get("model", "imagen-4.0-generate-001")
        n = inputs.get("number_of_images", 1)
        if "ultra" in model:
            return 0.06 * n
        if "fast" in model:
            return 0.02 * n
        return 0.04 * n

    def execute(self, inputs: dict[str, Any]) -> ToolResult:
        api_key = self._get_api_key()
        bearer_token: str | None = None
        project_id: str | None = None
        if not api_key:
            if not _service_account_configured():
                return ToolResult(
                    success=False,
                    error="No Google credentials found. " + self.install_instructions,
                )
            try:
                bearer_token, creds_project = _get_access_token()
            except RuntimeError as exc:
                return ToolResult(success=False, error=str(exc))
            project_id = creds_project or os.environ.get("GOOGLE_CLOUD_PROJECT")
            if not project_id:
                return ToolResult(
                    success=False,
                    error="Vertex AI needs a project id. Set GOOGLE_CLOUD_PROJECT.",
                )

        import requests

        start = time.time()
        model = inputs.get("model", "imagen-4.0-generate-001")
        prompt = inputs["prompt"]

        # Resolve aspect ratio
        if "aspect_ratio" in inputs:
            aspect_ratio = inputs["aspect_ratio"]
        elif "width" in inputs and "height" in inputs:
            aspect_ratio = _dims_to_aspect_ratio(inputs["width"], inputs["height"])
        else:
            aspect_ratio = "1:1"

        number_of_images = inputs.get("number_of_images", 1)
        parameters: dict[str, Any] = {
            "sampleCount": number_of_images,
            "aspectRatio": aspect_ratio,
        }

        if bearer_token:
            location = os.environ.get("GOOGLE_CLOUD_LOCATION", "us-central1")
            url = (
                f"https://{location}-aiplatform.googleapis.com/v1/projects/"
                f"{project_id}/locations/{location}/publishers/google/models/"
                f"{model}:predict"
            )
            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {bearer_token}",
            }
        else:
            url = (
                f"https://generativelanguage.googleapis.com/v1beta/models/"
                f"{model}:predict"
            )
            headers = {
                "Content-Type": "application/json",
                "x-goog-api-key": api_key,
            }

        try:
            response = requests.post(
                url,
                headers=headers,
                json={
                    "instances": [{"prompt": prompt}],
                    "parameters": parameters,
                },
                timeout=120,
            )
            response.raise_for_status()
            data = response.json()

            predictions = data.get("predictions", [])
            if not predictions:
                return ToolResult(success=False, error="No images returned from Imagen API")

            image_bytes = base64.b64decode(predictions[0]["bytesBase64Encoded"])

            output_path = Path(inputs.get("output_path", "generated_image.png"))
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_bytes(image_bytes)

        except Exception as e:
            return ToolResult(success=False, error=f"Imagen generation failed: {e}")

        return ToolResult(
            success=True,
            data={
                "provider": "google_imagen",
                "model": model,
                "prompt": prompt,
                "aspect_ratio": aspect_ratio,
                "output": str(output_path),
                "images_generated": len(predictions),
            },
            artifacts=[str(output_path)],
            cost_usd=self.estimate_cost(inputs),
            duration_seconds=round(time.time() - start, 2),
            model=model,
        )
