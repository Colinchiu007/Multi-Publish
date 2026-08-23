## Why

`01-docs/HELL-GRIND-OPENSOURCE-ANALYSIS-ROUND3-2026-08-14.md`（v3.0）以 `origin/main` 实测发现三类可立即实施的增量：

1. **图片缓存 key 串号缺陷（P0）**：A 线对齐后图片 evaluator 的 violations 扣分依赖 `excluded_characters`/`no_swap_pairs`（择优结果随其变化），但 `prompt_engine/cache_manager.py:100-113` 的 key 未含这两个字段（也不含 context/style/language、无版本盐）。请求 A（`excluded=["JAX"]`）与请求 B（`excluded=[]`）key 相同 → B 串号命中 A 的择优结果。视频侧 key（`video_prompt_engine/optimizer.py:126-145`）已含全部组件 + 版本盐，图片侧落后。
2. **确定性校验未自动化（P0-3）**：`failure_patterns.json` 12 条判据中，`timeline_missing`（多切提示词缺 `[SHOT N]`/`[HARD CUT]` 标记）与 `timing_break`（beats 时间锚和 vs duration 冲突）是**纯结构/数学检查、零误判**，但 evaluator violations 未实现（实际仅 4/12 自动化）。
3. **音频块粗粒度（P0-4）**：`VideoPromptMeta.audio` 单值（默认 "SFX"，≤50 字符），appendVideoTrailer 拼 `{audio} only.`；语料实证 64% 有完整 Audio 块（环境音/音效/对白/音乐开关分层）。粗粒度导致 missing_audio 检查无法区分"有环境音但无对白音效"的合法形态。

## What Changes

- **图片缓存 key 修复**（prompt-engine `prompt_engine/cache_manager.py`）：`make_key` 增加 `excluded_characters`/`no_swap_pairs` sha1 哈希 + `context` 哈希 + `style` + `language` 组件 + 版本盐（如 `IMAGE_FMT_V1`）；bump key 版本使旧缓存自然失效；同步更新内存/SQLite 两层缓存的 get/set 签名；回归测试断言同参数异约束/异 context → key 不同。
- **确定性 violations 自动化**（prompt-engine `video_prompt_engine/evaluator.py` + `strategies/base.py` + `generic_video.py` + `optimizer.py`）：**先教标记**——refined 多切（shots≥2）指令 rendered prompt 嵌入 `[SHOT N]`/`[HARD CUT]` 切分标记，视频缓存 key 版本盐 `HIGGSFIELD_FMT_V1 → V2` 使旧形态缓存失效；再落地 `violations["timeline_missing"]`（-5：shots≥2 时正文缺标记）与 `violations["timing_break"]`（-5：`beats[].time` 区间端点最大值超出 `shot.duration + 2s` 容差）——纯结构/数学判定，无 LLM、无启发式误判面；`checks` 暴露 `timeline_hits`/`timing_diff` 供调试。
- **音频分层**（prompt-engine `video_prompt_engine/models.py` + `strategies/generic_video.py`）：`VideoPromptMeta` 新增 `audio_layers`（可选对象 `{environment?, sfx?, dialogue?, music_off?}`，各 ≤200 字符，**默认 None 保持零回归**）；refined 渲染时若 `audio_layers` 非空则输出完整 Audio 段（`Audio: Environmental {environment}. SFX: {sfx}. Dialogue: {dialogue}. No music.` 形态），否则保持现有 `{audio} only.` 尾行；`missing_audio` 检查升级：`audio_layers` 提供时按层校验（environment/sfx/dialogue 至少 1 层非空即满足），未提供时沿用现状。
- **测试**：图片 cache key 回归（含 context/约束/语言变化）；视频 evaluator 确定性校验（timeline/timing 正反例 + 与既有 violations 共存）；音频分层（渲染单串形态 + missing_audio 细化 + 零回归：不传 audio_layers 行为不变）。
- **文档**：CHANGELOG、learnings（缓存 key 分叉教训）、v3.0 报告落地状态。

## Capabilities

### New Capabilities
- `prompt-engine`: 图片缓存 key 全组件化（含 Higgsfield 约束入参哈希 + context/style/language + 版本盐）；视频 evaluator 确定性 FAIL CHECK 自动化（timeline/timing）；音频分层输出（audio_layers，向后兼容）。

### Modified Capabilities
<!-- 无；openspec-integration 为流程契约，不受本变更影响 -->

## Impact

- 运行时代码（prompt-engine 仓库）：`prompt_engine/cache.py`（SqlitePromptCache.make_key）、`prompt_engine/cache_manager.py`（MemoryPromptCache + legacy 兼容）、`prompt_engine/optimizer.py`（_cache_key/_cache_get/_cache_set 调用点）、`video_prompt_engine/strategies/base.py`（Director Workflow 教标记 + extract_video_meta 清洗 + build_tail 去重）、`video_prompt_engine/evaluator.py`、`video_prompt_engine/models.py`、`video_prompt_engine/strategies/generic_video.py` + 对应测试。
- 外部依赖：Multi-Publish 契约层不改（audio_layers 为引擎输出增强，appendVideoTrailer 保持字符串 audio 选项向后兼容）；联调验收确认无回归。
- 文档：CHANGELOG.md、01-docs/learnings.md、01-docs/HELL-GRIND-OPENSOURCE-ANALYSIS-ROUND3-2026-08-14.md（落地状态附录）。
- 交付：prompt-engine 仓库 codex/ 分支 + PR 合并；测试全量回归（cache key 变更影响图片侧缓存语义，evaluator 变更影响视频侧择优）。
