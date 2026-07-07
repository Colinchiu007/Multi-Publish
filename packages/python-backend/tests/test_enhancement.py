"""Tests for video creation enhancement tools (Phase 5 - OpenMontage integration).
"""
from __future__ import annotations
from pathlib import Path
import pytest
from multi_publish.video_creation.base_tool import ToolTier, ToolStability
from multi_publish.video_creation.enhancement import (
    BgRemove, ColorGrade, EyeEnhance, FaceEnhance, FaceRestore, Upscale,
)


class TestBgRemove:
    def test_metadata(self):
        tool = BgRemove()
        assert tool.name == "bg_remove"
        assert tool.version == "0.1.0"
        assert tool.tier == ToolTier.ENHANCE
        assert tool.stability == ToolStability.EXPERIMENTAL

    def test_capabilities(self):
        tool = BgRemove()
        assert "background_removal" in tool.capabilities
        assert "batch_processing" in tool.capabilities

    def test_execute_missing_key(self):
        tool = BgRemove()
        with pytest.raises(KeyError):
            tool.execute({})

    def test_execute_missing_file(self):
        tool = BgRemove()
        result = tool.execute({"input_path": "/nonexistent/file.png"})
        assert not result.success

    def test_dry_run(self):
        tool = BgRemove()
        info = tool.dry_run({"input_path": "/tmp/test.png"})
        assert info["tool"] == "bg_remove"
        assert "estimated_runtime_seconds" in info

    def test_dependencies(self):
        tool = BgRemove()
        assert "python:rembg" in tool.dependencies


class TestColorGrade:
    def test_metadata(self):
        tool = ColorGrade()
        assert tool.name == "color_grade"
        assert tool.tier == ToolTier.ENHANCE

    def test_all_profiles_defined(self):
        from multi_publish.video_creation.enhancement.color_grade import PROFILES
        expected = {"cinematic_warm", "cinematic_cool", "moody_dark", "bright_clean",
                     "vintage_film", "high_contrast", "neutral"}
        assert set(PROFILES.keys()) == expected

    def test_each_profile_has_description_and_filter(self):
        from multi_publish.video_creation.enhancement.color_grade import PROFILES
        for name, profile in PROFILES.items():
            assert "description" in profile, f"Profile {name} missing description"
            assert "vf" in profile, f"Profile {name} missing filter chain"

    def test_execute_missing_file(self):
        tool = ColorGrade()
        result = tool.execute({"input_path": "/nonexistent.mp4", "profile": "neutral"})
        assert not result.success

    def test_dry_run(self):
        tool = ColorGrade()
        info = tool.dry_run({"input_path": "/tmp/test.mp4", "profile": "cinematic_warm"})
        assert info["tool"] == "color_grade"
        assert info["would_execute"]


class TestEyeEnhance:
    def test_metadata(self):
        tool = EyeEnhance()
        assert tool.name == "eye_enhance"
        assert tool.tier == ToolTier.ENHANCE

    def test_capabilities(self):
        tool = EyeEnhance()
        assert len(tool.capabilities) > 0

    def test_execute_missing_key(self):
        tool = EyeEnhance()
        with pytest.raises(KeyError):
            tool.execute({})


class TestFaceEnhance:
    def test_metadata(self):
        tool = FaceEnhance()
        assert tool.name == "face_enhance"
        assert tool.tier == ToolTier.ENHANCE

    def test_execute_missing_key(self):
        tool = FaceEnhance()
        with pytest.raises(KeyError):
            tool.execute({})

    def test_dry_run(self):
        tool = FaceEnhance()
        info = tool.dry_run({"input_path": "/tmp/face.jpg"})
        assert info["tool"] == "face_enhance"


class TestFaceRestore:
    def test_metadata(self):
        tool = FaceRestore()
        assert tool.name == "face_restore"
        assert tool.tier == ToolTier.ENHANCE

    def test_execute_missing_key(self):
        tool = FaceRestore()
        with pytest.raises(KeyError):
            tool.execute({})

    def test_dry_run(self):
        tool = FaceRestore()
        info = tool.dry_run({"input_path": "/tmp/old_photo.jpg"})
        assert info["tool"] == "face_restore"


class TestUpscale:
    def test_metadata(self):
        tool = Upscale()
        assert tool.name == "upscale"
        assert tool.tier == ToolTier.ENHANCE

    def test_execute_missing_key(self):
        tool = Upscale()
        with pytest.raises(KeyError):
            tool.execute({})

    def test_dry_run(self):
        tool = Upscale()
        info = tool.dry_run({"input_path": "/tmp/image.jpg"})
        assert info["tool"] == "upscale"
