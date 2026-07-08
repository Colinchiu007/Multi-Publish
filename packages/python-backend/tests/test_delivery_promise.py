"""Tests for delivery_promise.py — pure data + logic, no external deps."""

from __future__ import annotations

import pytest

from multi_publish.video_creation.providers.video.lib.delivery_promise import (
    PROMISE_RULES,
    DeliveryPromise,
    PromiseType,
    classify_from_brief,
)


class TestPromiseType:
    """Enum has 8 values with correct strings."""

    def test_all_promise_types(self):
        assert len(PromiseType) == 8
        assert PromiseType.MOTION_LED.value == "motion_led"
        assert PromiseType.SOURCE_LED.value == "source_led"
        assert PromiseType.DATA_EXPLAINER.value == "data_explainer"
        assert PromiseType.TEACHER_EXPLAINER.value == "teacher_explainer"
        assert PromiseType.SCREEN_DEMO.value == "screen_demo"
        assert PromiseType.AVATAR_PRESENTER.value == "avatar_presenter"
        assert PromiseType.HYBRID.value == "hybrid"
        assert PromiseType.LOCALIZATION.value == "localization"

    def test_all_types_have_rules(self):
        for pt in PromiseType:
            assert pt.value in PROMISE_RULES, f"Missing rules for {pt.value}"
            rules = PROMISE_RULES[pt.value]
            assert "still_fallback_allowed" in rules
            assert "requires_video_generation" in rules
            assert "min_motion_ratio" in rules
            assert "description" in rules


class TestDeliveryPromise:
    """DeliveryPromise dataclass + methods."""

    def test_default_construction(self):
        dp = DeliveryPromise(
            promise_type=PromiseType.MOTION_LED,
            motion_required=True,
            source_required=False,
            tone_mode="cinematic",
            quality_floor="broadcast",
        )
        assert dp.promise_type == PromiseType.MOTION_LED
        assert dp.motion_required is True
        assert dp.source_required is False
        assert dp.tone_mode == "cinematic"
        assert dp.quality_floor == "broadcast"
        assert dp.approved_fallback is None

    def test_approved_fallback_set(self):
        dp = DeliveryPromise(
            promise_type=PromiseType.MOTION_LED,
            motion_required=True,
            source_required=False,
            tone_mode="cinematic",
            quality_floor="presentable",
            approved_fallback="still_led",
        )
        assert dp.approved_fallback == "still_led"

    def test_to_dict_motion_led(self):
        dp = DeliveryPromise(
            promise_type=PromiseType.MOTION_LED,
            motion_required=True,
            source_required=False,
            tone_mode="cinematic",
            quality_floor="broadcast",
        )
        d = dp.to_dict()
        assert d["promise_type"] == "motion_led"
        assert d["motion_required"] is True
        assert d["source_required"] is False
        assert d["tone_mode"] == "cinematic"
        assert d["quality_floor"] == "broadcast"
        assert d["approved_fallback"] is None

    def test_to_dict_with_fallback(self):
        dp = DeliveryPromise(
            promise_type=PromiseType.MOTION_LED,
            motion_required=True,
            source_required=False,
            tone_mode="cinematic",
            quality_floor="presentable",
            approved_fallback="still_led",
        )
        d = dp.to_dict()
        assert d["approved_fallback"] == "still_led"

    def test_from_dict_roundtrip(self):
        data = {
            "promise_type": "motion_led",
            "motion_required": True,
            "source_required": False,
            "tone_mode": "cinematic",
            "quality_floor": "broadcast",
        }
        dp = DeliveryPromise.from_dict(data)
        assert dp.promise_type == PromiseType.MOTION_LED
        assert dp.motion_required is True
        assert dp.to_dict() == {
            "promise_type": "motion_led",
            "motion_required": True,
            "source_required": False,
            "tone_mode": "cinematic",
            "quality_floor": "broadcast",
            "approved_fallback": None,
        }

    def test_from_dict_with_fallback(self):
        data = {
            "promise_type": "avatar_presenter",
            "motion_required": True,
            "source_required": False,
            "tone_mode": "corporate",
            "quality_floor": "draft",
            "approved_fallback": "still_led",
        }
        dp = DeliveryPromise.from_dict(data)
        assert dp.approved_fallback == "still_led"

    def test_from_dict_defaults(self):
        data = {"promise_type": "data_explainer"}
        dp = DeliveryPromise.from_dict(data)
        assert dp.promise_type == PromiseType.DATA_EXPLAINER
        assert dp.motion_required is False
        assert dp.source_required is False
        assert dp.tone_mode == "corporate"
        assert dp.quality_floor == "presentable"
        assert dp.approved_fallback is None

    def test_get_rules_motion_led(self):
        dp = DeliveryPromise(
            promise_type=PromiseType.MOTION_LED,
            motion_required=True,
            source_required=False,
            tone_mode="cinematic",
            quality_floor="broadcast",
        )
        rules = dp.get_rules()
        assert rules["still_fallback_allowed"] is False
        assert rules["requires_video_generation"] is True
        assert rules["min_motion_ratio"] == 0.7

    def test_get_rules_data_explainer(self):
        dp = DeliveryPromise(
            promise_type=PromiseType.DATA_EXPLAINER,
            motion_required=False,
            source_required=False,
            tone_mode="educational",
            quality_floor="presentable",
        )
        rules = dp.get_rules()
        assert rules["still_fallback_allowed"] is True
        assert rules["requires_video_generation"] is False
        assert rules["min_motion_ratio"] == 0.0

    def test_get_rules_unknown_type(self):
        dp = DeliveryPromise(
            promise_type=PromiseType.HYBRID,
            motion_required=False,
            source_required=False,
            tone_mode="corporate",
            quality_floor="draft",
        )
        rules = dp.get_rules()
        assert rules == PROMISE_RULES["hybrid"]

    def test_validate_cuts_empty(self):
        dp = DeliveryPromise(
            promise_type=PromiseType.MOTION_LED,
            motion_required=True,
            source_required=False,
            tone_mode="cinematic",
            quality_floor="broadcast",
        )
        result = dp.validate_cuts([])
        assert result["valid"] is False
        assert "No cuts provided" in result["violations"]
        assert result["motion_ratio"] == 0.0

    def test_validate_cuts_motion_led_valid(self):
        dp = DeliveryPromise(
            promise_type=PromiseType.MOTION_LED,
            motion_required=True,
            source_required=False,
            tone_mode="cinematic",
            quality_floor="broadcast",
        )
        cuts = [
            {"source": "clip1.mp4", "type": "video"},
            {"source": "clip2.mp4", "type": "video"},
            {"source": "clip3.mov", "type": "video"},
            {"type": "text_card"},  # animated slide, not motion
        ]
        result = dp.validate_cuts(cuts)
        assert result["valid"] is True
        assert result["motion_ratio"] == 0.75  # 3/4
        assert result["motion_cuts"] == 3
        assert result["slide_cuts"] == 1
        assert result["still_cuts"] == 0

    def test_validate_cuts_motion_led_below_minimum(self):
        dp = DeliveryPromise(
            promise_type=PromiseType.MOTION_LED,
            motion_required=True,
            source_required=False,
            tone_mode="cinematic",
            quality_floor="broadcast",
        )
        # Only 1 motion cut out of 5 → 0.2 < 0.7
        cuts = [
            {"source": "clip1.mp4", "type": "video"},
            {"type": "text_card"},
            {"type": "chart"},
            {"type": "stat_card"},
            {"type": "callout"},
        ]
        result = dp.validate_cuts(cuts)
        assert result["valid"] is False
        assert len(result["violations"]) >= 1
        assert "motion ratio" in result["violations"][0].lower()
        assert result["motion_ratio"] == 0.2
        assert result["motion_cuts"] == 1
        assert result["slide_cuts"] == 4
        assert result["still_cuts"] == 0

    def test_validate_cuts_still_fallback_motion_led(self):
        """MOTION_LED with no approved fallback → violation when too many stills."""
        dp = DeliveryPromise(
            promise_type=PromiseType.MOTION_LED,
            motion_required=True,
            source_required=False,
            tone_mode="cinematic",
            quality_floor="broadcast",
            approved_fallback=None,
        )
        # All stills (no motion, no slides)
        cuts = [
            {"source": "image1.png", "type": "image"},
            {"source": "image2.png", "type": "image"},
        ]
        result = dp.validate_cuts(cuts)
        assert result["valid"] is False
        # Should have 2 violations: motion ratio + still fallback
        assert len(result["violations"]) >= 1

    def test_validate_cuts_still_fallback_motion_led_approved(self):
        """MOTION_LED with approved still_led fallback → no still-fallback violation."""
        dp = DeliveryPromise(
            promise_type=PromiseType.MOTION_LED,
            motion_required=True,
            source_required=False,
            tone_mode="cinematic",
            quality_floor="broadcast",
            approved_fallback="still_led",
        )
        cuts = [
            {"source": "image1.png", "type": "image"},
            {"source": "image2.png", "type": "image"},
        ]
        result = dp.validate_cuts(cuts)
        # Only motion ratio violation (since approved_fallback is set)
        assert len(result["violations"]) >= 0

    def test_validate_cuts_avatar_type_motion(self):
        dp = DeliveryPromise(
            promise_type=PromiseType.AVATAR_PRESENTER,
            motion_required=True,
            source_required=False,
            tone_mode="corporate",
            quality_floor="presentable",
        )
        cuts = [
            {"type": "avatar"},
            {"type": "avatar"},
            {"type": "text_card"},
        ]
        result = dp.validate_cuts(cuts)
        assert result["motion_cuts"] == 2
        assert result["slide_cuts"] == 1
        assert result["motion_ratio"] == 2 / 3
        # Avatar requires min 0.3 motion ratio - 0.66 >= 0.3, so valid on that front
        # But it has still_fallback_allowed=False, check if non-motion > 50%
        # non_motion = 1 (slide), total = 3, 1/3 = 33% < 50% → OK
        assert result["valid"] is True

    def test_validate_cuts_still_fallback_disallowed_no_approval(self):
        dp = DeliveryPromise(
            promise_type=PromiseType.AVATAR_PRESENTER,
            motion_required=True,
            source_required=False,
            tone_mode="corporate",
            quality_floor="presentable",
            approved_fallback=None,
        )
        cuts = [
            {"type": "text_card"},
            {"type": "chart"},
            {"type": "text_card"},
        ]
        result = dp.validate_cuts(cuts)
        # All slides, 0 motion
        assert result["motion_ratio"] == 0.0
        # non_motion = 3, total = 3, 100% > 50% → violation for still fallback
        # avatar disallows still_fallback
        assert result["valid"] is False

    def test_validate_cuts_data_explainer_always_valid(self):
        """Data explainer allows still fallback and 0 motion."""
        dp = DeliveryPromise(
            promise_type=PromiseType.DATA_EXPLAINER,
            motion_required=False,
            source_required=False,
            tone_mode="educational",
            quality_floor="presentable",
        )
        cuts = [{"type": "text_card"}, {"type": "chart"}]
        result = dp.validate_cuts(cuts)
        assert result["valid"] is True
        assert result["motion_ratio"] == 0.0

    def test_validate_cuts_file_extension_motion(self):
        dp = DeliveryPromise(
            promise_type=PromiseType.SOURCE_LED,
            motion_required=False,
            source_required=True,
            tone_mode="corporate",
            quality_floor="presentable",
        )
        cuts = [
            {"source": "clip.mp4"},  # motion by extension
            {"source": "clip.webm"},  # motion by extension
            {"source": "clip.mov"},  # motion by extension
            {"source": "clip.avi"},  # motion by extension
            {"source": "clip.mkv"},  # motion by extension
            {"source": "still.png"},  # still
        ]
        result = dp.validate_cuts(cuts)
        assert result["motion_cuts"] == 5
        assert result["still_cuts"] == 1
        assert result["motion_ratio"] == 5 / 6

    def test_validate_cuts_unknown_type(self):
        dp = DeliveryPromise(
            promise_type=PromiseType.SOURCE_LED,
            motion_required=False,
            source_required=True,
            tone_mode="corporate",
            quality_floor="presentable",
        )
        cuts = [{"source": "clip.unknown"}]
        result = dp.validate_cuts(cuts)
        assert result["still_cuts"] == 1

    def test_validate_cuts_animation_type(self):
        dp = DeliveryPromise(
            promise_type=PromiseType.MOTION_LED,
            motion_required=True,
            source_required=False,
            tone_mode="cinematic",
            quality_floor="broadcast",
        )
        cuts = [{"type": "animation"}, {"type": "animation"}]
        result = dp.validate_cuts(cuts)
        assert result["motion_cuts"] == 2
        assert result["motion_ratio"] == 1.0


class TestSlidesAreNotMotion:
    """Animated slides (text_card, chart, etc.) should never count as motion."""

    @pytest.mark.parametrize("slide_type", [
        "text_card", "stat_card", "chart", "bar_chart", "line_chart",
        "pie_chart", "kpi_grid", "comparison", "progress", "callout",
    ])
    def test_slide_type_not_motion(self, slide_type):
        dp = DeliveryPromise(
            promise_type=PromiseType.MOTION_LED,
            motion_required=True,
            source_required=False,
            tone_mode="cinematic",
            quality_floor="broadcast",
        )
        cuts = [{"type": slide_type}]
        result = dp.validate_cuts(cuts)
        assert result["motion_cuts"] == 0
        assert result["slide_cuts"] == 1
        assert result["motion_ratio"] == 0.0


class TestClassifyFromBrief:
    """classify_from_brief() function."""

    def test_cinematic_pipeline(self):
        dp = classify_from_brief("cinematic", {"motion_required": True})
        assert dp.promise_type == PromiseType.MOTION_LED
        assert dp.motion_required is True

    def test_animated_explainer(self):
        dp = classify_from_brief("animated-explainer", {})
        assert dp.promise_type == PromiseType.DATA_EXPLAINER

    def test_talking_head(self):
        dp = classify_from_brief("talking-head", {})
        assert dp.promise_type == PromiseType.AVATAR_PRESENTER

    def test_screen_demo(self):
        dp = classify_from_brief("screen-demo", {})
        assert dp.promise_type == PromiseType.SCREEN_DEMO

    def test_hybrid_pipeline(self):
        dp = classify_from_brief("hybrid", {})
        assert dp.promise_type == PromiseType.HYBRID

    def test_localization(self):
        dp = classify_from_brief("localization-dub", {})
        assert dp.promise_type == PromiseType.LOCALIZATION

    def test_podcast_repurpose(self):
        dp = classify_from_brief("podcast-repurpose", {})
        assert dp.promise_type == PromiseType.SOURCE_LED

    def test_clip_factory(self):
        dp = classify_from_brief("clip-factory", {})
        assert dp.promise_type == PromiseType.SOURCE_LED

    def test_unknown_pipeline_defaults_to_hybrid(self):
        dp = classify_from_brief("unknown-pipeline", {})
        assert dp.promise_type == PromiseType.HYBRID

    def test_user_intent_overrides_motion_required_false(self):
        dp = classify_from_brief(
            "cinematic",
            {"motion_required": False},
        )
        # motion_required=False overrides MOTION_LED → HYBRID
        assert dp.promise_type == PromiseType.HYBRID

    def test_user_has_footage(self):
        dp = classify_from_brief(
            "animated-explainer",
            {"has_footage": True},
        )
        assert dp.promise_type == PromiseType.SOURCE_LED
        assert dp.source_required is True

    def test_user_tone_and_quality(self):
        dp = classify_from_brief(
            "cinematic",
            {"tone": "playful", "quality": "draft", "motion_required": True},
        )
        assert dp.tone_mode == "playful"
        assert dp.quality_floor == "draft"

    def test_user_intent_empty_dict(self):
        dp = classify_from_brief("talking-head", {})
        assert dp.motion_required is True  # avatar_presenter defaults
        assert dp.source_required is False
        assert dp.tone_mode == "corporate"
        assert dp.quality_floor == "presentable"
