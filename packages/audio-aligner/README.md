# Audio Aligner — 字幕时间戳真实对齐（Tier 2 ASR sidecar）

## 依赖
- Python 3.10+，`pip install fastapi uvicorn faster-whisper pydantic`
- whisper 模型由 faster-whisper 自动从 HF 缓存加载（base 已缓存；可用 large-v3）

## 启动
```bash
python -m audio_aligner          # 默认 127.0.0.1:8004
# 或 PORT=8005 python -m audio_aligner
```

## API
- `GET /health` → `{status: ok}`
- `POST /align` body:
```json
{ "audio_path": "C:/tmp/vo.mp3",
  "options": { "model": "base", "language": "zh", "beam_size": 5, "vad_filter": true,
               "initial_prompt": "要知道在农耕社会，柴火、盐巴和香料……" } }
```
→ `{ words: [{text,start,end,probability}], segments, language, duration, elapsed_ms, model }`

## 定位
只做 ASR 词级时间；文本块聚合在 Node 侧（story2video-engine `subtitle-aligner.ts`）。
对齐层编排见 Electron `aligner-bridge.js`。
