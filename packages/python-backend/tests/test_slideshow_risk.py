"""Tests for slideshow_risk.py — 0% coverage → full coverage"""

from multi_publish.video_creation.providers.video.lib.slideshow_risk import (
    score_slideshow_risk,
    _score_repetition,
    _score_decorative,
    _score_weak_motion,
    _score_weak_intent,
    _score_typography,
    _score_cinematic_claims,
)


# ====== score_slideshow_risk ======

def test_empty_scenes_returns_fail():
    result = score_slideshow_risk([])
    assert result["average"] == 5.0
    assert result["verdict"] == "fail"
    assert result["dimensions"] == {}


def test_strong_scenes():
    scenes = [
        {"type": "visual", "information_role": "intro", "shot_intent": "establish", "shot_language": {"camera_movement": "pan", "shot_size": "wide"}},
        {"type": "visual", "information_role": "detail", "shot_intent": "reveal", "shot_language": {"camera_movement": "tilt", "shot_size": "medium"}},
        {"type": "visual", "information_role": "conclusion", "shot_intent": "conclude", "shot_language": {"camera_movement": "static", "shot_size": "closeup"}},
    ]
    result = score_slideshow_risk(scenes)
    assert result["verdict"] in ("strong", "acceptable")
    assert result["average"] < 3.0


def test_repetitive_scenes_raises_repetition():
    scenes = [
        {"type": "text_card", "description": "Same old", "shot_language": {"shot_size": "closeup"}},
        {"type": "text_card", "description": "Same old", "shot_language": {"shot_size": "closeup"}},
        {"type": "text_card", "description": "Same old", "shot_language": {"shot_size": "closeup"}},
        {"type": "text_card", "description": "Same old", "shot_language": {"shot_size": "closeup"}},
    ]
    result = score_slideshow_risk(scenes)
    assert result["dimensions"]["repetition"]["score"] >= 3.0


def test_decorative_scenes():
    scenes = [
        {},  # No purpose at all
        {},  # No purpose at all
        {"information_role": "info", "shot_intent": "show"},  # Has purpose
    ]
    result = score_slideshow_risk(scenes)
    assert result["dimensions"]["decorative_visuals"]["score"] >= 3.0


def test_cinematic_claims_without_backing():
    scenes = [{"shot_language": {"camera_movement": "static"}}]
    result = score_slideshow_risk(scenes, renderer_family="cinematic")
    assert result["dimensions"]["unsupported_cinematic_claims"]["score"] > 0


# ====== _score_repetition ======

def test_repetition_few_scenes():
    assert _score_repetition([{"type": "a"}])["score"] == 0.0


def test_repetition_high():
    scenes = [{"type": "a", "description": "x", "shot_language": {"shot_size": "wide"}}] * 5
    assert _score_repetition(scenes)["score"] >= 3.0


# ====== _score_decorative ======

def test_decorative_all_decorative():
    scenes = [{}, {}]
    assert _score_decorative(scenes)["score"] == 5.0


def test_decorative_all_has_purpose():
    scenes = [
        {"information_role": "info", "narrative_role": "setup", "shot_intent": "show"},
        {"information_role": "data", "shot_intent": "reveal"},
    ]
    assert _score_decorative(scenes)["score"] == 0.0


# ====== _score_weak_motion ======

def test_weak_motion_no_movement():
    result = _score_weak_motion([{"shot_language": {"camera_movement": "static"}}])
    assert result["score"] == 1.5


def test_weak_motion_purposeful():
    scenes = [
        {"shot_language": {"camera_movement": "pan"}, "shot_intent": "reveal"},
        {"shot_language": {"camera_movement": "tilt"}, "shot_intent": "show"},
    ]
    result = _score_weak_motion(scenes)
    assert result["score"] < 1.0


# ====== _score_weak_intent ======

def test_weak_intent_all_missing():
    scenes = [{}, {}]
    assert _score_weak_intent(scenes)["score"] == 5.0


def test_weak_intent_all_present():
    scenes = [{"shot_intent": "reveal"}, {"shot_intent": "show"}]
    assert _score_weak_intent(scenes)["score"] == 0.0


# ====== _score_typography ======

def test_typography_all_text():
    scenes = [{"type": "text_card"}, {"type": "stat_card"}, {"type": "kpi_grid"}]
    assert _score_typography(scenes)["score"] == 4.0


def test_typography_none_text():
    scenes = [{"type": "visual"}, {"type": "animation"}]
    assert _score_typography(scenes)["score"] == 0.0


# ====== _score_cinematic_claims ======

def test_cinematic_not_claiming():
    assert _score_cinematic_claims([], None)["score"] == 0.0


def test_cinematic_unsupported():
    result = _score_cinematic_claims([{"shot_language": {"camera_movement": "static"}}], "cinematic")
    assert result["score"] > 2.0


def test_cinematic_supported():
    scenes = [
        {"hero_moment": True, "shot_language": {"camera_movement": "pan", "lighting_key": "key"}},
        {"shot_language": {"camera_movement": "tilt", "lighting_key": "fill"}},
        {"shot_language": {"camera_movement": "dolly", "lighting_key": "rim"}},
    ]
    result = _score_cinematic_claims(scenes, "cinematic-v2")
    assert result["score"] < 2.0