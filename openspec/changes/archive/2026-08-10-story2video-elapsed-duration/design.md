## Context

动机见 `proposal.md - Why`。当前「已用时」= 墙钟 `endedAt - createdAt`（运行中 `now - createdAt`），把暂停、失败与断点恢复之间的空闲等待全部计入（用户实证 1245 分）。运行状态数据流：`pipeline-engine.js` 维护 `run.stages[]`（每个 stage 有 `startedAt`/`completedAt`/`status`）→ `getRunSnapshot()` 经 `pipeline:getRunContext` IPC → `CreateView.vue` 的 `story2videoRunMeta`/`orchestrationStages` → 计算属性展示。`run-state-store.js` 落盘 stages 浅拷贝（含 `startedAt`/`completedAt`）与 `createdAt`/`endedAt`，支持跨应用重启断点恢复。

## Goals / Non-Goals

**Goals:**
- 「已用时」= 各步骤实际执行耗时之和；暂停/检查点等待、失败→恢复之间的空闲时间不计入。
- 失败重试的多次执行段累计；跨应用重启/断点恢复后累计值不丢。
- 运行中每秒平滑刷新（沿用 `stageClockTick`），完成/失败后定格。
- 完成汇总与结果页 `durationMs` 同步使用累计口径。

**Non-Goals:**
- 不改 `run-state-store.js` 磁盘 schema 版本（`durationMs` 为增量字段随 stages 透传）。
- 不改 stage `startedAt`/`completedAt` 的时间线展示语义。
- 不修改 state_machine 旧模式的执行逻辑（只保证其展示不回归）。
- 不做运行时的精确到毫秒的墙钟对齐（3 秒轮询 + 前端 1 秒本地补差，误差有界且自愈）。

## Decisions

### D1：stage 新增 `durationMs` 累计字段，`_executeStage` 每段执行后累计
`start()` 创建 stage 时初始化 `durationMs: 0`；`_executeStage` 在 `await stageExecutor.execute(...)` 返回后（成功/失败/取消三条路径都覆盖）执行 `stage.durationMs = (stage.durationMs || 0) + Math.max(0, Date.now() - stageStartMs)`。
- 为什么在 `_executeStage` 累计而不是 `_advanceRun`：检查点阶段执行完成后进入 `paused`，`_advanceRun` 直到用户确认才写 `completedAt`，若用 `completedAt - startedAt` 会把用户审阅/暂停时间计入；`_executeStage` 的 `stageStartMs` 已存在（仅用于日志），是"真实执行段"的唯一权威边界。
- 备选 A（用 `completedAt - startedAt` 求和）：实现简单，但检查点暂停与用户暂停会污染时长，不满足"暂停不计入"的期望 → 否决。
- 备选 B（run 级 `activeStartedAt`/`accumulatedMs`）：粒度不如 stage 级，无法在 UI 展示每阶段耗时来源 → 否决。

### D2：`_computeElapsedMs(run, nowMs)` 权威计算：Σ durationMs + 当前 running stage 增量
```
elapsed = Σ stage.durationMs（合法有限值）
        + （status==='running' 且 startedAt 合法 ? nowMs - startedAt : 0）
```
- running 阶段的 live 增量不会与 `durationMs` 双计：`_executeStage` 只有在执行段结束后才累计，执行期间该 stage 的 `durationMs` 尚未包含本次段。
- paused/completed/failed 阶段不追加 live 增量（paused 的已执行段已累计）。
- 旧数据兼容：无 `durationMs` 的 stage 视为 0；若全部 stage 无累计且存在 `startedAt/completedAt`（state_machine 或历史数据），回退到 `completedAt - startedAt` 求和，保证旧展示不回归。

### D3：`getRunSnapshot` 返回 `elapsedMs`，完成/失败后定格
`getRunSnapshot()` 增加 `elapsedMs: this._computeElapsedMs(run)`。运行中每次轮询（3s）返回最新值；终态时返回定格值（不追加 live 增量）。`pipeline:complete` 事件的 `totalDuration` 与 `_finalizeRun` 终态日志同步改用 `_computeElapsedMs(run)`（原 `Date.now() - createdAt` 墙钟只在无 stage 数据时作日志回退）。
- IPC 返回体为增量字段，向后兼容（旧 renderer 忽略未知字段）。

### D4：前端 `orchestrationElapsedMs` 三层回退
1. stages 中有 `durationMs` 数据 → 前端本地求和 + 当前 running stage `now - startedAt`（1 秒平滑，复用 `stageClockTick`）；
2. 无 stage 累计但 `meta.elapsedMs` 有限 → 用主进程权威值；
3. 旧数据（既无 durationMs 也无 elapsedMs）→ 回退墙钟 `endedAt - createdAt`（仅历史展示，避免旧快照显示 0）。
`orchestrationSummary` 与 `applyOrchestrationOutcome` 的 `query.durationMs` 同步使用「优先 elapsedMs/前端累计值，最后墙钟」的口径。

### D5：断点恢复与持久化
`resumeOrchestration()` 恢复时 stage 用 `{ ...base }` 展开快照，`durationMs` 天然保留；失败 stage 重置 `startedAt=now` 后，live 增量从新尝试起点计，旧失败段的 `durationMs` 已累计，两者相加 = 该 stage 全部执行段。`run-state-store.js` 无需改动（stages 浅拷贝已含新字段）。

## Risks / Trade-offs

- [运行中 3s 轮询 vs 前端 1s 平滑存在最多 ~3s 漂移] → 前端对 running 阶段做本地 live 增量，漂移被下一次轮询的权威值自愈覆盖；暂停/结束瞬间最多残留 1 次轮询间隔的旧值，随后定格。
- [stage 执行中用户暂停（executor 仍在后台跑）] → `run.status` 变 paused，前端停止 live 增量；executor 结束后 `_executeStage` 仍会把该段累计进 `durationMs`（语义上这段确实在执行），下次轮询展示包含该段。行为与"暂停不计时"的直觉略有出入，但该段实际消耗资源，累计更准确。
- [旧数据/state_machine 无 `durationMs`] → D2/D4 回退链保证展示不为 0、不回归。
- [`elapsedMs` 与前端本地求和偶发不一致] → 以主进程 `elapsedMs` 为权威；前端求和仅用于运行中平滑展示，终态汇总/结果页一律用权威值。

## Migration Plan

1. 代码与测试同分支提交，PR 合并回 `main`（分层分支策略：运行时代码必须走 codex/ 分支）。
2. 无数据迁移：旧快照/历史记录按回退链展示；新任务自 `durationMs` 生效起累计。
3. 回滚策略：回滚 PR 后旧墙钟逻辑恢复，无残留数据副作用（`durationMs` 字段仅在前端/主进程读取，磁盘快照多一个无害字段）。

## Open Questions

无（语义、边界、回退均已在本设计中定案）。
