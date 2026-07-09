"""Tests for video analyzer brief construction — extracted from video_analyzer.py.

Covers the pure computation that builds a ``VideoAnalysisBrief`` artifact from
scene/transcript/metadata inputs. Before extraction this logic lived inside
``VideoAnalyzer.execute()`` (470-line orchestration method) and a handful of
``_xxx`` helper methods — all untestable without mocking cv2 / ffmpeg / file
system / six sibling Tools.

The extracted functions in ``video_analyzer_brief`` are pure: no I/O, no
``time.time()``, no subprocess, no sibling-Tool calls. Deterministic given
inputs.
"""

from __future__ import annotations

from multi_publish.video_creation.analysis.video_analyzer_brief import (
    apply_style_profile_defaults,
    build_initial_brief,
    build_narration_style,
    build_pacing_profile,
    build_replication_guidance,
    build_scene_list,
    classify_pacing,
    compute_keyframe_timestamps,
    detect_platform,
    estimate_complexity,
    is_url,
    is_youtube,
    needs_motion,
    suggest_pipeline,
    timestamp_to_scene,
)


# ─── Platform helpers ──────────────────────────────────────


class TestIsUrl:
    def test_http_is_url(self):
        assert is_url("http://example.com/v.mp4") is True

    def test_https_is_url(self):
        assert is_url("https://youtube.com/watch?v=x") is True

    def test_www_prefix_is_url(self):
        assert is_url("www.youtube.com/watch?v=x") is True

    def test_local_path_not_url(self):
        assert is_url("/tmp/video.mp4") is False

    def test_relative_path_not_url(self):
        assert is_url("videos/clip.mp4") is False

    def test_bare_filename_not_url(self):
        assert is_url("clip.mp4") is False


class TestDetectPlatform:
    def test_youtube_shorts(self):
        assert detect_platform("https://youtube.com/shorts/abc") == "shorts"

    def test_youtube_watch(self):
        assert detect_platform("https://youtube.com/watch?v=abc") == "youtube"

    def test_youtu_be(self):
        assert detect_platform("https://youtu.be/abc") == "youtube"

    def test_instagram(self):
        assert detect_platform("https://instagram.com/reel/x") == "instagram"

    def test_tiktok(self):
        assert detect_platform("https://tiktok.com/@user/video/x") == "tiktok"

    def test_other_url(self):
        assert detect_platform("https://vimeo.com/x") == "other_url"

    def test_local_file(self):
        assert detect_platform("/tmp/video.mp4") == "local_file"

    def test_shorts_takes_precedence_over_youtube(self):
        # "youtube.com/shorts" contains "youtube.com" — shorts must win
        assert detect_platform("https://www.youtube.com/shorts/abc") == "shorts"

    def test_case_insensitive_after_url_check(self):
        # is_url() is case-sensitive (startswith), so uppercase schemes are
        # treated as local files. detect_platform() only lowercases the body
        # AFTER the url check passes. This matches the pre-extraction behavior.
        assert detect_platform("https://TIKTOK.COM/x") == "tiktok"


class TestIsYoutube:
    def test_youtube_is_youtube(self):
        assert is_youtube("youtube") is True

    def test_shorts_is_youtube(self):
        assert is_youtube("shorts") is True

    def test_tiktok_not_youtube(self):
        assert is_youtube("tiktok") is False

    def test_local_not_youtube(self):
        assert is_youtube("local_file") is False


# ─── compute_keyframe_timestamps ───────────────────────────


class TestComputeKeyframeTimestamps:
    def test_empty_scenes_returns_empty(self):
        assert compute_keyframe_timestamps([], max_frames=20, depth="standard") == []

    def test_short_scene_single_timestamp(self):
        # duration < 3.0 → only start + 0.1
        scenes = [{"start_seconds": 0, "end_seconds": 2}]
        result = compute_keyframe_timestamps(scenes, max_frames=20, depth="standard")
        assert result == [0.1]

    def test_long_scene_adds_midpoint_standard(self):
        # duration > 3.0 → start+0.1 and midpoint
        scenes = [{"start_seconds": 0, "end_seconds": 10}]
        result = compute_keyframe_timestamps(scenes, max_frames=20, depth="standard")
        assert result == [0.1, 5.0]

    def test_deep_adds_quarter_three_quarter_for_long_scenes(self):
        # duration > 6.0 + deep → start+0.1, 0.25, 0.5, 0.75
        scenes = [{"start_seconds": 0, "end_seconds": 8}]
        result = compute_keyframe_timestamps(scenes, max_frames=20, depth="deep")
        assert result == [0.1, 2.0, 4.0, 6.0]

    def test_deep_does_not_add_extras_for_short_scene(self):
        # duration 4 (between 3 and 6) + deep → only start+0.1 and midpoint
        scenes = [{"start_seconds": 0, "end_seconds": 4}]
        result = compute_keyframe_timestamps(scenes, max_frames=20, depth="deep")
        assert result == [0.1, 2.0]

    def test_timestamps_sorted_and_deduplicated(self):
        # Two adjacent scenes producing duplicate boundary timestamps
        scenes = [
            {"start_seconds": 0, "end_seconds": 4},
            {"start_seconds": 4, "end_seconds": 8},
        ]
        result = compute_keyframe_timestamps(scenes, max_frames=20, depth="standard")
        # scene1: 0.1, 2.0; scene2: 4.1, 6.0 — all distinct, sorted
        assert result == [0.1, 2.0, 4.1, 6.0]

    def test_limits_to_max_frames_via_uniform_subsample(self):
        # 10 scenes each producing 2 timestamps = 20, limit to 5
        scenes = [{"start_seconds": i * 10, "end_seconds": i * 10 + 8} for i in range(10)]
        result = compute_keyframe_timestamps(scenes, max_frames=5, depth="standard")
        assert len(result) == 5
        # All timestamps must come from the original sorted set
        full = sorted({round(t, 3) for t in [s["start_seconds"] + 0.1 for s in scenes] + [s["start_seconds"] + 4.0 for s in scenes]})
        for t in result:
            assert t in full

    def test_uses_index_or_scene_index_key_fallback(self):
        # _timestamp_to_scene uses these; compute_keyframe_timestamps doesn't,
        # but verify it tolerates scenes missing the index key
        scenes = [{"start_seconds": 1, "end_seconds": 5}]
        result = compute_keyframe_timestamps(scenes, max_frames=20, depth="standard")
        assert result == [1.1, 3.0]


# ─── timestamp_to_scene ────────────────────────────────────


class TestTimestampToScene:
    def test_returns_scene_index_when_in_range(self):
        scenes = [{"index": 0, "start_seconds": 0, "end_seconds": 5}]
        assert timestamp_to_scene(2.5, scenes) == 0

    def test_returns_correct_index_for_multiple_scenes(self):
        scenes = [
            {"index": 0, "start_seconds": 0, "end_seconds": 5},
            {"index": 1, "start_seconds": 5, "end_seconds": 10},
        ]
        assert timestamp_to_scene(7.0, scenes) == 1

    def test_falls_back_to_scene_index_key(self):
        scenes = [{"scene_index": 3, "start_seconds": 0, "end_seconds": 5}]
        assert timestamp_to_scene(2.0, scenes) == 3

    def test_returns_zero_when_no_scene_contains_ts(self):
        scenes = [{"index": 0, "start_seconds": 5, "end_seconds": 10}]
        assert timestamp_to_scene(2.0, scenes) == 0

    def test_boundary_start_inclusive(self):
        scenes = [{"index": 2, "start_seconds": 5, "end_seconds": 10}]
        assert timestamp_to_scene(5.0, scenes) == 2

    def test_boundary_end_inclusive(self):
        scenes = [{"index": 2, "start_seconds": 5, "end_seconds": 10}]
        assert timestamp_to_scene(10.0, scenes) == 2

    def test_empty_scenes_returns_zero(self):
        assert timestamp_to_scene(5.0, []) == 0


# ─── classify_pacing ───────────────────────────────────────


class TestClassifyPacing:
    def test_empty_returns_variable(self):
        assert classify_pacing([]) == "variable"

    def test_avg_above_10_returns_slow_contemplative(self):
        assert classify_pacing([12, 14]) == "slow_contemplative"

    def test_avg_above_5_returns_steady_educational(self):
        assert classify_pacing([6, 8]) == "steady_educational"

    def test_avg_above_2_returns_dynamic_social(self):
        assert classify_pacing([3, 4]) == "dynamic_social"

    def test_avg_at_or_below_2_returns_rapid_fire(self):
        assert classify_pacing([1, 2]) == "rapid_fire"

    def test_boundary_10_is_steady_educational(self):
        # avg == 10 is not > 10
        assert classify_pacing([10]) == "steady_educational"

    def test_boundary_5_is_dynamic_social(self):
        assert classify_pacing([5]) == "dynamic_social"

    def test_boundary_2_is_rapid_fire(self):
        assert classify_pacing([2]) == "rapid_fire"


# ─── suggest_pipeline ──────────────────────────────────────


class TestSuggestPipeline:
    def _brief(self, platform, pacing=""):
        return {
            "source": {"type": platform},
            "structure_analysis": {"pacing_profile": {"pacing_style": pacing}},
        }

    def test_shorts_returns_animation(self):
        assert suggest_pipeline(self._brief("shorts")) == "animation"

    def test_tiktok_returns_animation(self):
        assert suggest_pipeline(self._brief("tiktok")) == "animation"

    def test_instagram_returns_animation(self):
        assert suggest_pipeline(self._brief("instagram")) == "animation"

    def test_slow_contemplative_returns_cinematic(self):
        assert suggest_pipeline(self._brief("youtube", "slow_contemplative")) == "cinematic"

    def test_default_returns_animated_explainer(self):
        assert suggest_pipeline(self._brief("youtube", "dynamic_social")) == "animated-explainer"

    def test_local_file_with_no_pacing_returns_animated_explainer(self):
        assert suggest_pipeline(self._brief("local_file")) == "animated-explainer"

    def test_shorts_takes_precedence_over_pacing(self):
        # shorts → animation regardless of pacing
        assert suggest_pipeline(self._brief("shorts", "slow_contemplative")) == "animation"


# ─── estimate_complexity ───────────────────────────────────


class TestEstimateComplexity:
    def _brief(self, duration, total_scenes):
        return {"source": {"duration_seconds": duration}, "structure_analysis": {"total_scenes": total_scenes}}

    def test_long_duration_returns_complex(self):
        assert estimate_complexity(self._brief(301, 5)) == "complex"

    def test_many_scenes_returns_complex(self):
        assert estimate_complexity(self._brief(60, 31)) == "complex"

    def test_moderate_duration_returns_moderate(self):
        assert estimate_complexity(self._brief(130, 5)) == "moderate"

    def test_moderate_scene_count_returns_moderate(self):
        assert estimate_complexity(self._brief(60, 16)) == "moderate"

    def test_short_few_scenes_returns_simple(self):
        assert estimate_complexity(self._brief(60, 5)) == "simple"

    def test_boundary_300_is_moderate(self):
        assert estimate_complexity(self._brief(300, 5)) == "moderate"

    def test_boundary_120_is_simple(self):
        assert estimate_complexity(self._brief(120, 5)) == "simple"

    def test_boundary_30_scenes_is_moderate(self):
        assert estimate_complexity(self._brief(60, 30)) == "moderate"

    def test_boundary_15_scenes_is_simple(self):
        assert estimate_complexity(self._brief(60, 15)) == "simple"


# ─── needs_motion ──────────────────────────────────────────


class TestNeedsMotion:
    def _brief(self, scenes, pacing=""):
        return {"structure_analysis": {"scenes": scenes, "pacing_profile": {"pacing_style": pacing}}}

    def test_majority_motion_clip_returns_true(self):
        # 2/3 = 0.67 ≥ 0.3
        scenes = [
            {"motion_type": "motion_clip"},
            {"motion_type": "motion_clip"},
            {"motion_type": "static_image"},
        ]
        assert needs_motion(self._brief(scenes)) is True

    def test_minority_motion_clip_returns_false(self):
        scenes = [
            {"motion_type": "static_image"},
            {"motion_type": "static_image"},
            {"motion_type": "animated_still"},
        ]
        assert needs_motion(self._brief(scenes)) is False

    def test_exactly_30_percent_returns_true(self):
        # 3/10 = 0.3 ≥ 0.3 → True
        scenes = [{"motion_type": "motion_clip"}] * 3 + [{"motion_type": "static_image"}] * 7
        assert needs_motion(self._brief(scenes)) is True

    def test_no_motion_data_dynamic_social_returns_true(self):
        scenes = [{"motion_type": "unknown"}]
        assert needs_motion(self._brief(scenes, "dynamic_social")) is True

    def test_no_motion_data_rapid_fire_returns_true(self):
        scenes = [{"motion_type": "unknown"}]
        assert needs_motion(self._brief(scenes, "rapid_fire")) is True

    def test_no_motion_data_slow_pacing_returns_false(self):
        scenes = [{"motion_type": "unknown"}]
        assert needs_motion(self._brief(scenes, "slow_contemplative")) is False

    def test_empty_scenes_with_rapid_pacing_returns_true(self):
        # scenes empty → skip motion check, fall to pacing heuristic
        assert needs_motion(self._brief([], "rapid_fire")) is True

    def test_empty_scenes_with_slow_pacing_returns_false(self):
        assert needs_motion(self._brief([], "steady_educational")) is False


# ─── build_initial_brief ───────────────────────────────────


class TestBuildInitialBrief:
    def test_structure_has_required_top_level_keys(self):
        brief = build_initial_brief("youtube", "src", is_url=True)
        assert set(brief.keys()) == {"version", "source", "content_analysis", "structure_analysis"}

    def test_version_is_1_0(self):
        assert build_initial_brief("x", "s", is_url=True)["version"] == "1.0"

    def test_platform_propagated_to_source_type(self):
        brief = build_initial_brief("tiktok", "src", is_url=True)
        assert brief["source"]["type"] == "tiktok"

    def test_url_source_adds_url_key(self):
        brief = build_initial_brief("youtube", "https://youtu.be/x", is_url=True)
        assert brief["source"]["url"] == "https://youtu.be/x"
        assert "local_path" not in brief["source"]

    def test_local_source_adds_local_path_key(self):
        brief = build_initial_brief("local_file", "/tmp/v.mp4", is_url=False)
        assert brief["source"]["local_path"] == "/tmp/v.mp4"
        assert "url" not in brief["source"]

    def test_initial_duration_is_zero(self):
        assert build_initial_brief("x", "s", is_url=True)["source"]["duration_seconds"] == 0

    def test_structure_starts_empty(self):
        brief = build_initial_brief("x", "s", is_url=True)
        assert brief["structure_analysis"]["total_scenes"] == 0
        assert brief["structure_analysis"]["scenes"] == []
        assert brief["structure_analysis"]["pacing_profile"] == {}

    def test_content_analysis_defaults(self):
        brief = build_initial_brief("x", "s", is_url=True)
        assert brief["content_analysis"] == {"summary": "", "topics": [], "target_audience": "general"}


# ─── build_scene_list ──────────────────────────────────────


class TestBuildSceneList:
    def test_empty_scenes_returns_empty(self):
        assert build_scene_list([]) == []

    def test_single_scene_maps_fields(self):
        scenes = [{"index": 0, "start_seconds": 1.5, "end_seconds": 4.0}]
        result = build_scene_list(scenes)
        assert len(result) == 1
        assert result[0] == {
            "scene_index": 0,
            "start_time": 1.5,
            "end_time": 4.0,
            "description": "",
            "visual_type": "other",
            "energy_level": "medium",
        }

    def test_falls_back_to_scene_index_key(self):
        scenes = [{"scene_index": 5, "start_seconds": 0, "end_seconds": 3}]
        result = build_scene_list(scenes)
        assert result[0]["scene_index"] == 5

    def test_defaults_to_zero_when_no_index_key(self):
        scenes = [{"start_seconds": 0, "end_seconds": 3}]
        result = build_scene_list(scenes)
        assert result[0]["scene_index"] == 0

    def test_multiple_scenes_preserve_order(self):
        scenes = [
            {"index": 0, "start_seconds": 0, "end_seconds": 3},
            {"index": 1, "start_seconds": 3, "end_seconds": 6},
        ]
        result = build_scene_list(scenes)
        assert [s["scene_index"] for s in result] == [0, 1]


# ─── build_pacing_profile ──────────────────────────────────


class TestBuildPacingProfile:
    def test_empty_durations_returns_empty_dict(self):
        assert build_pacing_profile([], total_duration=0) == {}

    def test_single_scene_profile(self):
        durations = [4.0]
        result = build_pacing_profile(durations, total_duration=4.0)
        assert result == {
            "avg_scene_duration_seconds": 4.0,
            "shortest_scene_seconds": 4.0,
            "longest_scene_seconds": 4.0,
            "cuts_per_minute": 15.0,  # 1 / (4/60) = 15
            "pacing_style": "dynamic_social",
        }

    def test_multiple_scenes_profile(self):
        durations = [2.0, 4.0, 6.0]
        total = 12.0
        result = build_pacing_profile(durations, total)
        assert result["avg_scene_duration_seconds"] == 4.0
        assert result["shortest_scene_seconds"] == 2.0
        assert result["longest_scene_seconds"] == 6.0
        assert result["cuts_per_minute"] == 15.0  # 3 / (12/60) = 15
        assert result["pacing_style"] == "dynamic_social"

    def test_zero_total_duration_cuts_per_minute_is_zero(self):
        durations = [3.0]
        result = build_pacing_profile(durations, total_duration=0)
        assert result["cuts_per_minute"] == 0
        # Other fields still computed
        assert result["avg_scene_duration_seconds"] == 3.0

    def test_pacing_style_propagated(self):
        durations = [12.0]
        result = build_pacing_profile(durations, total_duration=12.0)
        assert result["pacing_style"] == "slow_contemplative"


# ─── build_replication_guidance ────────────────────────────


class TestBuildReplicationGuidance:
    def _brief(self, platform="youtube", pacing="dynamic_social", duration=60, total_scenes=3, scenes=None):
        if scenes is None:
            scenes = []
        return {
            "source": {"type": platform, "duration_seconds": duration},
            "structure_analysis": {
                "total_scenes": total_scenes,
                "scenes": scenes,
                "pacing_profile": {"pacing_style": pacing},
            },
        }

    def test_has_all_required_keys(self):
        result = build_replication_guidance(self._brief())
        assert set(result.keys()) == {
            "suggested_pipeline",
            "suggested_playbook",
            "key_elements_to_replicate",
            "elements_requiring_custom_work",
            "estimated_complexity",
            "motion_required",
            "creative_differentiation_seeds",
        }

    def test_suggested_playbook_is_flat_motion_graphics(self):
        assert build_replication_guidance(self._brief())["suggested_playbook"] == "flat-motion-graphics"

    def test_empty_lists_seeds(self):
        result = build_replication_guidance(self._brief())
        assert result["key_elements_to_replicate"] == []
        assert result["elements_requiring_custom_work"] == []
        assert result["creative_differentiation_seeds"] == []

    def test_shorts_pipeline_is_animation(self):
        result = build_replication_guidance(self._brief(platform="shorts"))
        assert result["suggested_pipeline"] == "animation"

    def test_complex_brief_estimated_complex(self):
        result = build_replication_guidance(self._brief(duration=400))
        assert result["estimated_complexity"] == "complex"

    def test_motion_required_from_pacing(self):
        result = build_replication_guidance(self._brief(pacing="rapid_fire"))
        assert result["motion_required"] is True


# ─── build_narration_style ─────────────────────────────────


class TestBuildNarrationStyle:
    def test_none_transcript_returns_none(self):
        assert build_narration_style(None, duration=60) is None

    def test_falsy_transcript_returns_none(self):
        assert build_narration_style("", duration=60) is None

    def test_dict_transcript_uses_word_count(self):
        ts = {"word_count": 120, "full_text": "..."}
        result = build_narration_style(ts, duration=120)
        assert result == {
            "has_narration": True,  # 120 > 20
            "speaker_count": 1,
            "delivery_style": "",
            "words_per_minute": 60.0,  # 120 / (120/60) = 60
        }

    def test_low_word_count_has_narration_false(self):
        ts = {"word_count": 10}
        result = build_narration_style(ts, duration=60)
        assert result["has_narration"] is False

    def test_boundary_20_words_has_narration_false(self):
        # wc > 20, so 20 is False
        ts = {"word_count": 20}
        result = build_narration_style(ts, duration=60)
        assert result["has_narration"] is False

    def test_21_words_has_narration_true(self):
        ts = {"word_count": 21}
        result = build_narration_style(ts, duration=60)
        assert result["has_narration"] is True

    def test_zero_duration_wpm_is_zero(self):
        ts = {"word_count": 100}
        result = build_narration_style(ts, duration=0)
        assert result["words_per_minute"] == 0

    def test_non_dict_transcript_uses_fallback_word_count(self):
        result = build_narration_style("some text", duration=60, fallback_word_count=60)
        assert result["words_per_minute"] == 60.0  # 60 / (60/60) = 60

    def test_non_dict_transcript_default_fallback_zero(self):
        result = build_narration_style("some text", duration=60)
        assert result["has_narration"] is False
        assert result["words_per_minute"] == 0


# ─── apply_style_profile_defaults ──────────────────────────


class TestApplyStyleProfileDefaults:
    def test_empty_profile_gets_all_defaults(self):
        result = apply_style_profile_defaults({})
        assert result["color_palette"] == {"primary_colors": [], "accent_colors": [], "overall_mood": ""}
        assert result["typography_observed"] == ""
        assert result["transition_types"] == []
        assert result["music_style"] == ""
        assert result["subtitle_style"] == ""
        assert result["production_quality"] == "prosumer"
        assert result["closest_playbook"] == ""
        assert result["playbook_delta"] == ""

    def test_existing_values_preserved(self):
        result = apply_style_profile_defaults({"music_style": "lofi", "production_quality": "pro"})
        assert result["music_style"] == "lofi"
        assert result["production_quality"] == "pro"
        # Untouched fields still defaulted
        assert result["typography_observed"] == ""

    def test_color_palette_preserved_if_set(self):
        custom = {"primary_colors": ["#fff"]}
        result = apply_style_profile_defaults({"color_palette": custom})
        assert result["color_palette"] == custom

    def test_returns_same_dict_object(self):
        profile = {}
        result = apply_style_profile_defaults(profile)
        assert result is profile

    def test_all_expected_keys_present(self):
        result = apply_style_profile_defaults({})
        expected = {
            "color_palette",
            "typography_observed",
            "transition_types",
            "music_style",
            "subtitle_style",
            "production_quality",
            "closest_playbook",
            "playbook_delta",
        }
        assert expected.issubset(set(result.keys()))
