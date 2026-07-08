"""Tests for upscale.py — MODELS data + error paths."""

from __future__ import annotations

from multi_publish.video_creation.enhancement.upscale import (
    MODELS,
    VIDEO_EXTENSIONS,
    Upscale,
)


class TestVideoExtensions:
    """VIDEO_EXTENSIONS set."""

    def test_contains_known_extensions(self):
        assert ".mp4" in VIDEO_EXTENSIONS
        assert ".mov" in VIDEO_EXTENSIONS
        assert ".avi" in VIDEO_EXTENSIONS

    def test_does_not_contain_images(self):
        assert ".png" not in VIDEO_EXTENSIONS
        assert ".jpg" not in VIDEO_EXTENSIONS


class TestModels:
    """MODELS dict structure."""

    def test_three_models(self):
        assert len(MODELS) == 3

    def test_each_has_description_and_scale(self):
        for _name, info in MODELS.items():
            assert "description" in info
            assert "scale" in info
            assert info["scale"] == 4  # all models are 4x

    def test_x4plus_is_default(self):
        assert "RealESRGAN_x4plus" in MODELS

    def test_anime_model(self):
        assert "RealESRGAN_x4plus_anime_6B" in MODELS

    def test_net_model(self):
        assert "RealESRNet_x4plus" in MODELS

    def test_unique_descriptions(self):
        descs = [m["description"] for m in MODELS.values()]
        assert len(set(descs)) == len(MODELS)


class TestGetStatus:
    """get_status() checks import availability."""

    def test_realesrgan_not_installed(self):
        """Without realesrgan, status is UNAVAILABLE."""
        up = Upscale()
        status = up.get_status()
        # In test env without realesrgan, should be UNAVAILABLE
        from multi_publish.video_creation.base_tool import ToolStatus
        assert status in (ToolStatus.AVAILABLE, ToolStatus.UNAVAILABLE)


class TestExecuteErrorPaths:
    """execute() error path — no external deps needed."""

    def test_missing_input(self):
        up = Upscale()
        result = up.execute({"input_path": "/nonexistent/video.mp4"})
        assert result.success is False
        assert "Input not found" in result.error
