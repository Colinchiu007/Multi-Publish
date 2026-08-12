"""字幕时间戳真实对齐 — ASR 词级时间提取（Tier 2）。

faster-whisper（Systran）词级时间戳 → 供 Node 聚合器对齐到分句块。
模型：base（CPU int8，已缓存）优先；large-v3 可选（高精度慢）。
"""
from __future__ import annotations

import os
import time
from typing import List, Optional

_MODEL_CACHE: dict = {}


def get_model(model_size: str = "base", device: str = "cpu", compute_type: str = "int8"):
    key = f"{model_size}:{device}:{compute_type}"
    if key not in _MODEL_CACHE:
        from faster_whisper import WhisperModel

        _MODEL_CACHE[key] = WhisperModel(model_size, device=device, compute_type=compute_type)
    return _MODEL_CACHE[key]


def transcribe(
    audio_path: str,
    *,
    model_size: str = "base",
    language: Optional[str] = None,
    beam_size: int = 5,
    vad_filter: bool = True,
    initial_prompt: Optional[str] = None,
    max_seconds: int = 600,
) -> dict:
    """转写音频 → { words, segments, language, duration, elapsed_ms }。

    - word_timestamps=True：每个词返回 start/end/probability；
    - condition_on_previous_text=False：避免长音频的重复/漂移；
    - 词 text 可能含前导空格或标点，由 Node 聚合器归一化匹配。
    """
    if not os.path.isfile(audio_path):
        raise FileNotFoundError(f"audio not found: {audio_path}")
    started = time.time()
    model = get_model(model_size=model_size)
    segments_iter, info = model.transcribe(
        audio_path,
        beam_size=beam_size,
        word_timestamps=True,
        vad_filter=vad_filter,
        language=language,
        initial_prompt=initial_prompt,
        condition_on_previous_text=False,
    )
    words: List[dict] = []
    segments: List[dict] = []
    total_duration = getattr(info, "duration", 0.0) or 0.0
    for seg in segments_iter:
        segments.append(
            {
                "text": seg.text.strip(),
                "start": round(seg.start, 3),
                "end": round(seg.end, 3),
            }
        )
        for w in seg.words or []:
            words.append(
                {
                    "text": w.word,
                    "start": round(w.start, 3),
                    "end": round(w.end, 3),
                    "probability": round(float(w.probability), 4) if w.probability is not None else None,
                }
            )
        if words and words[-1]["end"] > max_seconds:
            break
    return {
        "words": words,
        "segments": segments,
        "language": getattr(info, "language", None),
        "language_probability": round(float(info.language_probability), 4) if getattr(info, "language_probability", None) else None,
        "duration": round(total_duration, 3),
        "elapsed_ms": int((time.time() - started) * 1000),
        "model": model_size,
    }
