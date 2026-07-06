"""Screen capture tools ? FFmpeg native recording and Cap integration."""

from __future__ import annotations

from multi_publish.video_creation.capture.cap_recorder import (
    CapRecorder,
    _find_cap_binary,
    _find_cap_recordings_dir,
    _get_recent_recordings,
    _is_cap_running,
)
from multi_publish.video_creation.capture.screen_capture_selector import (
    ScreenCaptureSelector,
)
from multi_publish.video_creation.capture.screen_recorder import (
    ScreenRecorder,
    _detect_audio_device_mac,
    _detect_audio_device_windows,
)


__all__ = [
    "CapRecorder",
    "ScreenCaptureSelector",
    "ScreenRecorder",
    "_detect_audio_device_mac",
    "_detect_audio_device_windows",
    "_find_cap_binary",
    "_find_cap_recordings_dir",
    "_get_recent_recordings",
    "_is_cap_running",
]
