# 审核回查结论写不回发布历史：关联键错配修复 PRD（2026-10-07）

- 关联取证：`docs/audit-requery-evidence-bilibili-2026-10-07.md` §四（真机投稿跑出的现场）
- 变更类型：运行时代码（`apps/desktop/electron/services/` + `bootstrap/`）⇒ 隔离 worktree `mp-audit-writeback-key-fix`、分支 `audit-writeback-key-fix`、经 PR + CI 合并
- 严重度：**P0 —— 一个已宣称存在的能力整体不工作，且静默**

---

## 一、症状与现场

B 站真机投稿（`BV1HyHC6mExS`）后，回查链路**完整跑通并拿到了终态**，但历史记录的审核字段始终为空：

```
[08:32:33.631] PublishMonitor monitor-result      {"platform":"bilibili","postId":"BV1HyHC6mExS","status":"published"}
[08:32:33.634] PublishMonitor audit-update-skipped {"taskId":"task_1_1791361909906"}
```

回读该条发布历史（`historyGet('muxumprdxpwj')`）：`status:"success"`、`result.postId` 有值，但**没有** `auditStatus` / `monitorStatus` / `auditedAt`。

日志里只有一行 `audit-update-skipped`，无异常栈 ⇒ 用户侧表现为「历史列表的审核徽标永远不出现」，排障侧表现为「没有任何东西报错」。

## 二、根因：两侧对「关联键」的理解不一致

```js
// apps/desktop/electron/bootstrap/phase4-events.js:91
const { updated } = history.updateRecordAudit(task.id, patch, ownerSubject)
//                                          ↑ 队列任务 id，形如 task_1_1791361909906

// apps/desktop/electron/services/publish-history.js:187 / :207-208
function updateRecordAudit (id, patch, ownerSubject) { ...
  String(record.id || '') === targetId && matchesOwner(record, owner)
//                  ↑ 历史记录主键，由 addRecord 生成为 Date.now().toString(36)+4 位随机
```

队列任务 id 在记录里**确实存了**，但字段名是 **`taskId`**（`addRecord({ ..., taskId: task.id, ... })`，`phase4-events.js:107 / :201`），不是 `id`。两个键永不相等 ⇒ 恒 `updated:false` ⇒ 恒走 `audit-update-skipped`。

### 2.1 规范键到底是哪个 —— 仓库自己已经回答过

这不是"选一个键"的设计分歧，本仓在别处**已经确立并写下**了答案：

- `PublishHistory.vue:633`（读侧 join）：`byTask.get(String(record.taskId || record.id))`
- `phase4-events.js:151-153` 注释原文：
  > 关联键的语义＝**发布任务 id**（读侧 PublishHistory.vue 按 record.taskId join 这一列）；
  > 存 addRecord() 返回的 entry.id 会让历史页表现列继续恒空。缺 id 就留 NULL，不猜。

⇒ **`taskId` 是规范关联键**，`updateRecordAudit` 按 `record.id` 匹配是这一条纪律的漏项，不是另一种约定。

## 三、为什么四层测试全绿（逃逸分析）

`phase4-events.test.js:308-360` 不是"没测到"，而是**两侧合谋**：

```js
const history = { addRecord: vi.fn(() => ({ id: 'h-1' })),
                  updateRecordAudit: vi.fn(() => ({ updated: true })) }   // ① 被调方永远报成功
...
const [id, patch, owner] = history.updateRecordAudit.mock.calls[0]
expect(id).toBe('task-audit-1')                                           // ② 把错键钉成契约
```

- ① mock 恒返 `{updated:true}` ⇒ 「到底有没有改到那条记录」在这套夹具下**结构性不可表示**；
- ② 断言 `id === 'task-audit-1'`（队列 id）把当前错误行为**升级为规格**，任何人改调用点都会撞红，改被调方却没人管。

这是 AGENTS.md 两条已记纪律的**同时命中**：「测试断言不得反向固化错误行为」+「契约夹具不得替对方剥壳」（此处是替对方改返回值）。属「装饰性链路」在本仓的第四次复发。

## 四、修法

### 4.1 被调方按规范键匹配，并保留 `id` 兜底

`publish-history.js` 的 `updateRecordAudit`：

1. **先按 `record.taskId` 匹配**（规范键）；
2. 未命中再按 `record.id` 匹配（兼容无 `taskId` 的存量记录，以及确实持有记录主键的调用方）；
3. 参数改名 `taskOrRecordId`，把语义写在签名上而不是靠调用方猜；
4. `matchesOwner` 与其余判据不变。

两键格式天然不相交（`task_<n>_<ms>` vs `Date.now().toString(36)+4rand`），不存在"一个键撞到两条记录"；但匹配仍按 **taskId 优先**，且**只改第一条命中**（保持现有 `updatedRecord === null` 单次命中的语义）。

### 4.2 调用点不改

`phase4-events.js:91` 继续传 `task.id` —— 它传的本来就是规范键。改的是被调方的理解。

### 4.3 必须同时改掉那条钉死错误行为的断言

`phase4-events.test.js` 里 `expect(id).toBe('task-audit-1')` **保留**（它确实该传队列 id），但**新增**一条注入**真** `publish-history` 实现的跨模块契约锁：

- 用真 `addRecord` 写一条带 `taskId` 的记录 → 真 `updateRecordAudit(taskId, patch, owner)` → **独立回读那份 JSONL**，断言该记录的 `auditStatus` 真的变了；
- 反证：把匹配条件退回 `record.id` 单键 ⇒ 该锁必须变红（证明锁在跑，不是记录性断言）。

按 AGENTS.md：「若该面跑绿」等价于「该面真的加载了守卫」——这条锁必须被看见执行过（runner 通过清单里出现该文件名且测试数 > 0），不接受只 `node --check`。

## 五、验收标准

### 5.1 判据

| ID | 判据 |
| --- | --- |
| K1 | 真实现契约锁：`addRecord` 写入带 `taskId` 的记录后，用**队列 task id** 调 `updateRecordAudit` 必须 `updated:true`，且**独立回读 JSONL** 见 `auditStatus`/`monitorStatus`/`auditedAt` 落盘 |
| K2 | 同一条锁的兜底路径：记录无 `taskId` 时，用 `record.id` 仍能命中并回写 |
| K3 | 键不得撞错记录：两条记录 `taskId` 分别为 A/B，传 A 只能改到 A（夹具必须对不同输入返回不同内容，否则该锁对"按输入区分"这一类缺陷结构性免疫） |
| K4 | owner 不匹配时仍不得回写（单向证据规则 + 多租户边界不因这次修键而放宽）。**必须自带正向对照**：owner 正确时同一键要能改到，否则"不符 ⇒ false"会因为"谁都改不到"而恒真 |
| K5 | `updateRecordAudit` 抛错不冒泡到发布主流程（既有语义保持，`phase4-events.test.js:379` 已有锁，不得因改动失效） |
| K6 | 退化键 `"undefined"` 不得命中「没有 `taskId`」的记录 —— 这是 `String(x \|\| '')` 空值保护**唯一**的可观测面，不测等于没锁 |
| X1 | **跨模块契约锁**：把**真** `publish-history` 注入 `wireTaskQueueEvents`，走完整链 `task:success` → 真 `addRecord` → 监控回调 → `updateRecordAudit(task.id)` → 独立回读 JSONL，断言那条记录的审核徽标真的落了地。§三 那套替身夹具测不到的，这条必须测到 |
| N1–N5 | 反证（见 5.2），每条都必须实测变红，且收尾断言源文件与备份**逐字节相同** |

### 5.2 反证归因（实跑结果，非计划）

| 变异 | 结果 | 被抓住的测试 |
| --- | --- | --- |
| N1 匹配退回「只按 `record.id`」（＝修复前的原始 bug） | 红 | **X1**（跨模块锁）+ K1 + K3 + K4 —— `Tests 4 failed \| 54 passed (58)` |
| N2 只按 `taskId`（删掉 `id` 兜底） | 红 | K2 + 既有锁「明确结论就地更新原记录且不新增行」「只吸收白名单键」 |
| N3 摘掉 `matchesOwner` | 红 | K4 + 既有锁「owner 不匹配/记录不存在/非法 id 一律不改」 |
| N4 键判据整体失效（任何记录都算命中） | 红 | K6 + 既有锁「只吸收白名单键」「owner 不匹配…一律不改」 |
| N5 `taskId` 不做空值保护（`String(undefined)` 参与比较） | 红 | **仅 K6**（`Tests 1 failed \| 57 passed (58)`）—— K6 是本轮为这条守卫补的锁；补它之前该变异**全绿**，即"有守卫无锁" |

工具层一条：名称解析最初用 `split(ESC).join('')`，`×` 与测试名之间残留 `[31m`，于是"红了但说不出谁红"，`caught` 恒为 `<none>`；改为按完整 ANSI 序列 `/\x1b\[[0-9;]*[A-Za-z]/g` 剥除后才有上表归因。**「解析器无匹配」不等于「零失败」**，必须先直读一次原始输出。

> 上表在 QM-6 评审修复（测试环境变量按套件回收）之后**复跑一次，归因与失败数逐条不变**（N1 仍为 `4 failed / 54 passed (58)`）。反证必须绑最终 head，否则"修完之后锁还成不成立"这句话没有出处。

## 六、影响面

- **不止 B 站**：所有走 `createMonitorTask` 回查的平台（bilibili / weibo / douyin / zhihu / xiaohongshu / toutiao / youtube…）此前都拿不到审核徽标。修完这条链才第一次真正通。
- 不改数据格式、不迁移存量：存量记录缺 `auditStatus` 就继续缺，回查再跑一次才会补上（**不擅自回填**）。
- `AUDIT_REQUERY_VERIFIED_PLATFORMS` 的准入判据不受本修复影响（仍按四类状态是否实测齐备）。

### 6.1 真机复验（2026-10-07 晚，合并之后补的）

已用一次真实投稿端到端验过，且**同一份日志里天然带着修复前的对照组**：

- 新稿 `BV1hhH16NEAZ`（任务 `task_1_1791381214184`）：5 轮 `poll-progress` 报 `reason:"in-review-bucket"` → `monitor-result published` → 记录上 `auditStatus/monitorStatus/platformWorkId/auditedAt` **四个字段全部落库**，`auditedAt` 与那条日志时间逐毫秒一致；
- 修复前那条 `task_1_1791361909906`（同账号同链路）：`monitor-result published` 之后 3 毫秒就是 `audit-update-skipped`，四个字段至今缺席；
- 界面层：`#/publish/history` 整页徽标集合实测 `["已上线"]` 且只挂在新稿行上，旧稿行无徽标位。

完整时间线、回读表与「本轮仍不能下结论的四件事」见 `docs/audit-requery-evidence-bilibili-2026-10-07.md` §八。
一处方法学自纠同时写在那里：初稿我曾写「落后 main 10 个提交，逐条查过均无关」——那是**没量过的归因**；正解是比 blob（链路四文件在运行树与 main 上逐字节相同）。

## 七、范围外

- 视觉门禁 `pixel-diff-baseline-guard` 的 10s 超时预算（另一会话域，且属"给他人测试调预算"的独立变更）。
- bilibili「审核不通过」`state` 取值仍未观测 ⇒ 不据此新增任何状态映射。
