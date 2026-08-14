"""prompt_eval_engine_client — prompt-engine HTTP 客户端（双路对比 engine 变体）。

契约（对齐 prompt-engine POST /v1/optimize）：
- 请求：{prompt, platform, creative_level, max_length, num_candidates, context, excluded_characters, no_swap_pairs}
- 成功：200 + OptimizeResult（optimized_prompt 非空字符串）
- 失败：超时/传输错误/5xx/非法 JSON/空输出/引擎内部 error 字段 → EngineUnavailableError
  （fail closed，不静默降级到人工提示词）
"""
from __future__ import annotations

import json
import logging
import os
import time

import httpx

logger = logging.getLogger("ops-center.prompt-eval.engine")

ENGINE_UNAVAILABLE = "OPS_PROMPT_EVAL_ENGINE_UNAVAILABLE"
DEFAULT_BASE_URL = "http://prompt-engine:8013"
OPTIMIZE_TIMEOUT_SECONDS = 20
HEALTH_TIMEOUT_SECONDS = 5
MAX_RETRIES = 1  # 单次重试（有界）

_RETRYABLE_STATUS = {500, 502, 503, 504}


class EngineUnavailableError(Exception):
    """引擎不可达/非法输出。stage 标记失败阶段（engine_optimize / engine_health）。"""

    def __init__(self, message: str, stage: str = "engine_optimize"):
        super().__init__(message)
        self.stage = stage


def engine_base_url() -> str:
    return (os.environ.get("OPS_PROMPT_ENGINE_BASE_URL") or DEFAULT_BASE_URL).rstrip("/")


def _context_payload(context) -> dict | None:
    """case.context 透传：JSON 字符串 → dict；普通字符串 → full_text 白名单键（≤500 字）。"""
    if context is None:
        return None
    if isinstance(context, dict):
        return context or None
    text = str(context).strip()
    if not text:
        return None
    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict) and parsed:
            return parsed
    except (ValueError, TypeError):
        pass
    return {"full_text": text[:500]}


async def optimize(
    base_url: str,
    source_text: str,
    context=None,
    creative_level: int = 8,
    num_candidates: int = 3,
    max_length: int = 500,
    excluded_characters: list | None = None,
    no_swap_pairs: list | None = None,
    http: httpx.AsyncClient | None = None,
) -> dict:
    """调用引擎优化单条提示词，返回 OptimizeResult dict；失败抛 EngineUnavailableError。"""
    url = f"{base_url}/v1/optimize"
    payload = {
        "prompt": source_text,
        "platform": "generic",
        "creative_level": creative_level,
        "max_length": max_length,
        "num_candidates": num_candidates,
        "context": _context_payload(context),
        "excluded_characters": list(excluded_characters or []),
        "no_swap_pairs": list(no_swap_pairs or []),
    }
    own = http is None
    client = http or httpx.AsyncClient(timeout=OPTIMIZE_TIMEOUT_SECONDS)
    last_err: Exception | None = None
    try:
        for attempt in range(MAX_RETRIES + 1):
            try:
                resp = await client.post(url, json=payload)
                if resp.status_code >= 400:
                    if resp.status_code in _RETRYABLE_STATUS and attempt < MAX_RETRIES:
                        last_err = EngineUnavailableError(f"prompt-engine 返回 HTTP {resp.status_code}", stage="engine_optimize")
                        logger.warning("prompt-engine optimize 5xx（%s），重试 %s/1", resp.status_code, attempt + 1)
                        continue
                    raise EngineUnavailableError(
                        f"prompt-engine 返回 HTTP {resp.status_code}: {resp.text[:200]}", stage="engine_optimize")
                try:
                    data = resp.json()
                except ValueError as e:
                    raise EngineUnavailableError("prompt-engine 返回非法 JSON", stage="engine_optimize") from e
                optimized = data.get("optimized_prompt")
                if not isinstance(optimized, str) or not optimized.strip():
                    raise EngineUnavailableError(
                        "prompt-engine 返回空/非字符串 optimized_prompt（fail closed）", stage="engine_optimize")
                if data.get("error"):
                    # 引擎内部失败会回退原 prompt 并带 error 字段：不静默降级
                    raise EngineUnavailableError(
                        f"prompt-engine 内部错误: {str(data['error'])[:200]}", stage="engine_optimize")
                return data
            except (httpx.TimeoutException, httpx.TransportError) as e:
                last_err = e
                if attempt < MAX_RETRIES:
                    logger.warning("prompt-engine optimize 传输失败，重试 %s/1: %s", attempt + 1, e)
                    continue
                break
        raise EngineUnavailableError(
            f"prompt-engine 不可达: {last_err.__class__.__name__}: {last_err}", stage="engine_optimize")
    finally:
        if own:
            await client.aclose()


async def health(base_url: str, http: httpx.AsyncClient | None = None) -> dict:
    """GET {base}/health → {ok, latency_ms}；失败抛 EngineUnavailableError（不消耗引擎 LLM 配额）。"""
    url = f"{base_url}/health"
    own = http is None
    client = http or httpx.AsyncClient(timeout=HEALTH_TIMEOUT_SECONDS)
    try:
        start = time.monotonic()
        resp = await client.get(url)
        latency = round((time.monotonic() - start) * 1000, 1)
        if resp.status_code == 200:
            return {"ok": True, "latency_ms": latency}
        raise EngineUnavailableError(f"prompt-engine /health 返回 HTTP {resp.status_code}", stage="engine_health")
    except httpx.TimeoutException as e:
        raise EngineUnavailableError("prompt-engine /health 超时", stage="engine_health") from e
    except httpx.TransportError as e:
        raise EngineUnavailableError(f"prompt-engine 不可达: {e.__class__.__name__}: {e}", stage="engine_health") from e
    finally:
        if own:
            await client.aclose()
