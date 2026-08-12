"""audio-aligner REST API（FastAPI，端口默认 8004，PORT 环境变量优先）。"""
from __future__ import annotations

import logging
from typing import List, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from .core import transcribe

logger = logging.getLogger("audio-aligner")
app = FastAPI(title="Audio Aligner", version="0.1.0")


class AlignRequest(BaseModel):
    audio_path: str = Field(..., description="音频文件绝对路径（wav/mp3/m4a 等 ffmpeg 可解码格式）")
    options: dict = Field(default_factory=dict, description="model/language/beam_size/vad_filter/initial_prompt/max_seconds")


@app.get("/health")
def health():
    return {"status": "ok", "service": "audio-aligner", "model_ready": True}


@app.post("/align")
def align(req: AlignRequest):
    """音频 → ASR 词级时间（供 Node 聚合器对齐分句块）。

    - 仅做 ASR（words/segments）；文本块聚合在 Node 侧（story2video-engine subtitle-aligner）；
    - initial_prompt 可传分句块拼接文本提升中文识别准确率。
    """
    try:
        opts = dict(req.options or {})
        if "model" in opts:  # 公开参数名 model → core.model_size
            opts["model_size"] = opts.pop("model")
        result = transcribe(req.audio_path, **opts)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except Exception as e:  # noqa: BLE001
        logger.exception("align failed")
        raise HTTPException(status_code=500, detail=f"align failed: {e}") from e
    return result
