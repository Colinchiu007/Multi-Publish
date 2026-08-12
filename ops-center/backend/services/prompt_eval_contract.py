"""PromptEval 契约常量（与桌面端 prompt-eval/dimensions.js 对齐，两端一致性测试断言）。"""
from __future__ import annotations

IMAGE_DIMENSIONS = [
    {"id": "relevance", "label": "提示-输出关联度", "weight": 0.30},
    {"id": "content_accuracy", "label": "内容准确性", "weight": 0.30},
    {"id": "aesthetic_quality", "label": "视觉审美质量", "weight": 0.20},
    {"id": "cross_image_consistency", "label": "跨图上下文一致性", "weight": 0.20},
]

VIDEO_DIMENSIONS = [
    {"id": "temporal_consistency", "label": "时序一致性", "weight": 0.30},
    {"id": "motion_accuracy", "label": "运动准确性", "weight": 0.30},
    {"id": "audio_visual_sync", "label": "音画同步", "weight": 0.20},
    {"id": "video_aesthetic_quality", "label": "视频审美质量", "weight": 0.20},
]

GRADES = [("excellent", 85), ("good", 70), ("fair", 50), ("poor", 0)]

PROBLEM_CATEGORIES = [
    "content_missing", "content_wrong", "style_deviation", "layout_composition",
    "color_lighting", "text_rendering", "ambiguity", "context_loss",
    "consistency_break", "quality_defect", "unknown",
]

PROMPT_PART_VALUES = ["source_text", "context", "optimized_prompt", "negative_prompt", "unknown"]

OPTIMIZATION_POINT_TYPES = [
    "add_specificity", "resolve_ambiguity", "enforce_style", "align_context",
    "add_negative", "structure_ordering", "consistency_anchor",
]

SEVERITIES = ["critical", "major", "minor"]

ASPECT_RATIOS = ["1:1", "16:9", "9:16", "3:4", "4:3"]
MAX_SOURCE_TEXT = 20000
MAX_PROMPT_ZH = 5000
MAX_CONTEXT = 20000
MAX_IMAGE_COUNT = 20
MIN_IMAGE_COUNT = 1
TRANSLATION_CACHE_SECONDS = 7 * 24 * 3600

SENSITIVE_KEYS = [
    "password", "token", "secret", "api_key", "apikey", "credential",
    "credentials", "authorization", "cookie", "cookies",
]


def grade_for_score(score: float) -> str:
    """0-100 → 等级（≥85 优秀 / ≥70 良好 / ≥50 一般 / <50 差）。"""
    s = round(score)
    if not (0 <= s <= 100):
        raise ValueError("score 必须在 0-100")
    for grade, threshold in GRADES:
        if s >= threshold:
            return grade
    return "poor"


def resolve_dimension_weights(image_count: int):
    """单图（<2）时跨图一致性不参与，权重归一化 0.375/0.375/0.25。"""
    dims = IMAGE_DIMENSIONS if image_count >= 2 else [d for d in IMAGE_DIMENSIONS if d["id"] != "cross_image_consistency"]
    total = sum(d["weight"] for d in dims)
    return [{**d, "weight": round(d["weight"] / total, 5)} for d in dims]


def _contains_sensitive(value, prefix="", seen=None) -> list[str]:
    """递归检查敏感键，返回命中路径列表。"""
    seen = seen if seen is not None else set()
    hits: list[str] = []
    if isinstance(value, dict):
        for k, v in value.items():
            path = f"{prefix}.{k}" if prefix else str(k)
            if any(kw in k.lower() for kw in SENSITIVE_KEYS):
                hits.append(path)
            if isinstance(v, (dict, list)) and id(v) not in seen:
                seen.add(id(v))
                hits.extend(_contains_sensitive(v, path, seen))
    elif isinstance(value, list):
        for i, v in enumerate(value):
            path = f"{prefix}[{i}]"
            if isinstance(v, (dict, list)) and id(v) not in seen:
                seen.add(id(v))
                hits.extend(_contains_sensitive(v, path, seen))
    return hits


def assert_no_sensitive_context(context, field="context") -> None:
    """context 递归敏感键过滤：命中即抛 ValueError。"""
    hits = _contains_sensitive(context)
    if hits:
        raise ValueError(f"{field} 包含敏感字段，已拒绝: {','.join(hits)}")


def validate_problem(p: dict) -> None:
    if not isinstance(p, dict):
        raise ValueError("problem 必须是对象")
    if p.get("severity") not in SEVERITIES:
        raise ValueError("invalid problem.severity")
    if p.get("category") not in PROBLEM_CATEGORIES:
        raise ValueError("invalid problem.category")
    if not isinstance(p.get("description"), str) or not p["description"].strip():
        raise ValueError("problem.description 必须是非空字符串")
    if p.get("promptPart") not in PROMPT_PART_VALUES:
        raise ValueError("invalid problem.promptPart")


def validate_optimization_point(p: dict) -> None:
    if not isinstance(p, dict):
        raise ValueError("optimization point 必须是对象")
    if p.get("type") not in OPTIMIZATION_POINT_TYPES:
        raise ValueError("invalid optimization point type")
    if not isinstance(p.get("suggestion"), str) or not p["suggestion"].strip():
        raise ValueError("optimization point suggestion 必须是非空字符串")


def validate_eval_result(payload: dict, image_count: int) -> None:
    """评估输出契约 fail closed：维度/分数/evidence/problems·points 数组校验。"""
    overall = payload.get("overall")
    if not isinstance(overall, (int, float)) or isinstance(overall, bool) or not (0 <= round(overall) <= 100):
        raise ValueError("overall 必须是 0-100 数字")
    dims = payload.get("dimensions")
    if not isinstance(dims, list):
        raise ValueError("dimensions 必须是数组")
    allowed = {d["id"] for d in resolve_dimension_weights(image_count)}
    seen: set[str] = set()
    for dim in dims:
        if not isinstance(dim, dict):
            raise ValueError("dimension 必须是对象")
        if dim.get("id") not in allowed:
            raise ValueError(f"unknown dimension id: {dim.get('id')}")
        if dim["id"] in seen:
            raise ValueError(f"duplicate dimension id: {dim['id']}")
        seen.add(dim["id"])
        score = dim.get("score")
        if not isinstance(score, (int, float)) or isinstance(score, bool) or not (0 <= round(score) <= 100):
            raise ValueError(f"dimension score 越界: {dim.get('id')}")
        if not isinstance(dim.get("evidence"), str) or not dim["evidence"].strip():
            raise ValueError(f"dimension evidence 必须非空: {dim.get('id')}")
    if seen != allowed:
        raise ValueError(f"dimensions 缺失或多余: expected={sorted(allowed)} got={sorted(seen)}")
    if "problems" not in payload or not isinstance(payload["problems"], list):
        raise ValueError("problems 必须为数组")
    for p in payload["problems"]:
        validate_problem(p)
    if "promptOptimizationPoints" not in payload or not isinstance(payload["promptOptimizationPoints"], list):
        raise ValueError("promptOptimizationPoints 必须为数组")
    for p in payload["promptOptimizationPoints"]:
        validate_optimization_point(p)
