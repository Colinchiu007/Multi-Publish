"""Runtime configuration model for video creation module.

Adapted from OpenMontage lib/config_model.py.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path

import yaml


class BudgetMode(str, Enum):
    OBSERVE = "observe"
    WARN = "warn"
    CAP = "cap"


@dataclass
class BudgetConfig:
    mode: BudgetMode = BudgetMode.WARN
    total_usd: float = 10.0
    reserve_pct: float = 0.10
    single_action_approval_usd: float = 0.50


@dataclass
class OutputConfig:
    default_format: str = "mp4"
    default_resolution: str = "1920x1080"
    default_fps: int = 30


@dataclass
class PathsConfig:
    output_dir: str = "output"
    cache_dir: str = "cache"
    temp_dir: str = "temp"


@dataclass
class VideoCreationConfig:
    budget: BudgetConfig = field(default_factory=BudgetConfig)
    output: OutputConfig = field(default_factory=OutputConfig)
    paths: PathsConfig = field(default_factory=PathsConfig)

    @classmethod
    def _from_dict(cls, data: dict) -> VideoCreationConfig:
        """从嵌套 dict 构建配置，递归转换子 dataclass。"""
        if "budget" in data and isinstance(data["budget"], dict):
            data["budget"] = BudgetConfig(**data["budget"])
        if "output" in data and isinstance(data["output"], dict):
            data["output"] = OutputConfig(**data["output"])
        if "paths" in data and isinstance(data["paths"], dict):
            data["paths"] = PathsConfig(**data["paths"])
        return cls(**data)

    @classmethod
    def load(cls, config_path: Path | None = None) -> VideoCreationConfig:
        if config_path is None:
            config_path = Path.cwd() / "config" / "video_creation.yaml"
        if config_path.exists():
            with open(config_path) as f:
                raw = yaml.safe_load(f) or {}
            return cls._from_dict(raw)
        return cls()

    def resolve_path(self, key: str, project_root: Path | None = None) -> Path:
        if project_root is None:
            project_root = Path.cwd()
        return (project_root / getattr(self.paths, key)).resolve()
