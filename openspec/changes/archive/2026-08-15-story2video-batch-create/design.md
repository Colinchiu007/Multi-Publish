# Design: story2video-batch-create

## 目标

Story2Video 故事讲述新增「批量创作」：队列调度（批量并行 ≤2；手动任务运行中批量并行 ≤1；遵守引擎全局并发预算）、弹窗交互、任务/排队信息展示、历史记录集成（复用现有 run 生命周期）。

## 决策与备选

### D1 队列服务形态：独立 BatchQueue 服务（选定） vs 引擎内嵌
- 备选 A：PipelineEngine 内嵌批量队列 → 引擎承担调度策略，手动/批量语义耦合，单测复杂。
- 备选 B：独立 services/story2video-batch-queue.js（依赖 pipelineEngine）→ 调度策略集中、可独立单测、引擎只暴露最小扩展点（run 打标 + 手动计数）。**选定 B**。

### D2 调度触发：Backlot 事件 + 入队/取消即 drain（选定） vs 轮询 vs runFinalizedHook
- setRunFinalizedHook 为覆盖式单钩子，已被 diagnostics-reporter 占用（bootstrap/phase1-context.js:281），不可再占用。
- 编排模式完成路径 emit pipeline:complete、失败路径 emit pipeline:fail（_autoAdvanceRun/_advanceRun），事件可订阅。
- 批量 run 都在 _runs Map 中，事件必然发出；事件 + drain 即时调度，无轮询延迟。**选定 Backlot 事件**；同时 drain 内对引擎并发预算拒绝（PIPELINE_CONCURRENCY_LIMIT）做 1s 有界退避重试（预算为瞬时状态，事件可能错过启动窗口）。

### D3 run 打标与索引隔离：source=batch 不写 _<name> 索引（选定）
- start() 当前同时写 _runs.set(runId) 与 _runs.set('_'+pipelineName) 并覆盖 _currentPipeline；批量 run 若覆盖索引，手动详情页 getStatus('story2video-compose') 会读到批量 run 状态，破坏手动 UI。
- 方案：start() 在 run 对象上写 source/batchId/batchItemId（由 params 透传）；source==='batch' 时跳过 _<name> 索引与 _currentPipeline 写入。随机 runId 仍在 Map 中，执行、事件、finalize、历史全部正常。
- normalizer（story2video-text-config.js）重建 params 会丢弃未知字段 → startOrchestrated 在 normalize 前提取 source/batchId/batchItemId（白名单校验），normalize 后重新附加。

### D4 取消语义：仅取消 pending（未启动）item（选定）
- 引擎编排 run 无按 runId 取消接口（cancel() 只作用于 _<name> 索引）；为控制范围，批量取消仅允许 pending item → status=cancelled；running/终态 item 不可取消（UI 禁用）。
- 排队任务不预创建 run：item 状态机 pending → running(含 runId) → completed/failed/cancelled；调度到才调 startOrchestrated。

### D5 文件读取与校验：主进程 batch:create 时同步读取校验（fail closed）
- 扩展名白名单 .txt/.md；大小上限 2MB；编码 utf-8（含 BOM 容忍）；内容 trim 后非空且 ≤ MAX_STORY2VIDEO_TEXT_UNICODE_CHARS。
- 任一 item 校验失败 → 整个 batch 创建失败（fail closed），返回 errorCode + 失败项明细，不部分入队。
- 文案与文件内容最终都经引擎 normalizeStory2VideoTextParams 二次校验（服务端兜底）。

### D6 并行上限组合规则
- 批量队列自身限制：runningBatchCount < BATCH_MAX_CONCURRENT(=2)；且 runningBatchCount + runningManualCount < engine.maxConcurrentRuns（全局预算）；且手动运行中（runningManualCount > 0）时 runningBatchCount < 1。
- _countActiveManualRuns() 新增：orchestrationMode==='orchestrator' && source!=='batch' && status==='running'（去重索引）。

## 主进程 IPC 契约

| channel | 请求 | 成功响应 | 错误 |
|---|---|---|---|
| story2video:batch:create | { mode:'text'\|'files', texts?: string[], files?: {path,name}[] , videoMode, s2vConfig, uiLocale } | { code:0, data:{ batchId, items:[{itemId,label,source,status,runId,error}] } } | { code, message, errorCode, errorParams } |
| story2video:batch:status | (batchId?) | { code:0, data:{ batches:[{ id, createdAt, summary:{pending,running,completed,failed,cancelled}, items:[...] }] } } | { code, message } |
| story2video:batch:cancel | { batchId, itemIds?: string[] } | { code:0, data:{ cancelled:number } } | { code, message, errorCode } |
| story2video:pickBatchFiles | () | { code:0, data:[{ path,name,size }] } | { code, message }（取消选择返回 {code:0, data:[]}） |

错误码（errorCode）：BATCH_NO_ITEMS / BATCH_ITEMS_LIMIT / BATCH_TEXT_EMPTY / BATCH_TEXT_TOO_LONG / BATCH_FILE_EXT_UNSUPPORTED / BATCH_FILE_TOO_LARGE / BATCH_FILE_UNREADABLE / BATCH_FILE_CONTENT_EMPTY / BATCH_FILE_CONTENT_TOO_LONG / BATCH_NOT_FOUND。

## 文件变更

- apps/desktop/electron/services/story2video-batch-queue.js（新增）：队列状态机、调度、文件读取校验、错误码、getBatches()
- apps/desktop/electron/services/pipeline-engine.js：start() run 打标 + batch 索引隔离；startOrchestrated 标记透传；_countActiveManualRuns()
- apps/desktop/electron/ipc-handlers/pipeline.js：注册 3 个 batch handler + pickBatchFiles（依赖注入 batchQueue + dialog）
- apps/desktop/electron/preload/publish.js：暴露 story2videoBatchCreate/Status/Cancel、story2videoPickBatchFiles
- apps/desktop/src/api/publisher.js：renderer 封装
- apps/desktop/src/views/CreateView.vue：批量按钮 + UiModal 弹窗 + 标签页 + 队列展示 + 轮询
- apps/desktop/src/locales/zh.js、en.js：成对新增文案
- 测试：story2video-batch-queue.test.js（调度/校验/取消）、pipeline-engine.test.js 增补（打标/索引隔离/手动计数）、CreateView.test.js 增补（弹窗交互）

## 风险与回退

- 重启丢失：队列为内存态，应用重启 pending/running 批量项丢失；running 中 run 由引擎退出兜底落盘为 paused 快照（历史可见可续跑）→ 文档与提示文字明确；回退：不改持久化（本期范围外）。
- 事件丢失窗口：pipeline:complete/fail 订阅在服务初始化时注册（batchQueue 在 container 注册时即订阅），先于任何 run 启动 → 无丢失窗口；drain 退避重试兜底预算拒绝。
- _currentPipeline 隔离：批量 run 不覆盖索引；验证方式：批量运行中手动 getStatus(name) 保持 idle。
- IPC 序列化：renderer 传纯 JSON（cloneForIpc 模式复用）；文件路径由主进程 dialog 返回，renderer 不回传任意路径（files 模式只传 pick 返回的 path 列表，主进程再次 stat/read 校验）。
