"""Tests for VideoStitch tool.

Tests the input validation, dry-run, schema checking, and error handling
paths of VideoStitch without requiring an actual FFmpeg installation.
"""

import pytest
import json
from pathlib import Path
from multi_publish.video_creation.base_tool import ToolResult, ToolTier, ToolStability
from multi_publish.video_creation.providers.video.video_stitch import VideoStitch


class TestVideoStitchBasics:
    """Basic metadata and configuration tests."""

    def test_name_and_version(self):
        v = VideoStitch()
        assert v.name == "video_stitch"
        assert v.version == "0.1.0"

    def test_tier_and_stability(self):
        v = VideoStitch()
        assert v.tier == ToolTier.CORE
        assert v.stability == ToolStability.EXPERIMENTAL

    def test_capabilities_listed(self):
        v = VideoStitch()
        assert "stitch" in v.capabilities
        assert "validate_clips" in v.capabilities
        assert "crossfade" in v.capabilities
        assert "spatial_side_by_side" in v.capabilities
        assert "spatial_picture_in_picture" in v.capabilities

    def test_dependencies(self):
        v = VideoStitch()
        assert "cmd:ffmpeg" in v.dependencies
        assert "cmd:ffprobe" in v.dependencies

    def test_input_schema_has_required_fields(self):
        v = VideoStitch()
        schema = v.input_schema
        assert schema["type"] == "object"
        assert "operation" in schema["required"]
        assert schema["properties"]["operation"]["enum"] == ["validate", "stitch", "preview_stitch", "spatial"]

    def test_dry_run(self):
        v = VideoStitch()
        result = v.dry_run({"operation": "stitch", "clips": ["a.mp4", "b.mp4"]})
        assert result["tool"] == "video_stitch"
        assert result["would_execute"] is True
        assert result["operation"] == "stitch"


class TestVideoStitchValidate:
    """Validation logic tests (no FFmpeg required)."""

    def test_missing_operation_returns_error(self):
        v = VideoStitch()
        result = v.execute({})
        assert result.success is False
        assert "operation" in (result.error or "")

    def test_invalid_operation_returns_error(self):
        v = VideoStitch()
        result = v.execute({"operation": "unknown_op"})
        assert result.success is False

    def test_validate_missing_clips_returns_error(self):
        v = VideoStitch()
        result = v.execute({"operation": "validate"})
        assert result.success is False

    def test_validate_empty_clips_returns_error(self):
        v = VideoStitch()
        result = v.execute({"operation": "validate", "clips": []})
        assert result.success is False

    def test_validate_non_existent_file(self):
        v = VideoStitch()
        result = v.execute({"operation": "validate", "clips": ["/tmp/nonexistent_video_12345.mp4"]})
        assert result.success is False
        assert "not found" in (result.error or "").lower() or "no such" in (result.error or "").lower()

    def test_stitch_without_clips_returns_error(self):
        v = VideoStitch()
        result = v.execute({"operation": "stitch"})
        assert result.success is False

    def test_stitch_single_clip_returns_error(self):
        v = VideoStitch()
        result = v.execute({"operation": "stitch", "clips": ["single.mp4"]})
        assert result.success is False

    def test_spatial_without_two_clips_returns_error(self):
        v = VideoStitch()
        result = v.execute({"operation": "spatial", "clips": ["a.mp4"]})
        assert result.success is False


class TestVideoStitchProbe:
    """Probe logic tests (no FFprobe needed for non-existent files)."""

    def test_probe_nonexistent_file(self):
        v = VideoStitch()
        result = v._probe_clip("/tmp/nonexistent_probe_test.mp4")
        assert result is None


class TestVideoStitchNormalization:
    """Normalization resolution logic tests."""

    def test_resolve_normalization_default(self):
        v = VideoStitch()
        probes = [
            {"width": 1920, "height": 1080, "fps": 30.0, "codec": "h264"},
            {"width": 1920, "height": 1080, "fps": 30.0, "codec": "h264"},
        ]
        width, height, fps, vcodec, acodec = v._resolve_normalization_target({}, probes)
        assert width == 1920
        assert height == 1080
        assert fps == 30.0

    def test_resolve_normalization_with_explicit_target(self):
        v = VideoStitch()
        probes = [
            {"width": 1920, "height": 1080, "fps": 30.0, "codec": "h264"},
            {"width": 1280, "height": 720, "fps": 24.0, "codec": "h264"},
        ]
        inputs = {"target_resolution": "1280x720", "target_fps": 24}
        width, height, fps, vcodec, acodec = v._resolve_normalization_target(inputs, probes)
        assert width == 1280
        assert height == 720
        assert fps == 24

    def test_resolve_normalization_picks_minimum(self):
        v = VideoStitch()
        probes = [
            {"width": 3840, "height": 2160, "fps": 60.0, "codec": "h264"},
            {"width": 1920, "height": 1080, "fps": 30.0, "codec": "h264"},
        ]
        width, height, fps, vcodec, acodec = v._resolve_normalization_target({}, probes)
        assert width >= 1920
        assert fps >= 30.0

    def test_needs_normalization_matching(self):
        v = VideoStitch()
        probes = [
            {"width": 1920, "height": 1080, "fps": 30.0, "codec": "h264"},
            {"width": 1920, "height": 1080, "fps": 30.0, "codec": "h264"},
        ]
        assert v._needs_normalization(probes) is False

    def test_needs_normalization_different(self):
        v = VideoStitch()
        probes = [
            {"width": 1920, "height": 1080, "fps": 30.0, "codec": "h264"},
            {"width": 1280, "height": 720, "fps": 24.0, "codec": "h264"},
        ]
        assert v._needs_normalization(probes) is True


class TestVideoStitchCleanup:
    """Temp cleanup tests."""

    def test_cleanup_nonexistent(self, tmp_path):
        nonexistent = tmp_path / "nonexistent_dir"
        VideoStitch._cleanup_temp(nonexistent, [])
        # Should not raise

    def test_cleanup_temp_files(self, tmp_path):
        temp_dir = tmp_path / "temp_video"
        temp_dir.mkdir()
        f1 = temp_dir / "tmp1.mp4"
        f1.write_text("test")
        f2 = temp_dir / "tmp2.mp4"
        f2.write_text("test")

        VideoStitch._cleanup_temp(temp_dir, [f1, f2])
        assert not f1.exists()
        assert not f2.exists()

    def test_info_method(self):
        v = VideoStitch()
        info = v.get_info()
        assert info["name"] == "video_stitch"
        assert info["tier"] == "core"
        assert info["stability"] == "experimental"
        assert info["capability"] == "video_post"
        assert "cmd:ffmpeg" in info.get("dependencies", [])

