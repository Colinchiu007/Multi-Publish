"""PromptEval 评估服务 — 视觉评估 + 白名单校验 fail closed（对齐桌面端契约）。"""
from __future__ import annotations

import base64
import json

import httpx

from services import prompt_eval_contract as contract

EVAL_SYSTEM = (
    "你是专业的 AI 生成图像评估专家。你负责评估「提示词优化引擎」的输出效果："
    "给定原始文案、整个文案上下文、优化后的提示词（中英对照）和生成的图片，"
    "给出客观、严格、可复核的评估结果，并输出严格 JSON（不要输出任何 JSON 以外的文字）。"
)


class EvaluationError(Exception):
    pass


def build_eval_prompt(source_text: str, context: str | None, prompt_zh: str, prompt_en: str | None, image_count: int, media_type: str = "image") -> str:
    if media_type == "video":
        return _build_video_eval_prompt(source_text, context, prompt_zh, prompt_en)
    dims = contract.resolve_dimension_weights(image_count)
    cross = image_count >= 2
    dimension_lines = [
        "1. relevance 提示-输出关联度（权重 30%）：图片与「原始文案+上下文+优化后提示词」整体语义的吻合程度。",
        "2. content_accuracy 内容准确性（权重 30%）：关键元素（主体/动作/场景/数量/风格/色彩/文字/道具）是否准确呈现，是否出现幻觉或缺失。",
        "3. aesthetic_quality 视觉审美质量（权重 20%）：构图、光影、色彩和谐、清晰度、细节质量、风格执行度。",
    ]
    if cross:
        dimension_lines.append("4. cross_image_consistency 跨图上下文一致性（权重 20%，仅多图）：同一文案的多张图片之间角色外观、视觉风格、色调/氛围、场景衔接是否连续一致。")
    dim_ids = "|".join(d["id"] for d in dims)
    return "\n".join([
        "【角色】" + EVAL_SYSTEM,
        "【输入快照】",
        f"- 原始文案：{source_text or ''}",
        f"- 文案上下文：{context or '（未提供）'}",
        f"- 优化后的提示词（中文）：{prompt_zh or ''}",
        f"- 优化后的提示词（英文对照）：{prompt_en or '（未提供）'}",
        f"- 图片数：{image_count}",
        "【评分标准】（每个维度 0-100 整数）",
        *dimension_lines,
        "【输出 JSON 契约】",
        '{ "overall": 0-100整数, "dimensions": [ { "id": "' + dim_ids + '", "score": 0-100整数, "evidence": "非空", "issues": [], "suggestions": [] } ], "problems": [], "promptOptimizationPoints": [] }',
        "【约束】problems 与 promptOptimizationPoints 可以为空数组但不得省略键；分数必须 0-100 整数；evidence 必须引用图片中实际可见的内容。",
    ])


def _build_video_eval_prompt(source_text: str, context: str | None, prompt_zh: str, prompt_en: str | None) -> str:
    """视频评估模板：固定 4 视频维度，输入为首/中/尾 3 帧（按帧序列判断时序与运动）。"""
    dims = contract.resolve_video_dimension_weights()
    dim_ids = "|".join(d["id"] for d in dims)
    return "\n".join([
        "【角色】" + EVAL_SYSTEM,
        "【输入快照】",
        f"- 原始文案：{source_text or ''}",
        f"- 文案上下文：{context or '（未提供）'}",
        f"- 优化后的提示词（中文）：{prompt_zh or ''}",
        f"- 优化后的提示词（英文对照）：{prompt_en or '（未提供）'}",
        "- 视频抽帧：3 张（首/中/尾，按时间顺序），代表生成的视频片段",
        "【评分标准】（每个维度 0-100 整数）",
        "1. temporal_consistency 时序一致性（权重 30%）：首/中/尾三帧之间主体、场景、动作是否时序连续，无跳变、闪烁或突变。",
        "2. motion_accuracy 运动准确性（权重 30%）：动作与运动轨迹是否符合提示词描述（运动方式/方向/速度），是否出现形变、扭曲或不合理运动。",
        "3. audio_visual_sync 音画同步（权重 20%）：画面叙事节奏与同步线索是否协调（基于画面帧评估；独立音轨评估为后续版本）。",
        "4. video_aesthetic_quality 视频审美质量（权重 20%）：构图、光影、色彩、镜头运动、画质细节与风格执行度。",
        "【输出 JSON 契约】",
        '{ "overall": 0-100整数, "dimensions": [ { "id": "' + dim_ids + '", "score": 0-100整数, "evidence": "非空", "issues": [], "suggestions": [] } ], "problems": [], "promptOptimizationPoints": [] }',
        "【约束】problems 与 promptOptimizationPoints 可以为空数组但不得省略键；分数必须 0-100 整数；evidence 必须引用帧中实际可见的内容，时序/运动判断必须基于三帧之间的差异。",
    ])


_MIME_BY_EXT = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".bmp": "image/bmp"}


def _mime_for(data: bytes) -> str:
    from services.prompt_eval_generation_service import ext_for_magic
    ext = ext_for_magic(data) or ".png"
    return _MIME_BY_EXT.get(ext, "image/png")


def build_vision_messages(prompt: str, images: list[bytes]) -> list[dict]:
    content: list[dict] = [{"type": "text", "text": prompt}]
    for data in images:
        content.append({"type": "image_url", "image_url": {"url": "data:" + _mime_for(data) + ";base64," + base64.b64encode(data).decode("ascii")}})
    return [{"role": "user", "content": content}]


def parse_and_validate(raw: str, image_count: int, media_type: str = "image") -> dict:
    """解析评估 LLM 输出并 fail closed 校验，返回归一化结果。"""
    text = raw.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.startswith("json"):
            text = text[4:].strip()
    try:
        parsed = json.loads(text)
    except Exception as e:
        raise EvaluationError(f"评估输出不是合法 JSON: {e}")
    try:
        contract.validate_eval_result(parsed, image_count, media_type=media_type)
    except ValueError as e:
        raise EvaluationError(str(e))
    return {
        "overall": parsed["overall"],
        "dimensions": parsed["dimensions"],
        "problems": parsed["problems"],
        "promptOptimizationPoints": parsed["promptOptimizationPoints"],
    }


async def evaluate_images(cfg: dict, prompt: str, images: list[bytes], http: httpx.AsyncClient | None = None) -> str:
    """调用视觉评估 LLM，返回原始文本。"""
    base_url = str(cfg.get("base_url") or "").rstrip("/")
    if not base_url:
        raise EvaluationError("未配置评估服务 base_url")
    model = cfg.get("model") or "MiniMax-M2.7"
    api_key = cfg.get("api_key") or ""
    url = f"{base_url}/chat/completions"
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    body = {"model": model, "messages": build_vision_messages(prompt, images), "temperature": 0, "max_tokens": 4000}
    own_client = http is None
    client = http or httpx.AsyncClient(timeout=180)
    try:
        resp = await client.post(url, json=body, headers=headers)
        if resp.status_code >= 400:
            raise EvaluationError(f"评估服务返回 {resp.status_code}: {resp.text[:200]}")
        data = resp.json()
        content = (data.get("choices") or [{}])[0].get("message", {}).get("content", "")
        return str(content)
    finally:
        if own_client:
            await client.aclose()
