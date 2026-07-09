"""Tests for composition_registry.py — Phase 5.2 extracted module."""

import pytest

from multi_publish.video_creation.providers.video.composition_registry import (
    get_composition_id,
    RENDERER_FAMILY_MAP,
)


class TestGetCompositionId:
    def test_known_family_explainer_data(self):
        cid = get_composition_id("explainer-data")
        assert cid == "Explainer"

    def test_known_family_cinematic(self):
        cid = get_composition_id("cinematic-trailer")
        assert cid == "CinematicRenderer"

    def test_known_family_presenter(self):
        cid = get_composition_id("presenter")
        assert cid == "TalkingHead"

    def test_unknown_family_raises(self):
        with pytest.raises(ValueError, match="Unknown renderer_family"):
            get_composition_id("nonexistent")

    def test_error_message_contains_family_name(self):
        with pytest.raises(ValueError) as exc_info:
            get_composition_id("bogus-family")
        assert "bogus-family" in str(exc_info.value)

    def test_error_message_lists_valid_families(self):
        with pytest.raises(ValueError) as exc_info:
            get_composition_id("bogus")
        msg = str(exc_info.value)
        assert "explainer-data" in msg
        assert "cinematic-trailer" in msg


class TestRendererFamilyMap:
    def test_map_has_expected_families(self):
        expected = {
            "explainer-data",
            "explainer-teacher",
            "cinematic-trailer",
            "documentary-montage",
            "product-reveal",
            "screen-demo",
            "presenter",
            "animation-first",
        }
        assert expected.issubset(set(RENDERER_FAMILY_MAP.keys()))

    def test_all_values_are_strings(self):
        for v in RENDERER_FAMILY_MAP.values():
            assert isinstance(v, str)
            assert v

    def test_values_are_known_compositions(self):
        known = {"Explainer", "CinematicRenderer", "TalkingHead"}
        assert set(RENDERER_FAMILY_MAP.values()).issubset(known)
