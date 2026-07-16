# Copyright (C) 2025 AIDC-AI
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
"""
Frame Processor
================

Manages frames/scenes and template selection.

Migrated from Pixelle-Video to Multi-Publish. Adapted to focus on:
- Frame/scene management: add, remove, list, get, clear
- Template selection logic: pick template based on size + content type
- Naming convention: ``static_*.html`` (text-only), ``image_*.html`` (image),
  ``video_*.html`` (video background)

The original Pixelle-Video ``FrameProcessor`` also orchestrated TTS → Image → Video
pipeline. That orchestration is NOT migrated here — it lives in the video_creation
package. This module provides the lightweight frame management and template
selection layer.

Usage:
    >>> fp = FrameProcessor()
    >>> fp.add_frame(Frame(index=0, title="Intro", content="Hello world"))
    >>> template = fp.select_template("1080x1920", "image")
    >>> frames = fp.list_frames()
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from loguru import logger

from multi_publish.services.frame_html import (
    TEMPLATES_DIR,
    get_template_type,
    resolve_template_path,
)


# ─── Frame dataclass ───────────────────────────────────────


@dataclass
class Frame:
    """Represents a single frame/scene in a storyboard.

    Attributes:
        index: Zero-based frame index.
        title: Frame title (rendered into ``{{ title }}``).
        content: Frame narration/content text (rendered into ``{{ content }}``).
        image_path: Path to generated image (for image-type frames).
        video_path: Path to generated video (for video-type frames).
        composed_image_path: Path to composed frame image (HTML rendered).
        audio_path: Path to TTS audio file.
        duration: Duration in seconds (from audio or video).
        media_type: ``"image"`` or ``"video"``.
    """

    index: int
    title: str = ""
    content: str = ""
    image_path: Optional[str] = None
    video_path: Optional[str] = None
    composed_image_path: Optional[str] = None
    audio_path: Optional[str] = None
    duration: Optional[float] = None
    media_type: Optional[str] = None

    @property
    def is_video(self) -> bool:
        """True if this frame uses video media."""
        return self.media_type == "video"

    @property
    def has_media(self) -> bool:
        """True if this frame has any media (image or video)."""
        return self.image_path is not None or self.video_path is not None


# ─── FrameProcessor ────────────────────────────────────────


class FrameProcessor:
    """Frame processor — manages frames and template selection.

    Provides lightweight frame/scene management:
    - ``add_frame()``: Add a frame to the storyboard
    - ``remove_frame()``: Remove a frame by index
    - ``list_frames()``: List all frames
    - ``get_frame()``: Get a frame by index
    - ``clear()``: Clear all frames
    - ``select_template()``: Select a template based on size + content type
    """

    def __init__(self):
        """Initialize an empty frame processor."""
        self._frames: list[Frame] = []

    # ─── Frame management ─────────────────────────────────

    def add_frame(self, frame: Frame) -> None:
        """Add a frame to the storyboard.

        Args:
            frame: Frame instance to add.
        """
        self._frames.append(frame)
        logger.debug(f"Added frame index={frame.index}, total={len(self._frames)}")

    def remove_frame(self, index: int) -> None:
        """Remove a frame by its index.

        If the index doesn't match any frame, this is a no-op.

        Args:
            index: Zero-based frame index to remove.
        """
        before = len(self._frames)
        self._frames = [f for f in self._frames if f.index != index]
        removed = before - len(self._frames)
        if removed:
            logger.debug(f"Removed {removed} frame(s) with index={index}")
        else:
            logger.debug(f"No frame found with index={index} (no-op)")

    def list_frames(self) -> list[Frame]:
        """List all frames in insertion order.

        Returns:
            List of Frame instances (shallow copy).
        """
        return list(self._frames)

    def get_frame(self, index: int) -> Optional[Frame]:
        """Get a frame by index.

        Args:
            index: Zero-based frame index.

        Returns:
            Frame instance or ``None`` if not found.
        """
        for f in self._frames:
            if f.index == index:
                return f
        return None

    def clear(self) -> None:
        """Remove all frames."""
        self._frames.clear()
        logger.debug("Cleared all frames")

    def frame_count(self) -> int:
        """Return the number of frames.

        Returns:
            Frame count.
        """
        return len(self._frames)

    # ─── Template selection ────────────────────────────────

    def select_template(self, size: str, content_type: str) -> Path:
        """Select a template based on size and content type.

        Template selection logic:
        1. Map ``content_type`` to a filename prefix:
           - ``"static"`` → ``static_*.html``
           - ``"image"``  → ``image_*.html``
           - ``"video"``  → ``video_*.html``
           - unknown types → ``image`` (default)
        2. Look for ``{prefix}_*.html`` in the size directory.
        3. Fall back to ``default.html`` if no prefix-matched template exists.

        Args:
            size: Size string like ``"1080x1920"``.
            content_type: ``"static"``, ``"image"``, ``"video"``, or custom.

        Returns:
            Path to the selected template file.

        Raises:
            FileNotFoundError: If the size directory doesn't exist.
        """
        # Map content type to prefix
        prefix_map = {
            "static": "static_",
            "image": "image_",
            "video": "video_",
        }
        prefix = prefix_map.get(content_type, "image_")

        size_dir = TEMPLATES_DIR / size
        if not size_dir.exists():
            raise FileNotFoundError(f"Template size directory not found: {size}")

        # Look for any template matching the prefix
        candidates = sorted(size_dir.glob(f"{prefix}*.html"))
        if candidates:
            selected = candidates[0]
            logger.debug(f"Selected template '{selected.name}' for size={size}, type={content_type}")
            return selected

        # Fall back to default.html
        default_path = size_dir / "default.html"
        if default_path.exists():
            logger.debug(
                f"No {prefix}*.html found for size={size}, falling back to default.html"
            )
            return default_path

        raise FileNotFoundError(f"No template found in {size}")

    # ─── Convenience: resolve template name ───────────────

    @staticmethod
    def resolve_template(template_name: str) -> Path:
        """Resolve a template name to a full path (delegates to ``resolve_template_path``).

        Args:
            template_name: Template identifier like ``"1080x1920/default"``.

        Returns:
            Resolved ``Path`` to template file.
        """
        return resolve_template_path(template_name)

    @staticmethod
    def get_template_type(template_path: str) -> str:
        """Determine template type from filename (delegates to ``get_template_type``).

        Args:
            template_path: Path to template file.

        Returns:
            ``"static"``, ``"image"``, or ``"video"``.
        """
        return get_template_type(template_path)
