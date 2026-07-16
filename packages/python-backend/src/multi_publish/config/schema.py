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
"""Configuration schema with Pydantic v2 models for Multi-Publish.

Single source of truth for all configuration defaults and validation.
Migrated from Pixelle-Video (Apache 2.0) and adapted to Multi-Publish's
config structure: llm / tts / publishers / video_creation.
"""

from typing import Optional

from pydantic import BaseModel, Field


class LLMConfig(BaseModel):
    """LLM configuration for AI writer / content generation."""

    api_key: str = Field(default="", description="LLM API Key")
    base_url: str = Field(default="", description="LLM API Base URL")
    model: str = Field(default="", description="LLM Model Name")


class TTSConfig(BaseModel):
    """Text-to-speech configuration."""

    provider: str = Field(
        default="local",
        description="TTS provider: 'local', 'openai', 'elevenlabs', ...",
    )
    voice: str = Field(
        default="zh-CN-YunjianNeural",
        description="TTS voice ID",
    )
    speed: float = Field(
        default=1.2,
        ge=0.5,
        le=2.0,
        description="Speech speed multiplier (0.5-2.0)",
    )


class PublisherConfig(BaseModel):
    """Per-platform publisher configuration.

    Each platform (douyin, wechat_mp, bilibili, xiaohongshu, youtube) shares
    this shape. Fields not applicable to a platform are simply left empty.
    """

    enabled: bool = Field(default=False, description="Whether this publisher is enabled")
    api_key: str = Field(default="", description="Publisher API key (if applicable)")
    app_id: str = Field(default="", description="Publisher app id (if applicable)")
    app_secret: str = Field(default="", description="Publisher app secret (if applicable)")


class PublishersConfig(BaseModel):
    """Aggregated publisher configuration for all supported platforms."""

    douyin: PublisherConfig = Field(default_factory=PublisherConfig)
    wechat_mp: PublisherConfig = Field(default_factory=PublisherConfig)
    bilibili: PublisherConfig = Field(default_factory=PublisherConfig)
    xiaohongshu: PublisherConfig = Field(default_factory=PublisherConfig)
    youtube: PublisherConfig = Field(default_factory=PublisherConfig)


class VideoCreationConfig(BaseModel):
    """Video creation defaults — selects the default pipeline and providers.

    Note: this is the high-level config switch for the ConfigManager.
    Detailed runtime settings live in
    ``multi_publish.video_creation.config_model``.
    """

    pipeline: str = Field(
        default="",
        description="Default video creation pipeline name (e.g. 'cinematic')",
    )
    providers: str = Field(
        default="",
        description="Default providers spec (e.g. 'openai,local')",
    )


class MultiPublishConfig(BaseModel):
    """Multi-Publish main configuration root.

    All fields have defaults so an empty ``config.yaml`` yields a fully
    valid (but unconfigured) instance.
    """

    project_name: str = Field(default="Multi-Publish", description="Project name")
    llm: LLMConfig = Field(default_factory=LLMConfig)
    tts: TTSConfig = Field(default_factory=TTSConfig)
    publishers: PublishersConfig = Field(default_factory=PublishersConfig)
    video_creation: VideoCreationConfig = Field(default_factory=VideoCreationConfig)

    def is_llm_configured(self) -> bool:
        """Return True only when LLM is fully configured (non-empty key/url/model)."""
        return bool(
            self.llm.api_key
            and self.llm.api_key.strip()
            and self.llm.base_url
            and self.llm.base_url.strip()
            and self.llm.model
            and self.llm.model.strip()
        )

    def validate_required(self) -> bool:
        """Validate that the minimal required configuration is present."""
        return self.is_llm_configured()

    def to_dict(self) -> dict:
        """Convert to a plain dictionary (for YAML persistence / deep merge)."""
        return self.model_dump()
