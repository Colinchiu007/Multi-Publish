# Tasks: story2video-elapsed-duration

## 1. 主进程：步骤执行耗时累计

- [x] `pipeline-engine.js`：`start()` 为每个 stage 初始化 `durationMs: 0`
- [x] `pipeline-engine.js`：`_executeStage` 在执行段结束（成功/失败/取消）后累计 `stage.durationMs += max(0, now - stageStartMs)`
- [x] `pipeline-engine.js`：新增 `_computeElapsedMs(run)`（Σ durationMs + running 阶段 live 增量；无累计时回退 `completedAt - startedAt` 求和）
- [x] `pipeline-engine.js`：`getRunSnapshot` 返回 `elapsedMs`；`pipeline:complete` totalDuration 与 `_finalizeRun` 日志改用累计口径
- **测试目标**：`apps/desktop/electron/tests/pipeline-engine.test.js`（成功累计、失败累计、暂停不计、live 增量、getRunSnapshot.elapsedMs、state_machine 回退）

## 2. 断点恢复与持久化透传

- [x] `resumeOrchestration` 恢复时保留 stage `durationMs`（`{ ...base }` 展开天然保留）+ 失败 stage 新尝试 live 增量
- [x] `run-state-store.js` 回归验证：快照 stages 浅拷贝含 `durationMs`，`load()` 后不丢
- **测试目标**：`apps/desktop/electron/tests/resume-orchestration.test.js`、`apps/desktop/electron/services/run-state-store.test.js`

## 3. 前端：「已用时」新口径

- [x] `CreateView.vue`：`orchestrationElapsedMs` 改为「Σ stage.durationMs + running stage live 增量」，每秒平滑刷新；无数据回退 `meta.elapsedMs` → 墙钟
- [x] `CreateView.vue`：`orchestrationSummary` 与 `applyOrchestrationOutcome` 的 `query.durationMs` 使用累计口径
- **测试目标**：`apps/desktop/src/views/CreateView.test.js`（暂停不计、断点恢复累计、旧数据回退、汇总同口径）、`apps/desktop/src/i18n/i18n.test.js`

## 4. 文档与门禁

- [x] `01-docs/PRD.md`（7.1.9 整体进度 + 新增「已用时口径」明细：数据校验/流程/功能逻辑/交互/显示项/提示文字）
- [x] `01-docs/product-manual.md`、`01-docs/UI-INVENTORY.md`、`CHANGELOG.md`、`01-docs/CHANGELOG.md` 同步
- [x] `01-docs/learnings.md` QM-5 复盘（根因/逃逸链/系统性漏洞/回归保护/预防）
- [x] 受影响 vitest 套件全绿 + `.quality-gates.md` 执行记录
- [x] 双模型审查（antigravity + claude；不可用降级记录）
- [x] PR 合并回 main（CI 全绿）；openspec archive / CCG task 归档 / learnings 三同步
