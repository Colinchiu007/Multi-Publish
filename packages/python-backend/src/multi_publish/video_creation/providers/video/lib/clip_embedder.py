"""Stub for OpenMontage lib/clip_embedder.py."""
from __future__ import annotations
from typing import Any
import numpy as np

def embed_texts(texts: list[str]) -> list[np.ndarray]:
    """Stub: returns zero vectors."""
    return [np.zeros(512) for _ in texts]

def embed_images(image_paths: list[str]) -> list[np.ndarray]:
    """Stub: returns zero vectors."""
    return [np.zeros(512) for _ in image_paths]

def pool_frames(video_path: str, fps: float = 1.0) -> list[np.ndarray]:
    """Stub: returns empty list."""
    return []
