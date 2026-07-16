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
Asset-based video script generation prompt.

For generating video scripts based on user-provided assets.
Migrated from ``pixelle_video.prompts.asset_script_generation`` (Apache 2.0) to
``multi_publish.prompts.asset_script_generation``.

Self-contained: standard library only. Output is free-form scene description
(no strict JSON schema enforced).
"""

from __future__ import annotations

from typing import Any

# The original prompt describes scene fields but does not require strict JSON
# output, so no JSON schema is enforced.
JSON_SCHEMA: Any = None

SYSTEM_PROMPT = (
    "You are a professional video script creator. Based on the user's video "
    "intent and available assets, you generate a coherent video script that "
    "respects the user's input language and target duration."
)

ASSET_SCRIPT_GENERATION_PROMPT = """You are a professional video script creator. Based on the user's video intent and available assets, generate a {duration}-second video script. Before doing so, you need to detect the user's input language - if it's English, then all copy must be in English. Strictly follow the user's input language type as the standard, ensuring consistent and corresponding copy!
## Requirements
{title_section}- Video Intent: {intent}
- Target Duration: {duration} seconds
## Available Assets (use exact paths in output)
{assets_text}
## Creation Guidelines
1. Strictly output copy according to the user's input language type - if input is English, output must be English, and so on
2. Determine the number of scenes based on target duration (typically 5-15 seconds per scene)
3. Assign one asset from available assets to each scene
4. Each scene can contain 1-3 narration sentences
5. Try to use all available assets, but assets can be reused if needed
6. Total duration of all scenes should approximately equal {duration} seconds
{title_instruction}
## Language Consistency Requirements (Strictly Enforce)
- Narration language must match the user's input video intent
- If video intent is in Chinese, narration must be in Chinese
- If video intent is in English, narration must be in English
- Unless the video intent explicitly specifies an output language, strictly follow the original language of the intent
## Output Requirements
Provide for each scene:
- scene_number: Scene number (starting from 1)
- asset_path: Exact path selected from available assets list
- narrations: Array containing 1-3 narration sentences
- duration: Estimated duration (seconds)
Now please begin generating the video script:"""


def build_asset_script_prompt(
    intent: str,
    duration: int,
    assets_text: str,
    title: str = "",
) -> str:
    """Build asset-based script generation prompt.

    Args:
        intent: Video intent/purpose
        duration: Target duration in seconds
        assets_text: Formatted text of available assets with descriptions
        title: Optional video title

    Returns:
        Formatted prompt
    """
    title_section = f"- Video Title: {title}\n" if title else ""
    title_instruction = (
        f"6. Narration content should be consistent with the video title: {title}\n"
        if title else ""
    )

    return ASSET_SCRIPT_GENERATION_PROMPT.format(
        duration=duration,
        title_section=title_section,
        intent=intent,
        assets_text=assets_text,
        title_instruction=title_instruction,
    )


def get_prompt_spec() -> dict[str, Any]:
    """Return structured prompt spec for Multi-Publish.

    ``json_schema`` is ``None`` because the output is a free-form scene list.
    """
    return {
        "system_prompt": SYSTEM_PROMPT,
        "user_template": build_asset_script_prompt,
        "json_schema": JSON_SCHEMA,
    }
