---
change: verify-scheduled-publish-completeness
status: implemented
created: 2026-10-06
branch: verify-scheduled-publish
---

# verify-scheduled-publish-completeness — 定时发布全链路验证与修复

## 背景

用户要求验证「定时发布」功能是否正常实现和完整（涵盖所有操作与流程），有问题就修复，
并对标参考产品（4.0 逆向工程）的实现方式。

前序变更 `fix-scheduled-publish-gaps`（#2655 / #2670，2026-10-02）已修：
批量定时重启丢失（P1）、发布历史定时模式标记（P1）、日历无取消入口（P2）、
`usePublishFlow` 重复定义（P2）、SQLite `scheduled_tasks` 死路径清理。

本轮在其基础上做端到端复审，定位并修复**仍然存在的正确性与完整性缺陷**。

## 验证范围

| 层 | 核查内容 |
|----|---------|
| 渲染层 | 单篇/批量创建入口、时间输入与校验、日历展示、取消/编辑/删除入口、通知文案 |
| IPC | 3 条 `scheduler:*` + 2 条 `batch:*` 通道、身份隔离、输入校验、错误码映射 |
| 主进程 | 调度器状态机、定时器武装与分段、认领 CAS、租户隔离、持久化与恢复 |
| 执行链路 | dispatch → TaskQueue → publisher → 成功/失败事件 → 发布历史 |
| 对标 | 参考产品 4.0 逆向工程（本机 `D:\Data\<参考产品逆向目录>`）定时发布实现 |

## 缺陷清单与修复

### P0 取消失败被谎报成功

- **根因**：`ipc-handlers/scheduler.js` 无条件返回 `{ code: 0, data: true }`，丢弃 `scheduler.cancel()` 返回值。
- **影响面**：
  1. `Calendar.vue` 的 `res.data === false` 分支永不可达 → 取消失败提示「已取消定时任务」。
  2. `usePublishFlow.scheduleTargets` 回滚失败判定 `rollback.value.data === false` 永不成立 →
     部分定时任务取消失败仍提示已回滚 → **到点仍会发布的幽灵排期**。
- **逃逸分析**：既有测试只断言 `code===0` 与 `cancel()` 调用参数，**从不断言返回值** —— 结构性盲区。
- **修复**：如实回传布尔；日历对 `data===false` 使用「该定时任务无法取消（可能已发布或已取消）」，
  与真正的失败（「失败，请重试」）区分开 —— 前者重试无意义。

### P1 JSONL 无界增长 + O(n) 全量重写

- **根因**：`updateStatus` 每次状态迁移全量读-改-写整个 JSONL；终态记录永不清理。
- **修复**：终态记录保留策略（`TERMINAL_RETENTION_DAYS=30`、`MAX_TERMINAL_ENTRIES=200`），
  在 `create()` 成功后旁路剪枝。`pending`/`dispatching` 永不裁剪；非法 JSON 行原样保留；
  剪枝失败只记 `warn`。

### P1 休眠 / 时钟跳变后定时器不重算

- **根因**：墙钟目标在武装时一次性换算成相对延时（`armNextSegment`）；
  `restore()` 见 `isTaskTracked` 为真即跳过，无法纠正漂移。
- **修复**：新增 `scheduler.rearm()`（解定时器 + 收束认领重试等待者 + 按新墙钟重武装，幂等）；
  新增 `bootstrap/resume-guard.js` 监听 `powerMonitor` `resume`，`minSleepGapMs=60000` 阈值
  避免短睡（锁屏/切用户）触发全量重写；失败仅记 WARN。

### P1 派发失败零用户可见性

- **根因**：`scheduler.js` 派发失败只 `logger.error`，无渲染层提示、不进发布历史、不重试。
- **修复**：`onDispatchFailed` 依赖注入钩子（载荷含 `stage: claim|enqueue`）
  → 主进程 `scheduler:dispatch-failed` → preload `onSchedulerDispatchFailed`
  → `Calendar.vue` 实时错误提示 + 刷新日历；卸载解除监听；老 preload 缺席时静默跳过。

### P1 批量排期取消仅会话内可做

- **根因**：`scheduledBatchId` 是内存态（离开发布页即丢），日历只渲染 `scheduler:*` 任务。
- **修复**：日历接入既有 `batchList` / `batchCancel` 桥接，补持久取消入口。
  批次事件时间取最早一篇 `publishTime`；整批立即发布（无任何 `publishTime`）不渲染为待发事件。

### P2 校验提示本地化 + 限制前置

- **根因**：`publish-contract.js` 内 5 条提示为硬编码中文字面量；30 天上限与 5 分钟间隔只在被拒时告知。
- **修复**：`validateScheduleEntries` 增加结构化 `{ reason, params }` 与 `translate` 注入选项，
  文案入 locales zh/en；未注入 `translate` 时回落中文兜底（既有行为不变）。
  `scheduleHint` 改为 `scheduleHintWithLimits`，限制值复用 `PUBLISH_CONTRACT_LIMITS` 单一真源。

## 对标参考产品的结论

| 维度 | 本项目 | 参考产品 4.0 |
|------|--------|-------------|
| 触发 | 主进程定时器 | 服务端 socket 下发 + 29 平台平台侧定时 |
| 客户端时间校验 | 有（渲染端 5 项 + 主进程二次） | **无** |
| 持久化 / 重启 | JSONL + 批次 SQLite | **无** |
| 错过补偿 | 有（重启 catch-up） | **无** |
| 取消 | 本地原子取消，单篇+批量双入口 | 仅能撤销未开始任务，无法取消平台侧排期 |

已采纳：失败原因必须可见、配额/冲突前置拦截、排期确认回读平台真实状态。
明确不采纳：其对 7 个不支持平台的「静默忽略定时参数、内容立即发布」——本项目统一本地调度不存在该语义。

## 测试证据

全部 TDD（先红后绿）：

- `packages/shared-utils/src/__tests__/scheduler.test.js`：剪枝 4 例 + rearm 4 例 + 派发失败通知 4 例（新增 12 例）
- `apps/desktop/electron/bootstrap/resume-guard.test.js`：8 例（新增）
- `apps/desktop/electron/ipc-handlers/scheduler.test.js`：cancel 回传 2 例（新增）
- `apps/desktop/src/views/Calendar.test.js`：派发失败 3 例 + 批量取消 6 例 + data=false 文案 1 例（新增 10 例）

同步更新的防漂移锁：preload publish 键数 123→124、`PUBLISH_METHODS` 87→88、
合并键数 334→335、scheduler API 契约新增 `rearm`、`index.d.ts` 类型声明。

回归：`packages/shared-utils` 全量 588 通过 / 10 跳过；`apps/desktop` 全量（见 PR CI）。