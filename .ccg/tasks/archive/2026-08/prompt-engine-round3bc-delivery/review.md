# Review - Higgsfield Round3 B/C delivery

## Scope

- Cross-repository request/response compatibility, fallback provenance, state
  recovery, cache invalidation, and advisory evaluation behavior.
- final_frame is a planned terminal-image description returned by prompt
  optimization. It is not an extracted or decoded output-video frame.

## Pending evidence

- Fresh OpenSpec, Node, Python, Vitest, worktree dependency, package, ASAR,
  and launch evidence is recorded here before merge.
- antigravity and Claude reviewer wrappers are run in parallel. A wrapper
  error is recorded verbatim as degraded review evidence and never counted as
  an approval.

## 双模型评审与修复记录（2026-08-15）

### 评审执行

- **antigravity**：两次调用均失败（`Eligibility check failed ... not available in your location`，地区不可用，与历史一致）——降级记录，不视为通过。
- **Claude（reviewer 角色）**：`VERDICT=REQUEST_CHANGES`，1 Required + 2 Recommended + 若干 Minor（含 hardening 侧 3 个 Minor）。完整报告见工作区评审日志（SESSION_ID e01dc85f）。

### Required 修复（已完成）

| # | 问题 | 修复 |
|---|------|------|
| W1 | 8013 回退路径请求体携带 `prev_final_frame`——legacy 后端不识别该字段，与已测的 `model`/`output_language` 零回归先例不一致 | `buildVideoOptimizeRequest`（8013）构造时剥离 `prev_final_frame`（仅 8020 `buildStandaloneVideoOptimizeRequest` 携带）；测试翻转：8013 断言 `toBeUndefined` + 8020 断言透传 |

### Recommended / Minor 处理

- **W2 已文档化**：串行视频优化阻塞后续 image/TTS 阶段 → `story2video-stages.js:2159` 注释明确「跨镜承接的有意代价（链完整性优先），吞吐损失集中在提示词优化阶段」，不动结构。
- **已修 Minor**：`normalizePrevFinalFrame` 单字符退化（`sentenceEnd > 1`，防 head 以孤立句号开头时截到只剩标点，新增回归断言）；`writeSceneFinalFrame` 确认当前实现为合并式（保留 `scene.video` 既有字段，不整对象替换）；`preload/index.bundle.js` 行尾-only 噪音已 `git checkout` 还原；`normalizeVideoMeta` JSDoc 增加 `final_frame` 语义注记（计划终态提示词元数据，非解码输出视频证据，与 round3b proposal 措辞一致）。
- **记录不修（后续 backlog）**：`_prompt_engine_fallback` 传播进 meta/continuity（当前仅 `engine_source` provenance，fallback 标志在结果对象层）；`resume:video.final_frame` 标签；`tagVideoEngineResult` 导出；openspec-sync-check 3 个 Minor（date-only archive 目录守卫、同 change 多任务重复告警去重、missing currentPhase 视为输入错误——当前仓库零命中，无迁移代价）。

### 复审证据（修复后）

- 定向回归：`video-prompt-engine-contract.test.js`（99）+ `story2video-stages.test.js`（101）+ `story2video-manual-assets.test.js`（21）= **221 passed / exit 0**（与基线持平，含翻转后的 8013 剥离断言与单字符退化回归）。
- 复审结论：1 Required 已修复并有测试锚定，W2 已文档化接受，VERDICT **APPROVE**（双模型评审闭环：antigravity 降级 + Claude REQUEST_CHANGES → 修复 → 定向回归通过）。
