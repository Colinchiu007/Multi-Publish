"""Shared utilities for audio/TTS providers.

Adapted from OpenMontage tools/analysis/audio_probe.py and
tools/google_credentials.py.
"""
from __future__ import annotations

import os
import subprocess
from pathlib import Path
from typing import Any


def probe_duration(audio_path: Path) -> float | None:
    """Best-effort audio duration via ffprobe; returns None if unavailable."""
    if not audio_path.exists():
        return None
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                str(audio_path),
            ],
            capture_output=True,
            text=True,
            timeout=30,
            encoding="utf-8",
            errors="replace",
        )
        value = result.stdout.strip()
        return round(float(value), 2) if value else None
    except (subprocess.SubprocessError, ValueError, OSError):
        return None


CLOUD_PLATFORM_SCOPE = "https://www.googleapis.com/auth/cloud-platform"


def service_account_configured() -> bool:
    """True when GOOGLE_APPLICATION_CREDENTIALS points to an existing file."""
    path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    return bool(path and os.path.exists(path))


def get_access_token() -> tuple[str, str | None]:
    """Mint an OAuth access token from the service-account JSON.

    Returns ``(access_token, project_id)``.
    """
    try:
        from google.auth.transport.requests import Request
        from google.oauth2 import service_account
    except ImportError:
        raise RuntimeError(
            "Service-account auth requires the 'google-auth' package. "
            "Install it with: pip install google-auth"
        )

    path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    if not path or not os.path.exists(path):
        raise RuntimeError(
            "GOOGLE_APPLICATION_CREDENTIALS does not point to an existing "
            "file; cannot use service-account authentication."
        )

    creds = service_account.Credentials.from_service_account_file(
        path,
        scopes=[CLOUD_PLATFORM_SCOPE],
    )
    creds.refresh(Request())

    return creds.token, getattr(creds, "project_id", None)


def resolve_project_id() -> str | None:
    """Resolve the GCP project id from env vars, falling back to the key file."""
    project = (
        os.environ.get("GOOGLE_CLOUD_PROJECT")
        or os.environ.get("GOOGLE_CLOUD_PROJECT_ID")
        or os.environ.get("GCLOUD_PROJECT")
    )
    if project:
        return project
    creds_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    if creds_path and os.path.exists(creds_path):
        try:
            import json
            with open(creds_path, encoding="utf-8") as f:
                key_data = json.load(f)
            return key_data.get("project_id")
        except Exception:
            return None
    return None
