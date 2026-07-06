"""Base tool class for video creation module.
Adapted from OpenMontage tools/base_tool.py.
"""
from __future__ import annotations
import hashlib, json, platform, subprocess, shutil
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any

class ToolTier(str, Enum):
    CORE = "core"; VOICE = "voice"; ENHANCE = "enhance"
    GENERATE = "generate"; SOURCE = "source"; ANALYZE = "analyze"; PUBLISH = "publish"
class ToolStability(str, Enum):
    EXPERIMENTAL = "experimental"; BETA = "beta"; PRODUCTION = "production"
class ToolStatus(str, Enum):
    AVAILABLE = "available"; UNAVAILABLE = "unavailable"; DEGRADED = "degraded"
class ToolRuntime(str, Enum):
    LOCAL = "local"; LOCAL_GPU = "local_gpu"; API = "api"; HYBRID = "hybrid"
class ExecutionMode(str, Enum):
    SYNC = "sync"; ASYNC = "async"
class Determinism(str, Enum):
    DETERMINISTIC = "deterministic"; SEEDED = "seeded"; STOCHASTIC = "stochastic"

@dataclass
class ResourceProfile:
    cpu_cores: int = 1
    ram_mb: int = 512
    vram_mb: int = 0
    disk_mb: int = 100
    network_required: bool = False

@dataclass
class ToolResult:
    success: bool
    data: dict[str, Any] = field(default_factory=dict)
    artifacts: list[str] = field(default_factory=list)
    error: str | None = None
    cost_usd: float = 0.0
    duration_seconds: float = 0.0
    seed: int | None = None
    model: str | None = None

class BaseTool(ABC):
    name: str = ""
    version: str = "0.1.0"
    tier: ToolTier = ToolTier.CORE
    stability: ToolStability = ToolStability.EXPERIMENTAL
    execution_mode: ExecutionMode = ExecutionMode.SYNC
    determinism: Determinism = Determinism.DETERMINISTIC
    runtime: ToolRuntime = ToolRuntime.LOCAL
    dependencies: list[str] = []
    install_instructions: str = ""
    capability: str = "generic"
    provider: str = "multi_publish"
    capabilities: list[str] = []
    best_for: list[str] = []
    not_good_for: list[str] = []
    resource_profile: ResourceProfile = ResourceProfile()
    idempotency_key_fields: list[str] = []

    def get_status(self) -> ToolStatus:
        return ToolStatus.AVAILABLE

    def get_info(self) -> dict[str, Any]:
        return {
            "name": self.name, "version": self.version,
            "tier": self.tier.value, "capability": self.capability,
            "provider": self.provider, "stability": self.stability.value,
            "execution_mode": self.execution_mode.value,
            "determinism": self.determinism.value, "runtime": self.runtime.value,
            "dependencies": self.dependencies, "capabilities": self.capabilities,
            "best_for": self.best_for, "not_good_for": self.not_good_for,
            "resource_profile": {
                k: getattr(self.resource_profile, k)
                for k in ["cpu_cores","ram_mb","vram_mb","disk_mb","network_required"]
            },
        }

    def estimate_cost(self, inputs: dict[str, Any]) -> float:
        return 0.0

    def estimate_runtime(self, inputs: dict[str, Any]) -> float:
        return 0.0

    def idempotency_key(self, inputs: dict[str, Any]) -> str:
        kd = {k: inputs.get(k) for k in self.idempotency_key_fields}
        return hashlib.sha256(json.dumps(kd, sort_keys=True).encode()).hexdigest()[:16]

    @abstractmethod
    def execute(self, inputs: dict[str, Any]) -> ToolResult:
        ...

    def dry_run(self, inputs: dict[str, Any]) -> dict[str, Any]:
        return {
            "tool": self.name,
            "estimated_cost_usd": self.estimate_cost(inputs),
            "estimated_runtime_seconds": self.estimate_runtime(inputs),
            "would_execute": True,
        }

    def run_command(self, cmd: list[str], *, timeout: int | None = None, cwd: Path | None = None) -> subprocess.CompletedProcess:
        rcmd = list(cmd)
        if platform.system() == "Windows" and rcmd:
            exe = shutil.which(rcmd[0])
            if exe: rcmd[0] = exe
        return subprocess.run(rcmd, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=timeout, cwd=cwd, check=True)

class DependencyError(Exception):
    pass