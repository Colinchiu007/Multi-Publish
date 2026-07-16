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
"""Configuration Manager — singleton pattern.

Provides unified access to configuration with automatic Pydantic validation,
hot reload, and deep-merge updates.
Migrated from Pixelle-Video (Apache 2.0) and adapted for Multi-Publish.
"""

from pathlib import Path
from typing import Any, Optional

from loguru import logger

from .loader import load_config_dict, save_config_dict
from .schema import MultiPublishConfig

#: Supported publisher platform names (used by accessors).
_PUBLISHERS = ("douyin", "wechat_mp", "bilibili", "xiaohongshu", "youtube")


def _deep_merge(base: dict, updates: dict) -> dict:
    """Recursively merge ``updates`` into ``base`` (in-place on ``base``).

    Nested dicts are merged field-by-field; non-dict values are overwritten.
    """
    for key, value in updates.items():
        if key in base and isinstance(base[key], dict) and isinstance(value, dict):
            _deep_merge(base[key], value)
        else:
            base[key] = value
    return base


class ConfigManager:
    """Configuration Manager (singleton).

    Provides unified access to configuration with automatic validation.
    A single instance per process is created via ``__new__``; subsequent
    ``ConfigManager(...)`` calls return the same object and skip
    re-initialisation.
    """

    _instance: Optional["ConfigManager"] = None

    def __new__(cls, config_path: str = "config.yaml"):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self, config_path: str = "config.yaml"):
        # Only initialise once per singleton lifetime.
        if getattr(self, "_initialized", False):
            return
        self.config_path = Path(config_path)
        self.config: MultiPublishConfig = self._load()
        self._initialized = True

    # -- internal helpers -------------------------------------------------
    def _load(self) -> MultiPublishConfig:
        """Load configuration from file and validate via Pydantic."""
        data = load_config_dict(str(self.config_path))
        return MultiPublishConfig(**data)

    # -- public API -------------------------------------------------------
    def reload(self) -> None:
        """Re-read the configuration file at runtime (hot reload)."""
        self.config = self._load()
        logger.info("Configuration reloaded")

    def save(self) -> None:
        """Persist current configuration to the YAML file."""
        save_config_dict(self.config.to_dict(), str(self.config_path))

    def update(self, updates: dict) -> None:
        """Deep-merge ``updates`` into the current configuration.

        Only the supplied keys are touched; sibling fields are preserved.
        Example::

            mgr.update({"llm": {"api_key": "new"}})  # keeps base_url & model
        """
        current = self.config.to_dict()
        merged = _deep_merge(current, updates)
        self.config = MultiPublishConfig(**merged)

    def get(self, key: str, default: Any = None) -> Any:
        """Dict-like access for backward compatibility."""
        return self.config.to_dict().get(key, default)

    def validate(self) -> bool:
        """Validate configuration completeness (LLM must be configured)."""
        return self.config.validate_required()

    # -- LLM -------------------------------------------------------------
    def get_llm_config(self) -> dict:
        """Return LLM configuration as a plain dict."""
        return {
            "api_key": self.config.llm.api_key,
            "base_url": self.config.llm.base_url,
            "model": self.config.llm.model,
        }

    def set_llm_config(self, api_key: str, base_url: str, model: str) -> None:
        """Set LLM configuration (deep-merged, other fields untouched)."""
        self.update(
            {
                "llm": {
                    "api_key": api_key,
                    "base_url": base_url,
                    "model": model,
                }
            }
        )

    # -- TTS -------------------------------------------------------------
    def get_tts_config(self) -> dict:
        """Return TTS configuration as a plain dict."""
        return {
            "provider": self.config.tts.provider,
            "voice": self.config.tts.voice,
            "speed": self.config.tts.speed,
        }

    def set_tts_config(
        self,
        provider: Optional[str] = None,
        voice: Optional[str] = None,
        speed: Optional[float] = None,
    ) -> None:
        """Set TTS configuration (only supplied fields are updated)."""
        updates: dict = {}
        if provider is not None:
            updates["provider"] = provider
        if voice is not None:
            updates["voice"] = voice
        if speed is not None:
            updates["speed"] = speed
        if updates:
            self.update({"tts": updates})

    # -- Publishers ------------------------------------------------------
    def get_publisher_config(self, platform: str) -> dict:
        """Return the publisher configuration for ``platform`` as a dict.

        Raises ``KeyError`` for unknown platforms.
        """
        if platform not in _PUBLISHERS:
            raise KeyError(f"Unknown publisher platform: {platform}")
        return getattr(self.config.publishers, platform).model_dump()

    def set_publisher_config(self, platform: str, updates: dict) -> None:
        """Update the publisher configuration for ``platform`` (deep merge)."""
        if platform not in _PUBLISHERS:
            raise KeyError(f"Unknown publisher platform: {platform}")
        self.update({"publishers": {platform: updates}})

    def get_video_creation_config(self) -> dict:
        """Return video-creation default configuration as a dict."""
        return {
            "pipeline": self.config.video_creation.pipeline,
            "providers": self.config.video_creation.providers,
        }

    # -- testing helper --------------------------------------------------
    @classmethod
    def _reset_instance(cls) -> None:
        """Reset the singleton state.

        Intended for unit tests that need independent ConfigManager
        instances backed by different config files.
        """
        if cls._instance is not None:
            cls._instance._initialized = False
        cls._instance = None
