# PROJECT-003 Multi-Publish — 全自动内容生产与发布管道 PRD

> **立项日期**：2026-09-07
> **最后更新**：2026-09-07
> **当前版本**：v1.0.0
> **PR #1533**：[codex/full-auto-pipeline](https://github.com/Colinchiu007/Multi-Publish/pull/1533)
> **交付分支**：`codex/full-auto-pipeline`
> **交付 SHA**：`32d1a49f`

---

## 一、需求概述

### 1.1 背景

当前 Multi-Publish 的「文章采集→文章改写→视频创作→内容发布」四个环节各自独立，用户需要手动在每个环节之间搬运数据：在采集页采集内容后手动创建草稿、打开草稿手动触发改写、改写后复制到视频创作页、视频创作完成再手动跳转发布页。整个过程需要大量人工操作，无法实现规模化内容生产。

### 1.2 核心价值

一键打通全链路：用户只需配置一次参数（采集源、改写风格、发布账号），即可自动完成从采集到发布的全部流程，无需人工干预。

两条分支全覆盖：视频发布分支（采集 → 改写 → 视频创作 story2video-compose → 发布到所有账号）；图文发布分支（采集 → 改写 → 跳过创作 → 直接发布到所有账号）。

### 1.3 目标用户

自媒体运营者（每天多平台发布大量内容）、MCN 机构（批量管理多账号内容生产）、企业内容团队（自动化内容分发流水线）。

---

## 二、数据校验

### 2.1 管道启动参数（startRun config）

| 字段 | 类型 | 必填 | 校验规则 | 默认值 |
|------|------|------|---------|--------|
| contentType | 'video' 或 'article' | 是 | 必须为 video 或 article | 无 |
| sourceType | 'url' 或 'rss' 或 'batch' | 是 | 必须为 url/rss/batch 之一 | 无 |
| urls | string[] | 条件 | sourceType=url 时至少 1 个；batch 时至少 1 个 | [] |
| rssUrl | string | 条件 | sourceType=rss 时不能为空 | '' |
| rewriteStyle | string | 否 | 轻松易懂/正式严谨/吸引眼球/深度分析/认知锚点 | '轻松易懂' |
| rewriteLength | string | 否 | keep/compress/expand | 'keep' |
| videoConfig | object | 否 | 透传给 story2video-compose 的额外参数 | {} |
| publishAllAccounts | boolean | 否 | 是否发布到所有已添加账号 | true |
| platforms | string[] | 否 | 指定平台列表，空数组 = 全部 | [] |

参数校验失败返回：{ success: false, error: '错误描述' }。

### 2.2 采集阶段数据契约

单篇采集（sourceType=url）：调用 POST /aggregation/collect，body 为 { url }；成功返回 { code: 0, data: { title, content, cover_image, ... } }；单篇失败不阻断，保留占位 { title: '', content: '', error: '错误信息' }。

批量采集（sourceType=rss/batch）：调用 POST /aggregation/collect/batch，body 为 { source_type, rss_url?, urls? }；返回 { task_id }，轮询 GET /aggregation/tasks/{task_id} 直到完成；轮询间隔 3s、超时 300s；status 为 completed/success 时返回结果数组，failed/error 抛出异常。

### 2.3 改写阶段数据契约

逐篇调用 POST /aggregation/rewrite，body 为 { title, content, style, length }；并发数 3；成功返回 { code: 0, data: { content, rewritten_content } }；空内容跳过（rewriteStatus: skipped）保留原文；改写失败保留原文 + rewriteStatus: failed + rewriteError。

### 2.4 创作阶段数据契约

图文模式跳过整个阶段（stage.status = skipped）。视频模式逐篇调用 pipelineEngine.startOrchestrated('story2video-compose', params)，并发数 2；轮询 pipelineEngine.getRunContext(pipelineRunId)，间隔 5s、超时 1800s（30 分钟）；从 compose 阶段输出提取 videoPath 或 video_path。

### 2.5 发布阶段数据契约

调用 accountManager.listAccounts() 获取所有账号；若指定 platforms 则过滤；逐内容逐账号串行发布、账号间间隔 5s；publishTask 含 id/platform/owner_subject/article（title/content/cover_path/video_path 仅视频/tags）；调用 publisherRouter.createPublisher(platform, deps).publish(task)；单平台失败不阻断其他平台（fail-open）。

---

## 三、流程与功能逻辑

### 3.1 四阶段线性 DAG

四阶段固定顺序：collect（采集）→ rewrite（改写）→ create（创作）→ publish（发布）。阶段间通过 run.context.{stageId}.items[] 传递数据，下一阶段读取上一阶段输出。

### 3.2 采集阶段流程

sourceType=url 时逐 URL 调 POST /aggregation/collect，成功加入 items、失败加入占位；sourceType=rss/batch 时 POST /aggregation/collect/batch 获取 taskId，轮询 GET /aggregation/tasks/{taskId}，completed 返回 items、failed 抛异常、进行中更新进度继续轮询。

### 3.3 改写阶段流程

遍历 run.context.collect.items（并发 3）：空内容跳过、POST /aggregation/rewrite、code=0 写入 rewrittenContent、失败保留原文并标记 failed，更新阶段进度。

### 3.4 创作阶段流程

article 模式跳过（stage.status=skipped）；video 模式遍历 run.context.rewrite.items（并发 2），调用 startOrchestrated('story2video-compose', { text, autoAdvance: true, background: true })，轮询 getRunContext 直到 completed/failed，completed 提取 videoPath、failed 标记 createStatus: failed。

### 3.5 发布阶段流程

获取账号列表、按 platforms 过滤、逐内容逐账号循环，createPublisher + publish，成功记录 url/postId、失败记录 error（不阻断后续），账号间间隔 5s。

### 3.6 断点续跑

resumeRun 从内存或 runStateStore 恢复 run，遍历 stages 跳过已完成/已跳过阶段，从第一个未完成阶段继续。持久化：每阶段完成后 runStateStore.saveRunning(snapshot)，失败/取消时 saveFailed(snapshot)。

### 3.7 取消机制

cancelRun 设置 _cancelFlags[runId]=true；每个阶段循环开始前与轮询等待期间检查取消标志；取消后 run.status=cancelled。

---

## 四、IPC 契约

### 4.1 通道列表

| 通道 | 方向 | 参数 | 返回 |
|------|------|------|------|
| auto-pipeline:start | renderer→main | config: object | { success, runId } |
| auto-pipeline:get-run | renderer→main | runId: string | snapshot 或 null |
| auto-pipeline:cancel | renderer→main | runId: string | { success } |
| auto-pipeline:list-runs | renderer→main | 无 | { code: 0, data: runs[] } |

### 4.2 Run Snapshot 结构

包含 runId/status（idle/running/completed/failed/cancelled）/progress（0-100）/stages[]（id/label/status/progress/summary/error）/logs[]（最近 100 条，time/message/level）/config/createdAt/startedAt/endedAt。

### 4.3 Preload API

window.electronAPI.autoPipelineStart(config)、autoPipelineGetRun(runId)、autoPipelineCancel(runId)、autoPipelineListRuns()。

---

## 五、交互逻辑

### 5.1 管道配置页（AutoPipelineView.vue）

路由 /auto-pipeline。配置表单：内容类型单选（视频/图文）、采集方式下拉（单篇 URL/RSS 批量/URL 列表）、URL 输入框 + 添加按钮 + 标签列表（可删除）、URL 列表/RSS textarea、改写设置（5 风格 + 3 长度下拉）、发布设置（全账号发布 checkbox + 账号数 + 刷新）。启动按钮禁用条件：URL 为空或运行中；启动后文字变「管道执行中...」；失败显示红色错误提示。

### 5.2 执行进度面板

总进度条四阶段等权各 25%；四阶段卡片网格布局（图标/阶段名/摘要/子进度/错误）；完成摘要绿色背景显示发布条数；失败摘要红色背景 + 重新执行按钮。

### 5.3 执行日志

黑色终端风格、最大 300px 高、自动滚动、日志级别颜色（info 灰 / warn 橙 / error 红）、时间戳 + 消息、最多 500 条。

### 5.4 历史运行

卡片网格布局，显示内容类型/采集方式、创建时间、进度百分比；状态颜色左边框；点击「查看」加载详细进度。

### 5.5 前端轮询

启动后每 1.5 秒调用 autoPipelineGetRun 刷新；状态终态后停止；每次轮询自动滚动日志到底部。

### 5.6 批量采集（Collection.vue 新增）

采集页底部新增「批量采集」区域：RSS 输入框 + 批量采集按钮、URL 列表 textarea + 批量采集按钮、进度条、取消按钮、完成后写入 collectedItems 列表（source 标记 batch）。

---

## 六、显示项

### 6.1 管道配置页

页面标题「全自动内容生产与发布」、副标题「一键打通采集、改写、视频创作、内容发布全链路」、配置卡片标题「管道配置」、内容类型标签与视频/图文单选、采集方式标签与三项下拉、URL 输入 placeholder「输入文章链接，回车添加」、添加按钮、URL 计数「已添加 N 个链接」、URL 标签（截断前 50 字符 + × 删除）、RSS placeholder「输入 RSS 订阅链接」、URL 列表 placeholder「每行一个 URL」、提示文字、改写设置（5 风格 + 3 长度）、发布设置（全账号 checkbox + 账号数 + 刷新）、启动/取消按钮、错误提示。

### 6.2 执行进度面板

进度标题「执行进度」、总进度条、四阶段卡片、完成/失败摘要、日志标题「执行日志」、日志面板。

### 6.3 历史运行

历史标题「历史运行」、空状态（🚀 暂无运行记录 + 提示）、历史卡片（内容类型·采集方式 / 时间·进度 / 查看按钮）。

---

## 七、提示文字清单（zh / en）

### 7.1 autoPipeline 命名空间

| key | zh | en |
|-----|----|----|
| autoPipeline.title | 全自动内容生产与发布 | Full Auto Pipeline |
| autoPipeline.subtitle | 一键打通采集、改写、视频创作、内容发布全链路 | One-click automation from collection to publishing |
| autoPipeline.configTitle | 管道配置 | Pipeline Configuration |
| autoPipeline.contentType | 内容类型 | Content Type |
| autoPipeline.videoPublish | 视频发布 | Video Publishing |
| autoPipeline.articlePublish | 图文发布 | Article Publishing |
| autoPipeline.sourceType | 采集方式 | Collection Method |
| autoPipeline.singleUrl | 单篇 URL | Single URL |
| autoPipeline.rssSource | RSS 批量 | RSS Batch |
| autoPipeline.urlList | URL 列表 | URL List |
| autoPipeline.urlPlaceholder | 输入文章链接，回车添加 | Enter article URL, press Enter to add |
| autoPipeline.addUrl | 添加 | Add |
| autoPipeline.urlCount | 已添加 {count} 个链接 | {count} URLs added |
| autoPipeline.rssPlaceholder | 输入 RSS 订阅链接 | Enter RSS feed URL |
| autoPipeline.listPlaceholder | 每行一个 URL | One URL per line |
| autoPipeline.rssHint | 支持 RSS 2.0 / Atom 格式 | Supports RSS 2.0 / Atom format |
| autoPipeline.listHint | 每行输入一个文章链接，可一次批量采集 | Enter one article URL per line for batch collection |
| autoPipeline.rewriteConfig | 改写设置 | Rewrite Settings |
| autoPipeline.publishConfig | 发布设置 | Publish Settings |
| autoPipeline.publishAll | 发布到所有已添加账号 | Publish to all added accounts |
| autoPipeline.accountsDetected | 已检测到 {count} 个账号 | {count} accounts detected |
| autoPipeline.refreshAccounts | 刷新 | Refresh |
| autoPipeline.loadingAccounts | 检测中... | Detecting... |
| autoPipeline.start | 启动全自动管道 | Start Full Auto Pipeline |
| autoPipeline.running | 管道执行中... | Pipeline running... |
| autoPipeline.cancel | 取消 | Cancel |
| autoPipeline.progressTitle | 执行进度 | Execution Progress |
| autoPipeline.totalProgress | 总进度 | Total Progress |
| autoPipeline.stage1 | 阶段 1/4 | Stage 1/4 |
| autoPipeline.stage2 | 阶段 2/4 | Stage 2/4 |
| autoPipeline.stage3 | 阶段 3/4 | Stage 3/4 |
| autoPipeline.stage4 | 阶段 4/4 | Stage 4/4 |
| autoPipeline.completed | 执行完成 | Execution Complete |
| autoPipeline.completedSummary | 全部阶段已完成，共发布 {count} 条内容 | All stages completed, {count} items published |
| autoPipeline.failed | 执行失败 | Execution Failed |
| autoPipeline.failedHint | 管道执行过程中出现错误，请查看日志定位问题 | Pipeline encountered an error, check logs for details |
| autoPipeline.resume | 重新执行 | Retry |
| autoPipeline.resuming | 正在重新执行... | Retrying... |
| autoPipeline.logTitle | 执行日志 | Execution Log |
| autoPipeline.historyTitle | 历史运行 | Run History |
| autoPipeline.noHistory | 暂无运行记录 | No run history |
| autoPipeline.noHistoryHint | 启动一次管道后会在这里显示历史记录 | Run history will appear here after starting a pipeline |
| autoPipeline.view | 查看 | View |
| autoPipeline.progress | 进度 | Progress |
| autoPipeline.started | 全自动管道已启动 | Full auto pipeline started |
| autoPipeline.startFailed | 启动失败 | Start failed |
| autoPipeline.cancelled | 管道已取消 | Pipeline cancelled |
| autoPipeline.unavailable | 全自动管道功能不可用 | Full auto pipeline unavailable |

### 7.2 collection 批量采集新增 key

| key | zh | en |
|-----|----|----|
| collection.batchCollectTitle | 批量采集 | Batch Collection |
| collection.rssBatch | RSS 批量采集 | RSS Batch Collection |
| collection.urlListBatch | URL 列表批量采集 | URL List Batch Collection |
| collection.batchCollect | 批量采集 | Batch Collect |
| collection.batchCollecting | 批量采集中... | Collecting... |
| collection.batchProgress | 采集进度 | Collection Progress |
| collection.batchProgressText | 已完成 {completed}/{total} 篇 | {completed}/{total} collected |
| collection.batchComplete | 批量采集完成 | Batch collection complete |
| collection.batchSuccess | 已采集 {count} 篇内容 | {count} articles collected |
| collection.batchCollectFailed | 批量采集失败 | Batch collection failed |
| collection.batchCancelled | 批量采集已取消 | Batch collection cancelled |
| collection.cancelBatch | 取消 | Cancel |
| collection.enterRss | 请输入 RSS 链接 | Please enter RSS URL |
| collection.enterUrlList | 请输入至少一个链接 | Please enter at least one URL |

---

## 八、DI 接线链

新增服务注册需在 6 处同步：①container.setup.js register + assertRequired ②phase1-context.js 提取 + services 组字段 ③phase5-ipc.js 解构 + handlerDependencies ④ipc-handlers/index.js require ⑤preload/index.js import + fullApi spread ⑥container.setup.test.js 断言。教训（PR #998 复盘）：三步缺一即 IPC handler 拿到 undefined。

---

## 九、设计决策

独立引擎不污染现有 15+ 条流水线，通过 startOrchestrated('story2video-compose') 复用视频创作、createPublisher 复用发布；线性 DAG 非通用图；Fail-Open 策略（采集/改写/创作/发布单条失败不阻断，仅获取账号列表失败阻断整个阶段）；断点续跑（runStateStore 持久化，resumeRun 恢复已完成阶段）。

---

## 十、测试覆盖

单元测试：full-auto-pipeline.test.js 11 用例（参数校验/单篇批量采集/图文视频分支/fail-open/取消/断点续跑/快照）+ auto-pipeline.test.js 8 用例（IPC 注册/start/get-run/cancel/list-runs/未注入降级）。DI 回归：bootstrap.test.js 46 + container.setup.test.js 18。E2E：真实 Electron + 6 个真实账号（百家号/快手/B站/抖音/公众号/头条），四阶段全部推进，fail-open 正确。

---

## 十一、文件变更清单

新增 6 文件（full-auto-pipeline.js 829 行、full-auto-pipeline.test.js、auto-pipeline.js、auto-pipeline.test.js、preload/auto-pipeline.js、AutoPipelineView.vue 439 行）；修改 11 文件（container.setup.js、phase1-context.js、phase5-ipc.js、ipc-handlers/index.js、preload/index.js、preload/index.bundle.js、router/index.js、zh.js +67、en.js +67、api/publisher.js、Collection.vue +185）。合计 17 文件 +2088/-33。

---

## 十二、已知限制与待办

1. 视频创作超时硬编码 30 分钟，长视频可能超时；2. 发布仅账号间 5s 间隔、无全局速率限制，频繁发布可能触发风控；3. 批量采集仅 RSS/URL 列表，不支持 sitemap/api 源；4. 无管道完成通知机制；5. 历史记录仅内存存储、重启丢失；6. 不支持定时启动管道；7. 图文模式封面透传采集结果，但采集可能不返回封面。

