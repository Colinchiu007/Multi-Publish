"""Doubao Speech text-to-speech provider tool (Volcengine).

Adapted from OpenMontage tools/audio/doubao_tts.py.
Async flow: submit -> poll -> download.
"""
from __future__ import annotations

import json
import os
import time
import uuid
from pathlib import Path
from typing import Any

from multi_publish.video_creation.base_tool import (
    BaseTool,
    Determinism,
    ExecutionMode,
    ResourceProfile,
    ToolResult,
    ToolRuntime,
    ToolStability,
    ToolStatus,
    ToolTier,
)
from multi_publish.video_creation.providers.audio._utils import probe_duration


class DoubaoTTS(BaseTool):
    name = "doubao_tts"
    version = "0.1.0"
    tier = ToolTier.VOICE
    capability = "tts"
    provider = "doubao"
    stability = ToolStability.EXPERIMENTAL
    execution_mode = ExecutionMode.ASYNC
    determinism = Determinism.STOCHASTIC
    runtime = ToolRuntime.API

    dependencies = []
    install_instructions = (
        "Set DOUBAO_SPEECH_API_KEY to a Volcengine Doubao Speech API Key.\n"
        "Optional: set DOUBAO_SPEECH_VOICE_TYPE to the default speaker voice.\n"
        "Use the new console API key flow."
    )

    capabilities = [
        "text_to_speech",
        "voice_selection",
        "multilingual",
        "timestamp_alignment",
    ]
    best_for = [
        "natural Mandarin narration",
        "Chinese explainer voiceovers with character-level timestamps",
        "long-form narration that needs subtitle alignment",
    ]
    not_good_for = [
        "fully offline production",
        "voice clone matching",
        "real-time interactive speech playback",
    ]

    resource_profile = ResourceProfile(
        cpu_cores=1, ram_mb=256, vram_mb=0, disk_mb=50, network_required=True
    )
    idempotency_key_fields = [
        "text", "voice_id", "resource_id", "format",
        "sample_rate", "speech_rate", "enable_timestamp",
    ]

    SUBMIT_URL = "https://openspeech.bytedance.com/api/v1/tts/async/submit"
    QUERY_URL = "https://openspeech.bytedance.com/api/v1/tts/async/query"

    def _get_api_key(self) -> str | None:
        return os.environ.get("DOUBAO_SPEECH_API_KEY")

    def _get_voice_id(self) -> str:
        return os.environ.get("DOUBAO_SPEECH_VOICE_TYPE", "zh_female_2024b")

    def get_status(self) -> ToolStatus:
        if self._get_api_key():
            return ToolStatus.AVAILABLE
        return ToolStatus.UNAVAILABLE

    def estimate_cost(self, inputs: dict[str, Any]) -> float:
        return round(len(inputs.get("text", "")) * 0.000015, 4)

    def execute(self, inputs: dict[str, Any]) -> ToolResult:
        api_key = self._get_api_key()
        if not api_key:
            return ToolResult(success=False, error="No Doubao API key. " + self.install_instructions)

        start = time.time()
        try:
            result = self._generate(inputs, api_key)
        except Exception as exc:
            return ToolResult(success=False, error=f"Doubao TTS failed: {self._safe_error(exc)}")

        result.duration_seconds = round(time.time() - start, 2)
        return result

    def _generate(self, inputs: dict[str, Any], api_key: str) -> ToolResult:
        import requests

        text = inputs["text"]
        voice_id = inputs.get("voice_id") or self._get_voice_id()
        resource_id = inputs.get("resource_id", "seed-tts-2.0")
        fmt = inputs.get("format", "mp3")

        ext = self._extension_for_format(fmt)
        output_path = Path(inputs.get("output_path", f"doubao_tts_output.{ext}"))
        metadata_path = Path(
            inputs.get("metadata_path") or output_path.with_suffix(output_path.suffix + ".json")
        )
        output_path.parent.mkdir(parents=True, exist_ok=True)
        metadata_path.parent.mkdir(parents=True, exist_ok=True)

        req_id = str(uuid.uuid4())
        headers = self._headers(
            api_key=api_key,
            resource_id=resource_id,
            request_id=req_id,
            return_usage=bool(inputs.get("return_usage", True)),
        )
        body = self._submit_body(inputs, voice_id=voice_id, request_id=req_id)

        submit_response = requests.post(self.SUBMIT_URL, headers=headers, json=body, timeout=(10, 60))
        submit_data = self._json_or_raise(submit_response)
        self._raise_for_doubao_error(submit_response.status_code, submit_data)

        task_id = submit_data.get("data", {}).get("task_id")
        if not task_id:
            raise RuntimeError("Doubao submit succeeded but did not return data.task_id")

        query_data = self._poll_query(
            requests_module=requests,
            api_key=api_key,
            resource_id=resource_id,
            task_id=task_id,
            return_usage=bool(inputs.get("return_usage", True)),
            poll_interval=float(inputs.get("poll_interval_seconds", 2.0)),
            timeout_seconds=int(inputs.get("timeout_seconds", 300)),
        )
        data = query_data.get("data", {})
        audio_url = data.get("audio_url")
        if not audio_url:
            raise RuntimeError("Doubao task completed but did not return data.audio_url")

        audio_response = requests.get(audio_url, timeout=(10, 120))
        audio_response.raise_for_status()
        output_path.write_bytes(audio_response.content)
        metadata_path.write_text(
            json.dumps(query_data, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

        audio_duration = probe_duration(output_path)
        usage = data.get("usage")
        cost = self._cost_from_usage(usage) or self.estimate_cost(inputs)

        return ToolResult(
            success=True,
            data={
                "provider": self.provider,
                "model": resource_id,
                "resource_id": resource_id,
                "voice_id": voice_id,
                "format": fmt,
                "sample_rate": inputs.get("sample_rate", 24000),
                "speech_rate": inputs.get("speech_rate", 0),
                "text_length": len(text),
                "task_id": task_id,
                "audio_duration_seconds": round(audio_duration, 2) if audio_duration else None,
                "output": str(output_path),
                "metadata_path": str(metadata_path),
                "sentences": data.get("sentences", []),
                "usage": usage,
            },
            artifacts=[str(output_path), str(metadata_path)],
            cost_usd=cost,
            model=resource_id,
        )

    def _headers(self, *, api_key: str, resource_id: str, request_id: str, return_usage: bool) -> dict[str, str]:
        headers = {
            "X-Api-Key": api_key,
            "X-Api-Resource-Id": resource_id,
            "X-Api-Request-Id": request_id,
            "Content-Type": "application/json",
        }
        if return_usage:
            headers["X-Control-Require-Usage-Tokens-Return"] = "true"
        return headers

    def _submit_body(self, inputs: dict[str, Any], *, voice_id: str, request_id: str) -> dict[str, Any]:
        audio_params = {
            "format": inputs.get("format", "mp3"),
            "sample_rate": inputs.get("sample_rate", 24000),
            "speech_rate": inputs.get("speech_rate", 0),
            "enable_timestamp": bool(inputs.get("enable_timestamp", True)),
        }
        additions = {
            "disable_markdown_filter": bool(inputs.get("disable_markdown_filter", False)),
        }
        return {
            "user": {"uid": inputs.get("user_id", "multi_publish")},
            "unique_id": request_id,
            "req_params": {
                "text": inputs["text"],
                "speaker": voice_id,
                "audio_params": audio_params,
                "additions": json.dumps(additions, ensure_ascii=False),
            },
        }

    def _poll_query(
        self, *, requests_module: Any, api_key: str, resource_id: str,
        task_id: str, return_usage: bool, poll_interval: float,
        timeout_seconds: int,
    ) -> dict[str, Any]:
        deadline = time.time() + timeout_seconds
        while time.time() < deadline:
            time.sleep(poll_interval)
            headers = self._headers(
                api_key=api_key, resource_id=resource_id,
                request_id=str(uuid.uuid4()), return_usage=return_usage,
            )
            response = requests_module.post(
                self.QUERY_URL, headers=headers, json={"task_id": task_id}, timeout=(10, 60),
            )
            query_data = self._json_or_raise(response)
            self._raise_for_doubao_error(response.status_code, query_data)
            status = query_data.get("data", {}).get("task_status")
            if status == 2:
                return query_data
            if status == 3:
                raise RuntimeError(f"Doubao task failed: {query_data.get('message', 'unknown error')}")
        raise TimeoutError(f"Doubao task did not finish within {timeout_seconds} seconds")

    @staticmethod
    def _json_or_raise(response: Any) -> dict[str, Any]:
        try:
            return response.json()
        except ValueError as exc:
            raise RuntimeError(f"Non-JSON response from Doubao API: HTTP {response.status_code}") from exc

    def _raise_for_doubao_error(self, http_status: int, payload: dict[str, Any]) -> None:
        code = payload.get("code")
        if http_status < 400 and code == 20000000:
            return
        message = payload.get("message", "unknown error")
        hint = self._diagnostic_hint(message)
        raise RuntimeError(f"HTTP {http_status}, code {code}: {message}{hint}")

    @staticmethod
    def _diagnostic_hint(message: str) -> str:
        lowered = message.lower()
        if "load grant" in lowered or "requested grant not found" in lowered:
            return " (check DOUBAO_SPEECH_API_KEY and use the new-console X-Api-Key flow)"
        if "speaker permission denied" in lowered or "access denied" in lowered:
            return " (check voice_id/DOUBAO_SPEECH_VOICE_TYPE and voice authorization)"
        if "quota exceeded" in lowered:
            return " (check quota, concurrency, or remaining character package)"
        if "unsupported additions explicit language" in lowered:
            return " (do not pass additions.explicit_language for this endpoint)"
        return ""

    @staticmethod
    def _safe_error(exc: Exception) -> str:
        return str(exc).replace(os.environ.get("DOUBAO_SPEECH_API_KEY", ""), "[redacted]")

    @staticmethod
    def _extension_for_format(fmt: str) -> str:
        if fmt == "ogg_opus":
            return "ogg"
        if fmt == "pcm":
            return "pcm"
        return "mp3"

    @staticmethod
    def _cost_from_usage(usage: Any) -> float | None:
        if not isinstance(usage, dict):
            return None
        text_words = usage.get("text_words")
        if not isinstance(text_words, (int, float)):
            return None
        return round(float(text_words) * 0.000015, 4)
