"""PromptEval 生成服务 — 运营后台服务端直连图片生成 provider。

- provider：minimax-image（image-01）/ flux（OpenAI 兼容 /images/generations）
- 瞬时错误有界重试 + 429 退避；结果扩展名/魔数校验；落盘本地媒体目录返回可访问 URL/路径
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


def build_image_payload(provider: str, model: str, prompt: str, image_count: int, aspect_ratio: str) -> dict:
    """归一化请求体（OpenAI 兼容 /images/generations）。"""
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
    own_client = http is None
    client = http or httpx.AsyncClient(timeout=120)
    """调用 provider 生成图片并落盘，返回文件名单。失败抛 GenerationError。"""
    base_url = str(cfg.get("base_url") or "").rstrip("/")
    if not base_url:
        raise GenerationError("未配置生成服务 base_url")
    api_key = cfg.get("api_key") or ""
    payload = build_image_payload(cfg["provider"], cfg["model"], prompt, image_count, aspect_ratio)
    url = f"{base_url}/images/generations"
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
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
                raw_images = _extract_images(resp.json())
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
                return results
            except httpx.HTTPError as e:
                last_error = e
                if attempt < MAX_RETRIES:
                    await asyncio.sleep(RETRY_DELAYS[attempt])
        raise GenerationError(f"生成服务请求失败: {last_error}")
    finally:
        if own_client:
            await client.aclose()
