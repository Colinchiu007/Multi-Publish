"""Standalone utility functions extracted from VideoCompose."""
from __future__ import annotations
import re, subprocess
from pathlib import Path
from typing import Optional

_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".bmp", ".tiff", ".tif", ".webp"}

def is_image(path: Path) -> bool:
    return path.suffix.lower() in _IMAGE_EXTENSIONS

def has_audio_stream(path: Path) -> bool:
    try:
        out = subprocess.check_output(
            ["ffprobe", "-v", "error", "-select_streams", "a",
             "-show_entries", "stream=codec_type", "-of", "default=nw=1:nk=1",
             str(path)], stderr=subprocess.STDOUT, text=True)
        return "audio" in out
    except Exception:
        return False

def read_text_file(path: str | Path | None) -> Optional[str]:
    if not path: return None
    try: return Path(path).read_text(encoding="utf-8")
    except Exception: return None

def tokenize(text: str) -> list[str]:
    cleaned = re.sub(r"[^A-Za-z0-9\-'  ]+", " ", text.lower())
    return [t for t in cleaned.split() if t and t != "-"]

def parse_probe_fps(fps_str: str) -> float:
    try:
        if "/" in fps_str:
            num, den = fps_str.split("/")
            return round(int(num) / max(int(den), 1), 2)
        return float(fps_str)
    except (ValueError, ZeroDivisionError):
        return 0.0

def build_subtitle_style(style: dict) -> str:
    parts = [f"FontName={style.get('font', 'Inter')}",
             f"FontSize={style.get('font_size', 28)}",
             f"Bold={1 if style.get('bold', True) else 0}"]
    if style.get("primary_color"): parts.append(f"PrimaryColour={style['primary_color']}")
    if style.get("outline_color"): parts.append(f"OutlineColour={style['outline_color']}")
    if style.get("back_color"): parts.append(f"BackColour={style['back_color']}")
    parts.append(f"BorderStyle={style.get('border_style', 1)}")
    parts.append(f"Outline={style.get('outline_width', 2)}")
    parts.append(f"Shadow={style.get('shadow', 0)}")
    parts.append(f"MarginV={style.get('margin_v', 40)}")
    parts.append(f"Alignment={style.get('alignment', 2)}")
    return ",".join(parts)

def build_atempo(factor: float) -> str:
    filters = []; remaining = factor
    while remaining > 100.0: filters.append("atempo=100.0"); remaining /= 100.0
    while remaining < 0.5: filters.append("atempo=0.5"); remaining /= 0.5
    filters.append(f"atempo={remaining:.4f}")
    return ",".join(filters)
