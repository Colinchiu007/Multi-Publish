## Why

2026-08-13 归档的 `pipeline-progress-feedback-unification` 只落地了统一契约骨架（`stage.progress` 双写、通用渲染、加权总进度），执行器覆盖不完整：story2video-compose 最耗时的 `optimize`（逐场景 LLM）与 `generate_assets`（图片/TTS/视频并行）仍只写旧 `context.optimize_progress` / `context.assets_progress`，未接入统一 `onProgress` 通道——运行中没有迷你进度条、完成态没有 summary；其余 8 条注册流水线（talking-head、cinematic、clip-factory、documentary、localization-dub、podcast-repurpose、videogen、smoketest）执行器完全无进行中反馈，explainer 仅 10%→100% 跳变且无 summary。运行中 message 由主进程硬编码中文，en 界面中英混排。

## What Changes

- `optimize` / `generate_assets` / `finalize_assets` 执行器接入统一 `onProgress` 通道：内部循环（逐场景、逐资源项、逐段 TTS）按子步骤上报 `percent + message + detail`，完成态写入 `stage.summary`；保留旧 `context.*_progress` 兼容旧快照读取。
- 进行中信息结构化本地化：`stage.progress` 可选携带 `messageKey` / `messageParams`，`stage.summary` 对应可选 `summaryKey` / `summaryParams`；渲染端优先按 key 走 locale 模板（zh/en 成对，CI Gate 7），缺失时降级 raw message/summary（旧快照兼容）。
- `detail.kind` 枚举收口：`scene` / `image` / `video` / `tts` / `platform` / `segment`。
- 其余流水线执行器（explainer 补 summary；talking-head / cinematic / clip-factory / documentary / localization-dub / podcast-repurpose / videogen / smoketest）接入最小进行中反馈：阶段开始 message + 完成 summary，内部循环按子步骤计数上报。
- 前端 `StageProgress.vue` 支持 `messageKey`/`summaryKey` 本地化渲染；新增 locale 键 zh/en 成对。

## Capabilities

### New Capabilities
- 无（增量统一层，不引入新能力域）

### Modified Capabilities
- `pipeline-progress-feedback`: 执行器覆盖完整化（optimize/generate_assets/finalize_assets 统一通道）、进行中信息结构化本地化（messageKey/summaryKey）、其余流水线反馈基线（所有注册流水线耗时阶段必须提供进行中 message + 完成 summary）

## Impact

- 执行器：`apps/desktop/electron/services/story2video-stages.js`、`stage-executor.js`、`explainer-stages.js`、`talkinghead-stages.js`、`cinematic-stages.js`、`clipfactory-stages.js`、`documentary-stages.js`、`localization-stages.js`、`podcast-repurpose-stages.js`、`videogen-stages.js`、`smoketest-stages.js`
- 契约校验：`apps/desktop/electron/services/stage-executor.js`（normalizeStageProgress 扩展 messageKey/summaryKey）、`pipeline-engine.js`（透传不变）
- 渲染：`apps/desktop/src/views/video-creation/StageProgress.vue`、`apps/desktop/src/locales/zh.js`、`apps/desktop/src/locales/en.js`
- 测试：`pipeline-story2video-contract.test.js`、`stage-executor.test.js`、`story2video-stages.test.js`、`explainer-stages.test.js`、`StageProgress.test.js`、`CreateView.test.js` 及新增流水线执行器断言
- 无新增依赖；不影响 checkpoint 语义与阶段执行顺序；真实 provider 目验属外部验收
