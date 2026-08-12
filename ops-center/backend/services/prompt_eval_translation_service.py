"""PromptEval 翻译服务 — LLM 中英对照（source=machine_translation）。"""
from __future__ import annotations

import json
import re

import httpx

_THINK_RE = re.compile(r"<think>.*?</think>", re.S)


def _strip_think(text: str) -> str:
    """剥离推理模型的 <think>...</think> 思维链块，只保留最终输出。"""
    return _THINK_RE.sub("", text or "").strip()


TRANSLATION_SYSTEM = (
    "你是专业的提示词翻译助手。把给定的中文图片生成提示词翻译成英文，"
    "保留风格、主体、场景、细节与否定词；只输出翻译后的英文文本，不要任何解释。"
)


class TranslationError(Exception):
    pass


async def translate_prompt_zh(cfg: dict, prompt_zh: str, http: httpx.AsyncClient | None = None) -> str:
    """调用 LLM（OpenAI 兼容 chat/completions）翻译，返回英文提示词。"""
    base_url = str(cfg.get("base_url") or "").rstrip("/")
    if not base_url:
        raise TranslationError("未配置翻译服务 base_url")
    model = cfg.get("model") or "MiniMax-M2.7"
    api_key = cfg.get("api_key") or ""
    url = f"{base_url}/chat/completions"
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": TRANSLATION_SYSTEM},
            {"role": "user", "content": prompt_zh},
        ],
        "temperature": 0,
        "max_tokens": 2000,
    }
    own_client = http is None
    client = http or httpx.AsyncClient(timeout=60)
    try:
        resp = await client.post(url, json=body, headers=headers)
        if resp.status_code >= 400:
            raise TranslationError(f"翻译服务返回 {resp.status_code}: {resp.text[:200]}")
        data = resp.json()
        content = (data.get("choices") or [{}])[0].get("message", {}).get("content", "")
        text = _strip_think(content)
        if not text:
            raise TranslationError("翻译服务返回空内容")
        return text
    finally:
        if own_client:
            await client.aclose()


OPTIMIZE_SYSTEM = (
    "你是专业的图片生成提示词优化专家。给定整篇文案、当前场景文字与场景上下文，"
    "生成一句可执行的中文图片生成提示词：保留主体/动作/场景/风格/色彩/细节，融入上下文锚点"
    "（时代/地域/角色/道具/视觉风格），避免与上下文冲突的现代元素。只输出优化后的提示词文本。"
)


async def optimize_scene_prompt(cfg: dict, full_text: str, scene_text: str, scene_context: str,
                                http: httpx.AsyncClient | None = None) -> str:
    """按「整篇原文+场景文字+场景上下文」生成中文优化提示词。"""
    base_url = str(cfg.get("base_url") or "").rstrip("/")
    if not base_url:
        raise TranslationError("未配置优化服务 base_url")
    model = cfg.get("model") or "MiniMax-M2.7"
    api_key = cfg.get("api_key") or ""
    url = f"{base_url}/chat/completions"
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": OPTIMIZE_SYSTEM},
            {"role": "user", "content": "整篇文案：\n" + (full_text or "") + "\n\n场景文字：\n" + (scene_text or "") + "\n\n场景上下文：\n" + (scene_context or "")},
        ],
        "temperature": 0.4,
        "max_tokens": 1500,
    }
    own_client = http is None
    client = http or httpx.AsyncClient(timeout=60)
    try:
        resp = await client.post(url, json=body, headers=headers)
        if resp.status_code >= 400:
            raise TranslationError(f"优化服务返回 {resp.status_code}: {resp.text[:200]}")
        data = resp.json()
        content = (data.get("choices") or [{}])[0].get("message", {}).get("content", "")
        text = _strip_think(content)
        if not text:
            raise TranslationError("优化服务返回空内容")
        return text
    finally:
        if own_client:
            await client.aclose()
