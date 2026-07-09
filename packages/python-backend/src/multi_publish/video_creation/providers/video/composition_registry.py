"""composition_registry.py — Remotion 组合 ID 注册表（从 video_compose.py 提取，Phase 5.2）。

职责：
  - RENDERER_FAMILY_MAP：renderer_family → Remotion composition ID 映射
  - get_composition_id：解析 renderer_family，未知则抛 ValueError

提取前：VideoCompose.RENDERER_FAMILY_MAP + VideoCompose._get_composition_id (classmethod)
提取后：VideoCompose 保留 classmethod 薄委托 wrapper，保持向后兼容
"""
from __future__ import annotations

# Only compositions registered in remotion-composer/src/Root.tsx are valid.
# Current compositions: Explainer, CinematicRenderer, TalkingHead
RENDERER_FAMILY_MAP: dict[str, str] = {
    "explainer-data": "Explainer",
    "explainer-teacher": "Explainer",
    "cinematic-trailer": "CinematicRenderer",
    "documentary-montage": "CinematicRenderer",
    "product-reveal": "Explainer",
    "screen-demo": "Explainer",
    "presenter": "TalkingHead",
    "animation-first": "Explainer",
}


def get_composition_id(renderer_family: str) -> str:
    """Resolve renderer_family to Remotion composition ID.

    Raises ValueError if renderer_family is not recognized — the caller
    must set it at proposal stage.
    """
    comp = RENDERER_FAMILY_MAP.get(renderer_family)
    if comp is None:
        raise ValueError(
            f"Unknown renderer_family {renderer_family!r}. "
            f"Valid families: {sorted(RENDERER_FAMILY_MAP)}. "
            f"Set renderer_family at proposal stage."
        )
    return comp
