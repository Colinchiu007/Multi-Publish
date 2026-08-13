## Why

视频创作首页（`/create` → 流水线创作视图）目前为卡片式布局，但页面容器被 `max-width: 1080px` 封顶且网格仅有单一断点，宽屏/高分屏下多列动态排布受限；卡片为纯色背景，视觉单调且缺少与产品调性匹配的背景视觉与交互动效。用户要求：按设备分辨率/宽度自动排列的多列布局、每张卡片用 MiniMax（image-01）生成统一风格且与文字协调的差异化背景、增加交互动态效果，并同步 PRD 与相关文档。

## What Changes

- 布局：`CreateView.vue` 流水线选择视图放宽页面容器（`create-page--pipeline-list` modifier，`max-width` 提升至 1600px），`pipeline-selector.css` 增加显式响应式断点（1/2/3/4/5 列，按视口宽度自动排列）。
- 背景生成：新增主进程服务 `apps/desktop/electron/services/pipeline-card-backgrounds.js`（MiniMax image-01 生成 + HTTPS 安全下载 + `userData/pipeline-card-bg/` 磁盘缓存 + 最小 loopback 静态服务），IPC `pipeline-card:backgrounds` + preload `pipelineCardBackgrounds()` + `src/api` 封装。
- 前端：`PipelineSelector.vue` 每张卡片渲染生成背景（暗色遮罩保证文字对比度）、加载 shimmer、无 provider/失败时渐变 fallback；悬停/焦点/入场动效 + `prefers-reduced-motion` 降级；提示文字 zh/en 成对新增 `pipelines.selector.*`。
- 文档：01-docs/PRD.md 视频创作首页卡片 UI 规格（数据校验、流程、功能逻辑、交互逻辑、显示项、提示文字）、CHANGELOG、learnings、i18n 术语表、OpenSpec 全套工件。
- 交付：codex 分支 + 隔离 worktree + PR + CI + 合并回 main；质量节拍全程门禁。

## Capabilities

### New Capabilities
- `pipeline-card-backgrounds-ui`: 视频创作首页流水线卡片的多列响应式布局、MiniMax 生成差异化背景（统一风格/缓存/降级）与交互动效的可观察行为契约。

### Modified Capabilities
<!-- 无既有 spec 需求变更 -->

## Impact

- 运行时代码：`apps/desktop/electron/services/pipeline-card-backgrounds.js`（新）、`apps/desktop/electron/ipc-handlers/pipeline-card-backgrounds.js`（新）、`apps/desktop/electron/ipc-handlers/index.js`、`apps/desktop/electron/preload/publish.js`、`apps/desktop/electron/preload/access-control.js`、`apps/desktop/src/api/publisher.js`、`apps/desktop/src/views/video-creation/PipelineSelector.vue`、`apps/desktop/src/styles/pipeline-selector.css`、`apps/desktop/src/styles/create-view.css`、`apps/desktop/src/views/CreateView.vue`、`apps/desktop/src/locales/zh.js`、`apps/desktop/src/locales/en.js`
- 测试：`apps/desktop/electron/services/pipeline-card-backgrounds.test.js`（新）、`apps/desktop/electron/ipc-handlers/pipeline-card-backgrounds.test.js`（新）、`apps/desktop/src/views/video-creation/PipelineSelector.test.js`（新）、`apps/desktop/electron/preload/access-control.test.js` 更新、既有 CreateView/Story2Video 套件回归
- 文档：`01-docs/PRD.md`、`CHANGELOG.md`、`01-docs/learnings.md`、`01-docs/i18n-glossary.md`、`.quality-gates.md`
