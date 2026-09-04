"""Mathematical animation tool via ManimCE.

Generates animated math/science/explainer videos from Python scene code
using the Manim Community Edition engine. Free, local, no API key required.
Adapted from OpenMontage tools/graphics/math_animate.py.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
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

QUALITY_PRESETS = {
    "low": {"flag": "-ql", "resolution": "854x480", "fps": 15},
    "medium": {"flag": "-qm", "resolution": "1280x720", "fps": 30},
    "high": {"flag": "-qh", "resolution": "1920x1080", "fps": 60},
    "4k": {"flag": "-qk", "resolution": "3840x2160", "fps": 60},
    "preview": {"flag": "-ql --format gif", "resolution": "854x480", "fps": 15},
}


class MathAnimate(BaseTool):
    name = "math_animate"
    version = "0.1.0"
    tier = ToolTier.GENERATE
    capability = "graphics"
    provider = "manim"
    stability = ToolStability.EXPERIMENTAL
    execution_mode = ExecutionMode.SYNC
    determinism = Determinism.DETERMINISTIC
    runtime = ToolRuntime.LOCAL

    dependencies = ["cmd:manim"]
    install_instructions = (
        "Install ManimCE:\n"
        "  pip install manim\n"
        "  manim checkhealth\n"
        "Requires: Python 3.8+, FFmpeg, LaTeX (optional, for math formulas)"
    )

    capabilities = ["render_scene", "render_from_code", "render_from_template"]
    best_for = [
        "mathematical animations and visualizations",
        "science explainer videos",
        "educational content with LaTeX formulas",
    ]
    not_good_for = [
        "non-mathematical content",
        "photorealistic rendering",
        "real-time animation",
    ]

    resource_profile = ResourceProfile(cpu_cores=2, ram_mb=1024, vram_mb=0, disk_mb=500, network_required=False)
    idempotency_key_fields = ["scene_code", "scene_name", "quality"]

    def get_status(self) -> ToolStatus:
        if shutil.which("manim"):
            return ToolStatus.AVAILABLE
        return ToolStatus.UNAVAILABLE

    def estimate_cost(self, inputs: dict[str, Any]) -> float:
        return 0.0

    def estimate_runtime(self, inputs: dict[str, Any]) -> float:
        quality = inputs.get("quality", "medium")
        estimates = {
            "low": 5.0,
            "medium": 15.0,
            "high": 45.0,
            "4k": 120.0,
            "preview": 3.0,
        }
        return estimates.get(quality, 15.0)

    def execute(self, inputs: dict[str, Any]) -> ToolResult:
        if not shutil.which("manim"):
            return ToolResult(
                success=False,
                error="Manim not installed. " + self.install_instructions,
            )

        _ = time.time()
        scene_code = inputs["scene_code"]
        quality = inputs.get("quality", "medium")
        output_format = inputs.get("format", "mp4")
        scene_name = inputs.get("scene_name") or self._detect_scene_name(scene_code)
        output_path = inputs.get("output_path")

        preset = QUALITY_PRESETS.get(quality, QUALITY_PRESETS["medium"])

        # Build the CLI flags from quality preset
        quality_flag = preset["flag"]
        if output_format == "gif":
            if "--format gif" not in quality_flag:
                quality_flag += " --format gif"
        elif output_format == "png":
            quality_flag += " -s"
        elif output_format == "webm":
            quality_flag += f" --format {output_format}"

        if not scene_name:
            return ToolResult(
                success=False,
                error="Could not detect Scene class name. Provide scene_name or ensure a single Scene subclass.",
            )

        # Create temp working directory
        work_dir = Path(tempfile.mkdtemp(prefix="manim_"))
        scene_file = work_dir / "scene.py"

        # Write scene code
        full_code = scene_code
        if "from manim import" not in scene_code:
            full_code = "from manim import *\n" + scene_code
        scene_file.write_text(full_code, encoding="utf-8")

        # Build command
        cmd = ["manim"] + quality_flag.split()
        if inputs.get("transparent"):
            cmd.append("--transparent")
        if inputs.get("background_color"):
            cmd.extend(["--background_color", inputs["background_color"]])
        if inputs.get("extra_args"):
            cmd.extend(inputs["extra_args"])
        cmd.extend([str(scene_file), scene_name])

        try:
            proc = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=600,
                cwd=str(work_dir),
                env={**os.environ},
            )
        except subprocess.TimeoutExpired:
            self._cleanup(work_dir)
            return ToolResult(success=False, error="Manim render timed out (600s)")

        if proc.returncode != 0:
            error_msg = proc.stderr or "Unknown error"
            self._cleanup(work_dir)
            return ToolResult(
                success=False,
                error=f"Manim render failed:\n{error_msg}",
                data={"full_stderr": proc.stderr, "full_stdout": proc.stdout},
            )

        rendered_file = self._find_output(work_dir, scene_name, output_format)
        if not rendered_file:
            self._cleanup(work_dir)
            return ToolResult(
                success=False,
                error=f"Render succeeded but output file not found. Manim output:\n{proc.stdout}",
            )

        if output_path:
            final_path = Path(output_path)
        else:
            ext = rendered_file.suffix
            final_path = Path(f"manim_{scene_name}{ext}")

        final_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(str(rendered_file), str(final_path))

        video_info = self._probe_output(final_path)
        self._cleanup(work_dir)

        return ToolResult(
            success=True,
            data={
                "scene_name": scene_name,
                "quality": quality,
                "format": output_format,
                "output": str(final_path),
                "resolution": preset["resolution"],
                "fps": preset["fps"],
                **video_info,
            },
            artifacts=[str(final_path)],
        )

    def _detect_scene_name(self, code: str) -> str | None:
        import re

        pattern = r"class\s+(\w+)\s*\(\s*(?:Scene|ThreeDScene|MovingCameraScene|ZoomedScene)\s*\)"
        matches = re.findall(pattern, code)
        if len(matches) == 1:
            return matches[0]
        if len(matches) > 1:
            return matches[-1]
        return None

    def _find_output(self, work_dir: Path, scene_name: str, fmt: str) -> Path | None:
        media_dir = work_dir / "media"
        if not media_dir.exists():
            return None

        ext_map = {"mp4": ".mp4", "gif": ".gif", "webm": ".webm", "png": ".png"}
        target_ext = ext_map.get(fmt, ".mp4")

        for path in media_dir.rglob(f"{scene_name}{target_ext}"):
            return path
        for path in media_dir.rglob(f"*{target_ext}"):
            return path
        return None

    def _probe_output(self, path: Path) -> dict[str, Any]:
        info: dict[str, Any] = {"file_size_bytes": path.stat().st_size}
        if not shutil.which("ffprobe"):
            return info

        try:
            proc = subprocess.run(
                [
                    "ffprobe",
                    "-v",
                    "quiet",
                    "-print_format",
                    "json",
                    "-show_format",
                    "-show_streams",
                    str(path),
                ],
                capture_output=True,
                text=True,
                timeout=10,
            )
            if proc.returncode == 0:
                import json

                probe = json.loads(proc.stdout)
                fmt = probe.get("format", {})
                info["duration_seconds"] = float(fmt.get("duration", 0))
                info["file_size_mb"] = round(path.stat().st_size / (1024 * 1024), 2)
                for stream in probe.get("streams", []):
                    if stream.get("codec_type") == "video":
                        info["video_width"] = int(stream.get("width", 0))
                        info["video_height"] = int(stream.get("height", 0))
                        info["video_codec"] = stream.get("codec_name", "")
                        break
        except Exception:
            pass
        return info

    @staticmethod
    def _cleanup(work_dir: Path) -> None:
        try:
            shutil.rmtree(str(work_dir), ignore_errors=True)
        except Exception:
            pass

