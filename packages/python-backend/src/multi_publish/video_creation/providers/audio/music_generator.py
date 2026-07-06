"""Music generation tool via ElevenLabs Music API.

Adapted from OpenMontage tools/audio/music_gen.py.
Generates background music for video production.
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


class MusicGenerator(BaseTool):
    name = "music_generator"
    version = "0.1.0"
    tier = ToolTier.GENERATE
    capability = "music_generation"
    provider = "elevenlabs_music"
    stability = ToolStability.EXPERIMENTAL
    execution_mode = ExecutionMode.SYNC
    determinism = Determinism.STOCHASTIC
    runtime = ToolRuntime.API

    dependencies = []
    install_instructions = (
        "Set the ELEVENLABS_API_KEY environment variable:\n"
        "  export ELEVENLABS_API_KEY=your_key_here\n"
        "Get a key at https://elevenlabs.io"
    )

    capabilities = [
        "generate_background_music",
        "generate_sfx",
    ]
    best_for = [
        "background music generation with mood/ genre control",
        "sound effects for video production",
        "quick music prototyping",
    ]
    not_good_for = [
        "user-provided local music (use music_library instead)",
        "searching existing tracks (use freesound_music / pixabay_music)",
    ]

    resource_profile = ResourceProfile(
        cpu_cores=1, ram_mb=256, vram_mb=0, disk_mb=50, network_required=True
    )
    idempotency_key_fields = ["prompt", "duration_seconds"]

    def get_status(self) -> ToolStatus:
        if os.environ.get("ELEVENLABS_API_KEY"):
            return ToolStatus.AVAILABLE
        return ToolStatus.UNAVAILABLE

    def estimate_cost(self, inputs: dict[str, Any]) -> float:
        duration = inputs.get("duration_seconds")
        if duration is None:
            raise ValueError(
                "music_generator.estimate_cost: duration_seconds is required."
            )
        return round(duration / 30 * 0.05, 4)

    def execute(self, inputs: dict[str, Any]) -> ToolResult:
        api_key = os.environ.get("ELEVENLABS_API_KEY")
        if not api_key:
            return ToolResult(
                success=False,
                error="No ElevenLabs API key. " + self.install_instructions,
            )

        start = time.time()

        try:
            result = self._generate(inputs, api_key)
        except Exception as e:
            return ToolResult(success=False, error=f"Music generation failed: {e}")

        result.duration_seconds = round(time.time() - start, 2)
        # Only compute cost when generation succeeded
        if result.success:
            result.cost_usd = self.estimate_cost(inputs)
        return result

    def _generate(self, inputs: dict[str, Any], api_key: str) -> ToolResult:
        import requests

        prompt = inputs["prompt"]
        duration = inputs.get("duration_seconds")
        if duration is None:
            return ToolResult(
                success=False,
                error=(
                    "music_generator: duration_seconds is required. "
                    "Derive it from the approved target runtime in the script/proposal."
                ),
            )

        url = "https://api.elevenlabs.io/v1/music"

        headers = {
            "xi-api-key": api_key,
            "Content-Type": "application/json",
        }

        payload = {
            "prompt": prompt,
            "music_length_ms": int(duration * 1000),
        }

        response = requests.post(url, headers=headers, json=payload, timeout=180)
        response.raise_for_status()

        output_path = Path(inputs.get("output_path", "music_output.mp3"))
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(response.content)

        return ToolResult(
            success=True,
            data={
                "provider": "elevenlabs",
                "prompt": prompt,
                "duration_seconds": duration,
                "output": str(output_path),
                "format": "mp3",
            },
            artifacts=[str(output_path)],
        )
