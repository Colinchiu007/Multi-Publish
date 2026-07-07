"""User music library — local royalty-free track discovery.

Adapted from OpenMontage tools/audio/music_library.py.
Surfaces tracks from a local music_library/ folder at proposal stage.
"""

from __future__ import annotations

import os
import shutil
import subprocess
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

# Resolve project root relative to this file
_PROJECT_ROOT = Path(__file__).resolve().parents[5]  # multi_publish/video_creation/providers/audio/ -> project root

_AUDIO_EXTENSIONS = {
    ".mp3",
    ".wav",
    ".m4a",
    ".aac",
    ".flac",
    ".ogg",
    ".opus",
    ".aiff",
    ".aif",
}


class MusicLibrary(BaseTool):
    name = "music_library"
    version = "0.1.0"
    tier = ToolTier.SOURCE
    capability = "music_library"
    provider = "local"
    stability = ToolStability.PRODUCTION
    execution_mode = ExecutionMode.SYNC
    determinism = Determinism.DETERMINISTIC
    runtime = ToolRuntime.LOCAL

    dependencies = []
    install_instructions = (
        "Create a 'music_library/' folder in the project root and drop "
        "royalty-free audio tracks into it (e.g. .mp3, .wav, .m4a, .flac, .ogg). "
        "Override the location with the MUSIC_LIBRARY_DIR environment variable."
    )

    capabilities = ["list_user_music_tracks"]
    best_for = [
        "user-provided, intentional background music",
        "free music with no API key or generation cost",
        "knowing music options at the proposal stage",
    ]
    not_good_for = [
        "generating new music (use music_generator / suno_music)",
        "searching an external catalog (use freesound_music / pixabay_music)",
    ]

    resource_profile = ResourceProfile(cpu_cores=1, ram_mb=64, vram_mb=0, disk_mb=0, network_required=False)

    def _library_dir(self, inputs: dict[str, Any] | None = None) -> Path:
        if inputs and inputs.get("library_dir"):
            return Path(inputs["library_dir"]).expanduser()
        env_dir = os.environ.get("MUSIC_LIBRARY_DIR")
        if env_dir:
            return Path(env_dir).expanduser()
        return _PROJECT_ROOT / "music_library"

    def _list_tracks(self, library_dir: Path) -> list[Path]:
        if not library_dir.is_dir():
            return []
        tracks = [p for p in library_dir.rglob("*") if p.is_file() and p.suffix.lower() in _AUDIO_EXTENSIONS]
        return sorted(tracks, key=lambda p: p.as_posix().lower())

    @staticmethod
    def _probe_duration(path: Path) -> float | None:
        if shutil.which("ffprobe") is None:
            return None
        try:
            out = subprocess.run(
                [
                    "ffprobe",
                    "-v",
                    "error",
                    "-show_entries",
                    "format=duration",
                    "-of",
                    "default=noprint_wrappers=1:nokey=1",
                    str(path),
                ],
                capture_output=True,
                text=True,
                timeout=15,
                check=True,
            )
            value = out.stdout.strip()
            return round(float(value), 2) if value else None
        except (subprocess.SubprocessError, ValueError):
            return None

    def get_status(self) -> ToolStatus:
        return ToolStatus.AVAILABLE if self._list_tracks(self._library_dir()) else ToolStatus.UNAVAILABLE

    def estimate_runtime(self, inputs: dict[str, Any]) -> float:
        return 1.0

    def execute(self, inputs: dict[str, Any]) -> ToolResult:
        start = time.time()
        library_dir = self._library_dir(inputs)
        track_paths = self._list_tracks(library_dir)

        tracks: list[dict[str, Any]] = []
        total_duration = 0.0
        have_any_duration = False
        for path in track_paths:
            duration = self._probe_duration(path)
            if duration is not None:
                have_any_duration = True
                total_duration += duration
            tracks.append(
                {
                    "name": path.name,
                    "path": str(path),
                    "size_bytes": path.stat().st_size,
                    "duration_seconds": duration,
                }
            )

        return ToolResult(
            success=True,
            data={
                "library_dir": str(library_dir),
                "exists": library_dir.is_dir(),
                "track_count": len(tracks),
                "total_duration_seconds": round(total_duration, 2) if have_any_duration else None,
                "tracks": tracks,
            },
            duration_seconds=round(time.time() - start, 2),
        )
