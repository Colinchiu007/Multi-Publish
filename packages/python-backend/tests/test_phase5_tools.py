"""Tests for Phase 5: Enhancement, Subtitle, and Capture tools."""
from __future__ import annotations

import pytest

from multi_publish.video_creation.base_tool import ToolTier

# Enhancement
from multi_publish.video_creation.enhancement.bg_remove import BgRemove
from multi_publish.video_creation.enhancement.color_grade import ColorGrade
from multi_publish.video_creation.enhancement.eye_enhance import EyeEnhance
from multi_publish.video_creation.enhancement.face_enhance import FaceEnhance
from multi_publish.video_creation.enhancement.face_restore import FaceRestore
from multi_publish.video_creation.enhancement.upscale import Upscale

# Subtitle
from multi_publish.video_creation.subtitle.subtitle_gen import SubtitleGen

# Capture
from multi_publish.video_creation.capture.cap_recorder import CapRecorder
from multi_publish.video_creation.capture.screen_capture_selector import ScreenCaptureSelector
from multi_publish.video_creation.capture.screen_recorder import ScreenRecorder


class TestEnhancementTools:
    """Verify all enhancement tools can be instantiated."""

    def test_bg_remove_metadata(self):
        t = BgRemove()
        assert t.name == "bg_remove"
        assert t.capability == "enhancement"

    def test_color_grade_metadata(self):
        t = ColorGrade()
        assert t.name == "color_grade"
        assert t.capability == "enhancement"

    def test_eye_enhance_metadata(self):
        t = EyeEnhance()
        assert t.name == "eye_enhance"
        assert t.provider in ("mediapipe", "opencv")

    def test_face_enhance_metadata(self):
        t = FaceEnhance()
        assert t.name == "face_enhance"

    def test_face_restore_metadata(self):
        t = FaceRestore()
        assert t.name == "face_restore"

    def test_upscale_metadata(self):
        t = Upscale()
        assert t.name == "upscale"
        assert t.capability == "enhancement"


class TestSubtitleTools:
    """Verify subtitle generation tool."""

    def test_subtitle_gen_metadata(self):
        t = SubtitleGen()
        assert t.name == "subtitle_gen"
        assert t.capability == "subtitle"

    def test_subtitle_gen_missing_input(self):
        t = SubtitleGen()
        result = t.execute({})
        assert not result.success
        assert result.error is not None


class TestCaptureTools:
    """Verify capture/recording tools."""

    def test_cap_recorder_metadata(self):
        t = CapRecorder()
        assert t.name == "cap_recorder"
        assert t.capability == "screen_capture"

    def test_screen_selector_metadata(self):
        t = ScreenCaptureSelector()
        assert t.name == "screen_capture_selector"

    def test_screen_recorder_metadata(self):
        t = ScreenRecorder()
        assert t.name == "screen_recorder"
        assert t.capability == "screen_capture"

    def test_screen_recorder_missing_input(self):
        t = ScreenRecorder()
        result = t.execute({})
        assert not result.success
