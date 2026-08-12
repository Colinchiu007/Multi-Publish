---
id: subtitle-audio-alignment
---

# 任务

- [x] 1. ASR sidecar `/align`（faster-whisper base，词级时间戳；`packages/audio-aligner/`，:8004；模型已缓存）
- [x] 2. Node 聚合器 `subtitle-aligner.ts`（wordTimestamps → alignedBlocks，Levenshtein 校验，区间连续 half-up）
- [x] 3. 流水线接入（story2video-stages.js TTS 后调用 alignScenes + `subtitleAlign` 持久化；aligner 不可用 fail-fast 跳过）
- [x] 4. 契约测试 + 真实验证（aligner API 4 例 / 聚合器 8 例 / bridge 2 例；edge-tts 合成音频 E2E coverage 100%，ffprobe 时长锚定一致）
