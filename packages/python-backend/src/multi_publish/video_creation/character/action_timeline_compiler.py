"""Action timeline compilation — pure scheduling math.

Extracted from ``character_animation.py`` (Phase 5.3 refactor). Before
extraction this logic lived inside ``ActionTimelineCompiler.execute()`` mixed
with ``_write_json`` I/O and ``ToolResult`` construction — making the
scheduling arithmetic untestable without file I/O.

The extracted ``compile_action_timeline`` is pure: no I/O, no ``time.time()``,
deterministic given inputs. The original method delegates here for the
artifact construction and only retains the I/O wrapper.
"""

from __future__ import annotations

from typing import Any


def compile_action_timeline(
    scene_plan: dict[str, Any],
    character_ids: list[str],
    fps: int,
    tool_name: str,
) -> dict[str, Any]:
    """Build an ``action_timeline`` artifact from a ``scene_plan``.

    For each scene in ``scene_plan["scenes"]`` and each character in
    ``character_ids``, emit three actions (anticipate/react → perform/follow →
    settle) at fixed fractions of the scene duration. Secondary characters
    (index > 0) are offset by ``min(duration * 0.08 * index, duration * 0.2)``
    so they react slightly after the primary.

    Pure: returns a new dict, performs no I/O.
    """
    scenes: list[dict[str, Any]] = []
    for scene in scene_plan.get("scenes", []):
        start_s = scene.get("start_seconds", 0)
        end_s = scene.get("end_seconds", start_s + 3)
        duration = max(0.1, end_s - start_s)
        actions: list[dict[str, Any]] = []
        for index, character_id in enumerate(character_ids):
            offset = min(duration * 0.08 * index, duration * 0.2)
            is_primary = index == 0
            actions.extend(
                [
                    {
                        "at_seconds": start_s + offset,
                        "duration_seconds": min(0.5, duration / 4),
                        "character_id": character_id,
                        "action": "anticipate" if is_primary else "react",
                        "pose": "idle",
                        "easing": "power2.out",
                    },
                    {
                        "at_seconds": start_s + duration * 0.25 + offset,
                        "duration_seconds": duration * 0.35,
                        "character_id": character_id,
                        "action": "perform" if is_primary else "follow",
                        "pose": ("surprised" if scene.get("hero_moment") or not is_primary else "look_right"),
                        "easing": "back.out",
                        "notes": scene.get("description", ""),
                    },
                    {
                        "at_seconds": start_s + duration * 0.7 + offset,
                        "duration_seconds": duration * 0.25,
                        "character_id": character_id,
                        "action": "settle",
                        "pose": "idle",
                        "easing": "power2.inOut",
                    },
                ]
            )
        scenes.append(
            {
                "scene_id": scene["id"],
                "start_seconds": start_s,
                "end_seconds": end_s,
                "camera": {"framing": scene.get("framing", "medium")},
                "background": scene.get("description", ""),
                "effects": [],
                "actions": actions,
            }
        )
    return {
        "version": "1.0",
        "fps": fps,
        "scenes": scenes,
        "metadata": {"source": tool_name},
    }
