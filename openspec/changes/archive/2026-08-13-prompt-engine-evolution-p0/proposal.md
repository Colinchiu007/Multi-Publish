## Why

图片/视频提示词引擎目前是"静态模板 + 每次从零生成"：`storyboard-prompt.ts`（8 构图×14 动作×23 物体×三步隐喻）、`history-prompt.ts`（时代/朝代增强 + prompt-engine 优化）每次生成都不复用历史经验，生成结果、用户采纳行为、平台发布表现全部没有沉淀。没有生成日志，就没有"进化"的数据基础——必须先建立反馈管道。

## What Changes

- **新增桌面端生成反馈管道（P0 范围）**：`GenerationEvent` / `FeedbackEvent` 双日志（append-only JSONL，按 `eventId` join），覆盖 Story2Video 图片轮播与视频合成的每次生成与用户操作。
- **新增 IPC 契约**：`generation:feedback`（渲染→主进程，`eventId` 必传），`prompt-library:list/get/activate`（只读/治理，P0 仅 list 骨架）。
- **前端埋点**：Story2Video 结果页对「采纳候选 / 重新生成 / 编辑字段 / 下载」上报 FeedbackEvent。
- **基础统计**：acceptRate / regenerateRate / 平均耗时（按 engine 聚合）。
- **契约测试**：append-only 校验、eventId join、写失败不阻断生成主流程、`os.tmpdir()` 隔离。

范围边界（本 change 不实现，后续 change 承载）：Evaluator 评分、PromptMemory 记忆库、Optimizer 重排/Self-Refine/A-B、Governance 门禁回滚、平台 per-note 回灌、provider 路由学习。

## Capabilities

### New Capabilities
- `prompt-engine-evolution`: 提示词引擎自进化反馈管道契约（GenerationEvent/FeedbackEvent 双日志 append-only、eventId join、generation:feedback IPC、采集开关三态、基础统计、失败不阻断主路径）。

### Modified Capabilities
- （无。既有 `image-prompt-engine` 覆盖"优化路径统一走 prompt-engine"，本 change 的日志采集为独立新能力，不改变其需求。）

## Impact

- 新增：`apps/desktop/electron/services/prompt-evolution/`（signal-collector.js + schema 常量 + 轮转 + stats）、`apps/desktop/electron/ipc-handlers/generation-feedback.js`、配套 `*.test.js`。
- 修改：`apps/desktop/electron/ipc-handlers/index.js`（注册）、`apps/desktop/electron/core/container.setup.js`（feature flag 注册）、`packages/story2video-engine/src/history-prompt.ts`（`generateImagePromptsSmart` 增加可选 `onEvent` 回调）、Story2Video 结果页埋点。
- 不改变：`generateCandidates` 同步签名、`composeStoryboardPrompt`、`PromptBridge` 契约、`IMAGE_STYLE_PRESETS`、`COMPOSITION_PATTERNS`。
- 存储：`userData/generation-logs/YYYY-MM.jsonl`（月轮转，30 天清理）。
- 文档：`01-docs/prompt-engine-evolution-design.md`（已定稿，作为 design 参考）、CHANGELOG、quality-gates。
- 交付：`codex/` 分支 + PR；双模型审查；桌面 Vitest 测试。
