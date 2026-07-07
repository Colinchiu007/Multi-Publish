"""Tests for media_profiles.py — 0% coverage"""

from multi_publish.video_creation.providers.video.lib.media_profiles import (
    ALL_PROFILES,
    AspectRatio,
    ffmpeg_output_args,
    get_profile,
    get_profiles_for_platform,
)

# ====== AspectRatio enum ======

def test_aspect_ratio_values():
    assert AspectRatio.LANDSCAPE_16_9 == "16:9"
    assert AspectRatio.PORTRAIT_9_16 == "9:16"
    assert AspectRatio.SQUARE_1_1 == "1:1"
    assert AspectRatio.CINEMATIC_21_9 == "21:9"
    assert AspectRatio.STANDARD_4_3 == "4:3"


# ====== ALL_PROFILES registry ======

def test_all_profiles_has_expected():
    assert "youtube_landscape" in ALL_PROFILES
    assert "tiktok" in ALL_PROFILES
    assert "cinematic" in ALL_PROFILES
    assert len(ALL_PROFILES) == 9


def test_profile_attributes():
    p = ALL_PROFILES["youtube_landscape"]
    assert p.width == 1920
    assert p.height == 1080
    assert p.fps == 30
    assert p.codec == "libx264"


def test_cinematic_profile():
    p = ALL_PROFILES["cinematic"]
    assert p.width == 2560
    assert p.height == 1080
    assert p.aspect_ratio == AspectRatio.CINEMATIC_21_9
    assert p.fps == 24
    assert p.crf == 16


# ====== get_profile ======

def test_get_profile_known():
    p = get_profile("tiktok")
    assert p.name == "tiktok"
    assert p.max_duration_seconds == 600


def test_get_profile_unknown_raises():
    import pytest
    with pytest.raises(ValueError, match="Unknown profile"):
        get_profile("nonexistent")


# ====== get_profiles_for_platform ======

def test_get_profiles_for_youtube():
    results = get_profiles_for_platform("youtube")
    assert len(results) == 3
    names = [p.name for p in results]
    assert "youtube_landscape" in names
    assert "youtube_4k" in names
    assert "youtube_shorts" in names


def test_get_profiles_for_instagram():
    results = get_profiles_for_platform("instagram")
    assert len(results) == 2


def test_get_profiles_for_unknown():
    assert get_profiles_for_platform("unknown") == []


# ====== ffmpeg_output_args ======

def test_ffmpeg_args():
    p = ALL_PROFILES["generic_hd"]
    args = ffmpeg_output_args(p)
    assert "-c:v" in args
    assert "-c:a" in args
    assert "-crf" in args
    assert "23" in args
    assert "1920:1080" in " ".join(args)
    assert "libx264" in args
    assert "aac" in args


def test_ffmpeg_args_cinematic():
    p = ALL_PROFILES["cinematic"]
    args = ffmpeg_output_args(p)
    assert "2560:1080" in " ".join(args)
    assert "24" in args  # fps
    assert "16" in args  # crf
