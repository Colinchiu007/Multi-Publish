# 账号标签开卡跳登录页 —— 根因与修复（fix-account-tab-cookie-restore）

- 缺陷编号：fix-account-tab-cookie-restore
- 日期：2026-10-09（根因取证）/ 2026-10-10（超时护栏与分区对齐落地）
- 分支：`fix-account-tab-cookie-restore`（隔离 worktree `D:/Data/projects/mp-worktrees/mp-fix-account-tab-cookie-restore`）
- 涉及文件：
  - `apps/desktop/electron/services/webview-manager/tab-lifecycle.js`（修复本体）
  - `apps/desktop/electron/services/webview-manager/constants.js`（超时默认值常量）
  - `apps/desktop/electron/publishers/account-session-restore.js`（分区对齐 `seedAccountPartitionCookies`）
  - `apps/desktop/electron/publishers/account-manager.js`（两条落盘入口的旁路接线）
  - 回归：`apps/desktop/electron/services/webview-manager.test.js`、`apps/desktop/electron/publishers/account-session-restore.test.js`、`apps/desktop/electron/publishers/account-manager-relogin-status.test.js`

---

## 1. 一句话结论

账号卡片开标签时的登录态恢复，把**冻结的加密快照无条件覆盖式写入**账号的持久分区，
击穿了分区里那份**平台持续轮换的实时会话态**；而「一键检测」读的是快照与分区的**并集**、
且用一次性隔离 session（零持久写），既不修复分区也不改变开卡所读的那份数据。
于是用户看到「第一次点开卡是登录页，点一次检测再开就正常」——**不是检测把登录态修好了，
是那次失败的导航本身被平台 `Set-Cookie` 静默修补了**。

修复后的语义：**分区优先、快照仅补缺**（同 `name@domain` 一律不覆盖）；读分区失败才回退全量注入；
整条「读 + 写」链被门控在首个导航之前，但该门控**带硬超时且永不 reject**；
同时在**凭证落盘时刻**把新快照对齐进账号分区（解决「重新登录后开卡仍卡登录页」的反向回归）。

---

## 2. 现象与复现

### 2.1 用户报告的原症状

1. 账号管理页存在一个**确实已登录**的快手账号（凭证已保存、状态显示「已登录」）。
2. 点击该账号卡片 → 打开的浏览器标签落在**快手登录页**，视觉上是未登录。
3. 回到账号管理页点「一键检测」→ 检测结果为已登录。
4. 再次点击同一张卡片 → 这次打开的是**创作者中心首页**（正常）。

### 2.2 稳定复现步骤（不依赖检测）

1. 登录某平台账号并保存凭证（走 `saveCapturedAccount`）。
2. 在该账号的浏览器标签里正常用一段时间（平台会轮换会话 Cookie，例如 `pass_token` 换值）。
3. 关闭该标签（**不**再点「保存账号」，因此加密快照仍是步骤 1 的旧值）。
4. 重新点击卡片开卡 → 首屏被判未登录，跳登录页。
5. 在弹出的登录页里什么都不做，让它自然跳到平台首页（或手动访问一次创作者中心）→ 该次导航
   带回 `Set-Cookie`，分区被刷回有效会话。
6. 再点一次卡片 → 正常。**这一步就是「一键检测后再开卡正常」的真实机制**：检测并没有写任何东西。

### 2.3 不受影响的场景

- 主页/普通浏览标签（`persist:browse-<tabId>` 分区）：不读凭证快照，无此问题。
- `cleanSession: true` 的标签（失效账号的登录窗口）：本来就先清空分区再**不**注入快照，语义正确，未改动。
- 显式传 `opts.cookies` 的调用：那是调用方当场从真实现场取到的 Cookie，覆盖式写入是正确的，保持原行为。

---

## 3. 影响面

| 维度 | 范围 |
| --- | --- |
| 入口 | 账号管理页卡片点击、账号页「打开主页/开卡」、任何带 `accountId` + `url` 的 `createNewTabPage` 调用 |
| 平台 | **全部**使用 `persist:account-*` 分区 + 有会话轮换的平台（快手、抖音、头条、B 站、知乎、视频号等），快手只是最容易被观察到的一家（它的创作者中心对无会话 Cookie 直接 302 到 `passport.kuaishou.com`） |
| 用户可感症状 | 「明明登录过，点开却是登录页」；二次伤害：用户在那个登录页**重新登录**后，凭证被写入加密库，但分区仍是旧值 → 见 §6.3 反向回归 |
| 数据面 | 只影响分区内实时 Cookie 值，不损坏加密库与登录态真源；无脏数据落库，因此**不需要数据迁移** |
| 持续性 | 覆盖式注入语义最早可追到 `57082ddec`（2026-08-24）之前的 `webview-manager.js`，2026-09-16 `4f2cf3cf1` 的产物里它已是 `for (credCookies) → cookies.set` 的无条件写（`webview-manager.js:322-330`）；2026-09-24 `069bb07d8` 把 1735 行单体拆成 10 个模块时**原样平移**进 `tab-lifecycle.js`，拆分审查没有覆盖这段语义 |

---

## 4. 证据链

1. **写侧**（缺陷代码，修复前 `tab-lifecycle.js`）：对 `credCookies`（来自
   `credentialStore.loadSavedCredentials(accountId)`）逐条 `normalizeElectronCookie` 后
   直接 `viewSession.cookies.set()`，**从不读取分区现状**，因此同键的新值被旧值覆盖。
2. **快照必然陈旧**：`tab-lifecycle.js:232` 的
   `credentialSaveState: (useAccountSession && cleanSession) ? 'unsaved' : null` ——
   普通账号标签（`cleanSession` 为假）**根本不进入「待保存」状态**，平台轮换出来的新 Cookie
   永远不会回写快照。快照只在登录窗口/扫码/显式「保存账号」时更新。
3. **读侧（为什么检测看起来「修好了」）**：`account-manager.js:540`
   `const cookies = sessionRestore.mergeCookies(encryptedCookies, partitionCookies)` ——
   检测读的是**并集**，任一侧有有效会话即判为已登录；并且检测走一次性隔离 session，
   **对 `persist:account-*` 零持久写**。所以检测既不解释症状也不制造修复。
4. **补丁来自平台**：失败导航落在登录页后，平台的匿名/风控 Cookie 与跳转回写使分区重新拿到
   可用会话，第二次开卡即正常。这是「第一次登录页、之后正常」这一时间形状的唯一解释。
5. **宿主能力边界**（决定了不能用「比谁新」来修）：`node_modules/electron/electron.d.ts` 的
   `interface Cookie` 只有 `domain / expirationDate / hostOnly / httpOnly / name / path /
   sameSite / secure / session / value`，**没有 `creationTime` / `lastAccessTime`**；
   `credential-store` 的载荷也没有时间戳。逐 Cookie 比新鲜度在文档 API 上不成立，
   读那两个字段就是恒 `undefined` 的死探针（AGENTS.md「宿主 API 字段归属必须先核实」）。

---

## 5. 根因（QM-5 第 1 步）

**第一性原因**：把「恢复登录态」实现成了「把快照搬到分区」，而快照与分区**不是同一类东西**——

- 分区（`persist:account-<id>`）= 该账号浏览器标签的**实时会话态**，平台在轮换它；
- 加密快照 = **上次显式保存时刻**的冻结值，且普通标签的轮换不回写它。

用「冻结值覆盖实时值」在方向上就是反的。这个错误在「凭证刚保存就立刻开卡」的场景下不显形
（两者此刻相同），只在账号被用起来一段时间之后才暴露，因此长期潜伏。

**为什么四层测试都没拦住**（QM-5 第 2 步，逃逸链）：

| 层 | 为什么漏过 |
| --- | --- |
| 单元（`webview-manager.test.js`） | 既有恢复用例只断言「快照 Cookie 被 `set` 了」，夹具分区**恒空**。分区里有更新鲜的同键值这一前提在夹具里根本不可表示——夹具对所有输入返回同一份数据，「按输入区分」这一整类缺陷对它结构性免疫。 |
| 集成 | 检测路径与开卡路径分别测，没有一条用例把「检测判已登录」与「开卡落在登录页」放在一起对照。 |
| E2E / 真机 | 真机验收每次都从「刚登录完」出发，快照此刻确实是新的。 |
| 代码审查 | `069bb07d8` 是纯平移，审查注意力在「拆得对不对」，不在被搬那段的行为语义。 |

---

## 6. 修复方案

### 6.1 语义变更：分区优先、快照仅补缺（`tab-lifecycle.js`）

开卡时先读一次分区，构造 `existingKeys = Set("name@domain")`，再逐条比对快照：

```
对快照每条 cookie：
  payload = normalizeElectronCookie(cookie, initialUrlForCookies)
  payload 为空            → 不计数、不注入（形态不合格）
  existingKeys 命中同键   → skipped-existing++，不覆盖
  否则                    → 注入
日志：credential restore (partition-first): injected=<实际发起 set 的条数> skipped-existing=<被分区挡掉的条数>
```

去重粒度 `name@domain` 与检测侧 `mergeCookies` 保持一致，避免「检测认为有效、开卡却覆盖掉同一条」。

**降级**：`viewSession.cookies.get({})` 失败（磁盘锁 / 会话异常，罕见）→ 记 warn 后
`restoreFromCredential(null)`，即退回旧的全量注入，保证「清空后首次恢复」能力不回退。
`cookies.get` 是异步 API，但 `Promise.resolve(...)` 求值参数时就会执行它，因此读取被包在
`try/catch` 里把**同步抛错**也转成 reject——否则「读失败回退全量注入」这条护栏对同步失效形态失明。

**短路**：快照一条可用 Cookie 都没有时**不发起分区读**（那是一次纯开销的无界 IPC，且发生在导航前）。

### 6.2 门控 promise 的超时护栏（QM-6 后端评审命中项）

「读分区 → 补缺注入」整条链聚合为**一个** promise 并被门控在首个 `loadURL` 之前，
因此它必须满足仓库铁律「**门控首个导航的异步 promise 必须带超时与销毁守卫**」
（2026-09-24 头条白屏事故同族；先例 `constants.js` 的 `LS_INJECTION_TIMEOUT_MS`）。

新增 `_gateRestoreWithTimeout(chain, label)`（实现位于 `webview-manager/utils.js`，与 `_partitionRestoreTimeoutMs`
一同作为可复用护栏导出；调用点在 `tab-lifecycle.js` 的恢复链上——拆分动机是 `tab-lifecycle.js` 已贴近 500 行逐文件上限）：

- 默认预算 `PARTITION_COOKIE_RESTORE_TIMEOUT_MS = 2500`（`constants.js` 单一真源）；
- 排障覆盖：`MP_COOKIE_RESTORE_TIMEOUT_MS`，非法值（非有限数 / ≤0 / 空串以外）回落默认并
  `log.warn` 出声，禁止静默；
- **超时后放行导航，且绝不改走全量注入**（注入不在超时点被取消，挂起的链在后台自行收敛）——分区本身就是
  实时会话态，改走全量 `set` 既可能同样挂死，也可能把陈旧快照盖回新鲜分区（正是要消除的方向错误）；
- 门控 promise **永不 reject**（超时与失败都 `resolve`），一条恢复失败不得逃出建标签流程；
- 定时器 `unref()`，且 `settled` 单次收口，避免迟到 settle 重复 resolve。

- **覆盖面（2026-10-10 QM-6 双模型外部评审命中项）**：凡进入 `preNavPromises` 的门控 promise **一律**套本护栏，
  不得只修凭证恢复这一条链。现覆盖三条——① 快照补缺链（label `<平台>:<id>`）、② `opts.cookies`
  显式注入链（label `supplied-cookie:<平台>:<id>`）、③ `cleanSession` 残留清除链（label
  `clean-session:<平台>:<id>`）。后两条若挂起，原先同样会把首个导航无限期挡住（白屏同族形态）。
  ③ 的链首另包一层 `Promise.resolve().then(...)`，使 `cookies.get` 的**同步**抛错转成 reject 走旁路，
  不再爆出 `createNewTabPage`（与 ① 的 `readExistingKeys` 同口径）。

### 6.3 反向回归：凭证落盘 → 账号分区对齐（QM-6 前端评审命中项）

改成「分区优先」后出现一个**新的**风险，必须同时闭合：

> 重新登录走的是独立 `persist:auth-*` 分区，`updateCapturedAccount` 只写加密库 + 回写
> `status=active`，**从不触碰 `persist:account-*`**（已确认：重登路径不走 `cleanSession`，
> 也不刷新账号分区）。于是分区里那条「还没过期、但已被平台吊销」的同键旧 Cookie 会挡掉刚拿到的
> 新快照 —— 用户重新登录后开卡**仍停在登录页**，比原 Bug 更糟。

由于逐 Cookie 比新鲜度不可得（§4.5），修法是**在唯一能保证「快照就是最新证据」的时刻**——
即凭证成功落盘之后——把快照对齐进账号分区。新增 `seedAccountPartitionCookies(platform, accountId, cookies, deps)`：

- 只写 `isPlatformCookieDomain(platform, cookie.domain)` 命中的记录（与读侧、凭证落盘侧同口径），
  平台域外一律不碰；
- `fromPartition('persist:account-' + accountId)`，与开卡侧分区名逐字同源；
- 同键新值胜出、缺失补上，不做任何删除；
- **调用点不得 `await`**（`syncAccountPartitionWithCredential` 为旁路：外层 `try/catch` +
  `pending.catch(...)` 双保险，任何失败只 `log.warn`）；
- 日志只记计数与 Cookie 名，**禁止记 value**。

为什么不选「落盘时先删除账号分区平台域 Cookie 再让它重新恢复」：`credential-saver` 自动保存的
快照就来自该分区，删除会把**正在使用的标签**立刻打成掉登录态。对齐（覆盖同键）而非清空重建，
是本场景下唯一不伤害在用标签的动作。

### 6.4 数据校验规则表

| # | 校验点 | 判据 | 不通过时行为 | 日志 |
| --- | --- | --- | --- | --- |
| V1 | 是否走账号会话 | `typeof accountId === 'string' && SAFE_IDENTIFIER.test(accountId)` | 走 `persist:browse-*` 普通分区，不做凭证恢复 | 无（既有） |
| V2 | 快照 Cookie 可用性 | `normalizeElectronCookie` 返回非空（要求 `name`/`value` 为字符串且能推出 `url`） | 该条跳过，不计入 `injected` | 无 |
| V3 | 快照是否值得读分区 | `credCookies.length > 0` | 不发起分区读 | 无 |
| V4 | 分区读结果形态 | 逐条要求 `ec.name` 为字符串；`domain` 缺失按空串参与键构造 | 该条不入 `existingKeys`（即不设防，宁可多注入也不误挡） | 无 |
| V5 | 读失败 | promise reject **或**同步抛错 | 回退全量注入（旧行为） | `partition cookie read failed, fallback to full credential restore <平台>:<id> err=` |
| V6 | 门控超时 | 链未在 `PARTITION_COOKIE_RESTORE_TIMEOUT_MS` 内收敛 | **放弃注入、放行导航** | `credential restore gate timed out after Nms, navigation not blocked: <平台>:<id>` |
| V7 | 门控内异常 | 链 reject | 收口为 resolve，不影响导航 | `credential restore gate failed, navigation not blocked: <label> err=` |
| V8 | 超时环境变量 | `Number.isFinite && > 0` | 回落默认 | `invalid MP_COOKIE_RESTORE_TIMEOUT_MS=..., fallback to 2500` |
| V9 | 分区名单合法性（seed） | `isSafePathSegment(accountId)`（`^[a-zA-Z0-9_-]+$`） | 直接返回，不碰任何分区 | 无（非法 id 在上游已 `throw`） |
| V10 | seed 域名合法性 | `isPlatformCookieDomain(platform, cookie.domain)` | `skipped++`，不写 | 汇总行的 `skipped=` |
| V11 | seed 宿主可用性 | `electron.session.fromPartition` 存在且返回带 `cookies.set` 的对象 | 返回，分区保持原样 | `seedAccountPartitionCookies: electron session unavailable / partition open failed / cookies.set unavailable` |
| V12 | seed 单条写失败 | `cookies.set` reject | 记 warn、`failed++`，其余条目继续 | `seed partition cookie failed name=... err=` |
| V13 | 落盘前置 | `credentialStore.saveCredential(...)` 返回 `true` | 抛错并回滚，**不执行分区对齐** | `加密凭证更新失败` |

### 6.5 流程（时序）

```
点卡片 → createNewTabPage({ accountId, url })
  ├─ 选分区 persist:account-<id>
  ├─ 读加密快照 loadSavedCredentials(accountId)
  ├─ [快照非空] 门控任务入队： cookies.get({}) → 构造 existingKeys → 只补缺 set()
  │      └─ 该任务被 _gateRestoreWithTimeout 包住：最多等 2500ms，超时/失败一律放行
  ├─ 等 cookieRestorations 收口（≤ 超时预算）
  └─ loadURL(创作者中心)            ← 恢复完成（或被放弃）之后才导航

用户重新登录（auth 分区） → updateCapturedAccount
  ├─ 平台域过滤 cookies
  ├─ saveCredential(...) 成功         ← 此刻快照 = 最新证据
  ├─ syncAccountPartitionWithCredential(...)（旁路，不 await）
  │      └─ seedAccountPartitionCookies: fromPartition('persist:account-<id>') → 逐条 set
  └─ persistLoginState(status=active) ← 真源回写，与分区对齐互不阻塞
```

### 6.6 交互逻辑与显示项

- **界面无新增控件、无新增文案、无新增 locale 键**：本修复改的是主进程恢复策略，
  用户可见的只有「点开卡直接进入创作者中心」这一结果。
- 账号卡片点击后的行为合同：点击 → 打开该账号的浏览器标签 → **目标页为该平台的创作者中心/首页**，
  不应出现登录页；若确实无有效会话（从未登录、或平台已吊销且分区无残留），落在登录页是**正确**表现，
  此时走既有的登录窗口流程。
- 「一键检测」的显示语义不变：检测结论仍只由 `mergeCookies`（快照 ∪ 分区）的有效会话 Cookie 决定，
  检测**不**是修复动作，也**不**再是「让开卡变正常」的前置条件。
- 状态显示项（已登录 / 未确认 / 已失效）与 `login-state.js` 单向证据规则不变，本修复未触及真源写侧规则。

### 6.7 提示文字（现场留痕）

用户侧无新增弹窗/提示。可观测性全部落在主进程日志（**均不含 Cookie 值**，只含计数与名称）：

| 场景 | 级别 | 文案 |
| --- | --- | --- |
| 正常补缺恢复 | INFO | `[<平台>:<accountId>] credential restore (partition-first): injected=N skipped-existing=M` |
| 分区读失败降级 | WARN | `partition cookie read failed, fallback to full credential restore <平台>:<accountId> err=<msg>` |
| 门控超时放行 | WARN | `credential restore gate timed out after <ms>ms, navigation not blocked: <平台>:<accountId>` |
| 门控内异常放行 | WARN | `credential restore gate failed, navigation not blocked: <label> err=<msg>` |
| 超时环境变量非法 | WARN | `invalid MP_COOKIE_RESTORE_TIMEOUT_MS=<raw>, fallback to 2500` |
| 单条注入失败 | WARN | `credential cookie restore failed name=<name> err=<msg>` |
| 分区对齐完成 | INFO | `seeded account partition <平台>:<accountId> seeded=S failed=F skipped=K` |
| 分区对齐单条失败 | WARN | `seed partition cookie failed name=<name> err=<msg>` |
| 分区对齐旁路异常 | WARN | `account partition sync threw/rejected <平台>:<accountId> err=<msg>` |

**排障口径**：若仍出现「开卡跳登录页」，先看有没有 `gate timed out` 或 `read failed` 两条 WARN——
有则是分区/磁盘层面的可用性问题（导航已放行，非本语义问题）；都没有且 `injected=0 skipped-existing>0`，
说明分区里同键值本身就是失效值，属平台侧吊销，应走重新登录并把 §6.3 的落盘对齐当作已生效路径核查。

---

## 7. 与既有合同的关系

- **`cleanSession` 合同不变**：失效账号开登录页仍走「先清空、不注入快照」（`4f2cf3cf1` #1888 建立的语义）。
- **登录态真源单向证据规则不变**：分区对齐不写 `status`，`active` 仍只由正向证据（凭证落盘）与
  `persistLoginState` 决定（AGENTS.md「登录态真源只被正/负证据改写」）。
- **凭证落盘契约覆盖全部同族路径**：分区对齐接在 `saveCapturedAccount` 与 `updateCapturedAccount`
  两条路径之后，与既有的「`status=active` + `last_validated` 固化」同位、同前置条件
  （凭证未落盘不执行），不新增第四条落盘入口。
- **门控首个导航的异步 promise 铁律**：本修复把新增的读分区 IPC 纳入同一护栏范式，
  与 `_injectLocalStorageAtDocumentStart` 的 `LS_INJECTION_TIMEOUT_MS` 同构。
- **IPC / 宿主 API 字段归属**：新增的分区读写只用 `electron.d.ts` 已核实的
  `session.cookies.get/set/remove`，未引入任何未声明字段。
- **日志脱敏**：所有新增日志只记计数与 Cookie 名，不记 value，符合既有 logger 口径。

---

## 8. QM-5 五步反哺

1. **第一性原因**：`credCookies → cookies.set` 的覆盖式恢复语义（§5，最早可追 `57082ddec`，
   在 `4f2cf3cf1` 产物中已是无条件写，由 `069bb07d8` 原样平移）。
2. **逃逸链**：见 §5 表格（单元夹具恒空分区 / 集成未对照 / 真机每次都从「刚登录」出发 / 平移未复审语义）。
3. **系统性漏洞**：
   - (a) **恢复类夹具对「分区已有更新鲜值」这一前提结构性免疫**——夹具对所有输入返回同一份数据；
   - (b) **纯平移重构的行为审查盲区**——「移动代码」的 PR 标题会让审查者放弃对语义的质疑；
   - (c) **门控首个导航的新增异步 IPC 缺少超时护栏**（本轮由 QM-6 外部评审独立命中，自审漏掉）。
4. **修复 + 回归保护**：见 §9，回归锁落 `webview-manager.test.js`（开卡侧）+
   `account-session-restore.test.js`（seed 单元）+ `account-manager-relogin-status.test.js`（跨模块真实现契约锁）。
5. **防止再次发生**（有具体文件变更落地）：
   - `AGENTS.md`：在「登录态固化契约覆盖全部『凭证落盘』同族路径」条目补记分区对齐这一步，
     并新增一条「**『把持久化快照灌回实时存储』的恢复必须读后补缺、不得覆盖，且门控首个导航的读取必须带超时**」；
   - `01-docs/learnings.md`：置顶记录「快照与分区是两类真相，覆盖方向反了」+「夹具恒空导致恢复类缺陷免疫」；
   - 回归锁全部接进既有 vitest 收集域（`apps/desktop` workspace），无需新增 CI 点名。

---

## 9. 测试与变异反证

### 9.1 新增/改动用例

`webview-manager.test.js`（开卡侧，8 条）：
1. 读分区挂起时导航仍发生（门控必须有超时）——`cookies.get` 返回永不 resolve 的 promise，
   `MP_COOKIE_RESTORE_TIMEOUT_MS=30`，断言 `loadURL` 被调用、WARN 含 `gate timed out`、`setCalls` 为空。
2. `cookies.get` **同步抛错**也走全量注入回退，且错误不逃出建标签流程。
3. 快照无可用 Cookie 时不发起分区读（用 `getCalls` 计数器证明「一次都没读」，同时导航照常发生）。
4. 恢复日志的 `injected` 只计真正**发起** `set` 的条数（被 `normalizeElectronCookie` 判 null 的不计；
   `injected=1 skipped-existing=0` 精确串断言）。注意口径是「发起」不是「成功」——`set` 被 reject 时
   仍计入，见 §10 第 9 条。
5. 显式传入的 `opts.cookies` 注入链挂起时导航仍发生（QM-6 前端评审 W1）——`cookies.set` 返回永不
   resolve 的 promise，断言 `loadURL` 被调用、WARN 含 `gate timed out` + `supplied-cookie:kuaishou:`、
   注入链只发起过 1 次 `set`。
6. `cleanSession` 残留清除链挂起时导航仍发生（同 W1 的第二条链）——`cookies.get` 永不 resolve，
   断言 `loadURL` 被调用且 WARN 含 `clean-session:wechat_mp:mp-9`。
7. `cleanSession` 分支 `cookies.get` **同步**抛错不得逃出建标签——与 ① 的 `readExistingKeys` 同口径，
   链首包 `Promise.resolve().then(...)` 把同步抛错转成 reject 走旁路；断言 `createNewTabPage` 不抛、
   `removeCalls` 为空、WARN 含 `clean session clear failed`、导航照常发生。
8. `sameSite` 已是规范化值 `no_restriction` 时必须直通（QM-6 前端评审 W2）——同批夹具另带一条
   `from_none` 作对照，防止「整条映射被删空」时该用例假绿。
（另有 2026-10-09 已交付的 2 条「分区优先不覆盖」「读失败降级」用例，共同构成行为矩阵。）

`account-session-restore.test.js`（seed 单元，6 条）：平台域过滤 + `seeded/skipped` 精确断言、
非法 `accountId` / 空快照 / 未注入 `deps` 一律不碰分区、`set` 失败只 warn 不 reject、
分区形状不符时降级、Playwright 形态 `sameSite` 归一与 `secure=false` 走 http url、
**日志不含 Cookie 值**。

`account-manager-relogin-status.test.js`（跨模块契约锁，5 条，**跑真 `seedAccountPartitionCookies`**，
只假 Electron session 宿主）：
1. `updateCapturedAccount` 把新快照写进 `persist:account-<id>`，平台域外不碰，
   且**只打开这一个分区**；
2. `saveCapturedAccount`（创建路径）与重登同口径——不得只锁一条落盘路径；
3. `cookies.set` 拒绝时返回值仍为 `active`、PATCH 仍发生、且必须出声；
4. 凭证未落盘（`saveCredential` 返回 false）时**不得**对齐分区——半成功不得污染实时会话态；
5. 结构锁：`account-manager` 必须复用 `sessionRestore.seedAccountPartitionCookies`，
   不得自带第二份 `fromPartition(` 拼分区名。

### 9.2 变异反证（八条均实测变红，且红的是**应当**变红的那条）

| 变异 | 结果 |
| --- | --- |
| 摘掉门控超时（`setTimeout` 预算改为等价于永不触发） | `回归：读分区挂起时导航仍发生` 1 红 |
| 摘掉两处 `syncAccountPartitionWithCredential(...)` 调用 | 契约锁 3 红（创建 / 重登 / 旁路出声） |
| 摘掉 `seedAccountPartitionCookies` 的平台域门禁 | `只把本平台域的可用 Cookie 写进 persist:account-{id}` 1 红（`seeded=3 skipped=2` vs `1/4`） |
| 把 `injected` 计数退回 `credCookies.length` | `恢复日志的 injected 只计真正发起 set 的条数（被 normalize 判 null 的不计）` 1 红 |
| 摘掉 `clean-session` 链的门控超时（`_gateRestoreWithTimeout` → 直接 push 原链） | `回归（2026-10-10，QM-6 评审命中）：cleanSession 清除链挂起时导航仍发生` 1 红 |
| 摘掉 `supplied-cookie` 链的门控超时 | `回归（2026-10-10，QM-6 评审命中）：显式传入的 Cookie 注入链挂起时导航仍发生` 1 红 |
| 摘掉 `normalizeElectronCookie` 的 `no_restriction` 直通分支 | `sameSite 已是规范化值 no_restriction 时必须直通` 1 红（`from_none` 对照仍命中，证明红的是直通而非映射整体） |
| `cleanSession` 链首退回「同步求值 `cookies.get`」（摘掉 `Promise.resolve().then(...)` 包裹） | `cleanSession 分支 cookies.get 同步抛错不得逃出建标签` 1 红 |

一条边界澄清（避免把锁写成语义重复）：平台域过滤存在**两道**——调用点 `account-manager` 与 `seed` 自身。
契约锁测的是「跨模块边界上不落平台域外记录」，`seed` 内部判据由 `account-session-restore.test.js`
的 `seeded/skipped` 精确断言独占（变异 2 与变异 3 各自独立变红，证明两道锁不是同一道锁的重复）。

### 9.3 验证范围（消费者并集）

改动模块 `tab-lifecycle.js` / `constants.js` / `account-session-restore.js` / `account-manager.js`
的全部 `.test.js` 消费者并集全跑，加上 `vitest run electron` 全量；
QM-1 打包（`electron-builder --win --dir`）后在 `app.asar` 内验证新增文件与 require 链，并做启动存活复测。

---

## 10. 已知边界与遗留（不在本修复范围内动）

1. **`mergeCookies` 的优先级与恢复路径相反**：检测侧并集去重时保留的是**快照**侧的值，
   而开卡恢复现在保留**分区**侧。这属既有行为（`account-session-restore.js` 的 `mergeCookies`），
   改动它会影响检测结论判定，需单独评估后收敛为「同一处 `name@domain` 取舍口径只有一份实现」。
2. **`normalizeElectronCookie` 的 `sameSite` 映射**（QM-6 前端评审 W2，**已在本 PR 内闭合**）：原映射只覆盖
   Playwright 词表（`None/Strict/Lax`），会把已规范化的 `no_restriction` 降级为 `'unspecified'`，与
   `seedAccountPartitionCookies` 的保留口径**方向相反**——同一份凭证在「落盘对齐」与「开卡恢复」两侧写出的
   出站属性不一致。现映射含 `no_restriction` 直通，回归锁为 `webview-manager.test.js`
   「sameSite 已是规范化值 `no_restriction` 时必须直通」（含 `from_none` 对照，防映射被整体删空后假绿）。
3. **`credLocalStorage` 的恢复未收口**：localStorage 注入同样存在「快照 vs 分区实时值」的方向问题，
   但它已有 `LS_INJECTION_TIMEOUT_MS` 护栏且症状未观察到。本轮刻意不扩大改动面，留作后续评估。
4. **`cloud-account-restore.js`（云端恢复到新设备）未接分区对齐**：该路径写的是加密库 +
   `status='unverified'`，新设备此刻还没有账号分区可供对齐，语义上也不需要；
   若未来引入「恢复到已存在分区的设备」，必须同 PR 补接线。
5. **`ipc-handlers/store.js:197` 未接线**：那是删除失败的回滚路径，不产出新凭证，按判据不该对齐。
6. **去重键对 url-only 快照条目失配**（QM-6 后端评审命中）：`existingKeys` 用 `name@domain` 作键，
   `domain` 缺失时键为 `name@''`，而分区里的实时 Cookie 键是 `name@.例域` —— 永不命中，该条会照常
   `set`，覆盖式恢复在 url-only 形态上仍会发生。真实捕获流（`captureCookies` 的 `context.cookies()` 与
   credential-saver 的 `cookies.get`）恒带 `domain`，故暴露面低；`mergeCookies` 用同构键，属同一既有边界。
   要闭合需在 `normalizeElectronCookie` 里由 `url` 反推 `domain`，那会让去重粒度与真源判定分叉，
   故与本条 1 一并评估，不在本修复里半改。
7. **seed 与开卡对「每条 Cookie 是否可用」判据不同**（QM-6 后端评审命中）：`seedAccountPartitionCookies`
   对 `value` 做宽松强转（数字 `42` → `'42'` 照样入分区），而开卡侧 `normalizeElectronCookie` 要求
   `typeof value === 'string'`（非字符串直接判 null 跳过）。同一份快照会被 seed 接受、被开卡恢复拒绝。
   真实捕获流 `value` 恒为字符串，暴露面低；本轮按「不改与症状无关的第二判据」处理，留作后续收敛。
8. **`seedAccountPartitionCookies` 自身不带超时守卫**（QM-6 后端评审命中）：它是与开卡同族的账号分区
   会话写，若 `cookies.set` 永久挂起则该内部 promise 永不 settle。因调用点刻意不 `await`（见 §6.3）、
   外层 try/catch 兜底，不会阻塞导航、无用户侧白屏，故本条属「守卫范式应用边界的启发式缺口」而非缺陷。
   ⚠️ 反向约束：**任何人把调用点改成 `await` 都必须先给 seed 套上 `_gateRestoreWithTimeout`**。
9. **`injected` 计数口径 = 「发起 set 的条数」**：`set` 被 reject 时由 `setCookieForRestore` 内部 catch
   吞掉并 resolve，`pending` 仍计数。§9.1 用例名与本文措辞已统一为「真正发起 set 的条数」，
   不再写成「真正被 set 的条数」——后者读起来像成功数，按它改实现会把日志改成成功计数而与 §6.1 冲突。
