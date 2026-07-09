"""Video analysis brief construction — pure computation.

Extracted from ``video_analyzer.py`` (Phase 5.3 refactor). Before extraction
this logic lived inside ``VideoAnalyzer.execute()`` (a 470-line orchestration
method) and a handful of ``_xxx`` helper methods. The orchestration method
mixed pure dict/list/arithmetic construction with cv2 / ffmpeg / six sibling
Tool calls and ``time.time()`` — making the brief construction untestable
without mocking the entire analysis pipeline.

The extracted functions here are pure: no I/O, no subprocess, no ``time.time()``,
no sibling-Tool calls. Deterministic given inputs. The original
``VideoAnalyzer`` methods delegate here and retain only the I/O wrapper.

Function groups:
- Platform helpers: ``is_url`` / ``detect_platform`` / ``is_youtube``
- Scheduling helpers: ``compute_keyframe_timestamps`` / ``timestamp_to_scene``
- Classification helpers: ``classify_pacing`` / ``suggest_pipeline`` /
  ``estimate_complexity`` / ``needs_motion``
- Brief builders: ``build_initial_brief`` / ``build_scene_list`` /
  ``build_pacing_profile`` / ``build_replication_guidance`` /
  ``build_narration_style`` / ``apply_style_profile_defaults``
"""

from __future__ import annotations

from typing import Any


# ─── Platform helpers ──────────────────────────────────────


def is_url(source: str) -> bool:
    """Check if source is a URL vs local file."""
    return source.startswith(("http://", "https://", "www."))


def detect_platform(source: str) -> str:
    """Detect platform from URL (or return 'local_file' for non-URLs)."""
    if not is_url(source):
        return "local_file"
    s = source.lower()
    if "youtube.com/shorts" in s:
        return "shorts"
    if "youtube.com" in s or "youtu.be" in s:
        return "youtube"
    if "instagram.com" in s:
        return "instagram"
    if "tiktok.com" in s:
        return "tiktok"
    return "other_url"


def is_youtube(platform: str) -> bool:
    """Return True for YouTube and Shorts platforms."""
    return platform in ("youtube", "shorts")


# ─── Keyframe scheduling ───────────────────────────────────


def compute_keyframe_timestamps(scenes: list[dict], max_frames: int, depth: str) -> list[float]:
    """Compute optimal keyframe timestamps from scene boundaries.

    For each scene: emit the first frame (start + 0.1s); add the midpoint for
    scenes longer than 3s; for ``deep`` depth add the 25% and 75% points for
    scenes longer than 6s. Timestamps are deduplicated, sorted, and uniformly
    subsampled to ``max_frames`` if exceeded.
    """
    timestamps: list[float] = []

    for scene in scenes:
        start = scene.get("start_seconds", 0)
        end = scene.get("end_seconds", 0)
        duration = end - start

        # First frame of each scene
        timestamps.append(start + 0.1)

        # Midpoint for scenes > 3 seconds
        if duration > 3.0:
            timestamps.append(start + duration / 2)

        # For deep analysis, add more intra-scene samples
        if depth == "deep" and duration > 6.0:
            timestamps.append(start + duration * 0.25)
            timestamps.append(start + duration * 0.75)

    # Deduplicate, sort, and limit
    timestamps = sorted(set(round(t, 3) for t in timestamps))
    if len(timestamps) > max_frames:
        # Uniform subsample to max_frames
        step = len(timestamps) / max_frames
        timestamps = [timestamps[int(i * step)] for i in range(max_frames)]

    return timestamps


def timestamp_to_scene(ts: float, scenes: list[dict]) -> int:
    """Map a timestamp to its scene index (inclusive boundaries).

    Returns the ``index`` (or ``scene_index``) of the first scene whose
    ``[start_seconds, end_seconds]`` range contains ``ts``; returns 0 if no
    scene contains it.
    """
    for scene in scenes:
        start = scene.get("start_seconds", 0)
        end = scene.get("end_seconds", 0)
        if start <= ts <= end:
            return scene.get("index", scene.get("scene_index", 0))
    return 0


# ─── Classification helpers ────────────────────────────────


def classify_pacing(durations: list[float]) -> str:
    """Classify pacing style from scene durations.

    - avg > 10  → slow_contemplative
    - avg > 5   → steady_educational
    - avg > 2   → dynamic_social
    - else      → rapid_fire
    - empty     → variable
    """
    if not durations:
        return "variable"
    avg = sum(durations) / len(durations)
    if avg > 10:
        return "slow_contemplative"
    if avg > 5:
        return "steady_educational"
    if avg > 2:
        return "dynamic_social"
    return "rapid_fire"


def suggest_pipeline(brief: dict) -> str:
    """Suggest the best pipeline based on content analysis.

    Short-form platforms (shorts/tiktok/instagram) → 'animation'.
    Slow contemplative pacing → 'cinematic'.
    Otherwise → 'animated-explainer'.
    """
    platform = brief["source"]["type"]
    pacing = brief["structure_analysis"].get("pacing_profile", {}).get("pacing_style", "")

    if platform in ("shorts", "tiktok", "instagram"):
        return "animation"  # Short-form → animation pipeline works well
    if pacing in ("slow_contemplative",):
        return "cinematic"
    return "animated-explainer"


def estimate_complexity(brief: dict) -> str:
    """Estimate how complex it would be to recreate this style.

    - duration > 300s OR scenes > 30 → 'complex'
    - duration > 120s OR scenes > 15 → 'moderate'
    - else                            → 'simple'
    """
    scenes = brief["structure_analysis"]["total_scenes"]
    duration = brief["source"]["duration_seconds"]

    if duration > 300 or scenes > 30:
        return "complex"
    if duration > 120 or scenes > 15:
        return "moderate"
    return "simple"


def needs_motion(brief: dict) -> bool:
    """Determine if motion (video gen or Remotion) is required.

    If per-scene motion data exists: True when ≥30% of scenes are
    'motion_clip'. Otherwise: True when pacing is dynamic_social or
    rapid_fire.
    """
    # If we have per-scene motion data, use it — majority motion_clip = motion required
    scenes = brief["structure_analysis"].get("scenes", [])
    motion_scenes = [s for s in scenes if s.get("motion_type") == "motion_clip"]
    if scenes and motion_scenes:
        return len(motion_scenes) / len(scenes) >= 0.3
    # Fallback to pacing heuristic
    pacing = brief["structure_analysis"].get("pacing_profile", {}).get("pacing_style", "")
    return pacing in ("dynamic_social", "rapid_fire")


# ─── Brief builders ────────────────────────────────────────


def build_initial_brief(platform: str, source: str, is_url: bool) -> dict:
    """Construct the initial ``VideoAnalysisBrief`` skeleton.

    ``source`` is recorded under ``source.url`` when ``is_url`` is True,
    otherwise under ``source.local_path``. (The ``is_url`` parameter shadows
    the module-level ``is_url()`` function within this scope — intentional,
    since this builder does not call that function.)
    """
    brief: dict[str, Any] = {
        "version": "1.0",
        "source": {
            "type": platform,
            "duration_seconds": 0,
        },
        "content_analysis": {
            "summary": "",
            "topics": [],
            "target_audience": "general",
        },
        "structure_analysis": {
            "total_scenes": 0,
            "scenes": [],
            "pacing_profile": {},
        },
    }
    if is_url:
        brief["source"]["url"] = source
    else:
        brief["source"]["local_path"] = source
    return brief


def build_scene_list(scenes: list[dict]) -> list[dict]:
    """Map raw scene-detection output into brief scene entries.

    Each entry has ``scene_index`` (from ``index`` or ``scene_index`` key,
    defaulting to 0), ``start_time`` / ``end_time`` (from the ``_seconds``
    keys), and placeholder ``description`` / ``visual_type`` / ``energy_level``
    fields for the agent to fill via vision.
    """
    return [
        {
            "scene_index": scene.get("index", scene.get("scene_index", 0)),
            "start_time": scene.get("start_seconds", 0),
            "end_time": scene.get("end_seconds", 0),
            "description": "",  # Agent fills this via vision
            "visual_type": "other",  # Agent classifies via vision
            "energy_level": "medium",
        }
        for scene in scenes
    ]


def build_pacing_profile(durations: list[float], total_duration: float) -> dict:
    """Compute the pacing profile from per-scene durations.

    Returns an empty dict when ``durations`` is empty (caller should treat a
    falsy return as "no pacing data"). Otherwise returns a dict with
    avg/shortest/longest scene duration, cuts-per-minute, and pacing style.
    """
    if not durations:
        return {}
    return {
        "avg_scene_duration_seconds": round(sum(durations) / len(durations), 2),
        "shortest_scene_seconds": round(min(durations), 2),
        "longest_scene_seconds": round(max(durations), 2),
        "cuts_per_minute": round(len(durations) / (total_duration / 60), 2) if total_duration > 0 else 0,
        "pacing_style": classify_pacing(durations),
    }


def build_replication_guidance(brief: dict) -> dict:
    """Build the ``replication_guidance`` block of the brief.

    Delegates to ``suggest_pipeline`` / ``estimate_complexity`` /
    ``needs_motion`` for the computed fields; seeds the agent-fill lists
    as empty.
    """
    return {
        "suggested_pipeline": suggest_pipeline(brief),
        "suggested_playbook": "flat-motion-graphics",
        "key_elements_to_replicate": [],  # Agent fills via analysis
        "elements_requiring_custom_work": [],
        "estimated_complexity": estimate_complexity(brief),
        "motion_required": needs_motion(brief),
        "creative_differentiation_seeds": [],  # Agent fills
    }


def build_narration_style(
    transcript_data: Any,
    duration: float,
    fallback_word_count: int = 0,
) -> dict | None:
    """Build the ``narration_style`` block from transcript data.

    Returns ``None`` when there is no transcript (caller should skip
    assignment). When ``transcript_data`` is a dict, reads ``word_count``
    from it; otherwise uses ``fallback_word_count``. Words-per-minute is
    ``word_count / (duration / 60)`` (0 when duration ≤ 0).
    """
    if not transcript_data:
        return None
    wc = (
        transcript_data.get("word_count", 0)
        if isinstance(transcript_data, dict)
        else fallback_word_count
    )
    wpm = round(wc / (duration / 60), 1) if duration > 0 else 0
    return {
        "has_narration": wc > 20,
        "speaker_count": 1,  # Agent refines via analysis
        "delivery_style": "",  # Agent fills
        "words_per_minute": wpm,
    }


def apply_style_profile_defaults(style_profile: dict) -> dict:
    """Apply default values for unset ``style_profile`` fields.

    Mutates ``style_profile`` in place (matching the original ``setdefault``
    behavior) and returns it for convenience. Existing values are preserved.
    """
    style_profile.setdefault(
        "color_palette",
        {
            "primary_colors": [],
            "accent_colors": [],
            "overall_mood": "",
        },
    )
    style_profile.setdefault("typography_observed", "")
    style_profile.setdefault("transition_types", [])
    style_profile.setdefault("music_style", "")
    style_profile.setdefault("subtitle_style", "")
    style_profile.setdefault("production_quality", "prosumer")
    style_profile.setdefault("closest_playbook", "")
    style_profile.setdefault("playbook_delta", "")
    return style_profile
