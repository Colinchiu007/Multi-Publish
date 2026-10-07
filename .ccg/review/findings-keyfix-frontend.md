# 前端轴结论（commit 5930bc6fb）

评审范围：`.ccg/review/keyfix-runtime.diff`（publish-history.js 实现 + publish-history.test.js / phase4-events.test.js 两个测试块）、PRD §三/§五、两个测试文件末尾新增 describe 整块，并核对了实现与生产调用点源码。

## Q1 X1 跨模块契约锁是否真的跑到生产链路 —— 是

- `freshHistory()`（phase4-events.test.js:555-559）`vi.resetModules()` + `require('../services/publish-history')`：注入的是**真实生产模块**，唯一替换是模块自带测试接缝 `PH_TEST_DATA_DIR`（publish-history.js:69-71）重定向存储位置，不是替身。
- 断言读**落盘文件**：`onDisk()`（:560-564）直接 `fs.readFileSync` JSONL，不看返回值；:591-593 前提自证（`taskId==='task_x_1'` 且 `id!=='task_x_1'`）保证旧「只按 record.id」匹配下本锁必红。
- `getMainWin:()=>null` 与缺省 `progressEmitter` **不绕过**被测代码：emitter 只是旁路广播，`createPublishProgressEmitter` 对 null 窗口在 publish-progress-events.js:135-136 直接 `return`（已核实），被测链（addRecord phase4-events.js:106 → startAuditRequery:56 → monitor 回调:79-98 → updateRecordAudit:91）完全不经过 getMainWin。
- `auditRequery`/`publishMonitor` 是生产代码自声明的注入点（phase4-events.js:43,47-48「测试可注入替身」）；`buildAuditPatch` 是真 shared-utils 实现（phase4-events.js:20），`rejected→deny` 映射（publish-audit-status.js:45）被真实执行。

## Q2 K1–K4、K6 有无恒真断言或为通过而构造的夹具 —— 无

- K4（publish-history.test.js:493-509）正向对照健全：:499 先以正确 owner 断言 `ok.updated===true`，「owner 不符 ⇒ false」因此具备区分力（谁都无法命中时正向对照先红）；负用例前 `wipe()`+`fresh()` 换新模块实例从干净态出发。
- K6（:511-520）的退化键 `"undefined"` **不会被** `if (!targetId) return` 早退吃掉——`targetId="undefined"` 是非空真值串，publish-history.js:201 的早退不触发；它精确打向 `String(record.taskId || '')` 空值保护（:221），N5 变异（去掉 `|| ''`）下 `String(undefined)==="undefined"` 会命中无 taskId 记录、K6 必红。锁测的正是它声称测的东西。
- K1/K2/K3 夹具对不同输入（不同 taskId、不同 owner）产出不同内容，非罐头成功 mock；K1 另有 `rec.id !== taskId` 前提自证（:447）。

## Q3 命名与口径一致性 —— 生产代码无残留旧口径，一处 nit

- publish-history.js:192 JSDoc 已改为 `taskOrRecordId` 并写明「规范键＝发布任务 id」；:217-221 匹配顺序 taskId 优先、id 兜底，与注释一致。
- phase4-events.js:151-153 注释「关联键的语义＝发布任务 id」与新口径一致；:91 调用点传的 `task.id` 本就是规范键（PRD §4.2 调用点不改）。
- PublishHistory.vue:633 读侧 join `String(record.taskId || record.id)` 与写侧匹配顺序**同构**，一致。
- 全仓 `updateRecordAudit` 生产调用点仅 phase4-events.js:91 一处（grep 证实），无其它漏改点。
- 唯一 nit：phase4-events.test.js:349 局部变量 `const [id, patch, owner]` 仍叫 `id`，实际承载队列任务 id——属 PRD §4.3 明确保留的旧 P0-1 块，不构成误导，但下一个维护者可能误读为记录主键。

## Q4 PH_TEST_DATA_DIR → os.tmpdir() 是否污染并行会话 —— 不污染；机制系沿用，有一处清理缺口

- 跨 worktree/跨会话：两测试均用 `fs.mkdtempSync`（唯一随机后缀目录），`PH_TEST_DATA_DIR` 是**进程级**而非机器级 env——同机多 worktree 各自进程互不可见，无文件级冲突。
- 既有夹具已用同一机制：publish-history.test.js:6-18 顶层 describe 早已 `mkdtempSync` + `PH_TEST_DATA_DIR` + `vi.resetModules`，本次只是沿用。
- 缺口：phase4-events.test.js 新块 :557 设 env，但**全文件无 `delete`**（grep 证实）；vitest.config.js:11-12 `maxWorkers:1 / fileParallelism:false` 使同 worker 进程串行跑多个测试文件，env 会泄漏给同 worker 后续文件。publish-history.test.js 外层 afterAll（:16）有 `delete` 兜底，phase4-events.test.js 没有。
- 影响定性：既有测试中所有 `PH_TEST_DATA_DIR` 引用点均自设 env（grep 证据），故属潜在风险而非现行故障。

## CRITICAL

无。

## WARNING

- **phase4-events.test.js:557 新块设置 `PH_TEST_DATA_DIR` 后全文件无回收**（:552-554 的 afterAll 只 `rmSync` 目录，未 `delete process.env.PH_TEST_DATA_DIR`）。同 worker 后续测试文件若 require publish-history 而不自设 env，会被重定向到已删除目录（`listRecords` 读路径 ENOENT 抛错）。建议在 :552 afterAll 补 `delete process.env.PH_TEST_DATA_DIR`，与 publish-history.test.js:16 对齐。

## INFO

- phase4-events.test.js:586 用 3 个 `await Promise.resolve()` 冲掉异步门，对当前单 await 的 `auditRequery` stub 足够；stub 若再增 await 层级需同步加拍，否则监控回调可能尚未注册就断言（当前无此问题）。
- phase4-events.test.js:349 `const [id, patch, owner]` 局部命名沿用旧口径（实为队列任务 id），建议随本 PR 顺手改名 `taskId` 以免误导（PRD §4.3 保留该断言本身，不必动）。
- publish-history.test.js:418 新块的 env 清理依赖外层 describe afterAll（:16）的 `delete`——若该块日后移出外层作用域即泄漏，在自身 afterAll 显式 `delete` 更稳。
