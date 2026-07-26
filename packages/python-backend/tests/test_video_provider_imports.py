"""视频 Provider 包的可选依赖导入合同。"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path


def test_video_provider_package_imports_without_optional_frame_dependencies():
    """未安装单个 Provider 的帧处理依赖时，基础视频工具仍应可导入。"""
    source_root = Path(__file__).resolve().parents[1] / "src"
    script = """
import builtins

real_import = builtins.__import__


def reject_optional_frame_dependencies(name, globals=None, locals=None, fromlist=(), level=0):
    if name == "numpy" or name.startswith("numpy.") or name == "PIL" or name.startswith("PIL."):
        raise ModuleNotFoundError(f"blocked optional dependency: {name}")
    return real_import(name, globals, locals, fromlist, level)


builtins.__import__ = reject_optional_frame_dependencies

from multi_publish.video_creation.providers.video.green_screen_composite import GreenScreenComposite
from multi_publish.video_creation.providers.video.video_trimmer import VideoTrimmer

assert GreenScreenComposite.name == "green_screen_composite"
assert VideoTrimmer.name == "video_trimmer"

result = GreenScreenComposite().execute({
    "speaker_path": "missing-speaker.mp4",
    "background_path": "missing-background.mp4",
    "output_path": "unused-output.mp4",
})
assert result.success is False
assert result.error.startswith("Speaker video not found:")
"""
    python_path = os.pathsep.join(filter(None, [str(source_root), os.environ.get("PYTHONPATH")]))
    result = subprocess.run(
        [sys.executable, "-c", script],
        cwd=source_root,
        env={**os.environ, "PYTHONPATH": python_path, "PYTHONDONTWRITEBYTECODE": "1"},
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )

    assert result.returncode == 0, result.stderr
