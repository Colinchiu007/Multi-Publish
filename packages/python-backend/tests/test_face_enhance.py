"""Tests for face_enhance.py — pure logic + error paths."""

from __future__ import annotations

import pytest

from multi_publish.video_creation.enhancement.face_enhance import (
    PRESETS,
    FaceEnhance,
)


class TestPresets:
    """PRESETS dict structure."""

    def test_all_presets_have_description_and_vf(self):
        for name, preset in PRESETS.items():
            assert "description" in preset, f"{name} missing description"
            assert "vf" in preset, f"{name} missing vf"
            assert isinstance(preset["description"], str)
            assert isinstance(preset["vf"], str)

    def test_known_preset_count(self):
        assert len(PRESETS) == 9

    def test_soft_skin_preset(self):
        assert "smartblur" in PRESETS["soft_skin"]["vf"]

    def test_talking_head_standard_is_combo(self):
        vf = PRESETS["talking_head_standard"]["vf"]
        assert "," in vf  # multiple filters chained
        assert "smartblur" in vf and "unsharp" in vf


class TestListPresets:
    """list_presets() returns descriptions."""

    def test_returns_all_presets(self):
        result = FaceEnhance.list_presets()
        assert len(result) == len(PRESETS)
        for name in PRESETS:
            assert name in result
            assert result[name] == PRESETS[name]["description"]


class TestBuildFilter:
    """_build_filter() — pure logic, no external deps."""

    def test_custom_vf_takes_precedence(self):
        fe = FaceEnhance()
        result = fe._build_filter({"custom_vf": "custom=filter", "preset": "soft_skin"})
        assert result == "custom=filter"

    def test_presets_list(self):
        fe = FaceEnhance()
        result = fe._build_filter({"presets": ["soft_skin", "sharpen"]})
        assert "smartblur" in result
        assert "unsharp" in result
        assert "," in result

    def test_presets_list_skips_unknown(self):
        fe = FaceEnhance()
        result = fe._build_filter({"presets": ["soft_skin", "unknown_preset"]})
        assert "smartblur" in result
        assert "unknown_preset" not in result

    def test_single_preset(self):
        fe = FaceEnhance()
        result = fe._build_filter({"preset": "sharpen"})
        assert result == PRESETS["sharpen"]["vf"]

    def test_default_preset(self):
        fe = FaceEnhance()
        result = fe._build_filter({})
        assert "smartblur" in result  # talking_head_standard default

    def test_unknown_preset_returns_empty(self):
        fe = FaceEnhance()
        result = fe._build_filter({"preset": "nonexistent"})
        assert result == ""

    def test_empty_inputs_returns_default_preset(self):
        fe = FaceEnhance()
        result = fe._build_filter({"preset": "talking_head_standard"})
        assert len(result) > 0


class TestExecuteErrorPaths:
    """execute() error paths — no FFmpeg needed."""

    def test_missing_input(self):
        fe = FaceEnhance()
        result = fe.execute({"input_path": "/nonexistent/video.mp4"})
        assert result.success is False
        assert "Input not found" in result.error

    def test_no_preset_specified(self):
        fe = FaceEnhance()
        result = fe.execute({"input_path": __file__})  # any existing file
        assert not result.success  # should fail because __file__ is not a video
        # The execute will find the file, then build_filter with no preset
        # which defaults to talking_head_standard, then try ffmpeg which fails
