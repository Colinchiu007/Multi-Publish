"""Music search and download from Freesound.org (free with API key).

Adapted from OpenMontage tools/audio/freesound_music.py.
Searches Freesound library of Creative Commons audio.
"""

from __future__ import annotations

import json
import os
import time
import urllib.parse
import urllib.request
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


class FreesoundMusic(BaseTool):
    name = "freesound_music"
    version = "0.1.0"
    tier = ToolTier.SOURCE
    capability = "music_search"
    provider = "freesound"
    stability = ToolStability.BETA
    execution_mode = ExecutionMode.SYNC
    determinism = Determinism.DETERMINISTIC
    runtime = ToolRuntime.API

    dependencies = []
    install_instructions = (
        "Set the FREESOUND_API_KEY environment variable:\n"
        "  export FREESOUND_API_KEY=your_key_here\n"
        "Get a free key at https://freesound.org/apiv2/apply/"
    )

    capabilities = ["search_music", "download_music", "stock_music"]
    best_for = [
        "ambient and atmospheric background music",
        "free Creative Commons licensed audio",
        "searching by mood, genre, or instrument tags",
        "finding loops, drones, and textural audio",
    ]
    not_good_for = [
        "full produced songs with vocals",
        "commercially licensed music (check individual CC licenses)",
        "offline use",
    ]

    resource_profile = ResourceProfile(cpu_cores=1, ram_mb=256, vram_mb=0, disk_mb=50, network_required=True)
    idempotency_key_fields = ["query", "min_duration", "max_duration"]

    _BASE_URL = "https://freesound.org/apiv2"

    def get_status(self) -> ToolStatus:
        if os.environ.get("FREESOUND_API_KEY"):
            return ToolStatus.AVAILABLE
        return ToolStatus.UNAVAILABLE

    def estimate_cost(self, inputs: dict[str, Any]) -> float:
        return 0.0

    def execute(self, inputs: dict[str, Any]) -> ToolResult:
        api_key = os.environ.get("FREESOUND_API_KEY")
        if not api_key:
            return ToolResult(
                success=False,
                error="FREESOUND_API_KEY not set. " + self.install_instructions,
            )

        start = time.time()

        try:
            search_result = self._search(inputs, api_key)
            if not search_result:
                return ToolResult(
                    success=False,
                    error=f"No music found on Freesound for query: {inputs['query']}",
                    data={"query": inputs["query"]},
                    duration_seconds=round(time.time() - start, 2),
                )

            sound = search_result[0]
            output_path = self._download(sound, inputs, api_key)
        except Exception as e:
            return ToolResult(
                success=False,
                error=f"Freesound music search failed: {e}",
                duration_seconds=round(time.time() - start, 2),
            )

        return ToolResult(
            success=True,
            data={
                "provider": "freesound",
                "sound_id": sound.get("id"),
                "name": sound.get("name", "Unknown"),
                "duration_seconds": sound.get("duration"),
                "avg_rating": sound.get("avg_rating"),
                "tags": sound.get("tags", []),
                "query": inputs["query"],
                "output": str(output_path),
                "format": "mp3",
                "license": "Creative Commons (check individual sound license)",
                "freesound_url": (
                    f"https://freesound.org/people/{sound.get('username', '')}/sounds/{sound.get('id', '')}/"
                ),
                "results_found": len(search_result),
            },
            artifacts=[str(output_path)],
            cost_usd=0.0,
            duration_seconds=round(time.time() - start, 2),
        )

    def _search(self, inputs: dict[str, Any], api_key: str) -> list[dict]:
        query = inputs["query"]
        min_dur = inputs.get("min_duration", 30)
        max_dur = inputs.get("max_duration", 120)

        params = urllib.parse.urlencode(
            {
                "query": query,
                "filter": f"duration:[{min_dur} TO {max_dur}]",
                "sort": "rating_desc",
                "fields": "id,name,duration,previews,tags,avg_rating,username",
                "token": api_key,
                "page_size": 15,
            }
        )

        url = f"{self._BASE_URL}/search/text/?{params}"

        request = urllib.request.Request(
            url,
            headers={"User-Agent": "Multi-Publish/0.1 (music acquisition tool)"},
        )

        with urllib.request.urlopen(request, timeout=30) as response:
            data = json.loads(response.read().decode("utf-8"))

        return data.get("results", [])

    def _download(self, sound: dict, inputs: dict[str, Any], api_key: str) -> Path:
        previews = sound.get("previews", {})
        audio_url = previews.get("preview-hq-mp3") or previews.get("preview-lq-mp3")

        if not audio_url:
            raise RuntimeError(f"No preview URL available for sound {sound.get('id')} ({sound.get('name')})")

        sound_name = sound.get("name", f"freesound_{sound.get('id', 'unknown')}")
        safe_name = "".join(c if c.isalnum() or c in "._- " else "_" for c in sound_name)
        default_filename = f"freesound_{sound.get('id')}_{safe_name}.mp3"
        output_path = Path(inputs.get("output_path", default_filename))
        output_path.parent.mkdir(parents=True, exist_ok=True)

        request = urllib.request.Request(
            audio_url,
            headers={"User-Agent": "Multi-Publish/0.1 (music acquisition tool)"},
        )

        with urllib.request.urlopen(request, timeout=60) as response:
            output_path.write_bytes(response.read())

        return output_path
