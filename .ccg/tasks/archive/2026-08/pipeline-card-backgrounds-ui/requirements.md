# 视频创作首页卡片 UI 优化 — 需求与设计简报（供双模型分析评审）

## 用户需求
1. 视频创作首页（`/create` → 流水线创作视图，`PipelineSelector.vue`）卡片布局改为**按设备分辨率/宽度自动排列的多列格局**。
2. 每张卡片使用**不同背景图，调用 MiniMax（image-01）生成**；所有卡片视觉风格统一、克制、不花哨，并与卡片文字颜色协调（可读性优先）。
3. 增加交互性动态效果（悬停/焦点/入场动画等）。
4. 更新 PRD 与相关文档（数据校验、流程、功能逻辑、交互逻辑、显示项、提示文字等，尽量详细）。
5. 新分支开发、推送 GitHub、合并分支；应用质量节拍；更新记忆。

## 现状事实（file:line 证据）
- 路由：`apps/desktop/src/router/index.js:23` Home(`/`)；`:36` Create(`/create` → `CreateView.vue`)。
- 页面容器：`apps/desktop/src/styles/create-view.css:6` `.create-page { padding: 24px 32px; max-width: 1080px; margin: 0 auto; }` → **1080px 封顶是宽屏下多列被压缩的根因之一**。
- 卡片网格：`apps/desktop/src/views/video-creation/PipelineSelector.vue`（94 行）渲染 `.pipeline-grid`；`apps/desktop/src/styles/pipeline-selector.css:8-12` `grid-template-columns: repeat(auto-fill, minmax(300px, 1fr))`；`:188-192` 仅一个 `max-width: 768px → 1fr` 断点。无 2/3/4/5 列显式断点。
- 卡片内容：badge(分类)、stability-dot、title、desc、meta(阶段数/成本/可用性)。`pipeline.available === false` 有 `is-unavailable` 降级样式。
- 流水线数据：`pipeline:list` IPC → `PipelineEngine.listPipelines()`（`apps/desktop/electron/services/pipeline-engine.js:768-798`）返回 `{name, description, category, stageCount, estimatedCost, available}`；CreateView 用 `withVideoCloneEntry()` 追加 `video-clone` 入口（`CreateView.vue:1067-1076`）。
- 本地化：`apps/desktop/src/i18n/pipeline-labels.js` 提供 name/description/category 键；`apps/desktop/src/locales/zh.js:285` `pipelines.names/descriptions/categories`；`en.js` 对应（i18n 成对修改 CI Gate 7）。
- 图片生成：`apps/desktop/electron/services/adapters/minimax-image.js` `MinimaxImageAdapter.generateImage({prompt,size}) → {urls,format}`，固定模型 image-01，POST /image_generation；`parseAspectRatio('1280x720')→'16:9'`。
- 主进程调用链：`AssetGenerator.generateImage(prompt, opts)` → `aiGenerator.generate('image', providerId, ...)` → `ModelProviderManager.callAdapter(providerId, 'generateImage', params)`（`ai-generator.js:78-200`、`model-provider-manager.js:206-283`）；provider 通过 `getConfiguredProvider(opts,['image_provider','imageProvider'])` 选择（`asset-generator.js:475`）。
- Provider 默认/能力：`model-provider:get-default(category)` → `mgr.getDefault(category)`；多模态 provider 以 `capabilities` 含 `image` 参与 image 类别（`model-provider-manager.js:626-631`）。
- IPC 模式：preload `publish.js:114-120` pipelineList 等；`system.js:261` modelProviderList；access-control `PUBLIC_METHODS`（`preload/access-control.js:12-46`）；ipc 注册中心 `electron/ipc-handlers/index.js`；依赖注入 `bootstrap/phase5-ipc.js` handlerDependencies 含 `modelProviderManager/aiGenerator/pipelineEngine/app`。
- 本地媒体 URL：主进程 `Story2VideoMediaServer.createUrl(filePath)` 返回 `http://127.0.0.1:<port>/media/<token>`（`story2video-media-server.js:138-151`），渲染端用该 URL 显示本地媒体（dev http://localhost 与打包 file:// 均可加载）——**渲染端不能直接加载 file:// 图片（dev 会被 Chromium 拦截），必须走 loopback HTTP**。
- 测试：vitest（jsdom，单 worker，`apps/desktop/vitest.config.js`）；CreateView.test.js 用 @vue/test-utils mount + i18n + router；视觉/像素测试在 `tests/visual-testing/`（命令 test:visual:*，PR 前可选跑）。

## 拟议方案
### A. 多列动态布局
- 流水线选择视图时放宽容器：`CreateView.vue` 在 `view==='pipelines' && !selectedPipeline` 时给 `.create-page` 加 modifier（如 `.create-page--pipeline-list`）→ `max-width: 1600px`（或更宽）。
- `pipeline-selector.css` 显式断点：基础 `repeat(auto-fill, minmax(280px, 1fr))`；≥1440px 4 列；≥1920px 5 列；≤768px 1 列；≤1024px 2 列。配合 `gap` 与卡片最小宽度，保证任意宽度自动排列。

### B. MiniMax 卡片背景（主进程服务 + IPC）
- 新增 `apps/desktop/electron/services/pipeline-card-backgrounds.js`：
  - `ensureBackgrounds(names, {force})`：逐流水线生成/复用缓存；返回 `{ backgrounds: {name:{url,status}}, generated[], cached[], failed[], skipped, provider }`。
  - provider 选择：`modelProviderManager.getDefault('image')` 优先；回退第一个 enabled 且 category==='image' 或 multimodal 且 capabilities 含 'image' 的 provider；无可用 → 返回 `available:false`，前端回退渐变。
  - 提示词：每流水线一条英文 prompt，共享统一风格块（极简低饱和深色渐变 + 抽象几何 + 大量留白 + 无文字/logo/人物 + 柔和光效），仅主题意象不同（如 story2video-compose=极光/创意光轨、talking-head=声波、cinematic=胶片光晕等）。尺寸 `1280x720`（16:9，卡片 cover）。
  - 下载：仅 HTTPS（或测试注入），带 DNS/内容类型/大小边界校验（复用 asset-generator 的 SSRF 防护模式，独立实现、可注入 fetch）。
  - 缓存：`userData/pipeline-card-bg/<safe-name>.png` + `manifest.json`（name/path/provider/时间）；命中缓存不重复调用 API；`force` 可刷新；并发上限（如 2）+ 每批上限（如 20）。
  - 本地服务：仿 Story2VideoMediaServer 的最小 loopback 静态服务（127.0.0.1 随机端口，随机 token，仅 GET/HEAD，nosniff，image/*，仅服务缓存目录内文件，realpath 校验防穿越，条目数上限）。
- 新增 `apps/desktop/electron/ipc-handlers/pipeline-card-backgrounds.js`：`pipeline-card:backgrounds`（get，`withSenderCheck`）。
- preload `publish.js` 增加 `pipelineCardBackgrounds(names, opts)`；`access-control.js` PUBLIC_METHODS 加入；`src/api/publisher.js` 增加封装（invokeWithFallback 空数据兜底）。

### C. 前端交互
- `PipelineSelector.vue`：mount/watch pipelines → 请求背景；卡片模板加背景层 `<div class="card-bg">`（`aria-hidden`）+ 遮罩层保证文字对比度；背景加载中显示 shimmer；无 provider/失败 → 渐变 fallback（沿用分类色系）；hover/focus 动效（图片 scale、抬升、光晕、边框高亮）；入场 stagger fadeInUp；`prefers-reduced-motion` 降级；键盘/ARIA 保持。
- 提示文字（zh/en 成对，新 key `pipelines.selector.*`）：生成中提示、未配置图片生成模型提示、失败回退提示、无障碍提示。

### D. 测试与文档
- 主进程服务单测（缓存命中/生成/无 provider fallback/下载 SSRF/并发/force/非法 name）；IPC handler 测试；前端组件测试（渲染背景、fallback、ARIA）；既有 CreateView.test.js 回归。
- 文档：01-docs/PRD.md（视频创作首页卡片 UI 规格：数据校验、流程、功能逻辑、交互逻辑、显示项、提示文字）、CHANGELOG、learnings、OpenSpec change 全套、i18n 术语表。
- 分支：codex/pipeline-card-backgrounds-ui，隔离 worktree，PR + CI + 合并回 main。

## 风险/决策点（请双模型评审重点回答）
1. 主进程新增 loopback 静态服务是否有更简单替代？（备选：复用 Story2VideoMediaServer 实例——但 TTL/容量约束与长期缓存不匹配）
2. provider 选择回退策略是否合理（image 默认 → multimodal capabilities 含 image）？是否应暴露「背景生成 provider 与流水线图片生成器解耦」的配置？
3. 提示词统一风格是否够克制？文字可读性是否需要双层遮罩（顶部+底部）？
4. IPC 返回契约（url/status/generated/cached/failed）与失败语义是否要调整？
5. 布局断点参数（280px 基数、1440/1920 列数）是否合理？
