"""Tests for subtitle/subtitle_gen.py — SRT/VTT/JSON subtitle generation.

subtitle_gen.py is pure Python (no external deps), making it a high-value
target for coverage improvement (currently 0%).
"""

from __future__ import annotations

import tempfile
from pathlib import Path

import pytest

from multi_publish.video_creation.subtitle.subtitle_gen import SubtitleGen

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def gen() -> SubtitleGen:
    return SubtitleGen()


@pytest.fixture
def sample_segments() -> list[dict]:
    """Two segments with word-level timestamps (typical ASR output)."""
    return [
        {
            "text": "Hello world",
            "words": [
                {"word": "Hello", "start": 0.0, "end": 0.5},
                {"word": "world", "start": 0.5, "end": 1.0},
            ],
        },
        {
            "text": "This is a test",
            "words": [
                {"word": "This", "start": 1.5, "end": 1.8},
                {"word": "is", "start": 1.8, "end": 2.0},
                {"word": "a", "start": 2.0, "end": 2.1},
                {"word": "test", "start": 2.1, "end": 2.5},
            ],
        },
    ]


@pytest.fixture
def long_segment() -> list[dict]:
    """Single segment with many words (forces max_words_per_cue splitting)."""
    words = []
    for i in range(20):
        words.append({"word": f"word{i}", "start": float(i * 0.5), "end": float(i * 0.5 + 0.4)})
    return [{"text": " ".join(w["word"] for w in words), "words": words}]


# ---------------------------------------------------------------------------
# Timestamp formatting
# ---------------------------------------------------------------------------

class TestTimestampFormatting:
    def test_ts_srt_zero(self, gen: SubtitleGen):
        assert gen._ts_srt(0.0) == "00:00:00,000"

    def test_ts_srt_simple(self, gen: SubtitleGen):
        assert gen._ts_srt(1.5) == "00:00:01,500"

    def test_ts_srt_hours(self, gen: SubtitleGen):
        assert gen._ts_srt(3661.001) == "01:01:01,001"

    def test_ts_srt_rounding(self, gen: SubtitleGen):
        assert gen._ts_srt(0.9999) == "00:00:01,000"

    def test_ts_vtt_zero(self, gen: SubtitleGen):
        assert gen._ts_vtt(0.0) == "00:00:00.000"

    def test_ts_vtt_simple(self, gen: SubtitleGen):
        assert gen._ts_vtt(1.5) == "00:00:01.500"

    def test_ts_vtt_hours(self, gen: SubtitleGen):
        assert gen._ts_vtt(3661.001) == "01:01:01.001"


# ---------------------------------------------------------------------------
# _build_cues
# ---------------------------------------------------------------------------

class TestBuildCues:
    def test_basic_cues(self, gen: SubtitleGen, sample_segments):
        cues = gen._build_cues(sample_segments, max_words=8, max_chars=42)
        assert len(cues) == 1  # max_words=8 merges both segments
        assert cues[0]["index"] == 1
        assert cues[0]["text"] == "Hello world This is a test"
        assert cues[0]["start"] == 0.0
        assert cues[0]["end"] == 2.5  # merges both segments (0.0-1.0 + 1.5-2.5)

    def test_empty_segments(self, gen: SubtitleGen):
        cues = gen._build_cues([], max_words=8, max_chars=42)
        assert cues == []

    def test_max_words_splitting(self, gen: SubtitleGen, long_segment):
        cues = gen._build_cues(long_segment, max_words=5, max_chars=42)
        # 20 words / 5 per cue = 4 cues
        assert len(cues) == 4
        assert cues[0]["text"] == "word0 word1 word2 word3 word4"
        assert cues[1]["text"] == "word5 word6 word7 word8 word9"

    def test_max_chars_splitting(self, gen: SubtitleGen):
        """Long single word exceeding max_chars should still appear."""
        segments = [
            {
                "text": "A" * 100,
                "words": [
                    {"word": "A" * 100, "start": 0.0, "end": 1.0},
                ],
            }
        ]
        cues = gen._build_cues(segments, max_words=8, max_chars=10)
        assert len(cues) == 1  # Can't split a single word
        assert cues[0]["text"] == "A" * 100

    def test_timestamp_propagation(self, gen: SubtitleGen):
        """Each cue should have start/end from first/last word."""
        segments = [
            {
                "text": "a b",
                "words": [
                    {"word": "a", "start": 1.0, "end": 1.5},
                    {"word": "b", "start": 2.0, "end": 2.5},
                ],
            }
        ]
        cues = gen._build_cues(segments, max_words=8, max_chars=42)
        assert cues[0]["start"] == 1.0
        assert cues[0]["end"] == 2.5


# ---------------------------------------------------------------------------
# _apply_corrections
# ---------------------------------------------------------------------------

class TestApplyCorrections:
    def test_basic_correction(self, gen: SubtitleGen):
        segments = [
            {
                "text": "Hello cloud",
                "words": [{"word": "Hello", "start": 0.0}, {"word": "cloud", "start": 0.5}],
            }
        ]
        result = gen._apply_corrections(segments, {"cloud": "Claude"})
        assert result[0]["words"][1]["word"] == "Claude"
        assert result[0]["text"] == "Hello Claude"

    def test_case_insensitive(self, gen: SubtitleGen):
        segments = [
            {
                "text": "CLOUD",
                "words": [{"word": "CLOUD", "start": 0.0}],
            }
        ]
        result = gen._apply_corrections(segments, {"cloud": "Claude"})
        assert result[0]["words"][0]["word"] == "Claude"

    def test_no_match(self, gen: SubtitleGen):
        segments = [
            {
                "text": "Hello world",
                "words": [{"word": "Hello", "start": 0.0}, {"word": "world", "start": 0.5}],
            }
        ]
        result = gen._apply_corrections(segments, {"foo": "bar"})
        assert result[0]["words"][0]["word"] == "Hello"
        assert result[0]["words"][1]["word"] == "world"

    def test_empty_corrections(self, gen: SubtitleGen):
        segments = [{"text": "test", "words": [{"word": "test", "start": 0.0}]}]
        result = gen._apply_corrections(segments, {})
        assert result[0]["words"][0]["word"] == "test"

    def test_deep_copy_independence(self, gen: SubtitleGen):
        """Corrections should not mutate the original segments."""
        original = [{"text": "foo", "words": [{"word": "foo", "start": 0.0}]}]
        gen._apply_corrections(original, {"foo": "bar"})
        assert original[0]["words"][0]["word"] == "foo"


# ---------------------------------------------------------------------------
# _render_srt
# ---------------------------------------------------------------------------

class TestRenderSRT:
    def test_basic_srt(self, gen: SubtitleGen):
        cues = [
            {"index": 1, "start": 0.0, "end": 1.0, "text": "Hello", "words": []},
        ]
        result = gen._render_srt(cues)
        assert "1" in result
        assert "00:00:00,000 --> 00:00:01,000" in result
        assert "Hello" in result

    def test_multiple_cues_srt(self, gen: SubtitleGen):
        cues = [
            {"index": 1, "start": 0.0, "end": 1.0, "text": "First", "words": []},
            {"index": 2, "start": 1.5, "end": 2.5, "text": "Second", "words": []},
        ]
        result = gen._render_srt(cues)
        assert result.count("-->") == 2

    def test_word_by_word_srt(self, gen: SubtitleGen):
        cues = [
            {
                "index": 1,
                "start": 0.0,
                "end": 2.0,
                "text": "hi there",
                "words": [
                    {"word": "hi", "start": 0.0, "end": 0.5},
                    {"word": "there", "start": 0.5, "end": 2.0},
                ],
            },
        ]
        result = gen._render_srt(cues, highlight_style="word_by_word")
        assert result.count("-->") == 2  # One per word
        assert "hi" in result
        assert "there" in result

    def test_karaoke_srt(self, gen: SubtitleGen):
        cues = [
            {
                "index": 1,
                "start": 0.0,
                "end": 2.0,
                "text": "hi there",
                "words": [
                    {"word": "hi", "start": 0.0, "end": 0.5},
                    {"word": "there", "start": 0.5, "end": 2.0},
                ],
            },
        ]
        result = gen._render_srt(cues, highlight_style="karaoke")
        assert "<b>" in result
        assert "</b>" in result
        assert result.count("-->") == 2  # One per word position

    def test_empty_words_karaoke_srt(self, gen: SubtitleGen):
        """Cue without words list should render as normal."""
        cues = [
            {"index": 1, "start": 0.0, "end": 1.0, "text": "plain", "words": []},
        ]
        result = gen._render_srt(cues, highlight_style="karaoke")
        assert "<b>" not in result
        assert "plain" in result


# ---------------------------------------------------------------------------
# _render_vtt
# ---------------------------------------------------------------------------

class TestRenderVTT:
    def test_basic_vtt(self, gen: SubtitleGen):
        cues = [
            {"index": 1, "start": 0.0, "end": 1.0, "text": "Hello", "words": []},
        ]
        result = gen._render_vtt(cues)
        assert result.startswith("WEBVTT")
        assert "00:00:00.000 --> 00:00:01.000" in result
        assert "Hello" in result

    def test_multiple_cues_vtt(self, gen: SubtitleGen):
        cues = [
            {"index": 1, "start": 0.0, "end": 1.0, "text": "First", "words": []},
            {"index": 2, "start": 1.5, "end": 2.5, "text": "Second", "words": []},
        ]
        result = gen._render_vtt(cues)
        assert result.count("-->") == 2


# ---------------------------------------------------------------------------
# execute() — integration
# ---------------------------------------------------------------------------

class TestExecute:
    def test_missing_segments(self, gen: SubtitleGen):
        result = gen.execute({})
        assert result.success is False
        assert "segments" in result.error

    def test_unknown_format(self, gen: SubtitleGen, sample_segments):
        result = gen.execute({"segments": sample_segments, "format": "pdf"})
        assert result.success is False
        assert "Unknown format" in result.error

    def test_srt_output(self, gen: SubtitleGen, sample_segments):
        result = gen.execute({"segments": sample_segments})
        assert result.success is True
        assert result.data["format"] == "srt"
        assert result.data["cue_count"] == 1  # max_words=8, both segments merge

    def test_vtt_output(self, gen: SubtitleGen, sample_segments):
        result = gen.execute({"segments": sample_segments, "format": "vtt"})
        assert result.success is True
        assert result.data["format"] == "vtt"

    def test_json_output(self, gen: SubtitleGen, sample_segments):
        result = gen.execute({"segments": sample_segments, "format": "json"})
        assert result.success is True
        assert result.data["format"] == "json"
        assert result.data["cue_count"] == 1

    def test_with_output_path(self, gen: SubtitleGen, sample_segments):
        with tempfile.TemporaryDirectory() as tmp:
            out_path = Path(tmp) / "subs.srt"
            result = gen.execute({"segments": sample_segments, "output_path": str(out_path)})
            assert result.success is True
            assert out_path.exists()
            content = out_path.read_text(encoding="utf-8")
            assert "Hello" in content

    def test_word_corrections_in_execute(self, gen: SubtitleGen):
        segments = [
            {
                "text": "Hello cloud",
                "words": [{"word": "Hello", "start": 0.0, "end": 0.5}, {"word": "cloud", "start": 0.5, "end": 1.0}],
            }
        ]
        result = gen.execute({"segments": segments, "corrections": {"cloud": "Claude"}})
        assert result.success is True
        assert result.data["cue_count"] == 1

    def test_max_words_per_cue(self, gen: SubtitleGen, long_segment):
        result = gen.execute({"segments": long_segment, "max_words_per_cue": 5})
        assert result.success is True
        assert result.data["cue_count"] == 4  # 20 words / 5

    def test_empty_segments_list(self, gen: SubtitleGen):
        result = gen.execute({"segments": []})
        assert result.success is True
        assert result.data["cue_count"] == 0

