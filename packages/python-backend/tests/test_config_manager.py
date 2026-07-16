# Copyright (C) 2025 AIDC-AI
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#     http://www.apache.org/licenses/LICENSE-2.0
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
"""Tests for multi_publish.config (ConfigManager migrated from Pixelle-Video).

Covers: YAML load/save, Pydantic validation, hot reload, deep merge,
singleton pattern, default values, and convenient accessors.
"""

import pytest
from pydantic import ValidationError

from multi_publish.config.loader import load_config_dict, save_config_dict
from multi_publish.config.manager import ConfigManager
from multi_publish.config.schema import (
    LLMConfig,
    MultiPublishConfig,
    PublisherConfig,
    PublishersConfig,
    TTSConfig,
    VideoCreationConfig,
)


@pytest.fixture(autouse=True)
def _reset_singleton():
    """Reset the ConfigManager singleton before and after every test."""
    ConfigManager._reset_instance()
    yield
    ConfigManager._reset_instance()


class TestLoader:
    def test_load_missing_file_returns_empty_dict(self, tmp_path):
        assert load_config_dict(str(tmp_path / "missing.yaml")) == {}

    def test_load_yaml_into_dict(self, tmp_path):
        path = tmp_path / "c.yaml"
        path.write_text("llm:\n  api_key: abc\n", encoding="utf-8")
        assert load_config_dict(str(path)) == {"llm": {"api_key": "abc"}}

    def test_load_empty_file_returns_empty_dict(self, tmp_path):
        path = tmp_path / "empty.yaml"
        path.write_text("", encoding="utf-8")
        assert load_config_dict(str(path)) == {}

    def test_save_then_load_roundtrip(self, tmp_path):
        path = tmp_path / "out.yaml"
        save_config_dict({"llm": {"model": "gpt-4o"}}, str(path))
        assert load_config_dict(str(path)) == {"llm": {"model": "gpt-4o"}}

    def test_save_preserves_unicode(self, tmp_path):
        path = tmp_path / "unicode.yaml"
        save_config_dict({"tts": {"voice": "zh-CN-XiaoxiaoNeural"}}, str(path))
        assert load_config_dict(str(path)) == {"tts": {"voice": "zh-CN-XiaoxiaoNeural"}}


class TestSchema:
    def test_llm_config_defaults(self):
        c = LLMConfig()
        assert c.api_key == ""
        assert c.base_url == ""
        assert c.model == ""

    def test_tts_config_defaults(self):
        c = TTSConfig()
        assert c.provider == "local"
        assert c.voice == "zh-CN-YunjianNeural"
        assert c.speed == 1.2

    def test_tts_speed_out_of_range_raises(self):
        with pytest.raises(ValidationError):
            TTSConfig(speed=99.0)

    def test_tts_speed_below_min_raises(self):
        with pytest.raises(ValidationError):
            TTSConfig(speed=0.1)

    def test_publisher_config_defaults(self):
        c = PublisherConfig()
        assert c.enabled is False
        assert c.api_key == ""
        assert c.app_id == ""

    def test_publishers_config_has_all_platforms(self):
        c = PublishersConfig()
        for platform in ("douyin", "wechat_mp", "bilibili", "xiaohongshu", "youtube"):
            assert isinstance(getattr(c, platform), PublisherConfig)

    def test_video_creation_defaults(self):
        c = VideoCreationConfig()
        assert c.pipeline == ""
        assert c.providers == ""

    def test_full_config_defaults(self):
        c = MultiPublishConfig()
        assert c.project_name == "Multi-Publish"
        assert isinstance(c.llm, LLMConfig)
        assert isinstance(c.tts, TTSConfig)
        assert isinstance(c.publishers, PublishersConfig)
        assert isinstance(c.video_creation, VideoCreationConfig)

    def test_full_config_from_dict(self):
        c = MultiPublishConfig(
            llm={"api_key": "k", "base_url": "http://x", "model": "m"},
            tts={"provider": "openai", "voice": "v"},
        )
        assert c.llm.api_key == "k"
        assert c.tts.provider == "openai"

    def test_is_llm_configured_false_when_empty(self):
        assert MultiPublishConfig().is_llm_configured() is False

    def test_is_llm_configured_true_when_set(self):
        c = MultiPublishConfig(llm={"api_key": "k", "base_url": "u", "model": "m"})
        assert c.is_llm_configured() is True

    def test_to_dict_returns_plain_dict(self):
        c = MultiPublishConfig(llm={"api_key": "k"})
        d = c.to_dict()
        assert isinstance(d, dict)
        assert d["llm"]["api_key"] == "k"


class TestSingleton:
    def test_two_instances_are_same_object(self, tmp_path):
        path = tmp_path / "c.yaml"
        path.write_text("", encoding="utf-8")
        a = ConfigManager(str(path))
        b = ConfigManager(str(path))
        assert a is b

    def test_reset_instance_creates_new_object(self, tmp_path):
        path = tmp_path / "c.yaml"
        path.write_text("", encoding="utf-8")
        a = ConfigManager(str(path))
        ConfigManager._reset_instance()
        b = ConfigManager(str(path))
        assert a is not b


class TestDefaults:
    def test_empty_yaml_all_defaults(self, tmp_path):
        path = tmp_path / "empty.yaml"
        path.write_text("", encoding="utf-8")
        mgr = ConfigManager(str(path))
        assert mgr.config.project_name == "Multi-Publish"
        assert mgr.config.llm.api_key == ""
        assert mgr.config.tts.provider == "local"
        assert mgr.config.publishers.douyin.enabled is False
        assert mgr.config.video_creation.pipeline == ""


class TestLoadFromYaml:
    def test_load_config_values(self, tmp_path):
        path = tmp_path / "c.yaml"
        path.write_text(
            "llm:\n  api_key: secret\n  base_url: http://api\n  model: gpt-4o\n",
            encoding="utf-8",
        )
        mgr = ConfigManager(str(path))
        assert mgr.config.llm.api_key == "secret"
        assert mgr.config.llm.base_url == "http://api"
        assert mgr.config.llm.model == "gpt-4o"

    def test_load_nested_publishers(self, tmp_path):
        path = tmp_path / "c.yaml"
        path.write_text(
            "publishers:\n  douyin:\n    enabled: true\n    api_key: dk\n",
            encoding="utf-8",
        )
        mgr = ConfigManager(str(path))
        assert mgr.config.publishers.douyin.enabled is True
        assert mgr.config.publishers.douyin.api_key == "dk"
        # other platforms keep defaults
        assert mgr.config.publishers.bilibili.enabled is False


class TestSaveToYaml:
    def test_save_writes_current_config(self, tmp_path):
        path = tmp_path / "c.yaml"
        path.write_text("", encoding="utf-8")
        mgr = ConfigManager(str(path))
        mgr.set_llm_config(api_key="saved", base_url="http://b", model="m1")
        mgr.save()
        # Re-read raw file
        raw = load_config_dict(str(path))
        assert raw["llm"]["api_key"] == "saved"
        assert raw["llm"]["model"] == "m1"


class TestPydanticValidation:
    def test_invalid_tts_speed_raises_on_load(self, tmp_path):
        path = tmp_path / "c.yaml"
        path.write_text("tts:\n  speed: 99.0\n", encoding="utf-8")
        with pytest.raises(ValidationError):
            ConfigManager(str(path))

    def test_invalid_llm_structure_raises_on_load(self, tmp_path):
        path = tmp_path / "c.yaml"
        path.write_text("llm: not-a-dict\n", encoding="utf-8")
        with pytest.raises(ValidationError):
            ConfigManager(str(path))

    def test_update_invalid_value_raises(self, tmp_path):
        path = tmp_path / "c.yaml"
        path.write_text("", encoding="utf-8")
        mgr = ConfigManager(str(path))
        with pytest.raises(ValidationError):
            mgr.update({"tts": {"speed": 999.0}})


# ---------------------------------------------------------------------------
# Hot reload
# ---------------------------------------------------------------------------
class TestHotReload:
    def test_reload_picks_up_file_changes(self, tmp_path):
        path = tmp_path / "c.yaml"
        path.write_text("llm:\n  api_key: old\n", encoding="utf-8")
        mgr = ConfigManager(str(path))
        assert mgr.get_llm_config()["api_key"] == "old"
        # Overwrite file
        path.write_text("llm:\n  api_key: new\n", encoding="utf-8")
        mgr.reload()
        assert mgr.get_llm_config()["api_key"] == "new"

    def test_reload_restores_defaults_when_file_emptied(self, tmp_path):
        path = tmp_path / "c.yaml"
        path.write_text("llm:\n  api_key: x\n", encoding="utf-8")
        mgr = ConfigManager(str(path))
        assert mgr.config.llm.api_key == "x"
        path.write_text("", encoding="utf-8")
        mgr.reload()
        assert mgr.config.llm.api_key == ""


class TestDeepMerge:
    def test_partial_update_preserves_sibling_fields(self, tmp_path):
        path = tmp_path / "c.yaml"
        path.write_text(
            "llm:\n  api_key: old\n  base_url: http://x\n  model: gpt\n",
            encoding="utf-8",
        )
        mgr = ConfigManager(str(path))
        mgr.update({"llm": {"api_key": "new"}})
        cfg = mgr.get_llm_config()
        assert cfg["api_key"] == "new"
        assert cfg["base_url"] == "http://x"
        assert cfg["model"] == "gpt"

    def test_deep_merge_nested_publisher(self, tmp_path):
        path = tmp_path / "c.yaml"
        path.write_text(
            "publishers:\n  douyin:\n    enabled: true\n    api_key: dk\n",
            encoding="utf-8",
        )
        mgr = ConfigManager(str(path))
        mgr.update({"publishers": {"douyin": {"api_key": "new-dk"}}})
        assert mgr.config.publishers.douyin.enabled is True  # preserved
        assert mgr.config.publishers.douyin.api_key == "new-dk"  # updated

    def test_update_does_not_mutate_input_dict(self, tmp_path):
        path = tmp_path / "c.yaml"
        path.write_text("", encoding="utf-8")
        mgr = ConfigManager(str(path))
        updates = {"llm": {"api_key": "k"}}
        mgr.update(updates)
        assert updates == {"llm": {"api_key": "k"}}


class TestAccessors:
    def test_get_llm_config_returns_dict_with_fields(self, tmp_path):
        path = tmp_path / "c.yaml"
        path.write_text(
            "llm:\n  api_key: k\n  base_url: u\n  model: m\n", encoding="utf-8"
        )
        mgr = ConfigManager(str(path))
        cfg = mgr.get_llm_config()
        assert cfg["api_key"] == "k"
        assert cfg["base_url"] == "u"
        assert cfg["model"] == "m"

    def test_set_llm_config_updates_values(self, tmp_path):
        path = tmp_path / "c.yaml"
        path.write_text("", encoding="utf-8")
        mgr = ConfigManager(str(path))
        mgr.set_llm_config(api_key="nk", base_url="http://nb", model="nm")
        assert mgr.config.llm.api_key == "nk"
        assert mgr.config.llm.base_url == "http://nb"
        assert mgr.config.llm.model == "nm"

    def test_get_tts_config(self, tmp_path):
        path = tmp_path / "c.yaml"
        path.write_text("tts:\n  provider: openai\n  voice: v1\n", encoding="utf-8")
        mgr = ConfigManager(str(path))
        cfg = mgr.get_tts_config()
        assert cfg["provider"] == "openai"
        assert cfg["voice"] == "v1"
        assert cfg["speed"] == 1.2

    def test_set_tts_config(self, tmp_path):
        path = tmp_path / "c.yaml"
        path.write_text("", encoding="utf-8")
        mgr = ConfigManager(str(path))
        mgr.set_tts_config(provider="elevenlabs", voice="rv")
        assert mgr.config.tts.provider == "elevenlabs"
        assert mgr.config.tts.voice == "rv"

    def test_get_publisher_config(self, tmp_path):
        path = tmp_path / "c.yaml"
        path.write_text(
            "publishers:\n  bilibili:\n    enabled: true\n    api_key: bk\n",
            encoding="utf-8",
        )
        mgr = ConfigManager(str(path))
        cfg = mgr.get_publisher_config("bilibili")
        assert cfg["enabled"] is True
        assert cfg["api_key"] == "bk"

    def test_set_publisher_config(self, tmp_path):
        path = tmp_path / "c.yaml"
        path.write_text("", encoding="utf-8")
        mgr = ConfigManager(str(path))
        mgr.set_publisher_config("xiaohongshu", {"enabled": True, "api_key": "xk"})
        assert mgr.config.publishers.xiaohongshu.enabled is True
        assert mgr.config.publishers.xiaohongshu.api_key == "xk"

    def test_get_dict_like_access(self, tmp_path):
        path = tmp_path / "c.yaml"
        path.write_text("llm:\n  model: gpt-4o\n", encoding="utf-8")
        mgr = ConfigManager(str(path))
        assert mgr.get("llm")["model"] == "gpt-4o"
        assert mgr.get("nonexistent", "fallback") == "fallback"

    def test_validate_returns_false_for_empty(self, tmp_path):
        path = tmp_path / "c.yaml"
        path.write_text("", encoding="utf-8")
        mgr = ConfigManager(str(path))
        assert mgr.validate() is False

    def test_validate_returns_true_when_llm_set(self, tmp_path):
        path = tmp_path / "c.yaml"
        path.write_text(
            "llm:\n  api_key: k\n  base_url: u\n  model: m\n", encoding="utf-8"
        )
        mgr = ConfigManager(str(path))
        assert mgr.validate() is True
