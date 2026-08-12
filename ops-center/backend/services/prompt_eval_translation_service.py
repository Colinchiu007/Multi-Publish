"""PromptEval 翻译服务 — LLM 中英对照（source=machine_translation）。"""
from __future__ import annotations

import json

import httpx

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
        text = content.strip()
        if not text:
            raise TranslationError("翻译服务返回空内容")
        return text
    finally:
        if own_client:
            await client.aclose()
