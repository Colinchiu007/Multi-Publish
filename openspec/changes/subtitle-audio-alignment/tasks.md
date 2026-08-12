---
id: subtitle-audio-alignment
---

# 任务

- [ ] 1. ASR sidecar `/align`（faster-whisper，词级时间戳；模型下载/超时/并发）
- [ ] 2. Node 聚合器（wordTimestamps → alignedBlocks，Levenshtein 校验，区间连续）
- [ ] 3. 流水线接入（TTS 后、合成前）+ `aligned`/`reason` 持久化
- [ ] 4. 契约测试 + 真值测试（<200ms）+ PRD 验收
