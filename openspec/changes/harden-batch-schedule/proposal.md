# 批量定时加固 + scheduled_tasks 死路径清理（harden-batch-schedule）

## Why

2026-10-02 首轮定时发布验证（PR #2655）修好了「单篇 + 批量重启恢复 / 历史定时标记 / 日历取消」，
但对**批量链路**只做了恢复语义，未做定时器生命周期与离线对齐的审查。第二轮验证发现 4 个真实缺陷
（其中 2 个是发布正确性问题，1 个是既有 P1），外加一条并行的死数据路径：

1. **b1 幽灵发布（P1）**：`batch:delete` 只删 SQLite 记录、**不清内存定时器**，而 `_timers` 原为
   `Set<timer>`（无 batchId 索引，想清也定位不到）。用户删除已排期批次后，`setTimeout` 仍在，
   **到点照样发布**。反证实测：删除后 `queue.add` 仍被调用 1 次。
2. **b2 重复排期（P1）**：`scheduleBatch` 每次调用都为未来文章注册新 timer 并累加进同一 Set，
   无批次级去重。UI 重复点发布 / restore 与手动排期叠加 ⇒ 重复定时器 ⇒ **同一文章重复发布**。
   反证实测：3 次调用产生 3 个定时器。
3. **b3 无取消入口（P2）**：批量排期后没有任何界面能取消（`batchCancel` IPC 与 preload 桥接都不存在），
   用户只能干等到点——与单篇已有日历取消入口不对等。
4. **b4 离线机制整体失效（既有 P1，本轮新发现）**：渲染层（单篇与批量）写入嵌套形状
   `{ targets: [{platform, accountId}], data }`，而 `offline-manager.processCachedTasks` 的判据是
   **扁平** `task.platform && task.article` ⇒ 嵌套条目 `platform` 为 undefined ⇒ 被永久留在缓存、
   网络恢复后**永不重放**。批量发布本身还完全没有离线检测（单篇有）。
   既有测试全部使用扁平夹具，所以这个缺陷从未被覆盖（又一次「夹具形状 ≠ 生产写入形状」）。
5. **scheduled_tasks 死路径（P3 清理）**：SQLite `scheduled_tasks` 表被包装成 3 个 store IPC
   （`store:add-scheduled-task` / `store:list-scheduled-tasks` / `store:delete-task`）+ 3 个 preload 桥接
   对外暴露，但**零渲染层调用**（全仓只有测试引用）。定时发布真源是 JSONL
   （`scheduler:create/list/cancel`）与 `BatchManager`（`batch:*`）。留着这条死路径的风险是
   后来者把它当真源接新功能 → 写出第二份真源、与 JSONL 必然漂移。

## What Changes

- **定时器索引重构（修 b1+b2）**：`BatchManager._timers` 从 `Set<timer>` 改为
  `Map<batchId, Set<timer>>`；新增 `_clearBatchTimers(batchId)` 作为唯一定时器清除点；
  `scheduleBatch` 入口先清同批次旧定时器（去重）；`batch:delete` 先清定时器再删记录。
- **取消排期（修 b3）**：新增 `BatchManager.cancelBatch(batchId)`（清定时器 + 状态置 `cancelled`，
  记录保留）+ `batch:cancel` IPC + preload `batchCancel` + `api/publisher.batchCancel`
  + `useBatchPublish.cancelScheduledBatch()`（失败保留 id 供重试，不自标记成功）
  + `Publish.vue` 批量进度区「取消排期」按钮（`scheduledBatchId` 驱动，排期成功才出现）。
- **离线形状同源（修 b4a）**：`offline-manager.expandCachedTask()` 作为**两种形状的唯一展开点**
  ——扁平原样透传（存量缓存向后兼容）、嵌套按 targets 逐条展开；单条缓存的全部 target 入队成功
  才计入重放数并移出缓存，任一失败整条保留（不部分丢失、不虚报成功）。
- **批量离线检测（修 b4b）**：`useBatchPublish.handleBatchPublish` 在创建批次前检测离线，
  离线时逐篇 `offlineAddToCache({ targets, data })` 并提示，不硬发；缓存失败提示失败不静默。
  提取 `buildBatchArticlePayload(a)` 作为 batchCreate 与离线缓存的**共用构造**（防两份漂移），
  `buildCacheTargets(a)` 把目标归一化为 `{platform, accountId}` 对象（字符串目标无法被重放）。
- **死路径清理（修 5）**：删 3 个 store IPC + 3 个 preload 桥接；**保留** `scheduled_tasks` 表
  （`base-store.migrateFromJsonl` 仍写入、`account-store` 删账号时级联清理仍读取）；
  `scheduler-store.js` 顶部加 ⛔ dead-path 标注（说明真源与保留原因）；
  新增**结构锁 4 例**（preload 不得再暴露 / 主进程不得再注册 / 渲染层不得调用 / 真源入口在位）。
  重打包 preload bundle（`index.bundle.js` + `home-shell-preload.bundle.js`）。

## Capabilities

### New Capabilities

（无——全部为既有批量发布能力域的行为修复与一致化。）

### Modified Capabilities

- `batch-publish`：排期批次获得**可取消**语义（清定时器 + 状态 cancelled）与**幂等排期**语义
  （重复调用不产生重复定时器）；删除批次不再留下幽灵定时器；离线时进入缓存而非硬发。
- `offline-cache`：缓存写入形状与重放形状**同源**（唯一展开点），修复「嵌套形状永不重放」。
- `scheduled-publish`（数据层）：`scheduled_tasks` 表明确降级为「迁移+级联删除载体」，
  不再对外暴露 IPC 面。

## Impact

- **代码**：`electron/services/batch-manager.js`（定时器索引 + cancelBatch + 2 个 IPC handler）、
  `electron/services/offline-manager.js`（expandCachedTask + processCachedTasks）、
  `electron/ipc-handlers/store.js`（删 3 handler）、`electron/preload/account.js` + `system.js`、
  `electron/services/store/scheduler-store.js`（dead-path 标注）、`src/api/publisher.js`、
  `src/composables/useBatchPublish.js`、`src/views/Publish.vue`、`src/locales/{zh,en}.js`、
  重打包的 2 个 preload bundle。
- **测试（TDD，先红后绿）**：`batch-manager.test.js` +7、`offline-manager.test.js` +5、
  `useBatchPublish.test.js` +5、`store.test.js` +4 结构锁；计数同步 preload 4 处。
- **风险面**：`_timers` 结构变更影响 `stopAll`/`restoreScheduledBatches` 的既有语义——已由
  回归测试覆盖（stopAll 清空、restore 不叠加、cancel 只影响目标批次）。
  `expandCachedTask` 是缓存形状的唯一判据，新增形状必须在此处登记（有测试锁形状与留缓存语义）。
  死路径清理保留表结构，因此迁移与级联删除行为不变。
- **与首轮修复的关系**：首轮（#2655）修复的是「恢复语义、历史标记、日历取消」；
  本轮修复的是「定时器生命周期、离线对齐、批量取消、死路径」。两轮合并后定时发布闭环完整。
