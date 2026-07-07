"""Tests for character animation module (Phase 7)."""
from __future__ import annotations
import pytest
from multi_publish.video_creation.character import (CharacterSpecGenerator, SvgRigBuilder, PoseLibraryBuilder,
    ActionTimelineCompiler, CharacterRigRenderer, CharacterAnimationReviewer)

class TestCharacterSpecGenerator:
    def test_metadata(self):
        t = CharacterSpecGenerator()
        assert t.name == "character_spec_generator"
    def test_dry_run(self):
        assert CharacterSpecGenerator().dry_run({})["tool"] == "character_spec_generator"
    def test_generates_default_spec(self):
        r = CharacterSpecGenerator().execute({})
        assert r.success and "character_design" in r.data

class TestSvgRigBuilder:
    def test_metadata(self):
        t = SvgRigBuilder()
        assert t.name == "svg_rig_builder"
    def test_missing_key_raises_error(self):
        with pytest.raises(KeyError):
            SvgRigBuilder().execute({})

class TestPoseLibraryBuilder:
    def test_metadata(self):
        t = PoseLibraryBuilder()
        assert t.name == "pose_library_builder"

class TestActionTimelineCompiler:
    def test_metadata(self):
        t = ActionTimelineCompiler()
        assert t.name == "action_timeline_compiler"

class TestCharacterRigRenderer:
    def test_metadata(self):
        t = CharacterRigRenderer()
        assert t.name == "character_rig_renderer"
    def test_missing_key_raises_error(self):
        with pytest.raises(KeyError):
            CharacterRigRenderer().execute({})

class TestCharacterAnimationReviewer:
    def test_metadata(self):
        t = CharacterAnimationReviewer()
        assert t.name == "character_animation_reviewer"
