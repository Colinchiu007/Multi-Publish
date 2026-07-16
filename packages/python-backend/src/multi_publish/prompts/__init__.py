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
"""
Prompts package — centralized prompt management for all LLM interactions.

Migrated from ``pixelle_video.prompts`` (Apache 2.0) to
``multi_publish.prompts``.

Each sub-module is self-contained (standard library only) and exposes:
- A ``build_*_prompt(...)`` convenience formatter returning a fully-formatted
  prompt string (kept for backward compatibility / direct use).
- A ``get_prompt_spec()`` function returning a dict with the keys
  ``system_prompt`` (str), ``user_template`` (str or callable), and
  ``json_schema`` (dict or None).

Use :func:`get_all_prompt_specs` to retrieve specs for every prompt module at
once (handy for wiring up LLM clients that want system+user+schema triples).
"""

from __future__ import annotations

from typing import Any

# Narration prompts
from multi_publish.prompts.content_narration import build_content_narration_prompt
from multi_publish.prompts.topic_narration import build_topic_narration_prompt
from multi_publish.prompts.title_generation import build_title_generation_prompt

# Image / video prompts
from multi_publish.prompts.image_generation import (
    DEFAULT_IMAGE_STYLE,
    IMAGE_STYLE_PRESETS,
    build_image_prompt_prompt,
)
from multi_publish.prompts.video_generation import build_video_prompt_prompt
from multi_publish.prompts.style_conversion import build_style_conversion_prompt

# Asset script prompts
from multi_publish.prompts.asset_script_generation import build_asset_script_prompt

# Per-module get_prompt_spec accessors
from multi_publish.prompts.asset_script_generation import get_prompt_spec as _asset_script_spec
from multi_publish.prompts.content_narration import get_prompt_spec as _content_narration_spec
from multi_publish.prompts.image_generation import get_prompt_spec as _image_generation_spec
from multi_publish.prompts.style_conversion import get_prompt_spec as _style_conversion_spec
from multi_publish.prompts.title_generation import get_prompt_spec as _title_generation_spec
from multi_publish.prompts.topic_narration import get_prompt_spec as _topic_narration_spec
from multi_publish.prompts.video_generation import get_prompt_spec as _video_generation_spec

__all__ = [
    # Narration builders
    "build_content_narration_prompt",
    "build_topic_narration_prompt",
    "build_title_generation_prompt",
    # Image / video builders
    "build_image_prompt_prompt",
    "build_video_prompt_prompt",
    "build_style_conversion_prompt",
    # Asset script builder
    "build_asset_script_prompt",
    # Image style presets
    "IMAGE_STYLE_PRESETS",
    "DEFAULT_IMAGE_STYLE",
    # Prompt spec registry
    "get_all_prompt_specs",
]

# Mapping of prompt name -> spec accessor. Kept private; the public API is
# :func:`get_all_prompt_specs` which materializes the specs on demand.
_SPEC_ACCESSORS = {
    "content_narration": _content_narration_spec,
    "topic_narration": _topic_narration_spec,
    "title_generation": _title_generation_spec,
    "image_generation": _image_generation_spec,
    "video_generation": _video_generation_spec,
    "asset_script_generation": _asset_script_spec,
    "style_conversion": _style_conversion_spec,
}


def get_all_prompt_specs() -> dict[str, dict[str, Any]]:
    """Return a mapping of prompt name -> prompt spec for all 7 modules.

    Each value is a dict with keys ``system_prompt``, ``user_template``,
    and ``json_schema`` (see each module's ``get_prompt_spec``).
    """
    return {name: accessor() for name, accessor in _SPEC_ACCESSORS.items()}
