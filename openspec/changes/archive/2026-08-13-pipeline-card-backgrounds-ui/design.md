## Context

现状（证据见 proposal.md 与 CCG requirements.md）：`CreateView.vue` 容器 `.create-page` 被 `max-width: 1080px` 封顶（`src/styles/create-view.css:6`）；卡片网格 `repeat(auto-fill, minmax(300px, 1fr))` 且仅一个 ≤768px 断点（`src/styles/pipeline-selector.css:8-12,188-192`）；图片生成能力已存在（`MinimaxImageAdapter.generateImage`，固定 image-01；`ModelProviderManager.getDefault('image')` 自动处理多模态偏好；`callAdapter(providerId,'generateImage',params)` 返回 `{urls,format}`）；渲染端本地媒体必须走 loopback HTTP（dev http://localhost 无法加载 file://，既有模式是 `Story2VideoMediaServer.createUrl` 返回 `http://127.0.0.1:<port>/media/<token>`）。IPC 契约沿用 `{code,data,message}` + `withSenderCheck` + preload `PUBLIC_METHODS` + `electron-bridge.invokeWithFallback`。

## Goals / Non-Goals

**Goals:**
- 让流水线选择视图按视口宽度 1-5 列自动排布，宽屏不再受 1080px 封顶压缩。
- 每张卡片获得 MiniMax（image-01，经已配置图片 provider）生成的统一风格差异化背景，磁盘缓存复用，失败安全降级渐变。
- 提供克制的交互动效与可访问性保障（aria、键盘、reduced-motion）。
- 文案 zh/en 成对；PRD/文档/CHANGELOG/learnings 同步。

**Non-Goals:**
- 不改动流水线数据模型、执行引擎、发布流程。
- 不做背景在线编辑/用户自定义/换肤管理后台。
- 不为背景图引入新第三方服务商（仅复用既有模型服务商体系）。
- 不修改 Story2Video 图片轮播/素材生成的既有行为。

## Decisions

### D1 布局：modifier 放宽容器 + 显式断点
- `CreateView.vue` 在 `view==='pipelines' && !selectedPipeline` 时为根节点加 `create-page--pipeline-list`；CSS 提升 `max-width: 1600px`（并允许 `@media (min-width: 1600px)` 继续放宽到 100% - 48px）。
- `pipeline-selector.css`：基础 `repeat(auto-fill, minmax(280px, 1fr))`；显式断点：≤768px → 1 列；769-1199px → 2-3 列（auto-fill 自然）；1200-1439px → 3 列上限；1440-1919px → 4 列；≥1920px → 5 列；gap 16px（≤480px 降 12px）。
- 备选（弃用）：纯 `auto-fill` 不动容器 —— 无法解决 1080px 封顶导致的列数压缩；容器级断点（container query）—— Electron 单容器场景收益低，CSS media query 足够。

### D2 背景服务：独立主进程服务 + 最小 loopback 静态服务
- 新增 `services/pipeline-card-backgrounds.js`：
  - provider 解析：`manager.getDefault('image')` 优先；否则 `listProviders('image')` 首个 `is_configured && enabled`；仍无 → `available:false`。
  - 生成：`manager.callAdapter(providerId, 'generateImage', { prompt, size: '1280x720' })` → `{urls}`，取第一张；提示词每流水线一条，共享统一风格块（见 D3）。
  - 下载：独立实现 HTTPS-only + DNS 解析拒绝私有/环回/链路本地 + content-type `image/*` + 大小上限 12MB + 可注入 fetch（测试）；失败抛错记入 failed。
  - 缓存：`userData/pipeline-card-bg/<safe-name>.png` + `manifest.json`（version/items{name,path,provider,generatedAt}）；命中且文件 realpath 在缓存目录内 → cached 复用；`force` 重新生成；批量上限 50、并发 2、单调用整体有界超时。
  - 本地服务：`127.0.0.1` 随机端口，token=`crypto.randomBytes(16).hex('hex')`，GET/HEAD only，`Cache-Control: no-store, private` + `X-Content-Type-Options: nosniff`，仅 `image/png|jpeg|webp`，realpath 校验仅服务缓存目录文件，条目上限 200、TTL 7 天（ensure 时刷新）。
  - 备选（弃用）：复用 `Story2VideoMediaServer` 实例 —— token TTL/容量语义为「短生命周期媒体流」设计，与长期卡片缓存不匹配；返回 `file://` —— dev（http://localhost:5173）被 Chromium 拦截，不可行；data URL —— 15 张 × 数百 KB 经 IPC 传输过重。

### D3 提示词风格：统一风格块 + 每卡主题意象
- 统一风格块（英文，克制）：`Minimalist premium abstract background, soft muted gradient light, deep low-saturation dark tones, subtle geometric shapes, generous negative space, no text, no logos, no people, high-end tech aesthetic, gentle glow, 16:9`。
- 每卡主题意象（仅替换主题词）：story2video-compose=aurora light trails；animated-explainer=floating soft rounded shapes；talking-head=smooth audio waveform lines；cinematic=soft film lens light flare；clip-factory=mosaic of light rectangles；documentary-montage=layered translucent photo frames；localization-dub=soft concentric language ripple；hybrid=blending gradient silhouettes；animation=gentle motion curves；avatar-spokesperson=soft studio spotlight；character-animation=abstract character silhouette；framework-smoke=subtle blueprint grid；screen-demo=window glass reflection；video-clone=mirrored light split。
- 渲染：`<img>` 覆盖整卡 + 顶部/底部双层暗色渐变遮罩（底部承载 meta 文字），前景文字统一白色系（现文字色 `var(--text)` 在浅色主题下为深色 —— 背景卡场景需覆盖为白/浅色并保证对比度）。

### D4 IPC 契约与失败语义
- 通道 `pipeline-card:backgrounds`，入参 `{ names: string[], force?: boolean }`；`withSenderCheck` 包裹。
- 返回 `{ code: 0, data: { available, provider, backgrounds: { name: { url, status: 'generated'|'cached' } }, generated: [], cached: [], failed: [{name, message}], skipped: [] } }`；无 provider → `{ code: 0, data: { available:false, backgrounds:{} } }`；参数非法 → `{ code: EC.VALIDATION_ERROR, message }`。
- preload：`publish.js` 增加 `pipelineCardBackgrounds(payload)`；`access-control.js` PUBLIC_METHODS 增加；`src/api/publisher.js` 增加 `invokeWithFallback` 封装（fallback `{code:0,data:{available:false,backgrounds:{}}}`）。

### D5 前端组件与样式
- `PipelineSelector.vue`：新增 `bgState = { loading, backgrounds, unavailable, failed }`；watch pipelines → 计算 names → 请求；卡片模板插入 `card-bg` 层（img + 遮罩）与状态 class；`aria-busy`/`aria-hidden`；无 provider 提示条（可关闭，一次会话一次）；hover/focus 效果通过 CSS（`.pipeline-card:hover .card-bg img { transform: scale(1.06) }` 等）。
- `pipeline-selector.css`：背景层/遮罩/骨架 shimmer/入场 `fadeInUp`（stagger 通过 inline `--i`）+ `prefers-reduced-motion` 关闭。
- 无障碍：卡片保留 `role=button` + `tabindex=0` + `aria-label`（沿用现有），背景 `aria-hidden="true"`。

## Risks / Trade-offs

- [首次进入时背景生成耗时（无缓存时 15 卡 × 单张 5-15s，并发 2 ≈ 40-120s）] → 加载状态逐卡 shimmer，不阻塞页面；生成完成逐张淡入；磁盘缓存后秒开。
- [MiniMax 依赖真实 API Key/配额，测试环境无 Key] → 服务层可注入 manager/fetch；前端无 provider 时渐变 fallback，不报错。
- [生成 URL 下载的 SSRF/内容风险] → HTTPS-only + 地址黑名单 + content-type + 大小上限；本地服务仅缓存目录 + token + realpath 校验。
- [浅色主题下背景卡文字对比度] → 卡片在「有背景」状态下强制深色遮罩 + 白色文字；无背景时保持原主题样式。
- [外部双模型（antigravity/claude）本次不可用（区域限制/CLI 挂起）] → 按机制硬化降级为主代理直接执行，审查以本地自审 + 既有测试门禁补充，记录于 task/review。

## Migration Plan

- 纯新增能力 + 前端样式调整，无数据迁移；`manifest.json` 首次创建即初始化；删除 `userData/pipeline-card-bg/` 即可完全重置缓存（重生成）。
- 回滚：合并前在分支内完成测试；如需回滚直接 revert PR（无 DB/服务端变更）。

## Open Questions

无（可在实现中按 D1-D5 决策直接落地）。
