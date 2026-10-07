# PRD · 博主采集主进程接线（2026-10-07）

> 上游：[PRD-CREATOR-MONITOR-COLLECT-2026-10-07.md](./PRD-CREATOR-MONITOR-COLLECT-2026-10-07.md)
> 契约：`openspec/specs/creator-monitor/spec.md`
> 前情：PR #3053 合并（`6bc65b3b`）只落地了**修复层**，功能**从未真正跑通过一次**。
> CCG 实现级评审证实：10 个 IPC 通道从未在生产注册、store 缺 10 个方法、配额对象无产出方。
> 取证脚本用真实 sql.js + 真实 store 走注册路径，输出「缺失 11/11」。

---

## 0. 评审状态（如实记录，不假装收敛）

决策层 CCG 跨家族评审（`opencode` × `claude`）共 4 轮，Critical 走势 **2 → 1 → 0 → 1**，
**最低维度分始终 5，未达 8.0 阈值，未形式收敛**。

停止自动迭代的原因是**结构性的**：proposer 后端（opencode）输入上限实测 7,800 字符
（实测边界约 8,125–8,145），每轮「修订」步骤都因超限失败，proposer 无法在循环内消化意见。
引擎自身给出的处方同样是「压缩方案后再分轮评审」。

本文已逐条消化各轮意见，**但不声称收敛**；剩余为 Warning/Info 级实现契约细节，随实现用测试兜住。

评审拦下的四个真问题（若照初稿实施必踩）：

| 轮次 | 问题 | 后果 |
|---|---|---|
| v1 Critical | 配额账本**没有写入方** | `SUM(units)` 恒为 0，额度永不生效，幂等前提悬空 |
| v1 Critical | outbox 无去重、终态未定义 | 重试时 CAS 不落空，下游重复发布 |
| v2 Critical | **superseded 无代码路径** | 状态机只分 `collected`/`CLAIM_LOST`，superseded 恒为 0，文案永不出现 |
| v2 Warning | 「天然幂等」是假的 | 主键冲突时裸 `INSERT` 抛异常并整段回滚，崩溃重发失败而非去重 |
| v3 Warning | **两条决策互斥**（门面装配期组合 vs 禁止装配期碰 store） | 装配期 `store.db` 为 null，门面当场崩 |
| v4 Critical | 注册锁自相矛盾（门面 4 法 vs IPC 需 10 法） | 交付物无法按稿组合 |
| v4 Warning | **配额并发洞**（预检与记账两时刻分离） | 并行采集双双通过预检后实际超池 |

---

## 1. 两个依赖对象，不要混为一谈

| 对象 | 来源 | 内容 |
|---|---|---|
| `creatorStore` | 容器注册（取 `store.db`） | 10 个方法（见 §2） |
| `creatorMonitor` | **注册点派生**，非容器注册 | 恰 4 个方法 |

- 容器只注册 3 个：`creatorStore` / `creatorCollector` / `creatorRuntime`。
- `creatorMonitor` 是**门面**：成员用箭头函数包装调用**同一个 runtime 实例**
  （`(...a) => runtime.collectOne(...a)`），**不得解构**（会丢实例态）。
- **门面在 `phase5-ipc` 注册 handler 时与 store 同源组装**，不在容器装配期——
  装配期 sql.js 未就绪、`store.db` 为 null，而门面依赖 store。

---

## 2. store 需补的 14 个方法

> **口径更正（2026-10-07，先红锁实测得出）**：初稿只枚举了 **IPC 层**的调用，得出「缺 10 个」。
> 实际 **runtime 层**另有 6 个调用点，其中 3 个此前完全没被计入：
> `recordFailure` / `recordSuccess` / `getClaimToken`。
> 方法面完整性锁（`creator-store-surface.test.js`，从两个消费方源码里剥注释后
> 解析 `store.x(` 调用点）给出的唯一待补集合是 **14 个**。
> 这三个正是失败分级（5 档 + 自动暂停）与幂等/被接管判据所依赖的读接口 ——
> 手工枚举漏掉它们，说明「按调用方逐个读代码」这种做法本身不可靠，必须有锁。

`listFollowsForQuota` **仅内部使用**，不注册成 IPC 通道。

### 2.1 IPC 层调用（10 个）

| 方法 | 语义 | 返回 | 非法态 |
|---|---|---|---|
| `listCreators()` | 全部博主 + 关注状态 + 待采集数 | `[{...creator, follow, pendingCount}]` | 空表 ⇒ `[]` |
| `listFollowsForQuota()` | 全部关注的 (id, interval, enabled) | `[{id, check_interval_min, enabled}]` | 空表 ⇒ `[]` |
| `upsertCreator({...})` | 按 `(platform, external_id)` 唯一索引 upsert | `{id, ...}` | 字段缺失 ⇒ 抛 `invalid_input` |
| `upsertFollow({creatorId, checkIntervalMin, perCreatorLimit})` | 按 `creator_id` 唯一索引 upsert | `{id, ...}` | `creatorId` 不存在 ⇒ 抛 `not_found` |
| `deleteFollow(followId)` | 关注置删 + 发现项转 `skipped` | `boolean` | 行不存在 ⇒ `not_found`（不静默） |
| `setFollowEnabled(followId, enabled)` | 见 §5 状态转换表 | `{id, enabled, status}` | 行不存在 ⇒ `not_found` |
| `listDiscoveries({creatorId, state, limit, offset})` | 分页查询 | `[{id, published_at, ...}]` | 越界 ⇒ `[]` |
| `getFollow(followId)` | 单条关注 | `\|null` | — |
| `getDiscovery(discoveryId)` | 单条发现项 | `\|null` | — |
| `skipDiscovery(discoveryId)` | `pending` ⇒ `skipped` | `boolean` | 已终态 ⇒ `invalid_state` |

### 2.2 runtime 层调用（6 个，此前漏计）

| 方法 | 语义 | 返回 | 用途 |
|---|---|---|---|
| `recordSuccess(followId, at?)` | 探测成功：清 `consecutive_failures`、写 `last_success_at` | `boolean` | 5 档失败分级的恢复路径 |
| `recordFailure(followId, reason, message?)` | 探测失败：`consecutive_failures+1`、写 `last_error_code`/`_message`、按阈值转 `auto_paused` | `{consecutive, status}` | 自动暂停的判据 |
| `getClaimToken(discoveryId)` | 读当前 `claim_token` 与 `claimed_by` | `{claim_token, claimed_by, collect_state} \| null` | §3.2 幂等/被接管三分支的判据来源 |
| `enqueueOutbox(discoveryId, kind)` | outbox 入队 | `{id}` | **由 `finalizeCollected` 内部取代**，不进 IPC 面 |

| 方法 | 语义 | 返回 | 非法态 |
|---|---|---|---|
| `listCreators()` | 全部博主 + 关注状态 + 待采集数 | `[{...creator, follow, pendingCount}]` | 空表 ⇒ `[]` |
| `listFollowsForQuota()` | 全部关注的 (id, interval, enabled) | `[{id, check_interval_min, enabled}]` | 空表 ⇒ `[]` |
| `upsertCreator({...})` | 按 `(platform, external_id)` 唯一索引 upsert | `{id, ...}` | 字段缺失 ⇒ 抛 `invalid_input` |
| `upsertFollow({creatorId, checkIntervalMin, perCreatorLimit})` | 按 `creator_id` 唯一索引 upsert | `{id, ...}` | `creatorId` 不存在 ⇒ 抛 `not_found` |
| `deleteFollow(followId)` | 关注置删 + 发现项转 `skipped` | `boolean` | 行不存在 ⇒ `not_found`（不静默） |
| `setFollowEnabled(followId, enabled)` | 见 §5 状态转换表 | `{id, enabled, status}` | 行不存在 ⇒ `not_found` |
| `listDiscoveries({creatorId, state, limit, offset})` | 分页查询 | `[{id, published_at, ...}]` | 越界 ⇒ `[]` |
| `getFollow(followId)` | 单条关注 | `\|null` | — |
| `getDiscovery(discoveryId)` | 单条发现项 | `\|null` | — |
| `skipDiscovery(discoveryId)` | `pending` ⇒ `skipped` | `boolean` | 已终态 ⇒ `invalid_state` |

---

## 3. 关键决策

### 3.1 同事务 + 终态

`finalizeCollected(id, token, collectorId, body)`：

```
BEGIN IMMEDIATE
  UPDATE creator_discoveries SET collect_state='collected', ...
   WHERE id=? AND claim_token=? AND claimed_by=? AND collect_state='collecting'
  → changes=0 ⇒ ROLLBACK 后返回（不得留下无主 outbox 行）
  配额复核（见 3.3）—— 超池 ⇒ ROLLBACK
  INSERT OR IGNORE INTO viral_library (...)      -- 按迁移建的 partial 索引关联
  仅当该 INSERT **真正新增行** ⇒ INSERT OR IGNORE INTO collection_outbox
      (ref_id=discoveryId, kind='finalize_collected')   -- UNIQUE(ref_id,kind)
COMMIT
```

- `viral_library` 的唯一索引是 `WHERE external_id <> ''` 的 **partial** 索引；
  软删只改 `collect_state`、**不清 external_id**，故重关注后仍命中忽略。
- 幂等重发与重关注都因 `INSERT OR IGNORE` 命中忽略而不产生第二条 outbox。

### 3.2 collectorId 与三分支

collectorId **随 claim 返回、由 collect 通道携带**，重发时**不得新生成 uuid**。
CAS 落空后回查该行并比对 `claim_token` **与** `collectorId`：

| 条件 | 判定 | 计数 |
|---|---|---|
| 两者都是我的 | **幂等重发**（上一轮已成功） | 三者**均不增** |
| `claim_token` 已推进且 `claimed_by` 是他人 | **superseded**（不重试） | `supersededCount+1` |
| 其余 | `CLAIM_LOST` | `failed+1` |

### 3.3 配额：事务内复核为准，预检只为快失败

池基准：`SUM(units) WHERE day=? AND kind=?`，按日按 kind 的**全局池**，预检与复核同源。

- 采集**前** `canSpend`（只读）超池 ⇒ `quota_would_exceed`，**不发任何网络请求**；
- `finalizeCollected` 事务内**再次复核**当日 `SUM`——并发下两个采集可能双双通过预检，
  **事务内复核才是权威**，超池即整段 ROLLBACK；
- `spend` 用 `INSERT OR IGNORE`（**不是裸 INSERT**），`request_sig = discoveryId` 幂等。

### 3.4 软删理由更正

初稿用「pending 会继续占采集额度」论证取消关注要软删，但 ledger 只在成功落库时记账，
pending 期本就不占额——**理由不成立**。更正为：软删使发现项**不再计入待采集额度**
（`listDiscoveries` 按 `state` 过滤），且**保留用户已采集的资产**（物理删不可逆）。

### 3.5 `creator:probe` 契约

- 入参 `followId`（白名单校验）；
- **写 `creator_discoveries`**（`INSERT OR IGNORE`，靠 `(platform, external_id)` 去重），
  不写 creator 表；
- 返回 `{ code: 0, fetched, inserted }`；
- `followId` 不存在 ⇒ `follow_not_found`；`enabled=0` ⇒ `follow_paused`（**不发网络请求**）。

### 3.6 装配时机

`creatorStore` 依赖 `store.db`，sql.js 异步就绪 ⇒ 不得在容器装配期 new，
在 `phase5-ipc` 注册 handler 时从 context 取。

---

## 4. 通道清单（共 11 个新通道）

| 通道 | 入参 | 成功返回 | 失败 reason |
|---|---|---|---|
| `creator:list` | — | `{code:0, items, totalPending}` | — |
| `creator:follow` | `input` | `{code:0, creator, follow}` | `invalid_input` / `channel_not_found` / `quota_would_exceed` |
| `creator:unfollow` | `followId` | `{code:0}` | `not_found` |
| `creator:toggle` | `followId`,`enabled` | `{code:0, follow}` | `not_found` |
| `creator:check-now` | `followId` | `{code:0, ...}` | `follow_not_found` |
| `creator:probe` | `followId` | `{code:0, fetched, inserted}` | `follow_not_found` / `follow_paused` |
| `creator:discoveries` | `creatorId?`,`state?`,`limit?`,`offset?` | `{code:0, items, limit, offset}` | — |
| `creator:collect` | `followId`,`count?` | `{code:0, collected, failed, supersededCount, remain, truncated, available, max}` | `follow_not_found` / `quota_would_exceed` / `invalid_input` |
| `creator:collect-one` | `discoveryId` | `{code:0, ...}` | `discovery_not_found` / `quota_would_exceed` |
| `creator:skip-one` | `discoveryId` | `{code:0}` | `invalid_state` |
| `creator:send-to-writer` | `discoveryId` | `{code:0, runId, idempotencyKey}` | `pipeline-unavailable` / `discovery_not_found` |
| `creator:pending-total` | — | `{code:0, total}` | — |

全部统一走 handler 层白名单（`requireString` 长度上限、类型、枚举），
`body` 设大小上限（超限按 `invalid_input` 拒）。**IPC 是权限边界，不信任渲染层入参。**
非法状态一律**显式返回原因码**，不静默吞。

---

## 5. 状态转换表

| 操作 | `enabled` | `status` | 发现项 |
|---|---|---|---|
| `setFollowEnabled(false)` | 0 | `paused_by_user` | `pending` **不动**（数据留着，只是不再被新探测填充） |
| `setFollowEnabled(true)` | 1 | `active` | 不动 |
| `deleteFollow` | — | 行删除 | 全部转 `skipped`（软删） |
| `skipDiscovery` | — | — | `pending` ⇒ `skipped`；已终态 ⇒ `invalid_state` |
| `finalizeCollected` 成功 | — | — | `collecting` ⇒ `collected`（终态） |

**角标统计口径**：只统计「`state='pending'` **且**所属 follow `enabled=1`」的行。

---

## 6. 交互与显示

### 6.1 角标

- **读通道**：`creator:pending-total`，挂载时取初始值；
- **推送**：main 在 `finalizeCollected` COMMIT、关注增删成功、**以及 `skipDiscovery` 成功后**
  `webContents.send('creator:pending-total', n)`；
- 渲染端订阅更新；父组件只订阅，**不重复请求**（否则切 tab 会重复拉取）。

### 6.2 提示文案（zh / en 成对）

| 场景 | zh | en |
|---|---|---|
| 被他人接手 | `N 条已被其他任务接手` | `N items were taken over by another task` |
| 配额超限 | `今日采集额度已用完，请明天再试或调整关注数量` | `Today's collection quota is used up. Try again tomorrow or adjust the number of followed creators` |
| 关注项已暂停，无法探测 | `该博主已暂停监控，请先恢复后再检查` | `Monitoring for this creator is paused. Resume it first` |
| 关注项不存在 | `关注项不存在或已取消关注` | `This follow no longer exists` |
| 作品状态不允许跳过 | `该作品已处理，无法跳过` | `This item is already processed and cannot be skipped` |
| 服务未就绪（降级） | `博主监控服务未就绪，请在设置中检查依赖与凭证` | `Creator monitoring is unavailable. Check dependencies and credentials in Settings` |

---

## 7. 测试策略

- **先红**：把取证脚本转成「方法面完整性」集合比对锁 —— 这类锁正是缺陷逃逸的原因。
- **集成**：真实 sql.js + 真实 store + 真实 `registerHandlers`，**全程走 IPC 通道**，
  跑通 关注 → `creator:probe` 入表 → 一键采集 → `viral_library` + outbox + ledger 同事务。
  **不再用桩 store 直调**（桩正是 11 个缺失方法隐身的原因）。
- **碰撞驱动用例**（让 `INSERT OR IGNORE` 的忽略分支可被证伪）：
  1. 同 discovery 重发 ⇒ 只一条 outbox、ledger 不重复计费、三项计数均不增；
  2. 同内容重关注再采 ⇒ `viral_library` 不新增、不产生第二条 outbox；
  3. **并发两笔同时超池** ⇒ 事务内复核使其中一笔 ROLLBACK，`SUM` 不越池。
- **错误路径**：`quota_would_exceed` ⇒ 零网络请求；三分流断言；
  collectorId 不匹配时**不得误判幂等**；各通道非法状态码逐条断言。
- **注册锁（两组独立断言）**：① `creatorMonitor` 门面恰含 4 个方法；
  ② 10 个 store 方法在 `creatorStore` 上可解析；③ require 存在性仅作前置。
- **变异反证**（四条各有用例必须立刻变红）：去掉 `changes=0` 的回滚；
  把任一 `INSERT OR IGNORE` 改回 `INSERT`；去掉「仅当真正新增才写 outbox」；
  去掉事务内配额复核。

---

## 8. 文件拆分（确定，非「必要时」）

| 文件 | 职责 |
|---|---|
| `creator-store.js` | 状态机与事务（`finalizeCollected` / `canSpend` / `spend`） |
| `creator-store.follows.js` | 关注表 CRUD 与状态转换 |
| `creator-store.discoveries.js` | 发现表 CRUD 与 `viral_library` 写入语句 |

`BEGIN/COMMIT` **只在 `creator-store.js` 一层**，子模块只提供语句 —— 避免拆完出现跨文件事务。

---

## 9. 本 PR 明确不做

探测调度落地（定时触发）、消耗系数修正、UI 交互与文案（除角标与 superseded 展示）、
商店多账号、`content_aggregator` 分发形态。

## 10. 风险

`ipc-handlers/index.js` 与 `phase5-ipc.js` 是**共享文件**，仓库并发极活跃，合并大概率 rebase 冲突。
