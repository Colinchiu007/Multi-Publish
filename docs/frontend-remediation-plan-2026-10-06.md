# 前端缺陷治理总方案

- **方案版本**：v3（2026-10-06，两轮 CCG 对抗评审后修订）
- **基线**：`770967c0`（实证部分）／`d8d05830`（PR #2962 已合并）
- **证据来源**：`docs/frontend-deep-review-2026-10-05.md`（含附录 A/B/C）
- **隔离**：worktree `mp-verify-p0-reentry`，分支 `plan-frontend-remediation`
- **PR #2962 已合并进 main**（`d8d05830`），内容为**方案外的证据测试与报告**，不含生产代码改动
  ```bash
  git diff --name-only 770967c0..d8d05830 -- apps/desktop/src/composables apps/desktop/src/stores apps/desktop/src/views
  # 返回空 ⇒ 无生产代码改动
  ```
- **性质**：本方案**评审未收敛前不动生产代码**
- **评审状态**：
  - **第 1 轮**：12 条问题（Critical 1），最低维度分 **5** ⇒ 未收敛。回应见 §9
  - **第 2 轮（对 v2）**：14 条问题（Critical 2），最低维度分 **4** ⇒ 未收敛。两条 Critical 均为**我在 v2 修订中引入的新错误**（§10 算术 111%、M-7 三处矛盾）
  - **v3 已修正**：§10 重建为 28 条精确对账（100%）、§11 补齐全部可验收数值、§12 排除契约测试可行性障碍
  - **待评审**：v3 尚未送审

---

## 0. 方案要解决什么

前端审查报告共登记 **1 CRITICAL / 16 MAJOR / 11 MINOR**。经二次复核与运行实证，5 条 P0 中已有 4 条取得运行证据（每条含基线 + 缺陷复现 + 修复版对照），但**至今零修复**。

本方案要回答：修什么、怎么修、什么顺序、哪些不该修。

---

## 1. 证据现状（已实证，非推断）

| 编号 | 别名 | 缺陷 | 实证结果 | 位置 |
|---|---|---|---|---|
| **C-1** | — | `filmEngineeringRetryShot` 命名空间错配 | 静态坐实（preload 扁平名命中 0，后端 handler 完好） | `api/publisher.js:396` ↔ `electron/preload/film-engineering.js:26` |
| **M-1** | P0-1 | 发布重入窗口 | **运行坐实**：基线 1 次 → 重入 2 次；修复版 1 进 1 拦 | `usePublishFlow.js:283/285/414` |
| **M-2** | P0-2 | 重试后结果卡失联 | **运行坐实**：会话已 `done`、任务 `success`，但 `result=null` | `usePublishFlow.js:116-122` + `publishProgress.js:285` |
| **M-4** | P0-3 | 轮询异常致 UI 卡死 | **运行坐实**：20 轮 reject 后 `batchCollecting=true`、`batchError=""` | `Collection.vue:2584` |
| **M-5** | P0-4 | `reportError` 未处理 Promise 拒绝 | 仅静态，**确认无法在 vitest 覆盖** | `utils/report-error.js:15` |
| **M-3** | P0-5 | 并发保存静默丢数据 | **运行坐实**：读阶段重叠时 2 条 → 1 条 | `useCopyLibrary.js:136/151` |

> **编号约定**：`M-x` 是报告 `docs/frontend-deep-review-2026-10-05.md` 的**正式编号**（权威）；`P0-x` 是本方案早期与行文中的**旧别名**。两者指同一条缺陷。**执行与追踪一律以 `M-x` 为准**；正文中出现的 `P0-x` 若无"别名"标注，视为待纠正的旧写法。

**结构性缺口（非 Bug，但是根因）**：

- **M-6** 覆盖率门禁不含 SFC：`vitest.config.js:67-82` 的 `include` 全为 `*.js` glob，146 个 Vue 组件命中 0
- **M-7** 超大文件棘轮：98 个文件永久挂账豁免（前端 27 个 / 36586 行），只防新增不要求下降

---

## 2. 修复方案（逐条）

### 2.1 C-1 命名空间错配 —— 收益最高的单条

**改法**：`api/publisher.js:396` 改走命名空间（`invokeWithFallback('filmEngineering', ...)` 后取 `retryShot`），或加一层 `filmEngineering` 封装。

**配套（决定这条是否真的修好了）**：补 **preload 契约测试** —— 遍历 `src/api/` 全部导出方法名，断言每个都在 `filterApiByAccessLevel(fullApi, 'admin')` 暴露面内存在。

> **为什么必须配套**：单测层用 `vi.mock('@/api/publisher')` 整体 mock 掉了本模块，只断言"调用过 `filmEngineeringRetryShot`"，从不断言 preload 是否存在该方法 ⇒ 单元层放行、无契约测试 ⇒ 集成层放行。**只改方法名不改测试架构，同类缺陷会再次进主干。**

**工作量**：方法名 1 行 + 契约测试约 60 行。

### 2.2 M-1 重入窗口

**改法**：锁前置到第一个 `await` 之前。

```js
async function handlePublish() {
  if (publishing.value) return
  publishing.value = true          // ← 前置
  try {
    if (!(await ensureLogin())) return
    // ...原校验...
  } finally { publishing.value = false }
}
```

**必须注意**（实证发现）：当前 `:414` 置锁、`:424` 才进 `try`，意味着 `:286-412` 的所有 `return` 都不受 `finally` 保护。**修复时必须把 `try` 起点上移到置锁处**，不能只删 `:414` 的赋值，否则会引入新的锁泄漏。

**触发条件（实证收窄）**：不是"快速双击"——`Publish.vue:587` + `UiButton.vue:5/:30/:39-43` 在 DOM 与 `onClick` 两层均拦截鼠标点击。真实路径是**登录引导窗口内的二次提交**（`:48` 确认框 + `:56` OAuth，可达秒级到分钟级）及 `handlePublish` 的非按钮调用方（`Publish.vue:1250`、`:1462`）。

### 2.3 M-2 结果卡失联

**改法（已定案：选 (b)）**：
- (a) ~~`registerSession` 把 session 引用回写给调用方，`activeSession` 改持引用~~ —— **已否决**，见下
- (b) ✅ store 记 `taskIdAliases`，`activeSession` 匹配时一并查

**为何否决 (a)**：(a) 会在调用方引入**与 store 并行的第二真相源** —— `clearFinished`/`dismissSession` 移除 session 后，调用方仍持旧对象引用且不会随 store 更新。本仓纪律是"单一真相源"，(a) 直接违反。完整六维对比见 §11.1。

**(b) 的实现要求**：别名表挂在 session 对象上（`session.taskIdAliases`），**随 session 一起被 `_pruneSessions` 裁剪**，天然有界；不可做成模块级独立 Map（会无界增长）。

**实证定位**：store 侧换 id 完全正常，**断点在消费侧** —— `usePublishFlow.js:116-122` 的 `activeTaskIds` 注册后永不更新。

### 2.4 M-4 轮询异常致卡死

**改法**：在 `Collection.vue:2584` 的 catch 内加 `consecutiveFailures` 计数，**达 10 次（≈20 秒，轮询间隔 2000ms）**即 `batchError` + `notifyError` + `stopBatchPolling()` + 复位 `batchCollecting`；另加总时长上限 **10 分钟**兜底。停止后**不自动重试**（批量采集是写操作，自动重试有重复采集风险），**已收集数据保留**并提示"部分数据获取失败，请重试"。完整参数推导见 §11.4。

**定性修正**：`Collection.vue:2519-2539` 的**启动阶段 catch 是正确的**（`:2539` 已复位）。7 个赋值点中启动阶段 4 个分支全对，**唯独轮询阶段 `:2584` 空着** —— 是"做了一半"，不是"没做"。

### 2.5 M-5 reportError（无法在 vitest 验证）

**改法**（v3 修正：不用裸 `console.error`，闸门成功即重置）：

```js
// 兜底走项目 logger + 敏感字段脱敏，不用裸 console.error（见评审 i9）
const fallbackLog = (message, err) => {
  logger.error('[reportError 兜底]', { message: String(message), detail: redactSensitive(err) })
}

export function reportError (message, err) {
  const detail = err instanceof Error ? err.message : err
  const text = detail == null || detail === '' ? String(message ?? '') : `${message}: ${detail}`
  // 闸门仅用于「同一次失败的自身上报」防自激，不做长期抑制
  if (reporting) return
  reporting = true
  try {
    const api = getApi()
    if (api && typeof api.logError === 'function') {
      const p = api.logError(String(text).slice(0, 2000))
      // 关键：无论成功失败都立即复位，否则一次瞬时 IPC 失败会永久静默后续上报
      Promise.resolve(p).catch(() => fallbackLog(message, err)).finally(() => { reporting = false })
      return
    }
  } catch (_) { /* 落到兜底 */ }
  reporting = false
  fallbackLog(message, err)
}
```

**为什么是"成功即重置"而非"30 秒窗口"**：`reporting` 闸门的作用是防止 §9.3 描述的**自激环**（一次 reject → `unhandledrejection` → 再调 `reportError` → 再 reject）。它是**单次调用的重入锁**，不是速率限制器。用时间窗口会引入"窗口内真实新错误被误吞"的风险；用 `.finally` 复位则精确对应"防自激"这一唯一目的。

**验证缺口（必须承认）**：需真实 IPC 拒绝场景（handler 未注册 / 窗口销毁），**确认无法在 vitest 覆盖**。要么接受"静态 + 代码评审"作为该条证据，要么投入 Electron 主进程级测试。**此项仍待你决策（见 §8 决策表 #3）。**

### 2.6 M-3 并发丢数据

**改法**：`useCopyLibrary.js` 加模块级 `let _writeChain = Promise.resolve()`，把 `upsertRewrite` / `removeRewrite` 的 read-modify-write 整体串行化。

**防链中毒（评审 i6）**：每个链节**内部 catch 后返回固定结果再续链**，保证链**永不进入 rejected 态** —— 否则某次写入 reject 会让后续所有操作被静默跳过。

**多窗口边界（评审 i9）**：Electron 多窗口各有独立渲染进程与模块实例，**模块级队列无法跨进程串行化**。需先确认 `useCopyLibrary` 是否会在多窗口同时实例化：若是，本方案不覆盖跨进程并发（需主进程侧排队）；若否（单窗口假设），在方案中声明该假设及其依据。**此项待核。**

**触发条件（实证收窄）**：只有两个调用的**读阶段真正重叠**才丢失。若写入生效快于第二次读完成则不会丢。真实风险窗口比原报告暗示的窄（手工操作间隔通常 > 一次 IPC 往返），但在程序化/自动保存或 IPC 较慢时命中。

**附加（不属本步）**：`MAX_COPY_REWRITES = 200`（`:29`）超限后静默丢弃最旧的，无任何提示 —— 这是独立于并发竞态的**容量策略**问题，归入 §10.6，本步不动。

---

## 3. 结构性缺口的处理（与 Bug 修复分开排期）

### 3.1 M-6 覆盖率门禁不含 SFC —— 建议**最先做**

**改法**：`vitest.config.js` 的 `coverage.include` 补 `src/**/*.vue` 与缺失的 `src/{utils,features,api,services}/**`。

**必须两步走**：`补 include + 记录基线` 先行，**不得在同一次变更里提高任何维度的阈值** —— 146 个 SFC 从 0 覆盖起步。

**阈值是三层，不是"保持不变"**（回应评审 i8 —— 补 146 个零覆盖 SFC 后任何非零全局阈值都会跌破，"维持原阈值"与"按目录拆分"无法同时成立）：

| 层 | 范围 | 设定 |
|---|---|---|
| 全局兜底 | 全部 include | 真实覆盖率 − 2% |
| 有测试目录 | `composables` / `stores` / `utils` | **维持现状**（55/40/60/55） |
| SFC 目录 | `views` / `components` | 低起步阈值 = 首次实测值，本次不预设 |

完整数值与验收口径见 §11.2（vitest 4.1.9 已实测支持该配置形态）。

**为什么优先**：这是**度量失真**。不修它，后续所有测试投入都没有度量依据；而 M-6 正是 M-2/M-4/M-3 这类"逻辑不轻但只有结构锁"的 composable 缺行为测试的直接原因。

### 3.2 M-7 超大文件棘轮 —— 建议**只加偿还配额，不动存量**

**改法**：给挂账文件设净下降配额（如每季度总行数净减 X%），或对 TOP 20 设独立目标行数与结项状态。另把测试文件纳入独立高行数阈值（约 1500），而非像现在被 `EXCLUDE` 完全排除（20 个 >500 行测试文件目前门禁看不到）。

**明确不做**：不按行数重构 `Publish.vue`(1659) / `ModelProviders.vue`(1428) / `Dashboard.vue`(679) —— 实证其结构健康（分别是 composable 编排、script 仅 98 行的模板+CSS、script 仅 159 行），**重构收益为负、回归风险为正**。

### 3.3 测试文件落地位置

M-1/M-2/M-3 的证据测试当前在 `apps/desktop/src/__p0verify__/`。**这是审查产物，不宜长期留在 `src/`**（会进覆盖率分母、可能被误认为产品测试）。建议：

- M-1/M-2/M-3 的**回归锁**迁至各被测模块旁（`usePublishFlow.test.js` / `publishProgress.test.js` / `useCopyLibrary.test.js`）
- M-4 因是"提取 + 锚点断言"，保留独立文件但改名明确用途（如 `collection-batch-poll.contract.test.js`）
- `__p0verify__/` 目录在迁移完成后删除

---

## 4. 执行顺序与依赖

```
第 0 步：M-6 覆盖率 include 补全 + 三层阈值落地（不提高任何维度）
         └─ 理由：先修度量，再谈其他投入是否有回报
第 1 步：C-1 方法名 + preload 契约测试（带豁免清单）
         └─ 收益最高；契约测试会长期拦住同类缺陷。技术路径已实测可行（§12）
第 2 步：M-1 锁前置 + try 起点上移 + 顺带 m-4（toggleEnabled 防重入）
         └─ 实证已验证方案有效
第 3 步：M-4 失败计数（10 次/20 秒）+ 10 分钟上限 + 保留部分数据
         └─ 用户可见卡死，改动 <10 行
第 4 步：M-3 写串行队列（防链中毒）
         └─ 用户数据丢失
第 5 步：M-2 activeSession 加 taskIdAliases（已定 (b)）+ 顺带 m-6
         └─ 别名表挂 session 上，随 _pruneSessions 裁剪
第 6 步：M-5 .catch + 成功即重置闸门 + logger 脱敏 + 顺带 m-5
         └─ 验证方式待定（见 §8 决策表 #3），可能独立成 change
第 7 步：回归测试迁移 + 删 __p0verify__
```

> **第 8 步 M-7 已从执行顺序中移出**（评审 i10 指出其无验收数值）。M-7 在补齐 §11 的配额数值前**不执行**，仅作方向性建议。

**依赖说明**：
- 第 1 步的契约测试一旦建立，会持续为后续所有 IPC 相关改动提供保护 ⇒ 值得最先做
- 第 2~5 步互相独立，可并行分支，但**建议串行** —— 它们都在 `src/` 运行时路径，并行会撞 `max-lines` 台账与 pre-commit 独占
- 第 6 步的验证缺口是**方案级风险**，不是实现细节，需先决策再动手

---

## 5. 风险与反制

| 风险 | 影响 | 反制 |
|---|---|---|
| 只改方法名不补契约测试 | 同类缺陷再次进主干（这正是 C-1 的逃逸链） | 契约测试与改名**同一 PR** |
| M-1 只删 `:414` 不上移 `try` | 引入新的锁泄漏（`:286-412` 的 return 绕过 finally） | 回归测试覆盖"锁前置后取消登录"路径 |
| M-6 覆盖率提阈值过早 | CI 立刻变红，阻塞所有工作 | 三层阈值：全局兜底下调 + 有测试目录维持 + SFC 目录低起步（见 §11） |
| 回归测试留在 `src/__p0verify__/` | 进覆盖率分母、长期维护尴尬 | 第 7 步迁移并删目录 |
| M-5 无自动化验证 | 修完无法证明修好 | 明确标注为"静态 + 评审"证据，或投独立 change 建主进程级测试 |
| 本机并发负载高（8 个 worktree、CI 资源饱和） | 验证变慢、CI 停滞 | 本方案不含并发治理，建议另起 `git-cleanup-analysis` |

---

## 6. 明确不做的事

1. **不按行数重构** `Publish.vue` / `ModelProviders.vue` / `Dashboard.vue` —— 结构健康，重构收益为负
2. **不引入虚拟滚动** —— 报告 M-15 建议先用 `el-pagination`，成本低收益直接
3. **不碰 `CI_IGNORED_PATHS` 白名单** —— 那是"谁来守门"，按 AGENTS.md 须人工过目
4. **不重写 CHANGELOG 历史** —— 棘轮只增不减
5. **不批量偿还 i18n 中文债务**（1489 条挂账）—— 建议先挑 2~3 个高可见文件试点，批量推进不现实

---

## 7. 验收标准

每一步的完成判据（全部可机械检查）：

1. **C-1**：契约测试能复现"preload 缺方法"这一失败；改后转绿。**契约测试须带显式豁免清单**（见 §9 评审回应 i5：290 个导出中 17 个是常量/命名空间包装/事件订阅，全量断言会误报）
2. **M-1/M-2/M-3/M-4**：各自证据测试的"修复版"用例转绿即通过。**"原版对照"用例是一次性变异验证，不是常驻回归锁** —— 合并前在 pre-fix 代码上跑一次、记录失败证据后即移出常规套件（见 §9 评审回应 i1）
3. **M-6**：`vitest run --coverage` 的 include 命中 `.vue` 文件数 > 0；**按目录重设基线，受影响的全局阈值同步下调而非保持不变**（见 §9 评审回应 i4）
4. **第 7 步**：`src/__p0verify__/` 不存在；回归测试在各自模块旁且被 CI 收集
5. 全程：`classify-docs-only.js` 判定为 false（改运行时代码）⇒ 走完整门禁，不得走 docs-only 快通道

---

## 9. CCG 决策层对抗评审回应（2026-10-06）

**评审执行情况（如实记录）**：`sh scripts/plan-review.sh` 首次执行 **失败** —— 本机未安装 `claude` CLI，`codeagent-wrapper` 报 `exit 127`；且脚本输出的"跨家族校验通过"是**假绿灯**（`proposer=opencode(undefined) critic=claude(undefined)`，交空集即判通过）。判定记录自身写明 `"status": "error"`。

改用 `codex` 作 critic 重跑（不改原引擎，仅在 worktree 内做副本把 `critic` 由 `claude` 改为 `codex`）。家族映射 `codex → openai` vs `opencode → deepseek, hy3`，**确为不同家族**。评审成功产出 **12 条问题（Critical 1 / Warning 7 / Info 4）**，维度分 `completeness 6 / consistency 5 / clarity 7 / feasibility 6 / security 7`，判定**未收敛**。修订阶段 proposer 失败（`exit 1`），本节为人工逐条核验后的回应。

### 9.1 Critical

**i1 · 原版对照明例会永久阻塞 CI** —— **成立，已采纳**

核验：`p0-reentry-mutation.test.js:57-80` 的对照组用例 `expect(bodies).toBe(2)` 当前就在 `src/__p0verify__/` 内。一旦 P0-1 修复落地，该用例**必然转红并阻塞合并**；而若仅在开发期临时运行，又不满足"可机械检查"的定位。原方案此处自相矛盾。

**采纳**：验收标准 2 已改写为「修复版转绿即通过；原版对照是一次性变异验证，合并前跑一次留证后移出套件」。

**附带动作**：`__p0verify__/` 下的对照组用例在 M-1 修复 PR 中必须同步移除或改写，不得原样带入 main。

### 9.2 Warning

**i2 · 覆盖声明与实际范围不符** —— **成立**

方案自称"总方案"却只处置了 C-1 / P0-1~5 / M-6 / M-7 / M-15 / i18n，报告里其余约 13 条 MAJOR 与 11 条 MINOR 无任何处置结论。

**采纳**：见 §10 全量处置表（补齐逐条修/不修/降级/排期）。这是本方案最大的实质缺口。

**i3 · 编号失配 P0-6 / M-6** —— **成立，已修**

核验：方案 L154 写 `P0-6`，而全文缺陷编号只到 P0-5，覆盖率编号为 M-6。已改为 `M-6`。

**i4 · M-6 两个要求无法同时成立** —— **成立**

3.1 要求"按目录拆分阈值"，验收标准 3 却要求"阈值保持不变"。补 146 个零覆盖 SFC 后，**任何非零全局阈值都会立即跌破**。

**采纳**：验收标准 3 已改为「按目录重设基线 + 受影响的全局阈值同步下调」，而非保持不变。

**i5 · 契约测试会产生合法误报** —— **成立且比评审所述更严重**

核验（AST 级扫描 `src/api/*.js` 290 个导出）：

| 类别 | 数量 | 是否该断言在 preload 面内 |
|---|---|---|
| 走桥接层（`invoke`/`invokeWithFallback`） | 233 | ✅ 应断言 |
| 直调 `getApi()`/`api.*`（绕过桥接，即 M-9 对象） | 40 | ✅ 应断言 |
| **纯工具/常量/命名空间包装/事件订阅** | **17** | ❌ **会误报** |

误报样例：`knowledge-library.js:PERSONAL_CATEGORIES`（常量）、`tts-voice-catalog.js:getTtsVoiceCatalog`（命名空间包装）、`automation.js:onAutomationNotification`（事件订阅）。**全量断言会立刻红 17 处。**

**采纳**：契约测试须带显式豁免清单（逐项注释豁免理由）；新增 API 必须"登记或豁免"的规则沉淀到规范文件，防止豁免清单无限膨胀。

**i6 · `_writeChain` 链中毒** —— **成立**

核验：方案 §2.6 确未提及。若某次写入 reject 且未在链节内捕获，链可能进入 rejected 态导致后续操作被静默跳过。HMR 与多窗口下模块级状态亦会失效。

**采纳**：每个链节内部 `catch` 后返回固定结果再续链，保证链**永不进入 rejected 态**；并在方案中写明 HMR / 多窗口场景的行为边界（模块级状态在 HMR 下会重建，正在进行的串行化不跨模块重载保证）。

**i7 · P0-2 倾向 (a) 与单一真相源纪律自相矛盾** —— **成立**

核验：(a) 持引用确实在调用方引入了**与 store 并行的第二真相源**，session 从 store 移除后引用可能失效或泄漏；方案却在待决策项里引用了"单一真相源"纪律却先倾向 (a)。(b) 别名表的清理时机与无限增长也未讨论。

**采纳**：撤回"倾向 (a)"的预设。把**两方案的生命周期对比**（引用失效路径 / 内存泄漏面 / 别名表清理时机）补入 §8，并把"单一真相源"作为**硬性判据**而非倾向性意见。

**i8 · 非按钮调用方是否查锁未验证** —— **部分成立，已澄清**

核验：`Publish.vue:1250` 与 `:1462` 并非内部绕过锁的调用，而是把 `handlePublish` **透出**给外部（`return` 与 provide）。它们本身不构成绕过，但评审的担忧方向正确 —— 透出后外部调用方是否检查 `publishing` **确未验证**。

**采纳**：P0-1 完成判据新增「核对全部 `handlePublish` 暴露点的外部调用方是否统一检查 `publishing`」；若存在不查锁的外部调用方，需收敛到同一守卫函数。

### 9.3 Info

**i9 · P0-4 兜底 console.error 可能泄漏敏感上下文** —— **成立**

**采纳**：兜底输出统一走项目 logger 并对错误对象做敏感字段脱敏；或在方案中显式声明接受的风险边界与理由。**不采用裸 `console.error(message, err)` 进生产。**

**i10 · M-7 停留在原则层面、无法机械验收** —— **成立**

**采纳**：M-7 需补齐 X 的取值、TOP 20 目标行数、统计口径（测试文件是否计入）与结项判定条件，并写明未达标时的处置。**在补齐前 M-7 不进入执行顺序，只作为方向性建议。**

**i11 · PR #2962 状态歧义** —— **成立**

核验：`git diff --name-only 770967c0..HEAD -- apps/desktop/src/{composables,stores,views}` 返回空 —— **PR #2962 确实不含任何生产代码改动**，仅含方案文档 + 证据测试。

**采纳**：已在方案开头补注该事实与核验命令。

**i12 · P0-3 阈值未论证、停止后恢复策略未定义** —— **成立**

**采纳**：失败阈值按实际轮询间隔推导（`Collection.vue:2587` 为 2000ms ⇒ 连续失败 3~5 次覆盖 6~10 秒，**需重新论证是否足够**，可能改用"覆盖不少于 30 秒"）；并明确停止后是用户手动重试还是允许自动恢复，写入验收标准。

### 9.4 评审的整体判断

维度分 `consistency 5` 为最低，**未收敛**。主要问题集中在：编号体系不严谨（i3）、同一要求在两处互相矛盾（i1/i4）、覆盖面与自我声明不符（i2）、方案停留在原则层缺可验收数值（i10/i12）。

**当前状态：本方案 v1 未通过评审。** 已采纳 12 条中的全部 Critical 与 Warning，Info 中 i9/i10/i11/i12 采纳为待补项。**v2 需补齐 §10 全量处置表与 M-7 数值后重新送审。**

---

## 8. 待决策项（请评审重点挑刺）

> **本节只列「尚未决策、需人来拍」的项。** 已在 §10/§11 定的方案不再列为待决策（评审 i10 曾指出"同时提问又已决"的矛盾，v3 已清理）。M-1/M-3/M-4 三条已定，不再询问优先级。

| # | 待决策 | 状态 | 需要的输入 |
|---|---|---|---|
| 1 | **M-6 排在第 0 步是否合适？** 收益是"让度量可信"，但不改任何用户可见行为 | **已定：排第 0 步** | 若评审认为应先修用户可见缺陷，此项需改序 |
| 2 | **M-2 选 (a) 持引用还是 (b) 别名表？** | **已定：选 (b)**（§11.1 六维对比） | (b) 需补别名清理时机，可接受则无需再问 |
| 3 | **M-5 是否值得单建 Electron 主进程级测试？** | **未定** | 成本 vs 收益，需你判断是否投独立 change |
| 4 | **回归测试迁入各模块 vs 保留独立目录？** | **未定** | 影响长期维护与覆盖率分母 |
| 5 | **M-3 是否仍值得本轮修？** | **已定：修（步 4）** | 风险窗口虽窄（需读阶段重叠），但**用户数据丢失的代价不对齐风险概率**，且改动 <20 行 |
| 6 | **串行执行是否过慢？** 8 个 worktree 并发压力下是否改为按模块并行 | **未定** | 需你权衡 CI 资源与冲突风险 |

**真正需要你拍板的只有 3 项：#3、#4、#6。** 其余 3 项已由 v3 依据评审结论定案。

---


---

## 10. 全量缺陷处置表（v3 重建，回应评审 i1/i2）

> **编号权威来源**：`docs/frontend-deep-review-2026-10-05.md` 的章节编号。报告中 5 条 P0 的**正式编号是 M-1~M-5**（"P0-x"只是行文简称）。本表一律用报告原编号，**每条恰好归一类**。

报告共 **1 CRITICAL（C-1）+ 16 MAJOR（M-1~M-16）+ 11 MINOR（m-1~m-11）= 28 条**。

### 10.1 A 类 · 本轮修复（7 条）

| 报告编号 | 缺陷 | 处置 | 步 |
|---|---|---|---|
| **C-1** | `filmEngineeringRetryShot` 命名空间错配 | 修方法名 + 建 preload 契约测试（带豁免清单） | 1 |
| **M-1** | 发布重入窗口（锁在 `await` 后置位） | 锁前置 + `try` 起点上移 | 2 |
| **M-4** | Collection 轮询无失败计数致卡死 | 失败计数 + 超时上限 + 部分数据保留 | 3 |
| **M-3** | `useCopyLibrary` 读-改-写无串行化 | 写串行队列（防链中毒） | 4 |
| **M-2** | 重试后结果卡失联 | 改持 session 引用或别名表（**决策后再定**） | 5 |
| **M-5** | `reportError` 未处理 Promise 拒绝 | `.catch` + 成功即重置闸门 + 脱敏 | 6 |
| **M-6** | 覆盖率门禁不含 SFC | 补 include + 三层阈值（见 §11） | 0 |

### 10.2 B 类 · 随附处理（4 条，与上表同链路）

| 报告编号 | 缺陷 | 随附于 | 理由 |
|---|---|---|---|
| **m-4** | `toggleEnabled` 无 try/catch、无防重入 | 步 2（M-1） | 同为重入保护缺失，同一文件族，成本 <5 行 |
| **m-5** | `useOpsCenterSync` 错误处理不一致 | 步 6（M-5） | 同为错误处理缺口 |
| **m-6** | `publishProgress.init()` 标志位先置 | 步 5（M-2） | 同一 store 同一链路 |
| **M-9** | IPC 契约无测试守护 | 步 1（C-1） | 契约测试即其守护；**本轮只建测试，不做 `getApi` 收敛** |

### 10.3 C 类 · 明确不修（4 条，附理由）

| 报告编号 | 缺陷 | 不修理由 |
|---|---|---|
| **M-7** | 超大文件棘轮（98 个挂账） | 缺验收数值（评审 i10）。**补齐 §11 配额前不执行**；存量文件不动 |
| **M-15** | 全仓零虚拟滚动 | 性能优化非正确性缺陷；需真实账号规模数据支撑。报告已建议先用 `el-pagination`，成本更低 |
| **m-3** | `toPlainIpcValue` 的 `Date`/`Map`/`Set` 边界 | **潜在风险，当前调用点未传这些类型**。改桥接层序列化策略影响面远超收益 |
| **m-9** | 3 个死 pipeline 导出 | 零调用方。`pipelineRegisterPipeline` 若被接线而无 handler 校验等于开动态执行面 ⇒ **建议删**，但属独立 change，不与 C-1 的 PR 职责重叠 |

### 10.4 D 类 · 另立任务（13 条 + 1 项）

| 报告编号 | 缺陷 | 归入任务 |
|---|---|---|
| **M-8** | `CreateView.vue` 单组件 102 data/245 methods | ① 组件拆分（独立 openspec change） |
| **M-10** | S2V 父子契约 fail-closed 单向 | ① 契约交叉校验测试 |
| **M-11** | PublishHistory 全表串行拉取、`views/` 无防抖 | ② 抽 `useDebouncedRef` + 分页上限 |
| **M-12** | CreateView 双深 watch | ② 收窄监听粒度 |
| **M-13** | 全域 IPC 零超时 | ③ 桥接层加 `invokeWithTimeout` |
| **M-14** | `invokeWithFallback` 对权限不足失效 | ③ 捕获 `LicensePermissionError` |
| **M-16** | Collection 两处异步副作用未清理 | ② 纳入 `onUnmounted` 清理 |
| **m-1** | `looksTechnical` 复制漂移 | ④ 一致性批量清理 |
| **m-2** | `toPlainIpcValue` 三份副本语义不一致 | ④ 一致性批量清理 |
| **m-10** | fallback 错误文案硬编码英文且口径分裂 | ④ 统一常量 + 入 i18n |
| **m-7** | `usePipelineHistory` 零调用方死代码 | ⑤ 死代码清理 |
| **m-8** | `loading` 初值 true | ⑤ 降级（改初值需核对所有消费方空态，收益低于回归风险） |
| **m-11** | `reportError` 无去重与采样 | ⑥ 独立设计（评审 i7：去重窗口/key/采样率均需单独决策，过度去重会吞真实错误） |
| 附录 A.3 | a11y：87% 可点击卡片键盘不可达 | ⑦ a11y 整改（组件语义重构，桌面端影响面小于 Web） |

### 10.5 数量对账（评审 i1 要求总和 = 100%）

| 类别 | 条数 | 占比 | 校验 |
|---|---|---|---|
| A 本轮修复 | 7 | 25.0% | 7 + 4 + 4 + 13 = **28** ✅ |
| B 随附处理 | 4 | 14.3% | |
| C 明确不修 | 4 | 14.3% | |
| D 另立任务 | 13 | 46.4% | |
| **合计** | **28** | **100.0%** | 与报告 `1 + 16 + 11 = 28` 对齐 ✅ |

> **一处易混淆已消解**：本表 `m-8`（`loading` 初值）与 `M-8`（`CreateView` 巨型组件）是**两条不同缺陷**，仅大小写不同。§10.3/§10.4 中 `M-8` 指巨型组件，`m-8` 指 `loading` 初值。

### 10.6 报告 §2.6 提到但易被漏掉的一项

`useCopyLibrary` 的 `MAX_COPY_REWRITES = 200`（`:29`）超限后**静默丢弃最旧的，无任何提示** —— 这是独立于 M-3（并发竞态）的数据丢失面。

**归入 D 类 ⑤（死代码/边界清理）**，不占本轮步 4：步 4 只做串行队列，不改容量策略。容量策略需独立决策（截断提示？拒绝写入？LRU？）。
---

## 11. 补齐评审要求的可验收数值（回应 i3 / i4 / i8 / i10 / i12 / i14）

### 11.1 P0-2（M-2）两方案生命周期对比 —— 兑现 §9.2 i7 的承诺

| 维度 | (a) 消费侧持 session 引用 | (b) store 记 `taskIdAliases` |
|---|---|---|
| 引用失效时 `activeSession` 行为 | store `clearFinished`/`dismissSession` 移除 session 后，调用方仍持旧对象引用 ⇒ **不随 store 变更更新**（Vue ref 指向旧对象不会自动跟随） | 仍从 `store.sessions` 查，**session 被移除后自然返回 null**，行为正确 |
| 内存泄漏面 | 每次发布持一个 session 对象引用，直到 composable 卸载；批量场景下累积 | 别名表随重试次数增长，**需清理策略** |
| 别名表增长 | 无 | 每次重试 +1 条别名，**理论上无界**（`MAX_SESSIONS=5` 会裁剪 session，但别名表独立） |
| 清理时机 | 不需要 | 需在 session 裁剪（`_pruneSessions`）/重试完成时同步清理 |
| 单一真相源符合度 | ❌ **引入第二真相源**（store.sessions + 调用方引用） | ✅ 单一真相源 |
| 改动面 | 消费侧（`usePublishFlow`）+ store 需回写 | store 为主，消费侧仅放宽匹配条件 |

**结论**：**(b) 别名表更符合本仓"单一真相源"纪律**。代价是必须处理清理 —— 建议别名表挂在 session 对象上（`session.taskIdAliases`），随 session 一起被裁剪，天然有界。

> v2 曾"倾向 (a)"，经此对比**撤回该倾向**。这是评审 i7 纠正的结果。

### 11.2 M-6 三层覆盖率阈值 —— 回应 i8 / i14

| 层 | 范围 | 阈值设定 | 理由 |
|---|---|---|---|
| 全局兜底 | 全部 include | **当前全仓真实覆盖率 − 2%** | 补入 146 个零覆盖 SFC 后必然大幅下跌；下调到贴近真实值才不阻塞 |
| 有测试目录 | `src/composables/**`、`src/stores/**`、`src/utils/**` | **维持现状**（statements 55 / branches 40 / functions 60 / lines 55） | 这些目录已充分测试，全局下调不应削弱对它们的保护 |
| SFC 目录 | `src/views/**`、`src/components/**`（`.vue`） | **低起步阈值**（起步值 = 首次跑出的真实值，**本次不预设数字**） | 0 覆盖起步，先记录基线，后续 PR 逐步抬升 |

**验收标准（回应 i14，原标准过弱）**：不是"命中 `.vue` 数 > 0"，而是

1. `coverage` 报告列出的 `.vue` 文件数 **== `src/**/*.vue` glob 的实际文件数**（当前 146，以实测为准）
2. 其中**至少包含** `views/` 与 `components/` 两个目录的 SFC
3. 全局阈值 **不得高于**首次记录的基线；**任何维度都不得提额**

### 11.3 M-7 偿还配额数值 —— 回应 i10

| 项 | 数值 | 口径 |
|---|---|---|
| 统计范围 | `.github/scripts/max-lines-baseline.json` 的 `files` 台账全部 98 项 | **不含**测试文件（现被 `EXCLUDE` 排除，另设 1500 行独立阈值） |
| 统计基准 | 该文件在 `origin/main` 上的 `split('\n').length`（与 `check-max-lines.js:59` 同一口径） | 与门禁口径一致，避免两套算法 |
| 季度净减目标 | **X = 2%**（约 1900 行/季） | 按前端 27 项 36586 行计，2% ≈ 732 行/季较激进；**取 2% 作为上限约束，具体值在首个季度复盘时按实际偿还率校准** |
| 未达标处置 | 台账不得新增条目（`--update` 拒绝登记新文件），并在季度复盘记录原因 | 用"不新增"兜底，不追求强制下降 |
| 结项判定 | 某文件登记值 < 500 行 ⇒ 从台账 `--prune` 立碑 | 沿用门禁既有机制 |

> **诚实声明**：X=2% 是**上限约束**而非承诺。棘轮机制下"不新增"已能防止债务扩大；强制下降需要真实偿还意愿，机械设高指标只会诱发为达标而做的无意义重构。**本轮不执行 M-7**，此表仅供将来启用时参考。

### 11.4 M-4 失败阈值推导 —— 回应 i12

`Collection.vue:2587` 轮询间隔 **2000ms**。原方案"3~5 次"对应 6~10 秒，**窗口偏短**（主进程短暂繁忙就误判失败）。

| 项 | 数值 | 理由 |
|---|---|---|
| 连续失败阈值 | **10 次（≈20 秒）** | 覆盖主进程重启、临时鉴权刷新等常见瞬时故障 |
| 总时长上限 | **10 分钟（300 次）** | 兜底，防"每 2 秒成功但永不终结"的活锁 |
| 停止后恢复策略 | **不自动重试，由用户手动重新发起** | 自动重试会在鉴权失效时无限循环；批量采集是写操作，自动重试有重复采集风险 |
| 部分数据处理（回应 i13） | **保留已收集数据 + 提示"部分数据获取失败，请重试"** | 丢弃已完成的工作是二次伤害；`collectedItems` 已有数据不应被清空 |
---

## 12. 契约测试技术路径（回应 i5 —— 评审担心的可行性障碍已排除）

评审担心"preload 调用 `contextBridge.exposeInMainWorld`，该 API 在 Node 中不存在，60 行测试可行性存疑"。**实查后确认不成立**：

```js
// electron/preload/film-engineering.js:12 —— preload 是工厂函数，不在模块顶层调 contextBridge
function createFilmEngineeringApi (ipcRendererRef = ipcRenderer) {
  return { filmEngineering: { retryShot: (payload) => ipcRendererRef.invoke('film-engineering:retry-shot', payload), ... } }
}
```

**契约测试的取数路径**（无需 mock `contextBridge`）：

1. **暴露面获取**：直接调用工厂函数并注入假 renderer
   ```js
   const { createFilmEngineeringApi } = require('@/../electron/preload/film-engineering')
   const surface = createFilmEngineeringApi({ invoke: () => {}, on: () => {}, removeListener: () => {} })
   Object.keys(surface)   // ['filmEngineering'] → 再展开一层拿到方法名
   ```
   `electron/preload/index.js:23` 显示聚合入口用 `require('./xxx')` 收集各工厂，因此**可逐个 require 各 preload 模块取暴露面**，无需加载 index.js（后者会真的调 `contextBridge`）。
2. **`fullApi` 入参**：`index.js:23` 从 `../core/access-level` 取 `filterApiByAccessLevel`。契约测试**直接 import 该函数**并传入 `'admin'` 级别，与生产同源。
3. **preload ↔ `src/api/` 映射**：契约测试的**比较方向**是「`src/api/` 声明的方法名 ⇒ 是否能在 preload 暴露面中找到」。支持三种形态：
   - 扁平：`invokeWithFallback('filmEngineeringRetryShot')` ⇒ 查 `surface` 顶层
   - 命名空间：`invokeWithFallback('filmEngineering', 'retryShot')` ⇒ 查 `surface.filmEngineering.retryShot`
   - 事件：`bridgeOn('onAutomationNotification')` ⇒ 查 `surface.onAutomationNotification`
4. **豁免清单**（回应 v1 评审 i5，已实测 17 项）：常量（`PERSONAL_CATEGORIES`）、命名空间包装（`getTtsVoiceCatalog`）、事件订阅（`onAutomationNotification`）。逐项注释豁免理由，并规定"新增 API 必须登记或豁免"。

**可行性结论**：契约测试可在 vitest Node 环境运行，无需 Electron 运行时、无需 mock `contextBridge`。预估 60~80 行（含豁免清单）。

**已实测验证（2026-10-06，纯 Node 环境实际执行）**：

```
$ node -e "const m=require('./electron/preload/film-engineering.js'); ..."
  模块导出: ["createFilmEngineeringApi"]
  工厂返回顶层键: ["filmEngineering"]
  filmEngineering 方法数: 17
  含 retryShot: true
```

即：**工厂函数可独立 require，注入假 renderer 后即可枚举暴露面**。评审 i5 担心的可行性障碍已被真实执行排除，不是纸面推演。
