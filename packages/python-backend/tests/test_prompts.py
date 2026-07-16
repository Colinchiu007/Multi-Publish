"""Tests for the migrated prompt management system.

Adapted from Pixelle-Video (Apache 2.0). Covers:
- Importability of each of the 7 prompt modules
- Each ``build_*_prompt`` function returns a non-empty ``str``
- Each ``get_prompt_spec`` returns a dict with ``system_prompt``/``user_template``/``json_schema``
- JSON schema (when present) is a well-formed dict
- ``__init__.py`` re-exports all 7 modules' builders + style presets
"""

from __future__ import annotations

import inspect

import pytest

from multi_publish import prompts as prompts_pkg
from multi_publish.prompts import (
    asset_script_generation,
    content_narration,
    image_generation,
    style_conversion,
    title_generation,
    topic_narration,
    video_generation,
)

# ---------------------------------------------------------------------------
# Required keys for a prompt spec returned by ``get_prompt_spec()``
# ---------------------------------------------------------------------------
REQUIRED_SPEC_KEYS = {"system_prompt", "user_template", "json_schema"}

PROMPT_MODULES = [
    content_narration,
    image_generation,
    title_generation,
    topic_narration,
    video_generation,
    asset_script_generation,
    style_conversion,
]


def _is_json_schema(value):
    """A JSON schema is either ``None`` (no structured output) or a dict
    that looks like a schema (has ``type`` or ``properties``)."""
    if value is None:
        return True
    if not isinstance(value, dict):
        return False
    return "type" in value or "properties" in value


# ---------------------------------------------------------------------------
# 1. Importability — each module loads and exposes expected symbols
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("module", PROMPT_MODULES, ids=lambda m: m.__name__)
def test_module_importable(module):
    assert hasattr(module, "get_prompt_spec"), f"{module.__name__} missing get_prompt_spec"


@pytest.mark.parametrize("module", PROMPT_MODULES, ids=lambda m: m.__name__)
def test_module_has_prompt_constant(module):
    """Each module exposes an UPPERCASE ``*_PROMPT`` constant string."""
    prompt_consts = [
        name for name in dir(module)
        if name.isupper() and name.endswith("_PROMPT")
    ]
    assert prompt_consts, f"{module.__name__} has no *_PROMPT constant"
    for name in prompt_consts:
        assert isinstance(getattr(module, name), str)
        assert len(getattr(module, name)) > 0


# ---------------------------------------------------------------------------
# 2. get_prompt_spec() — structure validation
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("module", PROMPT_MODULES, ids=lambda m: m.__name__)
def test_get_prompt_spec_returns_dict(module):
    spec = module.get_prompt_spec()
    assert isinstance(spec, dict)
    assert REQUIRED_SPEC_KEYS <= set(spec.keys()), (
        f"{module.__name__} spec missing keys: "
        f"{REQUIRED_SPEC_KEYS - set(spec.keys())}"
    )


@pytest.mark.parametrize("module", PROMPT_MODULES, ids=lambda m: m.__name__)
def test_spec_system_prompt_nonempty_str(module):
    system_prompt = module.get_prompt_spec()["system_prompt"]
    assert isinstance(system_prompt, str), f"{module.__name__} system_prompt not str"
    assert len(system_prompt.strip()) > 0, f"{module.__name__} system_prompt empty"


@pytest.mark.parametrize("module", PROMPT_MODULES, ids=lambda m: m.__name__)
def test_spec_user_template_str_or_callable(module):
    user_template = module.get_prompt_spec()["user_template"]
    # ``callable`` is a built-in function (not a type), so check it explicitly
    # rather than passing it to ``isinstance``.
    assert isinstance(user_template, str) or callable(user_template), (
        f"{module.__name__} user_template must be str or callable"
    )
    if isinstance(user_template, str):
        assert len(user_template.strip()) > 0


@pytest.mark.parametrize("module", PROMPT_MODULES, ids=lambda m: m.__name__)
def test_spec_json_schema_valid(module):
    json_schema = module.get_prompt_spec()["json_schema"]
    assert _is_json_schema(json_schema), (
        f"{module.__name__} json_schema is not None/dict-with-type-or-properties"
    )


# ---------------------------------------------------------------------------
# 3. build_*_prompt functions return non-empty formatted strings
# ---------------------------------------------------------------------------
def test_build_content_narration_prompt():
    result = content_narration.build_content_narration_prompt(
        content="Some long content about productivity.",
        n_storyboard=3,
        min_words=20,
        max_words=60,
    )
    assert isinstance(result, str)
    assert len(result) > 0
    # Placeholders should be resolved (no stray {content} left)
    assert "{content}" not in result
    assert "{n_storyboard}" not in result
    assert "3" in result


def test_build_topic_narration_prompt():
    result = topic_narration.build_topic_narration_prompt(
        topic="早起改变人生",
        n_storyboard=4,
        min_words=20,
        max_words=60,
    )
    assert isinstance(result, str) and len(result) > 0
    assert "{topic}" not in result
    assert "早起改变人生" in result
    assert "4" in result


def test_build_title_generation_prompt_default():
    result = title_generation.build_title_generation_prompt(
        content="A long article about the benefits of waking up early."
    )
    assert isinstance(result, str) and len(result) > 0
    assert "{content}" not in result
    assert "{max_length}" not in result
    assert "15" in result  # default max_length


def test_build_title_generation_prompt_custom_length():
    result = title_generation.build_title_generation_prompt(
        content="短内容",
        max_length=30,
    )
    assert "30" in result


def test_build_title_generation_prompt_truncates_long_content():
    long_content = "x" * 1000
    result = title_generation.build_title_generation_prompt(content=long_content)
    # Only first 500 chars should be embedded
    assert "x" * 500 in result
    assert "x" * 501 not in result


def test_build_image_prompt_prompt():
    result = image_generation.build_image_prompt_prompt(
        narrations=["narration one", "narration two"],
        min_words=50,
        max_words=100,
    )
    assert isinstance(result, str) and len(result) > 0
    assert "{narrations_json}" not in result
    assert "{narrations_count}" not in result
    assert "2" in result  # count of narrations
    assert "narration one" in result


def test_build_video_prompt_prompt():
    result = video_generation.build_video_prompt_prompt(
        narrations=["scene A", "scene B", "scene C"],
        min_words=40,
        max_words=90,
    )
    assert isinstance(result, str) and len(result) > 0
    assert "{narrations_json}" not in result
    assert "{narrations_count}" not in result
    assert "3" in result
    assert "scene A" in result


def test_build_asset_script_prompt_without_title():
    result = asset_script_generation.build_asset_script_prompt(
        intent="Showcase product features",
        duration=30,
        assets_text="/img/a.png — product shot",
    )
    assert isinstance(result, str) and len(result) > 0
    assert "{intent}" not in result
    assert "{duration}" not in result
    assert "{assets_text}" not in result
    assert "30" in result
    assert "Showcase product features" in result


def test_build_asset_script_prompt_with_title():
    result = asset_script_generation.build_asset_script_prompt(
        intent="Demo",
        duration=15,
        assets_text="/img/a.png",
        title="My Title",
    )
    assert "My Title" in result


def test_build_style_conversion_prompt():
    result = style_conversion.build_style_conversion_prompt(
        description="赛博朋克风格，霓虹灯"
    )
    assert isinstance(result, str) and len(result) > 0
    assert "{description}" not in result
    assert "赛博朋克风格，霓虹灯" in result


# ---------------------------------------------------------------------------
# 4. Image style presets (image_generation specific)
# ---------------------------------------------------------------------------
def test_image_style_presets_is_dict():
    presets = image_generation.IMAGE_STYLE_PRESETS
    assert isinstance(presets, dict)
    assert len(presets) >= 3
    for key, val in presets.items():
        assert isinstance(key, str)
        assert isinstance(val, dict)
        assert "description" in val


def test_default_image_style_in_presets():
    assert image_generation.DEFAULT_IMAGE_STYLE in image_generation.IMAGE_STYLE_PRESETS


# ---------------------------------------------------------------------------
# 5. JSON schema correctness for structured-output prompts
# ---------------------------------------------------------------------------
def test_content_narration_schema_has_narrations_array():
    schema = content_narration.get_prompt_spec()["json_schema"]
    assert schema is not None
    assert schema["type"] == "object"
    assert "narrations" in schema["properties"]
    assert schema["properties"]["narrations"]["type"] == "array"
    assert "narrations" in schema["required"]


def test_topic_narration_schema_has_narrations_array():
    schema = topic_narration.get_prompt_spec()["json_schema"]
    assert schema is not None
    assert schema["properties"]["narrations"]["type"] == "array"


def test_image_generation_schema_has_image_prompts_array():
    schema = image_generation.get_prompt_spec()["json_schema"]
    assert schema is not None
    assert "image_prompts" in schema["properties"]
    assert schema["properties"]["image_prompts"]["type"] == "array"


def test_video_generation_schema_has_video_prompts_array():
    schema = video_generation.get_prompt_spec()["json_schema"]
    assert schema is not None
    assert "video_prompts" in schema["properties"]


def test_title_generation_schema_is_none():
    # Title is plain text output, no JSON schema
    assert title_generation.get_prompt_spec()["json_schema"] is None


def test_style_conversion_schema_is_none():
    assert style_conversion.get_prompt_spec()["json_schema"] is None


# ---------------------------------------------------------------------------
# 6. __init__.py exports
# ---------------------------------------------------------------------------
def test_init_exports_all_builders():
    expected_builders = [
        "build_content_narration_prompt",
        "build_topic_narration_prompt",
        "build_title_generation_prompt",
        "build_image_prompt_prompt",
        "build_video_prompt_prompt",
        "build_asset_script_prompt",
        "build_style_conversion_prompt",
    ]
    for name in expected_builders:
        assert hasattr(prompts_pkg, name), f"prompts.__init__ missing {name}"
        assert callable(getattr(prompts_pkg, name))


def test_init_exports_style_presets():
    assert hasattr(prompts_pkg, "IMAGE_STYLE_PRESETS")
    assert hasattr(prompts_pkg, "DEFAULT_IMAGE_STYLE")


def test_init_exports_get_prompt_spec_registry():
    """``__init__`` should expose a way to get specs for every module."""
    assert hasattr(prompts_pkg, "get_all_prompt_specs")
    registry = prompts_pkg.get_all_prompt_specs()
    assert isinstance(registry, dict)
    assert len(registry) == 7
    for name, spec in registry.items():
        assert isinstance(name, str)
        assert REQUIRED_SPEC_KEYS <= set(spec.keys())


# ---------------------------------------------------------------------------
# 7. Callable user_template works end-to-end
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("module", PROMPT_MODULES, ids=lambda m: m.__name__)
def test_user_template_callable_when_callable(module):
    user_template = module.get_prompt_spec()["user_template"]
    if callable(user_template):
        sig = inspect.signature(user_template)
        # Should accept at least one positional arg
        assert len(sig.parameters) >= 1
