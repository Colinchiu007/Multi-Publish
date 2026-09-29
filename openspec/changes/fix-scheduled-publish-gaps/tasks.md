# fix-scheduled-publish-gaps — 任务清单

## 1. 批量定时重启恢复（P1，TDD）

- [x] 1.1 `batch-manager.test.js` 新增 `restoreScheduledBatches` describe（先红）：重启重臂定时器且未到点不入队、过期立即入队（catch-up）、无 scheduled 批次返回 0、单批次异常不阻断、身份模式按 owner 列批次 + owner 缺失 fail-closed
- [x] 1.2 实现 `BatchManager.restoreScheduledBatches(ownerSubject)`（复用 scheduleBatch，逐批 try/catch），测试转绿
- [x] 1.3 `phase3-services.test.js` 新增接线测试（先红）：restoreScheduledBatches 在 scheduler.restore 之后调用、恢复抛错不阻断启动（warn）
- [x] 1.4 `phase3-services.restoreForOwner` 接线（与 scheduler.restore 同点位、同 owner 语义、旁路 try/catch），测试转绿

## 2. 发布历史定时模式标记（P1，TDD）

- [x] 2.1 `scheduler.test.js` 新增派发标记测试（先红）：dispatch 入队任务带 `publishMode:'scheduled'`
- [x] 2.2 `task-queue.test.js` 新增透传测试（先红）：`_add` 白名单不丢 publishMode，立即发布为 null
- [x] 2.3 `phase4-events.test.js` 新增历史标记测试（先红）：success/failed 写历史带 publishMode、立即发布不写字段
- [x] 2.4 实现：`scheduler.dispatch` 标记 + `task-queue._add/getPendingTasks/serialize` 白名单透传 + `phase4-events` 有值才写 + `batch-manager` 排期入队（立即/定时两路径）标记，测试转绿
- [x] 2.5 同步 `scheduler.test.js` 3 处精确形状断言（合同有意变更：任务对象新增 publishMode）

## 3. usePublishFlow 重复定义清理（P2，TDD）

- [x] 3.1 `usePublishFlow.test.js` 新增「cancelPublish 单一定义结构锁」（先红：当前 2 处定义）
- [x] 3.2 删除 `Promise.all` 死代码版（保留 allSettled 版 + 根因注释），测试转绿

## 4. 日历取消入口与状态过滤（P2，TDD）

- [x] 4.1 `Calendar.test.js` 新增取消 describe（先红）：pending 显示按钮 + 点击确认 + schedulerCancel + 刷新、确认拒绝不调用、失败提示不刷新、历史事件无按钮、非 pending 无按钮、cancelled/executed 不渲染为 ⏰、无 id 防御
- [x] 4.2 实现 `Calendar.vue`：`cancelSchedule`（notifyConfirm → schedulerCancel → toast + loadData）、`cancellingId` 防重、`isPendingSchedule` 状态判定、`getEventsForDate` 状态过滤、取消按钮模板
- [x] 4.3 locales zh/en 成对新增 `calendarPage.*` 8 键（CI Gate 7 locale-sync + 基线扫描合规）
- [x] 4.4 修测试自身竞态：mount 后先等 onMounted 的异步 loadData 回写完成再设 vm 数据（`await vi.runAllTimersAsync()`）

## 5. 回归与文档

- [x] 5.1 全量回归：apps/desktop vitest 全量 + packages/shared-utils vitest 全量
- [x] 5.2 PRD §6.3 全链路重写（架构决策/入口交互/数据校验/创建/派发/恢复/取消/日历显示/持久化权益/离线）+ F2 表格行 + 验收表行
- [x] 5.3 CHANGELOG 收口
- [x] 5.4 OpenSpec change 登记（proposal/tasks/design）
- [ ] 5.5 QM-1 打包验证（electron-builder --win --dir）+ 推送 GitHub + PR + CI 通过后合并
