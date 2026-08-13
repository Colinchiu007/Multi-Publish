## Why

视频创作流水线各阶段「进行中」的信息反馈颗粒度不统一：仅 compose / generate_assets / optimize 有子进度（`compose_progress` / `assets_progress` / `optimize_progress`），其余阶段（domain_enrich、scene_context、select_video_scenes、finalize_assets、publish，以及 animated-explainer、talking-head 等其余 13 条流水线的全部阶段）运行中只有「运行中 + 开始时间」，长耗时阶段（LLM 调用 20s+、逐平台发布、逐段 TTS）无任何进行中细节。进度数据散落在 `run.context` 的多个非统一 key，阶段对象（`stage`）无 progress 字段，前端按阶段名硬编码特判渲染——新增阶段或其他流水线一律回到「运行中」。

## What Changes

- **统一阶段进度契约**：`stage.progress = { percent, message, detail?, updatedAt }` + 可选 `stage.summary`；经 `getRunSnapshot().stages[i].progress` 下发，并与 `context.stage_progress` 双写（兼容 3s 轮询读取路径）。
- **StageExecutor 通用 onProgress 通道**：`execute` 增加统一 `onProgress({ percent, message, detail })` 参数；`_executeStage` 注入并双写；字段级归一化/校验统一收口（percent 0-100 单调、message 限长、非法值 fail-closed 或拒绝展示）。additive 扩展，不改变现有执行器默认行为。
- **逐阶段补齐进行中反馈**：publish 逐平台（「正在发布到 {平台} (i/N)」）、finalize_assets 逐段 TTS、LLM 阶段（domain_enrich / scene_context / select_video_scenes / explainer 系列）调用前后、split 完成摘要、**optimize 运行中展示**（`optimize_progress` 数据已存在，UI 仅在完成后显示——修复展示缺口）。
- **UI 通用化**：StageProgress.vue 移除按 `stage.name` 特判，统一渲染 `stage.progress.message` + 迷你进度条（percent 合法即显示）；compose 子进度条泛化为任意阶段。
- **总进度平滑**：从「完成阶段数/总阶段数」升级为「阶段数占比 + 当前阶段 percent 加权」。

## Capabilities

### New Capabilities
- `pipeline-progress-feedback`: 统一视频创作流水线阶段「进行中」信息反馈契约——stage 级进度模型（`stage.progress` / `stage.summary` / `context.stage_progress` 双写）、StageExecutor 通用 `onProgress` 通道与字段级校验、各阶段目标反馈粒度（publish/finalize_assets/LLM 阶段/split/optimize 运行中）、StageProgress 通用渲染与总进度加权。

### Modified Capabilities
（无。现有 `story2video-compose-progress` / `story2video-creation-mode` / `image-prompt-engine` 已覆盖 compose/select_video_scenes/generate_assets/optimize 的 `context.*_progress` 契约；本 change 为增量扩展，不改其既有 requirement 行为。）

## Impact

- `apps/desktop/electron/services/pipeline-engine.js`：run/stage 结构（新增 `stage.progress`/`stage.summary`）、`getRunSnapshot` 下发、`_executeStage` 注入 onProgress、`_calcProgress` 加权。
- `apps/desktop/electron/services/stage-executor.js`：`execute` 签名 + 通用归一化/校验 + PUBLISH 循环接入。
- `apps/desktop/electron/services/story2video-stages.js`（+ explainer/talkinghead/cinematic 等按需）：各阶段接入 onProgress。
- `apps/desktop/src/views/video-creation/StageProgress.vue`、`apps/desktop/src/views/CreateView.vue`：去特判、通用渲染、快照字段透传。
- locale：新增用户可见文案 zh/en 成对（CI Gate 7）。
- 测试：`pipeline-engine` / `stage-executor` / `story2video-stages` 契约测试 + `StageProgress` / `CreateView` UI 测试；保留 `story2video-ue-contract.test.js` 阶段清单用例。
