"""字幕时间戳真实对齐 — ASR 词级时间提取（Tier 2）。

faster-whisper（Systran）词级时间戳 → 供 Node 聚合器对齐到分句块。
模型：base（CPU int8，已缓存）优先；large-v3 可选（高精度慢）。
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import time
from typing import List, Optional, Tuple

_MODEL_CACHE: dict = {}


def get_model(model_size: str = "base", device: str = "cpu", compute_type: str = "int8"):
    key = f"{model_size}:{device}:{compute_type}"
    if key not in _MODEL_CACHE:
        from faster_whisper import WhisperModel

        _MODEL_CACHE[key] = WhisperModel(model_size, device=device, compute_type=compute_type)
    return _MODEL_CACHE[key]




def detect_silences(
    audio_path: str,
    ffmpeg_path: str = "ffmpeg",
    noise_db: float = -35.0,
    min_duration: float = 0.12,
) -> List[Tuple[float, float]]:
    """ffmpeg silencedetect 检测停顿区间（独立于 ASR 的时序证据）。

    返回 [(silence_start, silence_end), ...]；ffmpeg 不可用/执行失败返回 []（fail-open）。
    """
    try:
        proc = subprocess.run(
            [
                ffmpeg_path,
                "-hide_banner",
                "-i", audio_path,
                "-af", f"silencedetect=noise={noise_db}dB:d={min_duration}",
                "-f", "null", "-",
            ],
            capture_output=True, text=True, timeout=60,
        )
    except Exception:  # noqa: BLE001
        return []
    intervals: List[Tuple[float, float]] = []
    start = None
    for line in proc.stderr.splitlines():
        m = re.search(r"silence_start:\s*([0-9.]+)", line)
        if m:
            start = float(m.group(1))
            continue
        m = re.search(r"silence_end:\s*([0-9.]+)", line)
        if m and start is not None:
            intervals.append((start, float(m.group(1))))
            start = None
    return intervals


def snap_words_to_silence(
    words: List[dict],
    silence_intervals: List[Tuple[float, float]],
    lead_tolerance: float = 0.30,
) -> List[dict]:
    """把"落在/覆盖停顿区间"的词起点吸附到停顿结束（修复 whisper 功能词吸收停顿导致的提前）。

    规则（实证校准）：词起点 s 满足 `silence_start - lead_tolerance <= s < silence_end` 且词与停顿有交集
    （e > silence_start）时，start = silence_end。lead_tolerance=0.30s 覆盖"词起点略早于停顿起点"的
    吸收场景（如 whisper 把停顿并入单字功能词）；对停顿外的词不生效。
    返回新列表（不修改入参）。
    """
    if not words or not silence_intervals:
        return words
    out = [dict(w) for w in words]
    for w in out:
        s, e = w["start"], w["end"]
        for (ss, se) in silence_intervals:
            if (ss - lead_tolerance) <= s < se and e > ss:
                w["start"] = round(se, 3)
                break
    return out

def transcribe(
    audio_path: str,
    *,
    model_size: str = "base",
    language: Optional[str] = None,
    beam_size: int = 5,
    vad_filter: bool = True,
    initial_prompt: Optional[str] = None,
    max_seconds: int = 600,
    silence_snap: bool = True,
    ffmpeg_path: str = "ffmpeg",
    silence_intervals: Optional[List[Tuple[float, float]]] = None,
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
    # 停顿吸附（可选）：ffmpeg silencedetect 独立校正词起点，修复功能词吸收停顿导致的提前
    snaps = None
    if silence_snap and words:
        intervals = silence_intervals if silence_intervals is not None else detect_silences(audio_path, ffmpeg_path=ffmpeg_path)
        if intervals:
            words = snap_words_to_silence(words, intervals)
            snaps = intervals
    return {
        "words": words,
        "segments": segments,
        "language": getattr(info, "language", None),
        "language_probability": round(float(info.language_probability), 4) if getattr(info, "language_probability", None) else None,
        "duration": round(total_duration, 3),
        "elapsed_ms": int((time.time() - started) * 1000),
        "model": model_size,
        "silence_intervals": snaps,
    }
