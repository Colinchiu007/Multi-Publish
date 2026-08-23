# 状态机核验：进度弹窗与后台脱离

## Files Found

- `apps/desktop/src/views/CreateView.vue:3985-4091`：轮询、runId/requestId 快照守卫、终态缺 context。
- `apps/desktop/src/views/CreateView.vue:4153-4283`：`applyOrchestrationOutcome`、终态和结果页跳转。
- `apps/desktop/src/views/CreateView.vue:4293-4363`：`handlePipelinePush`、实时推送过滤与轮询重启。
- `apps/desktop/src/views/CreateView.vue:4093-4122`：检查点推进、素材选择确认异步入口。
- `apps/desktop/src/views/CreateView.vue:4465-4585`：后台脱离、恢复运行、前台启动和检查点显示。
- `apps/desktop/src/views/CreateView.test.js:4617-4834`：启动/轮询/unmount/push 的竞态回归测试。

## Dependencies

- `onPipelineUpdate` -> `handlePipelinePush` -> 状态归一化 -> 终态处理或轮询重启。
- `setInterval(updateOrchestrationStatus, 3000)` -> `pipelineGetRunContext(runId)` -> runId/requestId guard -> 终态处理。
- `advanceOrchestration` -> `pipelineAdvanceToNextCheckpoint(this.orchestrationRunId)` -> `applyOrchestrationOutcome` 或轮询。
- `confirmSceneAssetSelections` -> `pipelineConfirmSceneAssets(this.orchestrationRunId, ...)` -> `applyOrchestrationOutcome` 或轮询。
- 脱离/切视图 -> `resetPipelineUiState` -> 停止轮询并清空 `orchestrationRunId`、`orchestrationContext`、`orchestrationContextRunId`。

## Patterns

- `updateOrchestrationStatus` 在 await 后检查 `orchestrationRunId === runId`、`orchestrationStatusRequestId === requestId`，catch 也检查（`CreateView.vue:3989-3995`, `4087-4090`）。轮询迟到响应处理正确。
- context fallback 按 `orchestrationContextRunId === runId` 限定（`CreateView.vue:4009-4012`）；completed 无 context 时保持非终态、提示暂不可用并重试（`4040-4058`）。
- `handlePipelinePush` 在写状态前拒绝非当前 run（`CreateView.vue:4297-4299`）；终态推送缺 context 时拉取全量状态，不直接用残缺事件跳结果页（`4334-4350`）。
- 启动 IPC 返回及保存选项后均复核 start request（`CreateView.vue:2580-2589`, `2616-2625`, `2863-2872`）。

## Risks

### Major：检查点动作响应未绑定发起时的 run

- `advanceOrchestration` 只在请求前读取 `this.orchestrationRunId`，没有保存本地快照；await 后直接把结果交给 `applyOrchestrationOutcome`（`CreateView.vue:4093-4099`）。
- `confirmSceneAssetSelections` 同样没有 action token/run 快照；await 后直接调用 `applyOrchestrationOutcome` 或对“当前” run 轮询（`CreateView.vue:4102-4122`）。
- `applyOrchestrationOutcome` 从当前 `this.orchestrationRunId` 取 runId，且不校验 `outcome.runId`（`CreateView.vue:4157-4165`）。因此旧 run 的 advance/confirm 请求在脱离（`4465-4487`）、切视图（`2295-2307`）或挂回新 run（`4492-4517`）期间返回时，可能把旧 stages/context/activeMs 写到新 run；旧 completed 可能以新 runId 跳结果页，旧失败也可能显示到新 run。
- 等级：**Major**。需要用户在 IPC 请求期间操作，但属于真实跨 run 状态机污染。
- 建议：两个入口在 await 前捕获 `const runId = this.orchestrationRunId` 和递增 action token；IPC 使用捕获值。await 后要求组件存活、当前 run 仍等于快照、token 仍相等，并在返回含 runId 时要求一致。让 `applyOrchestrationOutcome(outcome, expectedRunId)` 在任何 stages/context/meta/终态写入前拒绝不匹配响应。为 detach 与替换新 run 各补 advance、confirm 延迟 Promise 回归测试。

### Minor：`applyOrchestrationOutcome` 在身份校验前先合并 stages

- `CreateView.vue:4155-4156` 在检查 success/completed 前合并 `outcome.stages`。因此非终态/异常 outcome 也能改变可见阶段；上述检查点竞态使该问题可由真实异步路径触发。
- 建议：先校验 expected run/action token，再写 stages/context/meta；明确 progress snapshot 与 terminal outcome 的入口边界。

### Minor：缺少检查点动作迟到响应回归测试

- 现有测试覆盖轮询旧响应（`CreateView.test.js:4670-4685`）、启动迟到响应（`4617-4646`）、卸载（`4712-4724`）和推送过滤（`4762-4808`），但没有延迟 `pipelineAdvanceToNextCheckpoint` 或 `pipelineConfirmSceneAssets` 后再 detach/替换 run 的测试。
- 建议：每条动作至少补一个 deferred-promise 用例，断言旧 context/stages/meta 不变化、不跳结果页、当前新 run 保持不变。

### 已核验无明显问题

- `orchestrationContextRunId` 在 reset/detach 清空，并在轮询/推送提供当前 run context 时设置（`CreateView.vue:4431`, `4061-4064`, `4330-4333`）；现有 fallback 未发现旧 context 泄漏。
- completed 缺 context 不会跳结果页；会保持运行态并重试（`4040-4058`, `4243-4262`）。
- push 事件先做当前 run 过滤，unmount/stop polling 递增 request token 并设置 `_s2vAlive=false`（`4297-4299`, `4285-4291`, `5334-5345`），轮询迟到响应有保护。

