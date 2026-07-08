"""Tests for video_compose.py -- high-risk pure functions."""

import json
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from multi_publish.video_creation.providers.video.video_compose import VideoCompose


class TestGetCompositionId:
    def test_known_family(self):
        cid = VideoCompose._get_composition_id("explainer-data")
        assert isinstance(cid, str)

    def test_unknown_family_raises(self):
        with pytest.raises(ValueError, match="Unknown renderer_family"):
            VideoCompose._get_composition_id("nonexistent")

    def test_known_families(self):
        for family in ("explainer-data", "cinematic-trailer", "presenter"):
            cid = VideoCompose._get_composition_id(family)
            assert cid


class TestCompareTranscriptToScript:
    def test_missing_transcript_path(self):
        result = VideoCompose._compare_transcript_to_script(None, "hello world")
        assert result["transcript_matches_script"] is False
        assert any("not provided" in i for i in result["issues"])

    def test_transcript_file_not_found(self, tmp_path):
        result = VideoCompose._compare_transcript_to_script(tmp_path / "nonexistent.json", "hello")
        assert result["transcript_matches_script"] is False

    def test_missing_script_text(self, tmp_path):
        tf = tmp_path / "transcript.json"
        tf.write_text('{"word_timestamps": [{"word": "hello"}]}', encoding="utf-8")
        result = VideoCompose._compare_transcript_to_script(tf, "")
        assert any("not provided" in i for i in result["issues"])

    def test_invalid_json(self, tmp_path):
        tf = tmp_path / "transcript.json"
        tf.write_text("not json", encoding="utf-8")
        result = VideoCompose._compare_transcript_to_script(tf, "hello")
        assert any("could not parse" in i for i in result["issues"])

    def test_perfect_match(self, tmp_path):
        tf = tmp_path / "transcript.json"
        tf.write_text(
            json.dumps({"word_timestamps": [{"word": "hello"}, {"word": "world"}]}),
            encoding="utf-8",
        )
        result = VideoCompose._compare_transcript_to_script(tf, "hello world")
        assert result["transcript_matches_script"] is True
        assert result["word_accuracy"] >= 0.9

    def test_partial_match_low_accuracy(self, tmp_path):
        tf = tmp_path / "transcript.json"
        tf.write_text(
            json.dumps({"word_timestamps": [{"word": "hello"}, {"word": "there"}]}),
            encoding="utf-8",
        )
        result = VideoCompose._compare_transcript_to_script(tf, "hello world goodbye")
        assert result["word_accuracy"] < 0.9
        assert any("Low transcript" in i for i in result["issues"])

    def test_punctuation_leak_detected(self, tmp_path):
        tf = tmp_path / "transcript.json"
        tf.write_text(
            json.dumps({"word_timestamps": [{"word": "hello"}, {"word": "dot"}, {"word": "world"}]}),
            encoding="utf-8",
        )
        result = VideoCompose._compare_transcript_to_script(tf, "hello world")
        assert result["spurious_punctuation_words"]
        assert any("punctuation leak" in i for i in result["issues"])

    def test_empty_tokens(self, tmp_path):
        tf = tmp_path / "transcript.json"
        tf.write_text(json.dumps({"word_timestamps": []}), encoding="utf-8")
        result = VideoCompose._compare_transcript_to_script(tf, "some script text here")
        assert any("empty" in i for i in result["issues"])

    def test_accuracy_rounding(self, tmp_path):
        tf = tmp_path / "transcript.json"
        tf.write_text(
            json.dumps({"word_timestamps": [{"word": w} for w in "hello world foo bar baz".split()]}),
            encoding="utf-8",
        )
        result = VideoCompose._compare_transcript_to_script(tf, "hello world foo bar baz")
        assert result["word_accuracy"] == pytest.approx(1.0, abs=0.01)

    def test_mixed_leak_and_low_accuracy(self, tmp_path):
        tf = tmp_path / "transcript.json"
        tf.write_text(
            json.dumps({"word_timestamps": [{"word": w} for w in "hello dot yay world".split()]}),
            encoding="utf-8",
        )
        result = VideoCompose._compare_transcript_to_script(tf, "hello world goodbye friends")
        assert result["spurious_punctuation_words"]
        assert result["word_accuracy"] < 0.9


class TestNeedsRemotion:
    def test_remotion_available(self):
        vc = VideoCompose()
        with patch.object(vc, "_remotion_available", return_value=True):
            assert vc._needs_remotion([]) is True

    def test_remotion_not_available(self):
        vc = VideoCompose()
        with patch.object(vc, "_remotion_available", return_value=False):
            assert vc._needs_remotion([]) is False


class TestResolveSubtitleStyle:
    def test_all_empty(self):
        result = VideoCompose._resolve_subtitle_style(None, None, None)
        assert result["font"] == "Inter"
        assert result["font_size"] == 28

    def test_playbook_provides_style(self):
        playbook = {"typography": {"body": {"family": "Roboto"}}, "visual_language": {"color_palette": {"text": "#333", "background": "#FFF"}}}
        result = VideoCompose._resolve_subtitle_style(None, None, playbook)
        assert result["font"] == "Roboto"

    def test_edit_decisions_override(self):
        ed = {"subtitles": {"style": {"font_size": 36, "bold": False}}}
        result = VideoCompose._resolve_subtitle_style(None, ed, None)
        assert result["font_size"] == 36
        assert result["bold"] is False

    def test_explicit_override_highest(self):
        ed = {"subtitles": {"style": {"font_size": 36}}}
        result = VideoCompose._resolve_subtitle_style({"font_size": 42}, ed, None)
        assert result["font_size"] == 42

    def test_layering_priority(self):
        result = VideoCompose._resolve_subtitle_style(
            {"font": "Override", "font_size": 50},
            {"subtitles": {"style": {"font": "EditDecisions", "font_size": 40}}},
            {"typography": {"body": {"family": "Playbook"}}},
        )
        assert result["font"] == "Override"
        assert result["font_size"] == 50

    def test_none_values_not_overridden(self):
        result = VideoCompose._resolve_subtitle_style({"font": None}, {"subtitles": {"style": {"font": "Sans"}}}, None)
        assert result["font"] == "Sans"
class TestRemotionAvailable:
    """_remotion_available() checks npx + project dir + node_modules."""

    def test_no_npx_on_path(self):
        vc = VideoCompose()
        with patch("shutil.which", return_value=None):
            assert vc._remotion_available() is False

    def test_composer_dir_missing(self):
        vc = VideoCompose()
        with patch("shutil.which", return_value="/usr/bin/npx"):
            with patch("pathlib.Path.exists", return_value=False):
                assert vc._remotion_available() is False

    def test_all_checks_pass(self):
        vc = VideoCompose()
        with patch("shutil.which", return_value="/usr/bin/npx"):
            with patch("pathlib.Path.exists", return_value=True):
                assert vc._remotion_available() is True


class TestGetInfo:
    """get_info() returns capabilities dict."""

    def test_returns_dict_with_expected_keys(self):
        vc = VideoCompose()
        info = vc.get_info()
        assert isinstance(info, dict)
        assert "name" in info
        assert info["name"] == "video_compose"

    def test_includes_version(self):
        vc = VideoCompose()
        info = vc.get_info()
        assert "version" in info
        assert isinstance(info["version"], str)
