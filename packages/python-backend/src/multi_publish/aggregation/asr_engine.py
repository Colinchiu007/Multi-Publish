"""ASR 引擎抽象层 — 视频采集语音转写。

统一接口：transcribe(audio_path) / is_available() / install_hint()。
引擎选择：环境变量 ASR_ENGINE（faster_whisper | sensevoice | siliconflow），默认 faster_whisper。
Phase 1 实现 FasterWhisperEngine；sensevoice/siliconflow 为 Phase 2 预留。
"""

from __future__ import annotations

import os
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class AsrResult:
    """转写结果"""
    text: str = ""
    language: str = ""
    duration_seconds: float = 0.0
    segments: list[dict] = field(default_factory=list)
    engine: str = ""


class AsrEngineError(Exception):
    """ASR 引擎错误（code: engine_unavailable / timeout / no_audio / failed）"""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


class AsrEngine(ABC):
    """ASR 引擎抽象基类"""

    name: str = "abstract"

    @abstractmethod
    def transcribe(self, audio_path: str, *, language: str | None = None) -> AsrResult:
        """转写音频文件（16kHz 单声道 WAV 最佳）。失败抛 AsrEngineError。"""

    @abstractmethod
    def is_available(self) -> bool:
        """引擎依赖是否可用（库已装/二进制存在/API Key 已配）。"""

    @abstractmethod
    def install_hint(self) -> str:
        """依赖缺失时的中文安装指引。"""


class FasterWhisperEngine(AsrEngine):
    """faster-whisper 本地引擎（Phase 1 默认）。

    核心逻辑与 video_creation/analysis/transcriber.py 一致：
    model_size=base、CPU int8（CUDA 可用时 float16）、VAD 过滤、segments 拼接全文。
    """

    name = "faster_whisper"

    def __init__(self, model_size: str = "base"):
        self._model_size = model_size
        self._model = None  # 懒加载 + 缓存：WhisperModel 冷启动 5-10s，重复转写必须复用

    def is_available(self) -> bool:
        try:
            import faster_whisper  # noqa: F401
            return True
        except ImportError:
            return False

    def install_hint(self) -> str:
        return "语音转写引擎不可用，请安装 faster-whisper：pip install faster-whisper（模型首次使用时自动下载，国内可设 HF_ENDPOINT=https://hf-mirror.com）"

    def transcribe(self, audio_path: str, *, language: str | None = None) -> AsrResult:
        if not Path(audio_path).exists():
            raise AsrEngineError("no_audio", f"音频文件不存在: {audio_path}")
        try:
            from faster_whisper import WhisperModel
        except ImportError:
            raise AsrEngineError("engine_unavailable", self.install_hint())

        try:
            segments_iter, info = self._get_model().transcribe(
                str(audio_path),
                language=language,
                word_timestamps=False,
                vad_filter=True,
            )
        except Exception as e:
            raise AsrEngineError("failed", f"faster-whisper 转写失败: {e}")

        segments = []
        texts = []
        for seg in segments_iter:
            text = seg.text.strip()
            if text:
                texts.append(text)
            segments.append({"id": seg.id, "start": round(seg.start, 3), "end": round(seg.end, 3), "text": text})

        return AsrResult(
            text="".join(texts),
            language=language or info.language,
            duration_seconds=round(info.duration, 3),
            segments=segments,
            engine=self.name,
        )

    def _get_model(self):
        """懒加载并缓存 WhisperModel 实例（线程安全：CPython GIL 下竞态只导致重复加载，结果一致）。"""
        if self._model is not None:
            return self._model
        from faster_whisper import WhisperModel
        try:
            import torch
            device = "cuda" if torch.cuda.is_available() else "cpu"
            compute_type = "float16" if device == "cuda" else "int8"
        except ImportError:
            device = "cpu"
            compute_type = "int8"
        self._model = WhisperModel(self._model_size, device=device, compute_type=compute_type)
        return self._model


class SenseVoiceEngine(AsrEngine):
    """SenseVoice 本地引擎（Phase 2 预留）— llama.cpp GGUF 单二进制。"""

    name = "sensevoice"

    def is_available(self) -> bool:
        return bool(os.environ.get("ASR_SENSEVOICE_BIN")) and bool(os.environ.get("ASR_SENSEVOICE_MODEL"))

    def install_hint(self) -> str:
        return "SenseVoice 引擎未配置：请从 FunASR GitHub Releases 下载 funasr-llamacpp-windows-x64-avx2.zip 并设置 ASR_SENSEVOICE_BIN 与 ASR_SENSEVOICE_MODEL 环境变量"

    def transcribe(self, audio_path: str, *, language: str | None = None) -> AsrResult:
        raise AsrEngineError("engine_unavailable", "SenseVoice 引擎将在 Phase 2 提供，当前请使用 faster_whisper 或 siliconflow")


class SiliconFlowEngine(AsrEngine):
    """SiliconFlow SenseVoice 在线引擎（Phase 2 预留）— FunAudioLLM/SenseVoiceSmall 免费 API。"""

    name = "siliconflow"

    def is_available(self) -> bool:
        return bool(os.environ.get("SILICONFLOW_API_KEY"))

    def install_hint(self) -> str:
        return "SiliconFlow 引擎未配置：请注册 SiliconFlow（https://siliconflow.cn）并设置 SILICONFLOW_API_KEY 环境变量"

    def transcribe(self, audio_path: str, *, language: str | None = None) -> AsrResult:
        raise AsrEngineError("engine_unavailable", "SiliconFlow 引擎将在 Phase 2 提供，当前请使用 faster_whisper")


_ENGINES: dict[str, type[AsrEngine]] = {
    "faster_whisper": FasterWhisperEngine,
    "sensevoice": SenseVoiceEngine,
    "siliconflow": SiliconFlowEngine,
}


def get_asr_engine(engine_name: str | None = None) -> AsrEngine:
    """按名称或环境变量获取引擎实例。未知名称抛 AsrEngineError。"""
    name = (engine_name or os.environ.get("ASR_ENGINE") or "faster_whisper").strip()
    cls = _ENGINES.get(name)
    if cls is None:
        raise AsrEngineError(
            "engine_unavailable",
            f"不支持的 ASR 引擎: {name}，支持: {', '.join(sorted(_ENGINES))}",
        )
    return cls()
