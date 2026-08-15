"""PromptEval 生成服务 — 运营后台服务端直连图片生成 provider。

- provider：minimax-image（image-01）→ MiniMax 专有 /image_generation
  （response_format=base64 → data.image_base64；url → data.image_urls）；
  flux 等 → OpenAI 兼容 /images/generations
- 瞬时错误有界重试 + 429 退避；业务失败（base_resp.status_code != 0）fail closed；
  结果扩展名/魔数校验；落盘本地媒体目录返回可访问 URL/路径
"""
from __future__ import annotations

import asyncio
import base64
import datetime
import os
import pathlib

import httpx

ALLOWED_EXT = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"}
MAX_IMAGE_BYTES = 8 * 1024 * 1024

_MAGIC = {
    "png": bytes([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    "jpg": bytes([0xFF, 0xD8, 0xFF]),
    "webp": b"RIFF",
    "gif": b"GIF8",
    "bmp": b"BM",
}

MAX_RETRIES = 2
RETRY_DELAYS = [0.5, 1.5]


class GenerationError(Exception):
    pass


def ext_for_magic(data: bytes) -> str | None:
    for ext, magic in _MAGIC.items():
        if ext == "webp":
            if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
                return ".webp"
        elif data[: len(magic)] == magic:
            return "." + ext
    return None


def validate_image_bytes(data: bytes) -> bool:
    return bool(data and 8 <= len(data) <= MAX_IMAGE_BYTES and ext_for_magic(data))


def is_retryable_status(status: int) -> bool:
    return status in (429, 500, 502, 503, 504)


def _is_minimax(provider: str, model: str) -> bool:
    """MiniMax image-01 走专有 /image_generation 契约（非 OpenAI 兼容）。"""
    return provider == "minimax-image" or str(model).startswith("image-01")


def build_image_payload(provider: str, model: str, prompt: str, image_count: int, aspect_ratio: str) -> dict:
    """归一化请求体：MiniMax image-01 → /image_generation；其余 → OpenAI 兼容 /images/generations。"""
    if _is_minimax(provider, model):
        if not 1 <= image_count <= 9:
            raise GenerationError("MiniMax image-01 单次生成数量必须是 1-9")
        return {
            "model": model,
            "prompt": prompt,
            "n": image_count,
            "aspect_ratio": aspect_ratio,
            "response_format": "base64",
        }
    return {
        "model": model,
        "prompt": prompt,
        "n": image_count,
        "size": "1024x1024",
        "aspect_ratio": aspect_ratio,
        "response_format": "b64_json",
    }


def _extract_images(payload: dict) -> list[bytes]:
    data = payload.get("data") or []
    images: list[bytes] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        b64 = item.get("b64_json")
        if isinstance(b64, str) and b64:
            images.append(base64.b64decode(b64))
            continue
        url = item.get("url")
        if isinstance(url, str) and url:
            images.append(("url:" + url).encode("utf-8"))
    return images


def _extract_minimax_images(payload: dict) -> list[bytes]:
    """MiniMax image-01 响应：response_format=base64 → data.image_base64；response_format=url → data.image_urls。

    业务失败由 base_resp 拦截，此处仅提取；两种字段都兼容，避免契约漂移再次静默失败。
    """
    data = payload.get("data") or {}
    if not isinstance(data, dict):
        return []
    images: list[bytes] = []
    for item in data.get("image_base64") or []:
        if not isinstance(item, str) or not item:
            continue
        raw = item
        if raw.startswith("data:") and ";base64," in raw:
            raw = raw.split(";base64,", 1)[1]
        try:
            images.append(base64.b64decode(raw))
        except (ValueError, TypeError):
            continue
    for item in data.get("image_urls") or []:
        if isinstance(item, str) and item.startswith(("http://", "https://")):
            images.append(("url:" + item).encode("utf-8"))
    return images


def save_image_bytes(data: bytes, out_dir: str, index: int, run_id) -> str:
    """图片落盘，返回相对媒体路径（供前端拼 URL）。"""
    ext = ext_for_magic(data) or ".png"
    name = f"run_{run_id}_{index}{ext}"
    out = pathlib.Path(out_dir) / name
    out.write_bytes(data)
    return out.name


async def generate_images(
    cfg: dict,
    prompt: str,
    image_count: int,
    aspect_ratio: str,
    out_dir: str,
    run_id,
    http: httpx.AsyncClient | None = None,
    now: datetime.datetime | None = None,
) -> list[str]:
    """调用 provider 生成图片并落盘，返回文件名单。失败抛 GenerationError。"""
    base_url = str(cfg.get("base_url") or "").rstrip("/")
    if not base_url:
        raise GenerationError("未配置生成服务 base_url")
    api_key = cfg.get("api_key") or ""
    payload = build_image_payload(cfg["provider"], cfg["model"], prompt, image_count, aspect_ratio)
    is_minimax = _is_minimax(str(cfg.get("provider") or ""), str(cfg.get("model") or ""))
    url = f"{base_url}/image_generation" if is_minimax else f"{base_url}/images/generations"
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    own_client = http is None
    # payload 校验（如 n 越界）在创建自建 client 之前完成，避免泄漏未关闭的 AsyncClient
    client = http or httpx.AsyncClient(timeout=120)
    try:
        last_error: Exception | None = None
        for attempt in range(MAX_RETRIES + 1):
            try:
                resp = await client.post(url, json=payload, headers=headers)
                if resp.status_code >= 400:
                    if is_retryable_status(resp.status_code) and attempt < MAX_RETRIES:
                        await asyncio.sleep(RETRY_DELAYS[attempt])
                        continue
                    raise GenerationError(f"生成服务返回 {resp.status_code}: {resp.text[:200]}")
                body = resp.json()
                base_resp = body.get("base_resp") if isinstance(body, dict) else None
                if is_minimax and isinstance(base_resp, dict):
                    status_code = base_resp.get("status_code")
                    try:
                        status_code = int(status_code) if status_code is not None else 0
                    except (TypeError, ValueError):
                        status_code = -1
                    if status_code != 0:
                        raise GenerationError(
                            f"生成服务返回业务失败 {status_code}: {base_resp.get('status_msg', '')[:200]}"
                        )
                raw_images = _extract_minimax_images(body) if is_minimax else _extract_images(body)
                if not raw_images:
                    raise GenerationError("生成服务返回空结果")
                results: list[str] = []
                for i, data in enumerate(raw_images):
                    if data.startswith(b"url:"):
                        # url 型结果：下载落盘 + 魔数校验（避免评估/展示破图）
                        dl = await client.get(data[4:].decode("utf-8"))
                        if dl.status_code >= 400:
                            raise GenerationError(f"下载生成图片失败: {dl.status_code}")
                        if not validate_image_bytes(dl.content):
                            raise GenerationError("生成图片魔数校验失败")
                        results.append(save_image_bytes(dl.content, out_dir, i, run_id))
                        continue
                    if not validate_image_bytes(data):
                        raise GenerationError("生成图片魔数校验失败")
                    results.append(save_image_bytes(data, out_dir, i, run_id))
                if is_minimax and len(results) != image_count:
                    raise GenerationError(f"生成图片数量不符：期望 {image_count} 张，实际 {len(results)} 张")
                return results
            except httpx.HTTPError as e:
                last_error = e
                if attempt < MAX_RETRIES:
                    await asyncio.sleep(RETRY_DELAYS[attempt])
        raise GenerationError(f"生成服务请求失败: {last_error}")
    finally:
        if own_client:
            await client.aclose()
