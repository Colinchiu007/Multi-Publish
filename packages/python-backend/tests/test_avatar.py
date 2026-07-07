"""Tests for avatar."""
from multi_publish.video_creation.avatar import LipSync, TalkingHead

class TestLipSync:
    def test_metadata(self):
        t = LipSync()
        assert t.name == "lip_sync"
    def test_execute_missing_key(self):
        assert not LipSync().execute({}).success
    def test_dry_run(self):
        assert LipSync().dry_run({"input_path": "/tmp/v.mp4"})["tool"] == "lip_sync"

class TestTalkingHead:
    def test_metadata(self):
        t = TalkingHead()
        assert t.name == "talking_head"
    def test_execute_missing_key(self):
        assert not TalkingHead().execute({}).success
    def test_dry_run(self):
        assert TalkingHead().dry_run({"input_path": "/tmp/v.mp4"})["tool"] == "talking_head"
