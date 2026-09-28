## Why

用户确认卡片背景采用**方案 B**：预生成固定静态图并打包进项目（git 同步、所有用户一致），**彻底移除运行时生成**。运行时生成存在两个现实问题：(1) 存量 profile 的 MiniMax/LLM Key 经诊断均无法被当前 Electron 43 解密（DPAPI 上下文不匹配，往返加密正常、存量 blob 解密失败），真实 MiniMax 出图不可用；(2) 运行时生成依赖每台机器各自配置 Key，团队分发体验不一致且消耗额度。预生成改用**免费生图模型 Pollinations（flux）**完成，避免依赖任何 API Key。

## What Changes

- **静态资源**：`apps/desktop/src/assets/pipeline-card-bg/` 新增 15 张 1024x576 JPEG（每流水线一张，提示词含统一风格块 + 主题意象，低饱和深色、留白、无文字无人物）。
- **前端**：`PipelineSelector.vue` 改为直接使用内置静态资源映射（`pipeline-card-bg-assets.js`），删除运行时获取逻辑（fetchCardBackgrounds/bgLoading/bgHint/一次性提示/加载 shimmer）；保留背景层、双层暗色遮罩、悬停/焦点动效、reduced-motion、ARIA。
- **移除运行时生成链路（彻底）**：删除主进程服务 `pipeline-card-backgrounds.js`、IPC handler、preload `pipelineCardBackgrounds`、PUBLIC_METHODS/license-access-control 通道、`src/api/publisher.js` 封装及其测试；恢复 preload.test.js 计数。
- **样式**：`pipeline-selector.css` 删除 shimmer/生成中提示/失败提示样式，保留背景层与动效。
- **文案**：删除 `pipelines.selector.*`（bgGenerating/bgUnavailable/bgPartialFailure/bgClose）zh/en key 与术语表「卡片背景」行（不再有运行时提示文案）。
- **文档**：PRD-video-creation §3.1.24 改写为静态资源方案；CHANGELOG、learnings、质量门禁记录；OpenSpec change。
- **交付**：codex 分支 + 隔离 worktree + PR + CI + 合并回 main + 三同步归档。

## Capabilities

### New Capabilities
<!-- 无 -->

### Modified Capabilities
- `pipeline-card-backgrounds-ui`: 由「运行时 MiniMax 生成 + 磁盘缓存 + loopback 服务」改为「打包内置静态背景资源，前端直接引用；不再调用任何生成 API、不访问网络、不写缓存」。

## Impact

- 运行时代码：`apps/desktop/src/assets/pipeline-card-bg/*.jpg`（新增 15 张）、`apps/desktop/src/story2video/pipeline-card-bg-assets.js`（新增）、`apps/desktop/src/views/video-creation/PipelineSelector.vue`、`apps/desktop/src/styles/pipeline-selector.css`、`apps/desktop/src/locales/zh.js`、`en.js`
- 删除：`apps/desktop/electron/services/pipeline-card-backgrounds.js`(+test)、`apps/desktop/electron/ipc-handlers/pipeline-card-backgrounds.js`(+test)、preload/api/access-control/license-access-control 相关接线、`PipelineSelector.test.js` 运行时用例
- 测试：`PipelineSelector.test.js` 重写（静态资源映射、无 API 调用、ARIA/动效保留）
- 文档：PRD-video-creation §3.1.24、CHANGELOG、learnings、i18n-glossary、.quality-gates.md、openspec/changes/pipeline-card-bg-static-bundle
