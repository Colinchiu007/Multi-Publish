"""Tests for subtitle generation and capture modules (Phase 5)."""
from __future__ import annotations
import json
from pathlib import Path
import tempfile
import pytest
from multi_publish.video_creation.base_tool import ToolTier
from multi_publish.video_creation.subtitle import SubtitleGen
from multi_publish.video_creation.capture import ScreenRecorder, CapRecorder

SAMPLE = [{"start":0,"end":2.5,"words":[{"word":"Hello","start":0,"end":0.5},{"word":"world","start":0.6,"end":1}]}]

class TestSubtitleGen:
    def test_metadata(self):
        t = SubtitleGen()
        assert t.name == "subtitle_gen"
        assert t.tier == ToolTier.CORE
    def test_capabilities(self):
        assert "generate_srt" in SubtitleGen().capabilities
    def test_missing_segments(self):
        r = SubtitleGen().execute({})
        assert not r.success and "segments" in (r.error or "")
    def test_dry_run(self):
        assert SubtitleGen().dry_run({"segments":[]})["tool"]=="subtitle_gen"
    def test_generate_srt(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp)/"out.srt"
            r = SubtitleGen().execute({"segments":SAMPLE,"output_path":str(out)})
            assert r.success and out.exists() and "Hello" in out.read_text("utf-8")
    def test_generate_vtt(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp)/"out.vtt"
            r = SubtitleGen().execute({"segments":SAMPLE,"format":"vtt","output_path":str(out)})
            assert r.success and out.exists() and "WEBVTT" in out.read_text("utf-8")
    def test_generate_json(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp)/"out.json"
            r = SubtitleGen().execute({"segments":SAMPLE,"format":"json","output_path":str(out)})
            assert r.success and out.exists()
            d = json.loads(out.read_text("utf-8"))
            assert "cues" in d
    def test_invalid_format(self):
        assert not SubtitleGen().execute({"segments":SAMPLE,"format":"invalid"}).success
    def test_word_corrections(self):
        segs = [{"start":0,"end":1,"words":[{"word":"Helo","start":0,"end":1}]}]
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp)/"c.srt"
            r = SubtitleGen().execute({"segments":segs,"corrections":{"Helo":"Hello"},"output_path":str(out)})
            assert r.success and "Hello" in out.read_text("utf-8")

class TestScreenRecorder:
    def test_metadata(self):
        t = ScreenRecorder()
        assert t.name == "screen_recorder"
        assert t.tier == ToolTier.SOURCE
        assert "record_screen" in t.capabilities
    def test_execute_missing_key(self):
        assert not ScreenRecorder().execute({}).success
    def test_dry_run(self):
        assert ScreenRecorder().dry_run({"duration":10})["tool"]=="screen_recorder"

class TestCapRecorder:
    def test_metadata(self):
        t = CapRecorder()
        assert t.name == "cap_recorder"
        assert t.tier == ToolTier.SOURCE
    def test_execute_missing_key(self):
        with pytest.raises(KeyError):
            CapRecorder().execute({})
    def test_dry_run(self):
        assert CapRecorder().dry_run({"duration":5})["tool"]=="cap_recorder"
