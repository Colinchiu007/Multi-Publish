"""Google Cloud Text-to-Speech provider tool.

Adapted from OpenMontage tools/audio/google_tts.py.
Offers 700+ voices across 50+ languages.
"""
from __future__ import annotations

import base64
import os
import time
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
from multi_publish.video_creation.providers.audio._utils import (
    service_account_configured,
    get_access_token,
)


class GoogleTTS(BaseTool):
    name = "google_tts"
    version = "0.1.0"
    tier = ToolTier.VOICE
    capability = "tts"
    provider = "google_tts"
    stability = ToolStability.BETA
    execution_mode = ExecutionMode.SYNC
    determinism = Determinism.DETERMINISTIC
    runtime = ToolRuntime.API

    dependencies = []
    install_instructions = (
        "Auth option A — API key: set GOOGLE_API_KEY (or GEMINI_API_KEY) to a\n"
        "  Google Cloud API key with Text-to-Speech enabled.\n"
        "  Enable the API at https://console.cloud.google.com/apis/library/texttospeech.googleapis.com\n"
        "Auth option B — service account: set GOOGLE_APPLICATION_CREDENTIALS to the\n"
        "  path of a service-account JSON key (needs the 'google-auth' package)."
    )

    capabilities = [
        "text_to_speech",
        "voice_selection",
        "ssml_support",
        "multilingual",
    ]
    best_for = [
        "localization — 700+ voices across 50+ languages",
        "affordable high-quality TTS (Neural2, WaveNet)",
        "Google ecosystem integration",
    ]
    not_good_for = [
        "voice cloning",
        "fully offline production",
    ]

    resource_profile = ResourceProfile(
        cpu_cores=1, ram_mb=256, vram_mb=0, disk_mb=50, network_required=True
    )
    idempotency_key_fields = [
        "text", "input_type", "voice", "language_code", "speaking_rate", "pitch",
    ]

    _EXT_MAP = {
        "MP3": "mp3", "LINEAR16": "wav", "OGG_OPUS": "ogg",
        "MULAW": "wav", "ALAW": "wav",
    }

    def _get_api_key(self) -> str | None:
        return os.environ.get("GOOGLE_API_KEY") or os.environ.get("GEMINI_API_KEY")

    def get_status(self) -> ToolStatus:
        if self._get_api_key() or service_account_configured():
            return ToolStatus.AVAILABLE
        return ToolStatus.UNAVAILABLE

    @staticmethod
    def _needs_beta_api(voice_name: str) -> bool:
        return "Chirp3" in voice_name or "Journey" in voice_name

    def estimate_cost(self, inputs: dict[str, Any]) -> float:
        char_count = len(inputs.get("text", ""))
        voice = inputs.get("voice", "en-US-Chirp3-HD-Orus")
        if "Chirp3-HD" in voice:
            rate_per_char = 0.000030
        elif "Studio" in voice:
            rate_per_char = 0.000160
        elif "Neural2" in voice or "Journey" in voice:
            rate_per_char = 0.000016
        elif "WaveNet" in voice:
            rate_per_char = 0.000016
        else:
            rate_per_char = 0.000004
        return round(char_count * rate_per_char, 4)

    def execute(self, inputs: dict[str, Any]) -> ToolResult:
        api_key = self._get_api_key()
        bearer_token: str | None = None
        if not api_key:
            if service_account_configured():
                try:
                    bearer_token, _ = get_access_token()
                except RuntimeError as exc:
                    return ToolResult(success=False, error=str(exc))
            else:
                return ToolResult(
                    success=False,
                    error="No Google credentials found. " + self.install_instructions,
                )

        start = time.time()
        try:
            result = self._generate(inputs, api_key=api_key, bearer_token=bearer_token)
        except Exception as exc:
            return ToolResult(success=False, error=f"Google TTS failed: {exc}")

        result.duration_seconds = round(time.time() - start, 2)
        result.cost_usd = self.estimate_cost(inputs)
        return result

    def _generate(
        self, inputs: dict[str, Any],
        api_key: str | None = None,
        bearer_token: str | None = None,
    ) -> ToolResult:
        import requests

        text = inputs["text"]
        input_type = inputs.get("input_type", "text")
        voice_name = inputs.get("voice", "en-US-Chirp3-HD-Orus")
        language_code = inputs.get("language_code", "en-US")
        speaking_rate = inputs.get("speaking_rate", 1.0)
        pitch = inputs.get("pitch", 0.0)
        audio_encoding = inputs.get("audio_encoding", "MP3")

        if not 0.25 <= speaking_rate <= 2.0:
            return ToolResult(
                success=False,
                error="Google TTS speaking_rate must be between 0.25 and 2.0.",
            )
        if not -20.0 <= pitch <= 20.0:
            return ToolResult(
                success=False,
                error="Google TTS pitch must be between -20.0 and 20.0 semitones.",
            )

        if input_type == "ssml":
            stripped = text.strip()
            ssml = stripped if stripped.startswith("<speak") else f"<speak>{stripped}</speak>"
            synthesis_input = {"ssml": ssml}
        else:
            synthesis_input = {"text": text}

        payload = {
            "input": synthesis_input,
            "voice": {"languageCode": language_code, "name": voice_name},
            "audioConfig": {
                "audioEncoding": audio_encoding,
                "speakingRate": speaking_rate,
                "pitch": pitch,
            },
        }

        api_version = "v1beta1" if self._needs_beta_api(voice_name) else "v1"
        url = f"https://texttospeech.googleapis.com/{api_version}/text:synthesize"

        headers = {"Content-Type": "application/json"}
        params: dict[str, str] = {}
        if bearer_token:
            headers["Authorization"] = f"Bearer {bearer_token}"
        else:
            params["key"] = api_key

        response = requests.post(url, headers=headers, params=params, json=payload, timeout=120)
        response.raise_for_status()

        audio_content = base64.b64decode(response.json()["audioContent"])

        ext = self._EXT_MAP.get(audio_encoding, "mp3")
        output_path = Path(inputs.get("output_path", f"tts_output.{ext}"))
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(audio_content)

        return ToolResult(
            success=True,
            data={
                "provider": self.provider,
                "voice": voice_name,
                "language_code": language_code,
                "text_length": len(text),
                "input_type": input_type,
                "output": str(output_path),
                "format": audio_encoding,
                "speaking_rate": speaking_rate,
                "pitch": pitch,
            },
            artifacts=[str(output_path)],
            model=f"google-tts/{voice_name}",
        )
