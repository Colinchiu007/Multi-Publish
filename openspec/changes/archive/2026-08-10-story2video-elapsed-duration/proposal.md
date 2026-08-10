# Proposal: 流水线「已用时」改为步骤执行耗时总和

## Why

视频创作（Story2Video）流水线运行状态中的「已用时」当前按墙钟计算（`endedAt - createdAt`，运行中为 `now - createdAt`）。流水线支持暂停、失败后从断点恢复（可跨天）、人工检查点等机制，墙钟时长会把暂停/等待/失败与恢复之间的空闲时间全部计入。用户实证：一个可从断点继续的任务显示「已用时 1245 分 33 秒」（约 20 小时），与实际执行时间严重不符。

期望语义：**已用时 = 流水线所有步骤实际执行耗时之和**；暂停、中断等待、失败与恢复之间的空闲时间不计入；失败重试的多次执行段累计。

## What Changes

- `pipeline-engine.js`：stage 增加 `durationMs` 累计字段；`_executeStage` 在每次执行段结束（成功/失败/取消）时把本次执行段耗时累加进当前 stage；新增 `_computeElapsedMs(run)` 计算「已完成步骤累计 + 当前 running 步骤进行时长」；`getRunSnapshot` 返回 `elapsedMs`（权威值，随轮询刷新）；`pipeline:complete` 事件与终态日志的 totalDuration 改用累计值。
- `run-state-store.js`：快照继续浅拷贝 stages（`durationMs` 随 stages 持久化，跨应用重启/断点恢复不丢累计值）；不升 schema 版本（纯增量字段）。
- `CreateView.vue`：`orchestrationElapsedMs` 改为「各 stage `durationMs` 累计 + 当前 running stage `now - startedAt` 增量」，每秒平滑刷新；无新字段的旧数据回退到主进程 `elapsedMs`，再无则回退墙钟（仅旧数据展示）。
- `orchestrationSummary` / 结果页 `durationMs`：完成/失败汇总与结果页「完成时间共 X 分 Y 秒」同步改用累计耗时，不再用墙钟。
- 回归测试：累计语义（成功/失败重试/暂停不计入/断点恢复跨重启）、旧数据回退、state_machine 兼容。

## Capabilities

- **New Capabilities**: `story2video-elapsed-duration`
- **Modified Capabilities**: `story2video-compose-progress`（整体进度/已用时的口径从墙钟改为步骤耗时总和）

## Impact

- 生产代码：`apps/desktop/electron/services/pipeline-engine.js`；`apps/desktop/src/views/CreateView.vue`（`run-state-store.js` 无需逻辑改动，仅验证持久化字段透传）。
- 测试：`apps/desktop/electron/tests/pipeline-engine.test.js`、`apps/desktop/electron/tests/resume-orchestration.test.js`、`apps/desktop/src/views/CreateView.test.js`、`apps/desktop/electron/services/run-state-store.test.js`。
- 文档：`01-docs/PRD.md`（7.1.9 整体进度与新增明细）、`01-docs/product-manual.md`、`01-docs/UI-INVENTORY.md`、`CHANGELOG.md`、`01-docs/learnings.md`（QM-5 根因复盘）。
- 无 DB schema 变更、无外部 API 契约变更；IPC 返回体增加 `elapsedMs` 字段（增量、向后兼容）。
