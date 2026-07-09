"""subtitle_style.py — 字幕样式解析（从 video_compose.py 提取，Phase 5.2）。

职责：
  - resolve_subtitle_style：分层优先级解析字幕样式
    Priority: explicit_style > edit_decisions.subtitles.style > playbook > defaults
  - DEFAULT_SUBTITLE_STYLE：默认样式常量

提取前：VideoCompose._resolve_subtitle_style (staticmethod)
提取后：VideoCompose._resolve_subtitle_style 变为薄委托 wrapper
"""
from __future__ import annotations

DEFAULT_SUBTITLE_STYLE: dict = {
    "font": "Inter",
    "font_size": 28,
    "bold": True,
    "outline_width": 2,
    "shadow": 0,
    "margin_v": 40,
    "alignment": 2,
}


def resolve_subtitle_style(
    explicit_style: dict | None,
    edit_decisions: dict | None,
    playbook: dict | None,
) -> dict:
    """Resolve subtitle style with layered priority.

    Priority: explicit_style > edit_decisions.subtitles.style > playbook > defaults.
    This prevents every video from looking identical (Arial bold white).
    """
    # Start with minimal fallback defaults (copy to avoid mutation)
    resolved = dict(DEFAULT_SUBTITLE_STYLE)

    # Layer 1: Playbook-derived style
    if playbook:
        typo = playbook.get("typography", {})
        colors = playbook.get("visual_language", {}).get("color_palette", {})
        if typo.get("body", {}).get("family"):
            resolved["font"] = typo["body"]["family"]
        if colors.get("text"):
            resolved["primary_color"] = colors["text"]
        if colors.get("background"):
            resolved["outline_color"] = colors["background"]
            # Semi-transparent background for readability
            bg = colors["background"]
            resolved["back_color"] = bg

    # Layer 2: edit_decisions subtitle style
    if edit_decisions:
        ed_style = edit_decisions.get("subtitles", {}).get("style", {})
        for k, v in ed_style.items():
            if v is not None:
                resolved[k] = v

    # Layer 3: Explicit override (highest priority)
    if explicit_style:
        for k, v in explicit_style.items():
            if v is not None:
                resolved[k] = v

    return resolved
