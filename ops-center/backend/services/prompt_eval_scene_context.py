"""PromptEval 场景上下文服务（Python）— 对齐 story-context-engine.js 白名单键语义（轻量规则版）。"""
from __future__ import annotations

import re

# 白名单键（与桌面端 story-context-engine 对齐）
SCENE_CONTEXT_KEYS = [
    "genre", "era", "culture", "setting", "time", "characters",
    "props", "visual_style", "tone", "summary", "anchors", "negative_anchors",
]

_ERA_RULES = [
    ("唐朝", ["唐", "唐代", "盛唐", "长安"]),
    ("宋朝", ["宋", "宋代", "北宋", "南宋", "汴京"]),
    ("明朝", ["明", "明代", "大明"]),
    ("清朝", ["清", "清代", "大清", "康乾"]),
    ("民国", ["民国"]),
    ("现代", ["现代", "当代", "都市", "手机", "汽车", "电脑"]),
]
_CULTURE_RULES = [
    ("中国", ["中国", "中华", "长安", "北京", "江南", "西域"]),
    ("日本", ["日本", "东京", "武士", "和服"]),
    ("欧美", ["欧洲", "美国", "伦敦", "巴黎", "纽约"]),
]
_NEGATIVE_ANCHORS = ["现代电器", "英文文字", "西方服饰", "电烤箱", "微波炉", "西式厨房"]
_VISUAL_STYLES = [
    ("写实", ["写实", "现实", "photo", "摄影"]),
    ("古风", ["古风", "水墨", "工笔"]),
    ("动漫", ["动漫", "二次元", "卡通", "anime"]),
    ("电影感", ["电影", "cinematic", "氛围光"]),
]
_TONES = [
    ("温暖", ["温暖", "温馨", "炊烟"]),
    ("沉重", ["沉重", "悲", "战乱", "雪"]),
    ("宁静", ["宁静", "安静", "清晨", "暮色"]),
]


def extract_scene_context(full_text: str, scene_text: str | None = None) -> dict:
    """从整篇文案提取场景上下文（白名单键）。异常不抛出：结果含 degraded 标记由调用方处理。"""
    text = full_text or ""
    ctx: dict = {}
    era = next((name for name, kws in _ERA_RULES if any(k in text for k in kws)), "")
    if era:
        ctx["era"] = era
    culture = next((name for name, kws in _CULTURE_RULES if any(k in text for k in kws)), "")
    if culture:
        ctx["culture"] = culture
    style = next((name for name, kws in _VISUAL_STYLES if any(k in text for k in kws)), "")
    if style:
        ctx["visual_style"] = style
    tone = next((name for name, kws in _TONES if any(k in text for k in kws)), "")
    if tone:
        ctx["tone"] = tone
    summary = (scene_text or text).strip()[:200]
    if summary:
        ctx["summary"] = summary
    neg = [a for a in _NEGATIVE_ANCHORS if a not in (scene_text or "")]
    if neg:
        ctx["negative_anchors"] = neg
    ctx["genre"] = "故事"
    # 白名单过滤：只保留已知键
    return {k: v for k, v in ctx.items() if k in SCENE_CONTEXT_KEYS}


def assert_known_keys(context: dict) -> None:
    unknown = set(context.keys()) - set(SCENE_CONTEXT_KEYS)
    if unknown:
        raise ValueError(f"scene_context 包含未知键: {sorted(unknown)}")
