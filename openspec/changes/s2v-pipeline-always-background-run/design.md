## Context

PipelineEngine.startOrchestrated 已接收 autoAdvance: true, background: true，启动后立即返回 runId，主进程异步推进并写入运行快照。resumeOrchestration 同样异步调用 _autoAdvanceRun，恢复任务无需 renderer 保持连接即可继续执行。当前 CreateView.vue 在启动成功和历史恢复成功后设置 orchestrationRunId、调用 updateOrchestrationStatus 并建立轮询，因此产生了“前台挂载”的表现。

## Goals

- 运行中编排流水线从启动成功开始统一按后台 run 处理。
- 历史卡片继续/从断点继续进入 running 后不抢占创作页，历史页保留进度观察能力。
- 需要人工输入的暂停检查点仍可进入正确的交互面板。
- 通过单元测试覆盖启动、续跑、历史显示、错误和并发语义，避免“主进程后台、renderer 前台”的状态漂移。

## Non-Goals

- 不新增 Electron IPC 或 run.detached 持久化字段；后台是现有引擎执行模型的产品语义。
- 不改变 maxConcurrentRuns 来源、并发计数、取消释放槽位或错误码。
- 不添加第三方 provider 完成通知；历史记录轮询仍是本地可验证的观察机制。
- 不把需要人工选择素材的 paused 检查点伪装成 running。

## Design

### 1. 统一自动后台入口

在 CreateView.vue 增加一个仅供编排启动成功路径使用的 helper：校验 runId 为非空字符串；停止 renderer 轮询；清空 renderer 运行态；保留主进程 run，不调用 pipelineCancel；显示仍占用并发名额的 toast；刷新历史列表。

启动成功后的 applyOrchestrationOutcome 仍先处理同步完成/失败结果；只有 outcome 未完成且 run 已进入运行态时才自动后台。

### 2. 历史卡片续跑分支

resumeHistoryItem 按 res.data.paused 分支：paused === true 时保留当前分镜素材选择恢复流程，进入 pipelines 视图并获取 checkpoint 数据；其他成功恢复结果视为后台 running，不设置 renderer 当前 run、不切换视图、不启动轮询，只刷新历史并提示后台继续运行。

### 3. 历史卡片显示

当 item.status === running 时，卡片展示“后台运行中”提示、阶段进度、当前更新时间和运行中状态。历史列表通过既有刷新机制读取主进程快照。

### 4. 交互与数据校验

- 所有自动后台入口必须要求非空 runId，防止无效启动响应误清空当前任务。
- 后台 helper 不接收 renderer reactive proxy，只消费字符串 runId；传 IPC 的参数继续通过 cloneForIpc 脱壳。
- pipelineCancel 只由显式取消流程调用；自动后台和历史后台续跑不得调用。
- 并发提示继续使用主进程返回的 PIPELINE_CONCURRENCY_LIMIT、count 和 max，后台运行不能释放槽位。
- 选择检查点必须保持 paused，不能在缺少候选素材或用户确认的情况下自动进入 compose。
- zh/en 用户文案成对维护，renderer 不新增硬编码中文。

### 5. 回归测试策略

- CreateView.test.js：启动成功自动清理运行态、toast、历史刷新、取消未调用；历史失败/运行中续跑留在历史并不建立轮询；选择暂停仍进入交互；无效 runId 不改变状态。
- CreateViewHistory.test.js 或等价组件测试：running 卡片显示后台提示与进度，resume 按钮仍可用。
- 主进程既有 pipeline-engine.test.js / resume-orchestration.test.js：确认后台异步推进和槽位占用契约不回退。
