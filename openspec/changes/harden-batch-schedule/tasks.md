# harden-batch-schedule — 任务清单

## 1. 批量定时器生命周期（b1 幽灵发布 + b2 重复排期，TDD）

- [x] 1.1 `batch-manager.test.js` 新增「定时器生命周期」describe（先红 7 例）：重复 scheduleBatch 不产生重复定时器、cancelBatch 清定时器 + 状态 cancelled、cancelBatch 只影响目标批次、cancelBatch 未登记返回 false、batch:delete 先清定时器（幽灵发布回归锁）、batch:cancel IPC、stopAll 清空（Map 结构回归）
- [x] 1.2 实测 RED：`expected 3 to be 1`（3 次调用 3 个定时器）+ `expected "vi.fn()" to not be called at all, but actually been called 1 times`（删除后仍入队，**幽灵发布实证**）
- [x] 1.3 实现：`_timers` → `Map<batchId, Set<timer>>` + `_clearBatchTimers` + `scheduleBatch` 入口去重 + timer 回调按 Set 自删 + `cancelBatch` + `batch:cancel` IPC + `batch:delete` 先清定时器，21/21 GREEN

## 2. 取消排期入口（b3）

- [x] 2.1 `api/publisher.js` 新增 `batchCancel`；`preload/system.js` 新增 `batchCancel` 桥接
- [x] 2.2 `useBatchPublish` 新增 `scheduledBatchId` 状态 + `cancelScheduledBatch()`（失败保留 id 供重试）并导出
- [x] 2.3 `Publish.vue` 批量进度区新增「取消排期」按钮（`scheduledBatchId` 驱动 + `data-testid` + Close 图标）
- [x] 2.4 locales zh/en 成对新增 `cancelSchedule` / `scheduleCancelled` / `cancelScheduleFailed`
- [x] 2.5 测试：`useBatchPublish.test.js` +5（含「排期成功才暴露 id」「失败保留 id」「非排期批次无副作用」）

## 3. 离线缓存形状同源 + 批量离线检测（b4）

- [x] 3.1 `offline-manager.test.js` 新增「缓存写入形状与重放形状必须同源」describe（先红）：嵌套形状按 targets 展开、嵌套条目重放后移出缓存、扁平+嵌套共存、无法识别留缓存、单 target 失败整条保留
- [x] 3.2 实测 RED：嵌套形状重放返回 0（永久留缓存），3 例失败
- [x] 3.3 实现 `expandCachedTask()` 唯一展开点 + `processCachedTasks` 逐 target 入队/全成功才计数，23/23 GREEN
- [x] 3.4 `useBatchPublish` 提取 `buildBatchArticlePayload`（batchCreate 与缓存共用）+ `buildCacheTargets`（归一化对象目标）
- [x] 3.5 批量离线检测分支（逐篇缓存 + 提示；失败 danger 提示不静默）；locales 新增 `offlineCached` / `offlineCacheFailed`
- [x] 3.6 测试：`useBatchPublish.test.js` +2（离线逐篇缓存不创建批次 / 缓存失败提示失败）；mock 由死 mock 改为 window.electronAPI 转发

## 4. scheduled_tasks 死路径清理

- [x] 4.1 `ipc-handlers/store.js` 删 3 个 handler（附保留表的理由注释）
- [x] 4.2 `preload/account.js` 删 3 个桥接（附真源说明注释）
- [x] 4.3 `scheduler-store.js` 顶部加 ⛔ dead-path 标注（真源 = JSONL + BatchManager；表仅迁移/级联删除用）
- [x] 4.4 `store.test.js` 新增结构锁 4 例（preload/主进程/渲染层三面 + 真源入口在位），含扫描域规模下界反失明断言
- [x] 4.5 同步测试：`store.test.js` 清单/describe/owner 用例、`tests/ipc-handlers.test.js`、`preload.test.js` 计数 4 处、e2e `ipc-mock.js`
- [x] 4.6 重打包 preload bundle（index + home-shell），bundle 含 batchCancel

## 5. QM-6 评审（降级记录）

- [x] 5.1 派发双模型评审：codex（`codex review --commit` → 参数互斥；改 `codex exec`）+ claude（`claude -p`）
- [x] 5.2 **两路均 403 不可用**：claude `今日订阅额度已用尽或未配置订阅`；codex 同因（CC Switch 代理上游 AllinOne 403）+ 沙箱 policy 拦截 shell
- [x] 5.3 按 AGENTS.md「子代理降级」纪律：不盲等，降级为主代理对抗性自审；本轮自审产出即 b1/b2/b4a 三个新缺陷（比形式化评审更强的实质发现）；双路不可用事实与证据行记入 `.quality-gates.md` 与 PR 描述

## 6. 质量门禁与交付

- [ ] 6.1 QM-1 打包（electron-builder --win --dir）+ asar 含修复代码 + 启动 8 秒无致命 stderr
- [ ] 6.2 全量回归（apps/desktop + packages/shared-utils）
- [ ] 6.3 PRD 补充（§6.3.8 批量取消、§6.3.11 离线修正、§6.3.12 批量定时器契约）
- [ ] 6.4 CHANGELOG / learnings / `.quality-gates.md` 执行记录
- [ ] 6.5 推送 + PR + auto-merge + CI
- [ ] 6.6 记忆沉淀（外部记忆 learnings + EverOS episode）
