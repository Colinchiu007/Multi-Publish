"""Standalone utility functions extracted from HyperFramesCompose."""
from __future__ import annotations
import json, re, subprocess
from pathlib import Path
from typing import Any, Optional


def node_major_version() -> Optional[int]:
    """Return the major Node version (e.g. 18) or None if not found."""
    try:
        out = subprocess.check_output(["node", "--version"], text=True).strip()
        return int(out.lstrip("v").split(".")[0])
    except Exception:
        return None


def require_workspace(inputs: dict[str, Any]) -> Path:
    """Resolve workspace path from inputs."""
    raw = inputs.get("workspace") or inputs.get("project_dir") or "."
    return Path(raw).resolve()


def compute_total_duration(cuts: list[dict]) -> float:
    """Compute total duration from a list of cut dicts."""
    return sum(c.get("duration", c.get("end", 0)) for c in cuts)


def is_inside(path: Path, root: Path) -> bool:
    """Check if path is inside root."""
    try:
        path.resolve().relative_to(root.resolve())
        return True
    except ValueError:
        return False


def parse_json_output(stdout: str) -> Optional[Any]:
    """Parse JSON from stdout, handling artifacts."""
    for line in stdout.splitlines():
        line = line.strip()
        if line.startswith("{"):
            return json.loads(line)
    return None


def _f(v: float) -> str:
    """Format a float with zero-decimal rule for CSS."""
    s = f"{v:.2f}"
    return s.rstrip("0").rstrip(".")


def escape_text(s: str) -> str:
    """Escape text for HTML."""
    return (
        s.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def rel_from_workspace(path: str) -> str:
    """Convert an absolute path to a workspace-relative path."""
    abs_path = Path(path).resolve()
    cwd = Path.cwd().resolve()
    try:
        return str(abs_path.relative_to(cwd))
    except ValueError:
        return path
