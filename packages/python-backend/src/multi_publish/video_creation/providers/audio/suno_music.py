"""Suno AI music generation via sunoapi.org REST API.

Adapted from OpenMontage tools/audio/suno_music.py.
Async flow: submit -> poll -> download.
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


class SunoMusic(BaseTool):
    name = "suno_music"
    version = "0.1.0"
    tier = ToolTier.GENERATE
    capability = "music_generation"
    provider = "suno"
    stability = ToolStability.BETA
    execution_mode = ExecutionMode.ASYNC
    determinism = Determinism.STOCHASTIC
    runtime = ToolRuntime.API

    dependencies = []
    install_instructions = (
        "Set the SUNO_API_KEY environment variable:\n"
        "  export SUNO_API_KEY=your_key_here\n"
        "Get a key at https://sunoapi.org/api-key"
    )

    capabilities = [
        "generate_background_music",
        "generate_song",
        "generate_instrumental",
    ]
    best_for = [
        "full song generation with vocals and lyrics",
        "high-quality instrumental background music",
        "genre-specific music (any genre)",
        "longer tracks up to 8 minutes",
    ]
    not_good_for = [
        "sound effects (use ElevenLabs SFX instead)",
        "sub-10-second stingers (minimum ~30s generation)",
        "offline generation",
    ]

    resource_profile = ResourceProfile(
        cpu_cores=1, ram_mb=256, vram_mb=0, disk_mb=100, network_required=True
    )
    idempotency_key_fields = ["prompt", "style", "instrumental", "model"]

    _BASE_URL = "https://api.sunoapi.org/api/v1"
    _POLL_INTERVAL = 30
    _MAX_WAIT = 300

    def _get_api_key(self) -> str | None:
        return os.environ.get("SUNO_API_KEY")

    def get_status(self) -> ToolStatus:
        if self._get_api_key():
            return ToolStatus.AVAILABLE
        return ToolStatus.UNAVAILABLE

    def estimate_cost(self, inputs: dict[str, Any]) -> float:
        return 0.05

    def execute(self, inputs: dict[str, Any]) -> ToolResult:
        api_key = self._get_api_key()
        if not api_key:
            return ToolResult(
                success=False,
                error="No Suno API key. " + self.install_instructions,
            )

        if "prompt" not in inputs:
            return ToolResult(success=False, error="'prompt' is required for Suno music generation.")

        start = time.time()

        try:
            task_id = self._submit(inputs, api_key)
            result_data = self._poll(task_id, api_key)

            track_index = inputs.get("track_index", 0)
            tracks = result_data.get("data", [])
            if not tracks:
                return ToolResult(success=False, error="Suno returned no tracks.")

            track = tracks[min(track_index, len(tracks) - 1)]
            audio_url = track.get("audio_url")
            if not audio_url:
                return ToolResult(success=False, error="No audio_url in Suno response.")

            output_path = self._download(audio_url, inputs, api_key)
        except Exception as e:
            return ToolResult(success=False, error=f"Suno generation failed: {e}")

        duration = round(time.time() - start, 2)

        return ToolResult(
            success=True,
            data={
                "provider": "suno",
                "model": inputs.get("model", "V4"),
                "prompt": inputs["prompt"],
                "style": inputs.get("style"),
                "title": track.get("title", inputs.get("title")),
                "instrumental": inputs.get("instrumental", True),
                "duration_seconds": track.get("duration"),
                "output": str(output_path),
                "format": "mp3",
                "track_id": track.get("id"),
                "tracks_generated": len(tracks),
            },
            artifacts=[str(output_path)],
            cost_usd=self.estimate_cost(inputs),
            duration_seconds=duration,
            model=f"suno/{inputs.get('model', 'V4')}",
        )

    def _submit(self, inputs: dict[str, Any], api_key: str) -> str:
        import requests

        custom_mode = inputs.get("custom_mode", False)
        instrumental = inputs.get("instrumental", True)
        model = inputs.get("model", "V4")

        payload: dict[str, Any] = {
            "model": model,
            "customMode": custom_mode,
            "instrumental": instrumental,
            "callBackUrl": "",
        }

        if custom_mode:
            payload["prompt"] = inputs["prompt"]
            payload["style"] = inputs.get("style", "")
            payload["title"] = inputs.get("title", "")
        else:
            payload["prompt"] = inputs["prompt"][:500]

        response = requests.post(
            f"{self._BASE_URL}/generate",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=30,
        )
        response.raise_for_status()
        data = response.json()

        task_id = data.get("data", {}).get("taskId") or data.get("taskId")
        if not task_id:
            raise RuntimeError(f"No taskId in Suno response: {data}")

        return task_id

    def _poll(self, task_id: str, api_key: str) -> dict:
        import requests

        elapsed = 0
        while elapsed < self._MAX_WAIT:
            time.sleep(self._POLL_INTERVAL)
            elapsed += self._POLL_INTERVAL

            response = requests.get(
                f"{self._BASE_URL}/generate/record-info",
                params={"taskId": task_id},
                headers={"Authorization": f"Bearer {api_key}"},
                timeout=30,
            )
            response.raise_for_status()
            result = response.json()

            status = result.get("data", {}).get("status") or result.get("status", "")

            if status == "SUCCESS":
                return result.get("data", result)
            elif status in (
                "CREATE_TASK_FAILED", "GENERATE_AUDIO_FAILED", "SENSITIVE_WORD_ERROR",
            ):
                raise RuntimeError(f"Suno generation failed with status: {status}")

        raise TimeoutError(
            f"Suno generation timed out after {self._MAX_WAIT}s (taskId: {task_id})"
        )

    def _download(self, audio_url: str, inputs: dict[str, Any], api_key: str) -> Path:
        import requests

        output_path = Path(inputs.get("output_path", "suno_output.mp3"))
        output_path.parent.mkdir(parents=True, exist_ok=True)

        response = requests.get(audio_url, timeout=120)
        response.raise_for_status()
        output_path.write_bytes(response.content)

        return output_path
