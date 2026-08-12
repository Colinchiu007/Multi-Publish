---
id: subtitle-audio-alignment
title: 字幕时间戳真实对齐（Tier2 ASR 强制对齐）
status: implemented-partial
created: 2026-08-12
---

# 字幕时间戳真实对齐

## 背景

当前字幕时间戳为「真实总时长 + 文本/标点权重」的比例估算（PRD 7.1.1）：分句本身是纯文本驱动，
但 `duration_i = len_i / Σlen × parent_duration` 的估算与真实朗读节奏有偏差（长词/停顿/语气均未建模）。
用户要求「忽略时长、只要时间戳准确」——即分句完全交给语义/可读性，时间戳交给真实音频。

## 问题

1. MiniMax TTS（t2a_v2）只返回音频字节（`data.audio` hex），无词级时间戳（Tier 1 不可用）；
2. 本地 `buildSubtitleTimelineV2` / `slideshow.ts` 已有真实音频总时长与 `charTimings` 挂点，
   但 charTimings 是 `duration / charCount` 均分估算，非真实词边界；
3. 行业主流（MoneyPrinterTurbo 102k★ / edge-tts SubMaker / aeneas / WhisperX）均以真实词级时间为准。

## 方案（两阶段模型）

- 设计期（无音频）：现有文本切分 + 比例估算，仅用于预览，标注「估算」；
- 渲染期（有音频）：新增对齐层，把真实词级时间聚合到分句结果（同一文本块不变）。

### 时间戳来源三级

| Tier | 来源 | 精度 | 现状 |
|------|------|------|------|
| 1 | TTS 词边界事件（Azure WordBoundary / edge-tts SubMaker） | 精确 | 预留（MiniMax 不支持） |
| 2 | ASR 强制对齐（faster-whisper word_timestamps / aeneas） | 词级 | **本次实施目标** |
| 3 | 字数比例估算 | 近似 | 现状（预览兜底） |

### 对齐层契约（草案）

```
输入: { audioPath, textBlocks: [{text, displayOrder, startTime, endTime}], config? }
输出: { aligned: [{text, displayOrder, startTime, endTime, charTimings?, confidence?}], method: 'asr'|'estimate', warnings? }
```

- 实现路径：Electron 主进程编排（与 8002/8013 sidecar 模式一致）——新增 Python sidecar 或本地
  faster-whisper 服务暴露 `/align`（audio + text → word timestamps），Node 侧聚合到分句块；
- 回退：ASR 不可用/超时 → 保持 Tier 3 估算并标记 `method: 'estimate'`（fail-open 到估算，不中断流水线）；
- 一致性：聚合时按分句块边界裁剪词时间，保证区间连续、不重叠（复用现有舍入后累加约束）。

## 验收标准（草案）

- [ ] 同一音频+文本，对齐结果与人工标注词边界误差 < 200ms（抽样 ≥5 句）；
- [ ] 分句块文本序列与纯文本切分结果一致（对齐不改变分句）；
- [ ] 对齐失败回退估算且标记 `method: 'estimate'`，流水线不中断；
- [ ] 契约测试覆盖：空音频/缺文本/超时/ASR 返回错位等边界；
- [ ] 双实现（8002/本地）跑同一对齐测试向量。

## 实施状态（2026-08-12）

- ✅ ASR sidecar：`packages/audio-aligner/`（FastAPI :8004，faster-whisper base 已缓存模型，`/align` 返回词级时间）；
- ✅ Node 聚合器：`packages/story2video-engine/src/subtitle-aligner.ts`（Levenshtein 容差匹配 + 区间连续 + half-up + fail-open 估算）；
- ✅ Electron bridge：`apps/desktop/electron/services/aligner-bridge.js`（BasePythonBridge 模式，:8004，5min 超时）+ 契约测试；
- ✅ 真实验证：edge-tts 合成旁白 → ASR 55 词 / 15.72s（ffprobe 一致）→ 7 块全部命中（coverage 100%），真实时间替代估算；
- ⏳ 流水线 stage 接线（TTS 后、合成前调用 + aligned 持久化）：bridge 与聚合器就绪，stage 文件由并发工作流占用，接线留待下一步；
- 待决策：绝对误差 <200ms 需人工标注抽样（edge-tts 免费端点无 WordBoundary 真值）；ASR 模型可切 large-v3 提升精度。
