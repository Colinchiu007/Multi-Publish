# film-auto-mode — 影视工程「自动模式」与三标签重组

## Why

影视工程（`film-engineering`）目前是「单视图单动线」：`/film-engineering` 只有画布（`FilmCanvasView.vue`），而功能最完整的三栏工程页（分镜库/剧本套用/提示词方法论 + 视频生成面板 + 全量出片面板）**沦为暗路由** `/film-engineering/classic`，唯一入口是画布工具栏的一个文字链接（`route-registry.js:309-315` 注释自证「仅从画布工具栏进入」）。

同时，现有两条出片动线都要求用户**先理解工程概念**：
- 画布动线：贴剧本 → 拆分镜 → 理解节点/连线 → 上传参考图 → 连线 → 生成
- 全量出片动线：勾选分镜 → 计划预览 → **逐批确认** → 回收 → 收口合成

对「我只有一段文案，想尽快得到成片」的用户，二者都太重。缺一条**零概念门槛**的动线：给文案 + 参考图 + 横竖屏 + 大概时长，其余全部自动。

同时，画布与工程页的可达性割裂造成两类用户各丢一半能力：画布用户看不到分镜库/导出/回收；工程页用户要绕路。

## What Changes

- **页面重组为三标签 Hub**（`/film-engineering`）：
  - Tab 1「自动」→ 新增 `FilmAutoPanel.vue`
  - Tab 2「画布」→ 复用现有 `FilmCanvasView.vue`（新增可选 `embedded` prop，默认 false 时行为与现状逐字一致）
  - Tab 3「工程案例」→ 复用现有 `FilmEngineeringView.vue`（同上 `embedded` prop 隐藏自带标题）
  - 标签与 URL 双向绑定 `?tab=auto|canvas|classic`（默认 `auto`）；`/film-engineering/classic` 改为重定向到 `?tab=classic`
  - **不抽取/不改名既有视图文件**（`href-scheme-contract.test.js` 的已知站点清单含 `src/views/FilmEngineeringView.vue`，改名会打红该锁）
- **新增自动模式**（`film-engineering:auto-*` 6 通道 + `auto-plan.js` / `auto-project.js` 服务模块）：
  - 输入仅 5 项：剧本（≤10000 字）、人物参考图（可选 ≤8，带角色名）、场景参考图（可选 ≤8）、横竖屏（16x9/9x16）、大概时长（10–600s）
  - 程序完成：时长规划（目标时长 → 镜数）→ 提示词组装（**复用 kit 模板块结构与剧本套用引擎**）→ 角色检出与槽位映射 → 参考图逐镜绑定 → **一次聚合成本确认**（确认前零 provider 调用）→ 分批自动执行（复用 `production-driver`，`runOnlyBatch=null`）→ 自动收口合成（`film_render` manifest 模式）
  - 生成后**片段级编辑**：改提示词/参考图/时长 → 单镜重生成（原文直送，不经优化器）→ 重新合成；失败镜重试；断点续跑
- **复用 story2video 进度与编辑范式**：直接 import `views/video-creation/StageProgress.vue`（新增 `testidPrefix` prop，默认值不变），照抄「事件推送优先 + 3s 轮询兜底 + runId 守卫」纪律；片段编辑交互对齐 `ResultView.vue` 的「分段编辑」范式，数据落影视工程自己的契约（**不复用** `story2video:*` project 通道与 `ResultView.vue`）

## Capabilities

- `film-engineering`（增量：自动模式契约、三标签导航契约、片段编辑契约、6 条 IPC 校验契约）
- 复用能力：`pipeline-progress-push`、`story2video-page-ux`（仅作范式参考，不改其规格）

## Impact

- **新增**：`views/FilmEngineeringHubView.vue`、`views/film-auto/*`（面板 + 编辑器）、`composables/useFilmAuto.js`、`electron/services/film-engineering/auto-plan.js`、`auto-project.js`、`ipc-handlers/film-engineering-auto.js`（或并入既有 handler 文件）、6 条 IPC + 1 个事件
- **修改**：`router/index.js`、`config/route-registry.js`、`preload/film-engineering.js`（+bundle 重建）、`ipc-handlers/license-access-control.js`（公开清单）、`FilmCanvasView.vue` / `FilmEngineeringView.vue`（仅加 `embedded` prop）、`views/video-creation/StageProgress.vue`（`testidPrefix`）、locales zh/en、相关测试
- **不改**：六阶段语义与 checkpoint、`film_generate_videos` 原文直送、成本闸零调用、`production-*` 三通道、`retry-shot` 语义、kit schema、`ResultView.vue` 与 `story2video:*`
- **BREAKING**：无（`/film-engineering/classic` 保留为等价重定向）
