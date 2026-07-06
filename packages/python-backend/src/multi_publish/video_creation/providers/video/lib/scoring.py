"""Stub for OpenMontage lib/scoring.py."""
from __future__ import annotations
from dataclasses import dataclass
from typing import Any, Optional

@dataclass
class ProviderScore:
    provider: str = ""
    score: float = 0.0
    reason: str = ""

def rank_providers(task_context: dict, providers: list[Any]) -> list[ProviderScore]:
    return []

def normalize_task_context(task_context: dict) -> dict:
    return task_context
