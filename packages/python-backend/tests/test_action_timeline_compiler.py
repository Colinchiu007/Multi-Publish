"""Tests for action timeline compilation — extracted from character_animation.py.

Covers the pure scheduling math that builds an ``action_timeline`` artifact
from a ``scene_plan``. Before extraction this logic lived inside
``ActionTimelineCompiler.execute()`` mixed with ``_write_json`` I/O and
``ToolResult`` construction — making the scheduling arithmetic untestable
without file I/O.

The extracted ``compile_action_timeline`` is pure: no I/O, no time.time(),
deterministic given inputs.
"""

from __future__ import annotations

from multi_publish.video_creation.character.action_timeline_compiler import (
    compile_action_timeline,
)


# ─── Helpers ────────────────────────────────────────────────


def _scene(
    *,
    id: str = "scene1",
    start_seconds: float = 0,
    end_seconds: float | None = None,
    description: str = "A scene",
    framing: str | None = None,
    hero_moment: bool = False,
) -> dict:
    scene: dict = {
        "id": id,
        "start_seconds": start_seconds,
        "end_seconds": end_seconds if end_seconds is not None else start_seconds + 3,
        "description": description,
    }
    if framing is not None:
        scene["framing"] = framing
    if hero_moment:
        scene["hero_moment"] = True
    return scene


def _action(action: str, **overrides) -> dict:
    base = {"action": action}
    base.update(overrides)
    return base


# ─── compile_action_timeline: artifact structure ───────────


class TestCompileActionTimelineStructure:
    def test_returns_dict_with_required_keys(self):
        result = compile_action_timeline(
            scene_plan={"scenes": []}, character_ids=["c1"], fps=30, tool_name="action_timeline_compiler"
        )
        assert set(result.keys()) == {"version", "fps", "scenes", "metadata"}
        assert result["version"] == "1.0"
        assert result["fps"] == 30
        assert result["scenes"] == []
        assert result["metadata"] == {"source": "action_timeline_compiler"}

    def test_fps_defaults_to_30_when_not_specified(self):
        # Note: the function takes fps as a param; caller defaults to 30.
        # Here we test that any fps value is faithfully propagated.
        result = compile_action_timeline(
            scene_plan={"scenes": []}, character_ids=["c1"], fps=24, tool_name="x"
        )
        assert result["fps"] == 24

    def test_metadata_source_uses_tool_name(self):
        result = compile_action_timeline(
            scene_plan={"scenes": []}, character_ids=["c1"], fps=30, tool_name="my_tool"
        )
        assert result["metadata"]["source"] == "my_tool"


# ─── compile_action_timeline: single scene / single character ──


class TestCompileActionTimelineSingleCharacter:
    def test_single_scene_single_character_produces_3_actions(self):
        scene = _scene(id="s1", start_seconds=0, end_seconds=4)
        result = compile_action_timeline(
            scene_plan={"scenes": [scene]}, character_ids=["main"], fps=30, tool_name="x"
        )
        assert len(result["scenes"]) == 1
        out_scene = result["scenes"][0]
        assert out_scene["scene_id"] == "s1"
        assert out_scene["start_seconds"] == 0
        assert out_scene["end_seconds"] == 4
        # 1 character × 3 actions
        assert len(out_scene["actions"]) == 3
        # effects always empty
        assert out_scene["effects"] == []

    def test_primary_character_action_sequence(self):
        """Primary (index=0) → anticipate / perform / settle."""
        scene = _scene(id="s1", start_seconds=0, end_seconds=4)
        result = compile_action_timeline(
            scene_plan={"scenes": [scene]}, character_ids=["main"], fps=30, tool_name="x"
        )
        actions = result["scenes"][0]["actions"]
        assert [a["action"] for a in actions] == ["anticipate", "perform", "settle"]

    def test_primary_character_pose_sequence(self):
        """Primary without hero_moment → idle / look_right / idle."""
        scene = _scene(id="s1", start_seconds=0, end_seconds=4)
        result = compile_action_timeline(
            scene_plan={"scenes": [scene]}, character_ids=["main"], fps=30, tool_name="x"
        )
        actions = result["scenes"][0]["actions"]
        assert [a["pose"] for a in actions] == ["idle", "look_right", "idle"]

    def test_primary_character_easing_sequence(self):
        scene = _scene(id="s1", start_seconds=0, end_seconds=4)
        result = compile_action_timeline(
            scene_plan={"scenes": [scene]}, character_ids=["main"], fps=30, tool_name="x"
        )
        actions = result["scenes"][0]["actions"]
        assert [a["easing"] for a in actions] == ["power2.out", "back.out", "power2.inOut"]

    def test_primary_character_at_seconds_with_zero_offset(self):
        """index=0 → offset=0 → at_seconds = start + {0, dur*0.25, dur*0.7}."""
        scene = _scene(id="s1", start_seconds=10, end_seconds=14)  # duration=4
        result = compile_action_timeline(
            scene_plan={"scenes": [scene]}, character_ids=["main"], fps=30, tool_name="x"
        )
        actions = result["scenes"][0]["actions"]
        # anticipate: start + 0 = 10
        assert actions[0]["at_seconds"] == 10
        # perform: start + duration*0.25 + offset = 10 + 1 + 0 = 11
        assert actions[1]["at_seconds"] == 11
        # settle: start + duration*0.7 + offset = 10 + 2.8 + 0 = 12.8
        assert actions[2]["at_seconds"] == 12.8

    def test_primary_character_duration_seconds(self):
        scene = _scene(id="s1", start_seconds=0, end_seconds=4)  # duration=4
        result = compile_action_timeline(
            scene_plan={"scenes": [scene]}, character_ids=["main"], fps=30, tool_name="x"
        )
        actions = result["scenes"][0]["actions"]
        # anticipate: min(0.5, 4/4=1) = 0.5
        assert actions[0]["duration_seconds"] == 0.5
        # perform: duration * 0.35 = 1.4
        assert actions[1]["duration_seconds"] == 1.4
        # settle: duration * 0.25 = 1.0
        assert actions[2]["duration_seconds"] == 1.0


# ─── compile_action_timeline: multiple characters ──────────


class TestCompileActionTimelineMultiCharacter:
    def test_two_characters_produce_6_actions(self):
        scene = _scene(id="s1", start_seconds=0, end_seconds=4)
        result = compile_action_timeline(
            scene_plan={"scenes": [scene]}, character_ids=["main", "side"], fps=30, tool_name="x"
        )
        actions = result["scenes"][0]["actions"]
        assert len(actions) == 6  # 2 characters × 3 actions

    def test_secondary_character_action_sequence(self):
        """Secondary (index>0) → react / follow / settle."""
        scene = _scene(id="s1", start_seconds=0, end_seconds=4)
        result = compile_action_timeline(
            scene_plan={"scenes": [scene]}, character_ids=["main", "side"], fps=30, tool_name="x"
        )
        actions = result["scenes"][0]["actions"]
        # actions[3:6] are the secondary character's
        assert [a["action"] for a in actions[3:]] == ["react", "follow", "settle"]

    def test_secondary_character_pose_sequence(self):
        """Secondary without hero_moment → idle / surprised / idle."""
        scene = _scene(id="s1", start_seconds=0, end_seconds=4)
        result = compile_action_timeline(
            scene_plan={"scenes": [scene]}, character_ids=["main", "side"], fps=30, tool_name="x"
        )
        actions = result["scenes"][0]["actions"]
        assert [a["pose"] for a in actions[3:]] == ["idle", "surprised", "idle"]

    def test_secondary_character_uses_offset(self):
        """index=1 → offset = min(dur*0.08*1, dur*0.2)."""
        scene = _scene(id="s1", start_seconds=0, end_seconds=4)  # duration=4
        result = compile_action_timeline(
            scene_plan={"scenes": [scene]}, character_ids=["main", "side"], fps=30, tool_name="x"
        )
        actions = result["scenes"][0]["actions"]
        # offset = min(4*0.08, 4*0.2) = min(0.32, 0.8) = 0.32
        # anticipate at_seconds = 0 + 0.32 = 0.32
        assert actions[3]["at_seconds"] == 0.32
        # perform at_seconds = 0 + 4*0.25 + 0.32 = 1.32
        assert actions[4]["at_seconds"] == 1.32

    def test_offset_capped_at_20_percent_of_duration(self):
        """With many characters, offset caps at duration*0.2."""
        # duration=4, index=5 → 4*0.08*5 = 1.6, cap = 4*0.2 = 0.8 → offset=0.8
        scene = _scene(id="s1", start_seconds=0, end_seconds=4)
        result = compile_action_timeline(
            scene_plan={"scenes": [scene]},
            character_ids=["c0", "c1", "c2", "c3", "c4", "c5"],
            fps=30,
            tool_name="x",
        )
        actions = result["scenes"][0]["actions"]
        # c5 is index 5 → actions[15] is its anticipate
        # at_seconds = 0 + 0.8 = 0.8
        assert actions[15]["at_seconds"] == 0.8

    def test_character_id_propagated_to_each_action(self):
        scene = _scene(id="s1", start_seconds=0, end_seconds=4)
        result = compile_action_timeline(
            scene_plan={"scenes": [scene]}, character_ids=["alice", "bob"], fps=30, tool_name="x"
        )
        actions = result["scenes"][0]["actions"]
        assert all(a["character_id"] in {"alice", "bob"} for a in actions)
        # First 3 belong to alice, next 3 to bob
        assert [a["character_id"] for a in actions[:3]] == ["alice"] * 3
        assert [a["character_id"] for a in actions[3:]] == ["bob"] * 3


# ─── compile_action_timeline: hero_moment ──────────────────


class TestCompileActionTimelineHeroMoment:
    def test_hero_moment_flips_primary_perform_pose_to_surprised(self):
        scene = _scene(id="s1", start_seconds=0, end_seconds=4, hero_moment=True)
        result = compile_action_timeline(
            scene_plan={"scenes": [scene]}, character_ids=["main"], fps=30, tool_name="x"
        )
        actions = result["scenes"][0]["actions"]
        # Without hero_moment, primary's perform pose is "look_right"
        # With hero_moment, it becomes "surprised"
        assert actions[1]["pose"] == "surprised"

    def test_hero_moment_does_not_affect_anticipate_or_settle(self):
        scene = _scene(id="s1", start_seconds=0, end_seconds=4, hero_moment=True)
        result = compile_action_timeline(
            scene_plan={"scenes": [scene]}, character_ids=["main"], fps=30, tool_name="x"
        )
        actions = result["scenes"][0]["actions"]
        assert actions[0]["pose"] == "idle"  # anticipate still idle
        assert actions[2]["pose"] == "idle"  # settle still idle


# ─── compile_action_timeline: scene defaults ───────────────


class TestCompileActionTimelineSceneDefaults:
    def test_default_start_seconds_is_0(self):
        scene = {"id": "s1", "end_seconds": 3}  # no start_seconds
        result = compile_action_timeline(
            scene_plan={"scenes": [scene]}, character_ids=["main"], fps=30, tool_name="x"
        )
        out_scene = result["scenes"][0]
        assert out_scene["start_seconds"] == 0

    def test_default_end_seconds_is_start_plus_3(self):
        scene = {"id": "s1", "start_seconds": 5}  # no end_seconds
        result = compile_action_timeline(
            scene_plan={"scenes": [scene]}, character_ids=["main"], fps=30, tool_name="x"
        )
        out_scene = result["scenes"][0]
        assert out_scene["end_seconds"] == 8  # 5 + 3

    def test_duration_clamped_to_min_0_1(self):
        """When end < start, duration = max(0.1, negative) = 0.1."""
        scene = {"id": "s1", "start_seconds": 5, "end_seconds": 5}  # duration=0
        result = compile_action_timeline(
            scene_plan={"scenes": [scene]}, character_ids=["main"], fps=30, tool_name="x"
        )
        actions = result["scenes"][0]["actions"]
        # With duration=0.1: anticipate duration = min(0.5, 0.1/4=0.025) = 0.025
        assert actions[0]["duration_seconds"] == 0.025

    def test_default_framing_is_medium(self):
        scene = {"id": "s1", "start_seconds": 0, "end_seconds": 3}  # no framing
        result = compile_action_timeline(
            scene_plan={"scenes": [scene]}, character_ids=["main"], fps=30, tool_name="x"
        )
        out_scene = result["scenes"][0]
        assert out_scene["camera"]["framing"] == "medium"

    def test_custom_framing_propagated(self):
        scene = {"id": "s1", "start_seconds": 0, "end_seconds": 3, "framing": "close_up"}
        result = compile_action_timeline(
            scene_plan={"scenes": [scene]}, character_ids=["main"], fps=30, tool_name="x"
        )
        out_scene = result["scenes"][0]
        assert out_scene["camera"]["framing"] == "close_up"

    def test_description_used_as_background(self):
        scene = {"id": "s1", "start_seconds": 0, "end_seconds": 3, "description": "Forest scene"}
        result = compile_action_timeline(
            scene_plan={"scenes": [scene]}, character_ids=["main"], fps=30, tool_name="x"
        )
        out_scene = result["scenes"][0]
        assert out_scene["background"] == "Forest scene"

    def test_description_used_as_perform_notes(self):
        scene = {"id": "s1", "start_seconds": 0, "end_seconds": 3, "description": "Forest scene"}
        result = compile_action_timeline(
            scene_plan={"scenes": [scene]}, character_ids=["main"], fps=30, tool_name="x"
        )
        actions = result["scenes"][0]["actions"]
        # perform action carries notes=description
        assert actions[1]["notes"] == "Forest scene"
        # anticipate and settle do NOT carry notes
        assert "notes" not in actions[0]
        assert "notes" not in actions[2]


# ─── compile_action_timeline: multiple scenes ──────────────


class TestCompileActionTimelineMultipleScenes:
    def test_two_scenes_produce_two_entries(self):
        scenes = [
            _scene(id="s1", start_seconds=0, end_seconds=3),
            _scene(id="s2", start_seconds=3, end_seconds=6),
        ]
        result = compile_action_timeline(
            scene_plan={"scenes": scenes}, character_ids=["main"], fps=30, tool_name="x"
        )
        assert len(result["scenes"]) == 2
        assert result["scenes"][0]["scene_id"] == "s1"
        assert result["scenes"][1]["scene_id"] == "s2"

    def test_empty_scenes_list_produces_empty_artifact(self):
        result = compile_action_timeline(
            scene_plan={"scenes": []}, character_ids=["main"], fps=30, tool_name="x"
        )
        assert result["scenes"] == []

    def test_missing_scenes_key_treated_as_empty(self):
        result = compile_action_timeline(
            scene_plan={}, character_ids=["main"], fps=30, tool_name="x"
        )
        assert result["scenes"] == []
