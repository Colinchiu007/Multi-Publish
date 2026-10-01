# PRD：P2-8 账号分组落持久化真源 + 发布页按组选择（publish-page-optimization 第七切片，2026-10-01）

> **立项日期**: 2026-10-01
> **所属 roadmap**: [PRD-PUBLISH-PAGE-OPTIMIZATION-2026-10-08.md](./PRD-PUBLISH-PAGE-OPTIMIZATION-2026-10-08.md) 差距表第 8 项
> **基线**: `origin/main` = `5149125c`
> **worktree / 分支**: `D:/Data/projects/mp-worktrees/mp-account-groups-persistence` / `account-groups-persistence`
> **状态**: 本文档为「先文档再代码」门禁产出物，实施与本文档同 PR

---

## 一、问题定义

roadmap 把 P2-8 写成「无账号分组」，**该判定已过期**（见 roadmap「后续项现状纠偏」一节，2026-10-01 按内容逐条复核）。实况是：

1. **分组功能已存在，但只活在渲染层。** `apps/desktop/src/stores/accounts.js` 持有完整 CRUD：`:32` `groups = ref([])`、`:258 createGroup` / `:273 deleteGroup` / `:277 renameGroup` / `:286 setGroupPlatform` / `:298 getGroupAccounts` / `:310 toggleAccountInGroup`（账号删除后还做组内清理）。UI 侧 `views/Accounts.vue:128` 挂 `AccountGroupsPanel`，另有 `AccountGroupManager.vue` / `PlatformAccountGroup.vue`。
2. **持久化只有 `localStorage`。** `:225` 读 / `:252` 写，键 `mp_account_groups`，实现侧全仓仅此一个文件 ⇒ 换机/重装/清浏览器数据即丢，且与账号真源（后端 `accounts.json`）**不在同一持久化层**，账号能同步而分组不能，两者会长久错位。
3. **发布页零接入。** `views/Publish.vue` 对账号分组无任何引用（其 `groups` 唯一命中是 `:556` 的 `:groups="groupedPlatforms"`，那是**平台分组**，来自 `usePublishPlatformCatalog` 的运行时计算、不存储 —— 同名不同义，本切片禁止复用该 prop 名）。用户建好分组后仍要在发布页逐个勾账号。

⇒ 本切片交付的是：**分组改落「已有且按用户命名空间隔离」的持久化真源** + **发布页按组选择账号**。不是从零做分组。

## 二、真源选型（实测过的四条面）

| 候选面 | 现场 | 判定 |
| --- | --- | --- |
| `localStorage` | 现状（`stores/accounts.js:225/252`） | ❌ 与账号真源分层，重装即丢 |
| python-backend `accounts.json` | `packages/python-backend/src/server.py:428 _account_to_dict`，读源 | ❌ 该文件承载**账号**记录；分组不是账号，塞进去要动后端真源形状 + 两道投影白名单（`_account_to_dict` 与 `ipc-handlers/account.js:203 publicAccountFields`），代价与收益不匹配 |
| 云端 `/api/v1/me/accounts` | 信封加密镜像（AGENTS.md 账号凭证云端镜像契约） | ❌ 本切片不做跨设备同步，见 §九 非目标 |
| **Electron `settings`（SQLite）** | `services/store/settings-store.js`：`getSetting/setSetting` + `getUserSetting/setUserSetting`，键经 `scopedSettingKey` 做 **owner sha256 命名空间**；IPC `store:get-setting` / `store:set-setting`（`ipc-handlers/store.js:328/342`，带 `withSenderCheck`）；preload 暴露 `storeGetSetting/storeSetSetting`（`preload/account.js:125-126`） | ✅ **选它** |

选它的第三条理由是**有先例照抄**，不是新发明：`apps/desktop/src/composables/useCopyLibrary.js` 用的就是同一条面（键 `copy_library_rewrites`，`@/api/publisher` 的 `storeGetSetting/storeSetSetting`），并已把两类坑写死在前例里：

- **上限防膨胀**：`MAX_COPY_REWRITES = 200`，超出丢最旧 —— settings 表是无 schema 约束的 KV，不设上限就等于给用户一个无界增长文件。
- **读盘优先于内存**：其 `readCurrent()` 注释明写「避免跨组件内存副本互相覆盖——采集页与文案库面板各自持有一份 composable 实例，只用内存会丢对方的写入」。**分组天生同形**（`Accounts.vue` 面板 + 发布页两处消费），照抄这条，不得只写内存。

## 三、数据校验（硬约束表）

存储形状：**保持与今日 `localStorage` 完全一致的「分组对象数组」**，不加信封。理由：现有 `loadGroups()` 已实现一版迁移与归一（非数组 ⇒ 视为空；`accountIds` 缺失 ⇒ 按 `platformFilter` 回填），改形状会让两套归一逻辑并存 —— 两份必然漂移。

| # | 判据 | 规则 | 不成立时 | 落点 |
| --- | --- | --- | --- | --- |
| 1 | 顶层必须是数组 | 反序列化后 `Array.isArray` | 整份视为空并出声 `warn`，**不得**逐元素猜 | `normalizeAccountGroups` |
| 2 | 组数上限 | `MAX_ACCOUNT_GROUPS = 50` | 拒绝新建 + 提示已达上限（不是静默截断已有数据） | `createGroup` |
| 3 | 组内账号数上限 | `MAX_GROUP_ACCOUNTS = 500` | 追加时拒绝并提示 | `toggleAccountInGroup` |
| 4 | `name` | `String(x).trim()` 后长度 1..40 | 拒绝写入，保持现状（不写脏值） | `createGroup` / `renameGroup` |
| 5 | 同 `(platformFilter, name)` 不得重复 | 大小写敏感（中文为主，避免过度设计） | 拒绝并提示「同名分组已存在」 | `createGroup` / `renameGroup` |
| 6 | `platformFilter` | `null` 或 ∈ 注册表平台 id 单一真源（`packages/shared-utils/src/publish-capabilities.json`） | 未知 id ⇒ **丢弃该筛选并出声**，不得让它渲染成"筛不到账号的组" | `normalizeAccountGroups` |
| 7 | `accountIds` | 必须是非空字符串数组；**去重**；每项须能在当前账号列表里找到 | 找不到的 id 归为「失效成员」，保留在内存对象里但**不计入可选集合**，UI 标失效数；不得静默删（用户可能重新导入账号） | `getGroupAccounts` / 渲染层 |
| 8 | `id` | 必须存在且唯一；缺失 ⇒ 生成（`crypto.randomUUID()`）并写回 | 不得用 `name` 当 id（重命名会丢关联） | `normalizeAccountGroups` |
| 9 | 读盘失败 / IPC 不可用（浏览器 dev server 无 `electronAPI`） | 保持内存现状 + **出声**（`console.warn` 或 notify），禁止静默当成「没有分组」 | — | `loadAccountGroups` |
| 10 | 写盘失败 | `setSetting` 返回值/异常必须被消费；失败时 UI 保留未落盘态并提示「未能保存，重启后会丢失」 | 不得让「写失败」读起来像「已保存」 | `saveAccountGroups` |
| 11 | 返回码必须被消费（**owner 命名空间在主进程做，不在渲染层**） | `ipc-handlers/store.js:328/342` 的 handler 自己调 `_getOwnerSubject()`：`owner === null` ⇒ 返回 `{code: AUTH_ERROR}`；有 owner ⇒ 走 `getUserSetting/setUserSetting`（键被 `scopedSettingKey` 加 sha256 命名空间）；**`owner === undefined` ⇒ 退回无命名空间的 `getSetting/setSetting`（全局键）**。渲染层只传 key，因此**不得**把「返回了东西」当成功：`code !== 0` 一律保持现状并出声 | 把 `AUTH_ERROR` 读成「用户没有分组」⇒ 用户建好的组在界面上凭空消失，且下一次保存会用空数组**覆盖真源**（这是最坏的失效形态） | `readAccountGroups` / `writeAccountGroups` |
| 11b | 未登录态不得写盘 | `_getOwnerSubject()` 返回 `null` 或 `undefined` 时（前者 AUTH_ERROR、后者会落到全局键），本模块**拒绝写入**并提示先登录 | 落到全局键 = A 用户建的组被 B 用户看见并互相覆盖 | 同上 |
| 12 | IPC 参数纯 JSON | 写盘前 `JSON.parse(JSON.stringify())` 脱壳（AGENTS.md IPC 序列化铁律） | reactive proxy 直传会抛 `could not be cloned` | `saveAccountGroups` |

**迁移（一次性，非破坏）**：读 `mp_account_groups`（localStorage）有值、而 settings 无值 ⇒ 校验归一后写入 settings；**不删 localStorage**（删用户数据不是本切片的授权范围）。两侧都有 ⇒ 以 settings 为准，localStorage 只作历史。迁移失败必须出声，否则用户会以为已经换到新真源了。

## 四、流程

```
应用启动 / 账号列表就绪
   └─ loadAccountGroups(owner)
        ├─ settings 有值 → 校验归一 → 用之
        ├─ settings 无值 && localStorage 有值 → 归一 → 写 settings（迁移）→ 用之
        └─ 都无 → 空数组，UI 出「还没有分组」空态

发布页（单篇 / 批量条目）
   └─ 用户点「按分组添加」选一个组
        ├─ 取 getGroupAccounts(groupId) → 与当前所选平台取交集
        ├─ 交集并入已选账号（追加，不替换）
        └─ 差集如实报告：失效 N 个 / 其他平台 M 个未加入

发布页账号被删（Accounts 页或列表刷新）
   └─ 既有组内清理逻辑（stores/accounts.js 已在做）→ 下一次写盘时随全量落真源
```

## 五、功能逻辑与交互逻辑

1. **追加而非替换**：按组选择语义是"把这个组加进来"。替换是破坏性动作（会抹掉用户手勾的结果），如要做须显式二次确认 —— 本切片**不做替换**，并在提示文字里写明是"追加"。
2. **作用域按条目/按所选平台**：批量模式下每个条目自己的平台集不同（P2-7 已确立条目作用域约束），组内账号必须先与该条目 `a.platforms` 取交集；全局所选平台**不得**污染条目级结果。
3. **组的可用性实时判定**：组内当前平台可选账号为 0 时，下拉项置灰并说明原因（"该组在抖音下没有可选账号"），不得让用户点了才知道没反应。
4. **命名不得复用 `groups` prop**：`PublishTargetSelector.vue:83/132` 的 `selectedAccounts` 与 `:81` 的 `groups`（平台分组）已在同一组件里，新 prop 一律命名 `accountGroups` / 事件 `select-account-group`，避免两套语义撞名。
5. **两处消费同一真源**：`Accounts.vue` 面板与发布页必须各自 `readCurrent()`（先盘后内存），照 §二 先例；否则一边保存会覆盖另一边的写入。

## 六、显示项与提示文字（全部走 locale，zh/en 成对）

| 位置 | 内容 | key |
| --- | --- | --- |
| 发布页分组入口 | 「按分组添加」 | `publishPage.accountGroup.addByGroup` |
| 分组下拉项 | 「{name}（{platform} · {count}）」 | 复用参数化模板 `publishPage.accountGroup.itemLabel` |
| 下拉空态 | 「还没有分组，可先到账号管理页创建」 | `publishPage.accountGroup.empty` |
| 置灰原因 | 「该组在{platform}下没有可选账号」 | `publishPage.accountGroup.noAccountForPlatform` |
| 追加结果 | 「已加入 {added} 个账号」 | `publishPage.accountGroup.added` |
| 失效成员 | 「{count} 个账号已不存在，未加入」 | `publishPage.accountGroup.staleSkipped` |
| 跨平台未加入 | 「该组另有 {count} 个其他平台账号未加入」 | `publishPage.accountGroup.otherPlatformsSkipped` |
| 同名拒绝 | 「同名分组已存在」 | `publishPage.accountGroup.duplicateName` |
| 组数上限 | 「分组数量已达上限（{max}）」 | `publishPage.accountGroup.limitReached` |
| 写盘失败 | 「分组未能保存，重启后会丢失」 | `publishPage.accountGroup.saveFailed` |
| 迁移完成 | 「已从本机旧记录恢复 {count} 个分组」 | `publishPage.accountGroup.migrated` |

品牌红线：以上文案与全部代码注释**不得出现竞品/参考产品名**，需要指代时写「参考产品」（AGENTS.md Gate 12）。

## 七、行数预算（设计输入，不是事后解释）

`node .github/scripts/check-max-lines.js` 在 `origin/main` 实测（登记值 + 容差 200 − 当前行数）：

| 文件 | 登记 | 当前 | 上限 | **余量** |
| --- | --- | --- | --- | --- |
| `apps/desktop/src/views/Publish.vue` | 1515 | 1712 | 1715 | **3 行** |
| `apps/desktop/src/views/Accounts.vue` | 1365 | 1535 | 1565 | 30 行 |
| `apps/desktop/src/stores/accounts.js` | 未挂账 | 464 | 500 | 36 行 |

⇒ **硬约束**：发布页的分组 UI 一律落**新文件**（`features/publish/components/AccountGroupPicker.vue`），`Publish.vue` 侧只允许 import + 使用两处；若 3 行放不下，必须先在本 PR 内把另一块内联逻辑下沉换预算（P2-7 同法：下沉判据反而净减 27 行）。**不得**为省行放宽注释或写不可读的一行流 —— 那只是把债换个形状。`stores/accounts.js` 距 500 行新文件上限只剩 36 行，真源读写与归一逻辑建议放 `features/accounts/account-groups-store.js`（新文件，与 §八 判据单一真源同族）。

## 八、测试矩阵与反证（每条锁都要做一次"把锁改成 no-op 必须变红"）

| 锁 | 文件 | 断言 | 反证变异 → 预期 |
| --- | --- | --- | --- |
| L1 真源读写 | `account-groups-store.test.js` | 写后读回逐值相等；`electronAPI` 缺席时保持现状并出声 | 已实跑：把 `envelope.code !== 0` 判据摘掉 ⇒ **红 2**（模块侧「不得交出空数组当事实」+ store 侧「绝不拿空数组覆盖真源」）。⚠️ 原计划写的「摘掉 owner 命名空间 → 红」**未兑现**：owner 命名空间与 `AUTH_ERROR` 都在主进程 `ipc-handlers/store.js:344-347`，而 `store.test.js` 的「Logto owner_subject 隔离」只覆盖 `store:add-account`，**没有** `store:set-setting` 的用例。本切片未改动该 handler（属既有契约），故不在此处补测；缺口登记为残余（见 §十一），补测时须断言「identity 在而 sub 缺失 ⇒ `{code: AUTH_ERROR}`」与「有 owner ⇒ 走 `setUserSetting` 而非全局 `setSetting`」 |
| L2 迁移一次性 | 同上 | localStorage 有 / settings 无 ⇒ 迁移且**不删** localStorage | 把"不删"改成"清掉" → 红 |
| L3 校验表逐条 | 同上 | §三 第 1–8 条各有正反例（含未知 `platformFilter`、重复 id、非数组顶层） | 逐条放宽 → 各自红 |
| L4 读盘优先 | `accounts.store.test.js` | 两个实例并发写，后写的不得吞掉另一方的既有分组 | 改成只写内存 → 红 |
| L5 发布页追加语义 | `AccountGroupPicker.test.js` | 选组 ⇒ 只并入该条目所选平台、结果为并集、失效项不计入 | 改成整体替换 → 红 |
| L6 判据单一真源 | 结构锁 | `platformFilter` 合法性与 `getGroupAccounts` 的可选集合判定只有一份实现 | 复制第二份 → 红 |
| L7 locale 成对 | 门禁 `check-locale-sync --pair-base --keys --cjk` | §六 全部 key zh/en 双在、无死键、无新增硬编码中文 | 只加 zh → 红 |

## 九、非目标（明确不做什么，避免下一个会话当遗漏补上）

1. **不做跨设备/云端同步**：分组真源落本机 SQLite `settings`（userData 内），换机不随账号走。要跨设备得进 `/api/v1/me/*` 面并补跨包契约锁，另案。
2. **不做组权限/组共享/组级定时策略**。
3. **不删 localStorage 旧数据**（§三 迁移条）。
4. **不改 `AccountGroupsPanel` 的既有交互形状**，只换它的持久化后端。

## 十、实施切分（8a / 8b，按冲突面切，不按工作量切）

| 子片 | 内容 | 触碰文件 | 前置 |
| --- | --- | --- | --- |
| **8a 真源落库** | `account-groups-store.js`（新）+ 其测试 + `api/publisher.js` 增 `storeGetSettingResult` + `stores/accounts.js` 换后端 | 全部为新文件或只碰 `stores/accounts.js`（余量 36 行） | 无 —— 立即开工 |
| **8b 发布页按组选择** | `AccountGroupPicker.vue`（新）+ 单篇/批量两处挂载 + §六 全部 locale 键 | `Publish.vue`（**余量 3 行**）、`PublishTargetSelector.vue`、`locales/zh.js`、`locales/en.js` | **等 PR #2716（P2-7）合并** |

8b 排在 8a 之后不是工作量偏好，是**冲突面**：#2716 正在改同一批文件（`Publish.vue` + 两个 locale），两支并行会在一个只剩 3 行余量的文件上互相制造 CONFLICTING —— 而 CONFLICTING 的 PR 不调度任何 CI（本仓实测）。因此本 PR 只交付 8a，§五/§六 的发布页部分随 8b 落地，**不得**在 8a 里"顺手先接一半"。

## 十一、残余限制（实施后如实写回本文档与 PR）

- 组内账号是**按 id 引用**：从后端导入的新账号若换了 id，旧分组里的引用会变成"失效成员"，本切片只标不修。
- 发布页按组添加是**追加**，无"一键撤销本次追加"（用户可靠逐个取消达成）。
- `settings` 是无模式 KV：写坏一份 JSON 的后果由 §三 第 1 条兜住（整份视为空 + 出声），不做自动修复。
- **主进程侧 `store:set-setting` 的 owner 分支无测试覆盖**（`ipc-handlers/store.js:344-347`：`owner === null` ⇒ `AUTH_ERROR`；有 owner ⇒ `setUserSetting` 加 sha256 命名空间）。`store.test.js` 的「Logto owner_subject 隔离」只覆盖 `store:add-account`。本切片未改该 handler（属既有契约），因此 §八 L1 的反证只做到**渲染层**那一半；主进程那一半要补时须断言两条：identity 在而 sub 缺失 ⇒ `{code: AUTH_ERROR}`；有 owner ⇒ 走 `setUserSetting` 而不是全局 `setSetting`。
- **legacy 模式（`identityService` 缺席 ⇒ `owner === undefined`）下分组写的是无命名空间的全局键**，这是 settings 层的既有设计（`store.js:346` 只在 `owner !== undefined` 时走用户作用域），渲染层无从区分。后果：同一台机器上未登录/legacy 形态运行的分组会与「全局设置」共用一份。本切片不改该语义（改它等于同时动所有 settings 消费者），仅在此登记。
