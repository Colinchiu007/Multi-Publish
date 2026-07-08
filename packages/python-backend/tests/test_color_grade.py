"""Tests for color_grade.py — pure logic + error paths."""

from __future__ import annotations

import tempfile
from pathlib import Path

from multi_publish.video_creation.enhancement.color_grade import (
    PROFILES,
    ColorGrade,
)


class TestProfiles:
    """PROFILES dict structure."""

    def test_all_profiles_have_description_and_vf(self):
        for name, profile in PROFILES.items():
            assert "description" in profile, f"{name} missing description"
            assert "vf" in profile, f"{name} missing vf"

    def test_known_profile_count(self):
        assert len(PROFILES) == 7

    def test_each_profile_has_different_vf(self):
        vfs = [p["vf"] for p in PROFILES.values()]
        assert len(set(vfs)) == len(PROFILES)  # all unique

    def test_cinematic_warm_contains_colorbalance(self):
        assert "colorbalance" in PROFILES["cinematic_warm"]["vf"]


class TestListProfiles:
    """list_profiles() returns descriptions."""

    def test_returns_all_profiles(self):
        result = ColorGrade.list_profiles()
        assert len(result) == len(PROFILES)
        for name in PROFILES:
            assert name in result
            assert result[name] == PROFILES[name]["description"]


class TestBuildFilter:
    """_build_filter() — pure logic, no external deps."""

    def test_custom_vf_takes_precedence(self):
        cg = ColorGrade()
        result = cg._build_filter({"custom_vf": "custom=chain", "profile": "cinematic_warm"})
        assert result == "custom=chain"

    def test_lut_path_with_existing_file(self):
        cg = ColorGrade()
        with tempfile.NamedTemporaryFile(suffix=".cube", delete=False) as f:
            f.write(b"test")
            lut = f.name
        try:
            result = cg._build_filter({"lut_path": lut})
            assert "lut3d" in result
            assert lut.replace("\\", "/") in result or Path(lut).name in result
        finally:
            Path(lut).unlink(missing_ok=True)

    def test_lut_path_nonexistent_falls_through(self):
        cg = ColorGrade()
        result = cg._build_filter({"lut_path": "/nonexistent/file.cube"})
        # Falls through to profile default
        assert "colorbalance" in result  # cinematic_warm default

    def test_single_profile(self):
        cg = ColorGrade()
        result = cg._build_filter({"profile": "moody_dark"})
        assert result == PROFILES["moody_dark"]["vf"]

    def test_default_profile(self):
        cg = ColorGrade()
        result = cg._build_filter({})
        assert "colorbalance" in result  # cinematic_warm default

    def test_unknown_profile_returns_empty(self):
        cg = ColorGrade()
        result = cg._build_filter({"profile": "nonexistent"})
        assert result == ""

    def test_intensity_below_one_adds_blend(self):
        cg = ColorGrade()
        result = cg._build_filter({"profile": "neutral", "intensity": 0.5})
        assert "blend" in result
        assert "all_opacity=0.5" in result

    def test_intensity_at_one_no_blend(self):
        cg = ColorGrade()
        result = cg._build_filter({"profile": "neutral", "intensity": 1.0})
        assert "blend" not in result

    def test_intensity_at_zero_no_blend(self):
        cg = ColorGrade()
        result = cg._build_filter({"profile": "neutral", "intensity": 0.0})
        assert "blend" not in result


class TestExecuteErrorPaths:
    """execute() error paths — no FFmpeg needed."""

    def test_missing_input(self):
        cg = ColorGrade()
        result = cg.execute({"input_path": "/nonexistent/video.mp4"})
        assert result.success is False
        assert "Input not found" in result.error
