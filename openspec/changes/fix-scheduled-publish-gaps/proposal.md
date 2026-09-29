# 定时发布全链路验证与缺陷修复（fix-scheduled-publish-gaps）

## Why

对定时发布功能做全链路验证（创建 → 校验 → 派发 → 恢复 → 取消 → 历史标记 → 日历展示），
对照参考产品（蚁小二 4.0 逆向工程，平台侧定时方案）梳理差异后，发现 5 个真实缺陷：

1. **P1 批量定时重启丢失（静默数据丢失）**：`BatchManager.scheduleBatch` 只用内存 `setTimeout`
   （`this._timers`），应用退出即丢；`batch_jobs` 表里 status='scheduled' 的批次重启后无人重新武装，
   排期文章**永不发布**。PRD §6.3 声称「支持 App 关闭后重启恢复」对批量路径不成立。
2. **P1 发布历史无法标记定时模式（死过滤器）**：`PublishHistory.vue` 的「定时发布」过滤器与
   详情「发布模式」读 `record.publishMode`，但生产代码从不写该字段（`phase4-events.addRecord` 只写
   platform/title/taskId/status/result/error）——过滤器恒空，用户无法区分定时/立即发布。
   `TaskQueue._add` 白名单也会丢弃自定义字段，即使上游标记也传不到终态事件。
3. **P2 日历无取消入口**：唯一取消路径是发布页会话内 `cancelPublish`（`activeScheduleIds` 内存态，
   离开页面即丢）；`schedulerCancel` IPC 已暴露但无 UI 消费——用户排期后无法从任何界面取消。
4. **P2 日历显示已取消/已执行任务**：`getEventsForDate` 把所有 `scheduledTasks` 渲染为 ⏰ 待发事件，
   cancelled/executed 状态的任务看起来「还会发布」。
5. **P2 usePublishFlow 重复函数定义**：`aa7e7cf0`（2026-08-23）新增 `Promise.allSettled` 版
   `cancelPublish` 时未删旧 `Promise.all` 版，旧版成死代码；`fdd30498`（2026-08-30）的通知迁移
   甚至误改在死副本上。函数声明重复无 lint 规则拦截、行为测试全绿（JS 后者覆盖前者）。

## What Changes

- **批量定时重启恢复（P1）**：`BatchManager.restoreScheduledBatches(ownerSubject)` 遍历
  `batch_jobs` status='scheduled' 批次复用 `scheduleBatch` 重臂定时器；过期文章立即入队
  （catch-up，与单篇 `scheduler.restore` 语义一致）；单批次异常逐批 try/catch 只记 warn。
  `phase3-services.restoreForOwner` 与 `scheduler.restore` 同点位接线（身份模式同 owner 语义，
  恢复属旁路、失败不阻断启动）。
- **发布历史定时模式标记（P1）**：`scheduler.dispatch` 与 `BatchManager.scheduleBatch` 入队任务带
  `publishMode:'scheduled'`；`TaskQueue._add` / `getPendingTasks` / `serialize` 白名单透传
  （崩溃恢复 deserialize 后不丢）；`phase4-events` 的 `task:success` / `task:failed` 写历史时
  有值才带 `publishMode`（立即发布保持原样不写字段）。
- **日历取消入口（P2）**：`Calendar.vue` 待发事件（⏰ pending）行内「取消定时」按钮 →
  `notifyConfirm` 确认弹窗 → `schedulerCancel(id)` → 成功 toast + 刷新 / 失败 toast 不刷新；
  进行中禁用防重复点击。文案 `calendarPage.*` zh/en 成对入 locales（CI 基线扫描拦截渲染端
  新增中文字面量）。
- **日历状态过滤（P2）**：⏰ 只显示 pending/dispatching（及无 status 历史数据）；executed/failed
  由发布历史承载（✅/❌）；cancelled 不显示。取消按钮仅 pending（dispatching 是认领瞬态且
  `scheduler.cancel` 只认 pending）。
- **删除重复 cancelPublish（P2）**：删 `Promise.all` 死代码版，保留 `allSettled` 版（失败任务
  保留 ID 供重试）；`usePublishFlow.test.js` 新增「单一定义结构锁」（源码级正则断言，防替换式
  重构再残留死代码）。

## Capabilities

### New Capabilities

（无——全部为既有定时发布能力域的行为修复与补全。）

### Modified Capabilities

- `scheduled-publish`（PRD §6.3）：批量排期获得重启恢复语义；发布历史获得定时模式标记；
  日历获得取消入口与状态过滤；离线行为描述按实现修正（原文「断网标记 missed」与实现不符）。

## Impact

- **代码**：`packages/shared-utils/src/scheduler.js`（dispatch 标记）、`packages/shared-utils/src/task-queue.js`
  （白名单透传 ×3）、`apps/desktop/electron/services/batch-manager.js`（restoreScheduledBatches +
  排期入队标记）、`apps/desktop/electron/bootstrap/phase3-services.js`（恢复接线）、
  `apps/desktop/electron/bootstrap/phase4-events.js`（历史标记）、`apps/desktop/src/composables/usePublishFlow.js`
  （删死代码）、`apps/desktop/src/views/Calendar.vue`（取消 + 状态过滤）、
  `apps/desktop/src/locales/{zh,en}.js`（calendarPage 成对）。
- **测试（TDD，先红后绿）**：`batch-manager.test.js` +5（恢复语义 ×5）、`scheduler.test.js` +1
  （派发标记）+3 处精确形状断言同步、`task-queue.test.js` +1（透传）、`phase4-events.test.js` +2
  （历史标记/立即不写）、`phase3-services.test.js` +2（接线/旁路容错）、`Calendar.test.js` +7
  （取消闭环/状态过滤）、`usePublishFlow.test.js` +1（结构锁）。
- **文档**：PRD §6.3 全链路重写（架构决策/校验/流程/交互/显示/提示文字/持久化/权益/离线），
  F2 表格行与验收表行同步。
- **风险面**：`restoreScheduledBatches` 在启动路径执行——旁路 try/catch + 逐批容错保证不阻断启动；
  `publishMode` 为加法字段（立即发布不写），历史读取方 `publishModeValue` 缺省即 immediate，向后兼容；
  日历状态过滤对无 status 的历史 JSONL 数据保持显示（向后兼容）。
- **与参考产品的差异（不采纳平台侧定时的理由）**：本地方案零平台适配、统一取消、离线可控；
  代价是到点时应用须在运行（重启 catch-up 补发）。详见 PRD §6.3.1 对照表。
