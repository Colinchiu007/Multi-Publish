# Proposal: 图片轮播流水线「视频合成」阶段子百分比进度条

## Why

图片轮播流水线（story2video-compose）启动后，`compose`（视频合成）阶段在 6 阶段清单中只显示「进行中」状态与耗时，不显示任何子进度；该阶段实际耗时占比最大（逐场景 ffmpeg 合成 + 拼接 + 旁白合并 + 可选 BGM/转码 + 校验），用户无法判断进度与剩余工作量，体验与 `optimize`（场景 x/y）、`generate_assets`（图片/旁白 x/y）已有的子进度不对称。

## What Changes

- `Story2VideoComposeEngine.compose(assetManifest, options, onProgress)` 新增可选进度回调（兼容 `options.onProgress`），按阶段权重发射 `{ phase, percent, segmentsDone, segmentsTotal, message }`：预检 0% → 校验通过 4% → 逐片段 5..75% → 拼接 80% → 旁白 87% → BGM 91%（可选）→ WebM 95%（可选）→ 校验 98% → 完成 100%；percent 单调不降、整数 0-100。
- StageExecutor 内置 COMPOSE 执行器将 `options.onProgress` 透传，回调内 fail-closed 写入 `context.compose_progress`（非有限 percent 不写）。
- 前端 CreateView.vue：`stageDetailText` 新增 compose 分支；compose 阶段 running 时渲染子进度条（mini bar + 文案，含 `data-testid`）；新增 zh/en i18n 键。
- 测试：compose 引擎进度发射（mock `_createSegment`）、执行器 context 写入、前端子进度条渲染与文案；契约测试同步更新。
- 文档：PRD（`01-docs/PRD.md`、`01-docs/PRD-video-creation.md`）与 CHANGELOG 补充数据校验、流程、功能逻辑、交互逻辑、显示项、提示文字。

## Capabilities

- **New Capabilities**: `story2video-compose-progress`（compose 阶段子进度数据契约与展示规范）
- **Modified Capabilities**: 无（openspec/specs 下无 story2video 既有能力规格）

## Impact

- 代码：`apps/desktop/electron/services/story2video-compose-engine.js`、`stage-executor.js`、`apps/desktop/src/views/CreateView.vue`、i18n locale 文件
- 测试：`story2video-compose-engine.test.js`、`stage-executor.test.js`、`CreateView.test.js`、`pipeline-story2video-contract.test.js`、`story2video-ue-contract.test.js`
- 文档：`01-docs/PRD.md`、`01-docs/PRD-video-creation.md`、`CHANGELOG.md`
- 无依赖/API 破坏：compose 参数仅新增可选回调，现有调用方（ServiceBus、测试）向后兼容。
