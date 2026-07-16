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
Style conversion prompt.

For converting user's custom style description to image generation prompt.
Migrated from ``pixelle_video.prompts.style_conversion`` (Apache 2.0) to
``multi_publish.prompts.style_conversion``.

Self-contained: standard library only. Output is plain text (no JSON schema).
"""

from __future__ import annotations

from typing import Any

# Style conversion outputs a plain-text prompt, no structured JSON schema.
JSON_SCHEMA: Any = None

SYSTEM_PROMPT = (
    "You are a professional image generation prompt engineer specializing in "
    "Stable Diffusion / FLUX models. You translate style descriptions in any "
    "language into detailed, comma-separated English image prompts."
)

STYLE_CONVERSION_PROMPT = """Convert this style description into a detailed image generation prompt for Stable Diffusion/FLUX:
Style Description: {description}
Requirements:
- Focus on visual elements, colors, lighting, mood, atmosphere
- Be specific and detailed
- Use professional photography/art terminology
- Output ONLY the prompt in English (no explanations)
- Keep it under 100 words
- Use comma-separated descriptive phrases
Image Prompt:"""


def build_style_conversion_prompt(description: str) -> str:
    """Build style conversion prompt.

    Converts user's custom style description (in any language) to an English
    image generation prompt suitable for Stable Diffusion/FLUX models.

    Args:
        description: User's style description in any language

    Returns:
        Formatted prompt

    Example:
        >>> build_style_conversion_prompt("赛博朋克风格，霓虹灯，未来感")
        # Returns prompt that will convert to: "cyberpunk style, neon lights, futuristic..."
    """
    return STYLE_CONVERSION_PROMPT.format(description=description)


def get_prompt_spec() -> dict[str, Any]:
    """Return structured prompt spec for Multi-Publish.

    ``json_schema`` is ``None`` because the expected output is plain text.
    """
    return {
        "system_prompt": SYSTEM_PROMPT,
        "user_template": build_style_conversion_prompt,
        "json_schema": JSON_SCHEMA,
    }
