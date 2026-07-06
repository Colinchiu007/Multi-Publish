"""Tests for Phase 4: Video Analysis tools."""
from __future__ import annotations

import pytest

from multi_publish.video_creation.analysis.audio_energy import AudioEnergy
from multi_publish.video_creation.analysis.audio_probe import AudioProbe
from multi_publish.video_creation.analysis.composition_validator import CompositionValidator
from multi_publish.video_creation.analysis.face_tracker import FaceTracker
from multi_publish.video_creation.analysis.frame_sampler import FrameSampler
from multi_publish.video_creation.analysis.scene_detect import SceneDetect
from multi_publish.video_creation.analysis.transcriber import Transcriber
from multi_publish.video_creation.analysis.transcript_fetcher import TranscriptFetcher
from multi_publish.video_creation.analysis.video_analyzer import VideoAnalyzer
from multi_publish.video_creation.analysis.video_downloader import VideoDownloader
from multi_publish.video_creation.analysis.video_understand import VideoUnderstand
from multi_publish.video_creation.analysis.visual_qa import VisualQA
from multi_publish.video_creation.base_tool import ToolResult, ToolTier


class TestAnalysisTools:
    """Verify all 12 analysis tools can be instantiated with correct metadata."""

    def test_audio_energy_metadata(self):
        t = AudioEnergy()
        assert t.name == "audio_energy"
        assert t.capability == "analysis"
        assert t.tier == ToolTier.CORE

    def test_audio_probe_metadata(self):
        t = AudioProbe()
        assert t.name == "audio_probe"
        assert t.capability == "analysis"

    def test_composition_validator_metadata(self):
        t = CompositionValidator()
        assert t.name == "composition_validator"
        assert t.capability == "analysis"

    def test_face_tracker_metadata(self):
        t = FaceTracker()
        assert t.name == "face_tracker"
        assert "mediapipe" in t.provider

    def test_frame_sampler_metadata(self):
        t = FrameSampler()
        assert t.name == "frame_sampler"
        assert t.capability == "analysis"

    def test_scene_detect_metadata(self):
        t = SceneDetect()
        assert t.name == "scene_detect"
        assert t.capability == "analysis"

    def test_transcriber_metadata(self):
        t = Transcriber()
        assert t.name == "transcriber"
        assert t.capability == "analysis"

    def test_transcript_fetcher_metadata(self):
        t = TranscriptFetcher()
        assert t.name == "transcript_fetcher"
        assert t.capability == "analysis"

    def test_video_analyzer_metadata(self):
        t = VideoAnalyzer()
        assert t.name == "video_analyzer"
        assert t.capability == "analysis"

    def test_video_downloader_metadata(self):
        t = VideoDownloader()
        assert t.name == "video_downloader"

    def test_video_understand_metadata(self):
        t = VideoUnderstand()
        assert t.name == "video_understand"

    def test_visual_qa_metadata(self):
        t = VisualQA()
        assert t.name == "visual_qa"


class TestAnalysisToolErrorHandling:
    """Verify tools return proper errors when required inputs are missing."""

    def test_face_tracker_missing_input(self):
        t = FaceTracker()
        result = t.execute({"no_input_path": "x"})
        assert not result.success
        assert result.error is not None

    def test_scene_detect_missing_input(self):
        t = SceneDetect()
        result = t.execute({})
        assert not result.success

    def test_audio_energy_dry_run(self):
        t = AudioEnergy()
        result = t.execute({"dry_run": True, "input_path": "dummy.mp4"})
        # dry run with missing file returns error, not crash
        assert result.error is not None or result.success is False
