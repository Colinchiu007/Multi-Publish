---
id: subtitle-audio-alignment
change_id: subtitle-audio-alignment
---

# 字幕时间戳真实对齐 — 设计

## 数据流

```
分句引擎(8002/本地TS) ──textBlocks──> 对齐层 ──alignedBlocks──> 渲染器(slideshow/合成)
TTS(含MiniMax) ──audio──> 对齐层(ASR) ──wordTimestamps──┘
```

## 关键设计点

1. **分句与对齐解耦**：文本块序列由分句引擎唯一决定；对齐层只替换时间戳，不改变文本；
2. **ASR 词级时间**：faster-whisper `word_timestamps=True`（MoneyPrinterTurbo 同款）；
   词 → 块聚合：块内首个词 start = 块 start，块内末词 end = 块 end；块间取 round 后严格连续；
3. **失败降级**：ASR 服务不可用/超时/音频缺失 → 返回 `method:'estimate'` 的 Tier 3 估算，
   并在 `subtitleSource`/`subtitleTimeline` 持久化 `aligned:false` + `reason`（与既有 fallbackReason 契约一致）；
4. **校验**：对齐块拼接文本与输入 textBlocks 逐字一致（Levenshtein 容忍 ASR 识别误差，参考 MoneyPrinterTurbo）；
   不一致块回退估算并记录 warning；
5. **性能**：ASR 模型 small/base 优先（CPU 可跑），批处理按场景音频切片；单场景 ≤10s 音频目标 <2s 对齐耗时。

## 测试策略

- 契约测试：mock ASR 返回词级时间 → 断言聚合/裁剪/连续/回退；
- 真值测试：用已知音频（人工标注词边界）验证 <200ms 误差；
- 双实现：8002 与本地 TS 跑同一对齐向量。

## 任务拆解

1. sidecar /align 接口 + faster-whisper 集成（含模型下载、超时、并发）；
2. Node 聚合器（wordTimestamps → alignedBlocks，含 Levenshtein 校验）；
3. 流水线接入（TTS 完成后、合成前）+ 持久化 aligned 标记；
4. 契约/真值测试 + PRD 验收。
