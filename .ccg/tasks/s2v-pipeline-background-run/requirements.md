# 需求：流水线「后台运行」按钮（s2v-pipeline-background-run）

## 1. 需求概述（用户原话）
- 确认：当前支持 2 条视频创作流水线任务并行运行。
- 新增：运行流水线状态下，【取消】按钮旁增加【后台运行】按钮。
- 点击后：当前流水线在后台继续运行；前端流水线详情恢复初始化状态（重新显示【启动流水线】）；
  用户可再次启动流水线（当前运行中流水线 < 并发上限时）。

## 2. 现状核实结论
1. **并行能力**：主进程 `PipelineEngine` 已支持多流水线并行。上限 `maxConcurrentRuns`：
   deps 注入 > 环境变量 `STORY2VIDEO_MAX_CONCURRENT_RUNS`（1-8）> 机器资源自适应 `computeDefaultMaxConcurrentRuns`（1-4）。
   `container.setup.js` 未注入 deps → 生产默认 = 环境变量或自适应（常见开发机 ≥4 核 4GB 为 3）。
   即「并行运行」已具备，上限为自适应/可配置，并非固定 2。
2. **后台运行已具备（引擎层）**：`pipelineStartOrchestrated` 传 `autoAdvance:true, background:true` 时，
   主进程后台推进并立即返回 runId；renderer 仅轮询展示。story2video-compose 启动即带该参数。
3. **并发门禁**：`_assertConcurrencyBudget()` 在 startOrchestrated/resumeOrchestration 统一拦截，
   超限返回 `{ errorCode: 'PIPELINE_CONCURRENCY_LIMIT', error: '当前已有 N 条流水线正在后台运行，最多同时运行 M 条…' }`。
4. **取消**：`cancelPipeline()` 调 `pipelineCancel()`（引擎终止）后重置全部前端状态。
5. **历史可重挂**：运行中流水线在历史记录置顶显示，点击经 `resumeHistoryItem` → `pipelineResumeOrchestration`
   （幂等 alreadyRunning）重新挂回并恢复轮询。

## 3. 方案（纯前端脱离，引擎不改）
新增【后台运行】按钮（仅编排流水线运行中显示：`orchestrationRunId` 存在 && `pipelineRunStatus.status === 'running'`）。
点击后：
1. 不调用 `pipelineCancel()`（run 继续在主进程执行）；
2. 停止轮询（stopPipelinePolling）；
3. 重置前端运行态（提取公共 `resetPipelineUiState()`，与取消后重置一致 + 清 runMeta/resultPath）；
4. 显示轻提示 toast「流水线已转入后台运行…」；
5. 刷新内部历史列表（运行中置顶，可随时点击重挂）。

## 4. 数据校验 / 前置条件
- 仅当 `this.orchestrationRunId` 非空且 `pipelineRunStatus?.status === 'running'` 时按钮可用（模板 v-if 控制）。
- 防重复点击：方法入口再次校验 runId；重置为幂等操作。
- 不校验并发（引擎统一门禁负责；第 2 条启动时超限由引擎返回 PIPELINE_CONCURRENCY_LIMIT 弹窗）。

## 5. 交互逻辑
- 位置：【取消】按钮左侧（同一 running-controls 操作区）。
- 无二次确认（可逆操作：历史记录可重挂恢复查看）。
- 点击后 UI 立即回到 idle 初始化状态（【启动流水线】按钮重新出现）。
- 运行中流水线仍计入并发槽位；历史记录「运行中」置顶，5s 轮询刷新阶段；点击可重新挂回。

## 6. 显示项与提示文字（zh/en 成对写入 locales）
- 按钮：后台运行 / Run in background
- toast：流水线已转入后台运行，可在「流水线记录」中查看进度并继续操作。 / Pipeline moved to background. Track it under Pipeline history and resume there.
- 需补充 PRD「视频创作后台运行与并发合同」小节。

## 7. 边界场景
- 检查点等待（scene_asset_selection / content_policy）：按钮仅运行中显示；若后台 run 到达检查点会暂停等待，
  用户经历史记录重挂后继续（文档说明）。
- 重复点击：runId 已清空后按钮消失，幂等。
- 窗口关闭/应用重启：run 继续受主进程托盘/持久化快照保护（既有合同），重启后历史可见可恢复。
- 并发超限：启动第 2 条（已达上限）时引擎返回 PIPELINE_CONCURRENCY_LIMIT，前端弹窗既有文案。
- mounted 自动重挂：切页返回时 resumeRunningOrchestration 会重新挂起运行中 run（既有合同，文档说明）。

## 8. 测试策略
- CreateView.test.js：运行中 + orchestrationRunId 存在 → 按钮可见；idle / paused / 无 runId → 不可见；
  点击后 pipelineCancel 未被调用、pipelineRunStatus=null、orchestrationRunId=null、轮询停止、toast 显示、启动按钮恢复；
  取消路径回归（reset 公共方法行为不变）。
- locales：zh/en 成对键存在（i18n-content-sync 门禁）。
