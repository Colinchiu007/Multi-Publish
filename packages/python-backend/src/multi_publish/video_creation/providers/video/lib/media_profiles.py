"""Stub for OpenMontage lib/media_profiles.py."""
from __future__ import annotations
from dataclasses import dataclass
from typing import Any

@dataclass
class MediaProfile:
    name: str = "default"
    width: int = 1920
    height: int = 1080
    fps: int = 30
    codec: str = "libx264"
    crf: int = 23
    preset: str = "medium"

def get_profile(name: str) -> MediaProfile:
    return MediaProfile(name=name)

def ffmpeg_output_args(profile: MediaProfile) -> list[str]:
    return ["-c:v", profile.codec, "-crf", str(profile.crf), "-preset", profile.preset]
