"""Tests for Phase 6: Pipeline orchestration and Phase 7: Character animation."""
from __future__ import annotations

import pytest

from multi_publish.video_creation.character.character_animation import CharacterSpecGenerator
from multi_publish.video_creation.avatar.lip_sync import LipSync
from multi_publish.video_creation.avatar.talking_head import TalkingHead


class TestPhase7Tools:
    def test_metadata(self):
        t = CharacterSpecGenerator()
        assert t.name == "character_spec_generator"
        assert t.capability == "character_animation"

    def test_empty_input_returns_data(self):
        t = CharacterSpecGenerator()
        result = t.execute({})
        # Generator creates default spec even with empty input
        assert result.success
        assert "character_design" in result.data


class TestAvatarTools:
    def test_lip_sync_metadata(self):
        t = LipSync()
        assert t.name == "lip_sync"
        assert t.capability == "avatar"

    def test_talking_head_metadata(self):
        t = TalkingHead()
        assert t.name == "talking_head"
        assert t.capability == "avatar"

    def test_talking_head_missing_input(self):
        t = TalkingHead()
        result = t.execute({})
        assert not result.success
