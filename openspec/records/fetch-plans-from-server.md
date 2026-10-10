---
record: fetch-plans-from-server
task: 价目目录改从服务端 /api/v1/plans 取，购买入口保持关闭
date: 2026-10-07
---

## 本次执行记录：价目改从服务端取（fetch-plans-from-server，2026-10-07）

> 分支：`fetch-plans-from-server`；`classify-docs-only` → **docs-only=false**（改运行时代码 + UI）
> 规模：10 文件 / 682 行 ⇒ **M+** ⇒ CCG 判定 **DUAL** → 双模型 CLI 沙箱不可用
> → 降级 **SELF-REVIEW**，结论记入 `.quality-gates.md`

## 背景与取证

`plan-matrix.js` 是定价唯一真源（`PLAN_IDS = free/standard/pro`），
`getPlanCatalog()` 返回 `priceMonthlyCents` / `priceYearlyCents`（**单位：分**，整数无浮点误差）：

| 套餐 | 月 | 年 |
|---|---|---|
| free | ¥0 | ¥0 |
| standard | ¥29 | ¥199 |
| pro | ¥79 | ¥599 |

**与 #3003 校正后的营销文档口径完全一致**（已作为 SELF-REVIEW 第①条固化进测试）。

### 逃逸分析

`UpgradeModal` 此前**根本不显示价格**（正式包显示「付费通道筹备中」），
营销文档里的金额是**手写的**。于是「凭记忆写死价格」与「从服务端取价」
在测试视角下**完全等价**——没有任何测试覆盖价格的来源。这是本 PR 要消除的盲区。

### `/api/v1/plans` 的接入约束

- 需 `profile:read` scope（`logtoScopes` 已含）→ **登录后可调**
- 实测无 token：`401 {"error":"Unauthorized","message":"Valid API key required..."}`
  （该文案是**默认兜底**，不代表只支持 API key；桌面端走 Logto access token 通道）
- 响应：`{ plans: [{ id, label, currency, priceMonthlyCents, priceYearlyCents, entitlement }] }`

## 关键设计决策：复用既有 state 推送，零新增 preload 暴露面

**原方案（新增 `plansList` preload API）被否决**——pre-flight 实测：

```
$ node scripts/build-preload.js
Error: Cannot find module 'esbuild'
```

沙箱未装 `apps/desktop` 依赖 ⇒ **无法重建 `index.bundle.js` 提交物**
⇒ 必定打红 `electron/tests/build-preload.test.js`、
`preload.test.js` 的总键数硬编码（当前 337）、`preload/<x>.test.js` 的方法清单。

**改走既有通道**（全部实证，非推断）：

```
_entitlementService.fetchPlans()          ← 新增，与 sync 并行
   ↓ Promise.all
auth-service._setState({ plans })        ← state 合并
   ↓ onStateChanged → webContents.send('identity:state-changed', state)
stores/identity.js  onIdentityStateChanged → normalizeState（加 plans 白名单）
   ↓
MemberCenter.vue  读 identityStore.plans
```

**preload 暴露面零改动 ⇒ 不碰任何契约测试。**

### 三个设计决策

1. **与权益 `Promise.all` 并行**：两者打同一服务、同一份 token，串行会白付一个 RTT。
2. **失败降级为 `null` 而非空数组**：`[]` 会让 UI 渲染「无套餐」的空目录，
   与「取价失败」混淆。`null` = 明确不可用。**绝不兜硬编码价格。**
3. **UI 放 `MemberCenter` 而非 `UpgradeModal`**：`UpgradeModal` 已 490 行
   （`maxFileLines` 棘轮），且**购买入口关闭的弹窗里摆价目是「看得见买不着」**。
   `MemberCenter.vue` 仅 152 行且已有 entitlement 单一真源（A2 注释在案）。

## 验证（沙箱无 vitest，node 直驱真实模块）

**entitlement-service 6 条** + **auth-service 5 条** + **端到端 6 条全过**。

端到端 6 条含两条关键不变量：

- **价目失败 ⇒ 权益照常返回，plans=null**（核心不被辅助拖累）
- **取价失败路径不产生任何价格数据**（杜绝硬编码兜底）

**变异验证**：

| 变异 | 结果 |
|---|---|
| 并行改回串行 | ❌ 耗时 121ms 被抓住 |
| 价目失败时兜硬编码价格 | ❌ 2 条红（**正是要消除的反模式**） |
| 还原 | ✅ 6/6 |

## SELF-REVIEW 抓出的一处真问题（已修）

首次取价失败时 `this._plans` 从未被赋值 ⇒ 是 **`undefined` 而非 `null`**。
而 `undefined` 与 `null` 在 `normalizeState` 里语义不同（未初始化 / 明确不可用）。

已在构造函数显式初始化 `this._plans = null`，并在 catch 分支再次显式置 `null`。
**宁可从一开始就只产生一种状态。**

## UI 三态

| 状态 | 显示 |
|---|---|
| `plans === null` | 「价格暂时无法获取，请稍后重试」 |
| `plans.length === 0` | 「暂无可购买的套餐」 |
| 有数据 | 真实价格 + 当前套餐标记 |

## 遗留

- **购买入口仍关闭**（`paymentChannelUnavailable`）——本 PR 只做取价与展示。
- 激活码接 `/api/v1/redeem` 未做，属独立功能项。
- 渲染层 37 处本地权限门禁仍只读 `licenseManager`（架构遗留，独立工程）。

| 远程同步 | PASS —— PR #3118 squash 合并，merge SHA `c162745a6`；quality-gate 全绿（QG Static / Unit Tests / Desktop Shards 1、2 / Coverage 均通过） |
|---|

---

## 第二轮 CI 失败与修复（2026-10-08）

首轮 CI 红的是 `债务熔断检查`。日志归档已过期（11 小时后只返回 162 字节占位），
最终靠**读门禁脚本源码**定位，而不是靠日志。

### 根因：漏跑了一个门禁

`debt-guard.yml` 的那个 job 跑**两件事**：

```yaml
- run: node scripts/check-debt-budget.js      # ← 我只跑了这个（本地通过）
- run: node .github/scripts/check-max-lines.js # ← 真正红的是这个
```

`check-max-lines.js` 报：

```
❌ NEW_OVER_LIMIT: apps/desktop/electron/services/identity/auth-service.js 531 行 >= 500，
   新代码不得引入超限文件
```

**我把 `check-debt-budget` 当成了「债务门禁」的全部。** 它是全仓聚合棘轮
（`maxFileLines`/`filesOver500`/`filesOver1000`），**不检查单文件是否跨过 500 硬上限**；
`check-max-lines` 才是逐文件判定。两者是不同的门禁。

### 修法：改挂载点，而不是压行数

`auth-service.js` 在 main 上**已 498 行、上限 500，只剩 2 行余量**。
我原方案往里加了 12 行 → 必然破线。

考虑过的三条路：
- ❌ 压注释硬挤：净增 12 行要压到 2 行，且文件本就在债务热点，治标不治本
- ❌ 拆 `restore()`（62 行）或 `getAccessToken`（42 行）：两者都深度耦合
  `this._client` / `this._operationId` / `this._setState`，属**结构性重构**，
  不该由一个取价功能承担
- ❌ `--prune` 清账：脚本注释明写 `--prune` 是**还债后销账**用；
  我这是**新增超限**（规则 1：新代码必须拆分），语义不符
- ✅ **改挂载点**：把取价放到 `identity-service-factory` 的**投递层**
  （那里本就在做 `identity:state-changed` 推送），`auth-service.js` **零改动**

最终 `auth-service.js` 保持 498 行、与 main 完全一致。

### 架构调整后的行为

取价从「与权益 `Promise.all` 并行」变成「随 state 推送异步补一次」：

```
onStateChanged(state) → pushState({...state, plans: null})   ← 先空
                       → plansCache.load()                     ← 打服务端
                       → pushState({...state, plans: [...]})   ← 再实
```

**「先空后实」是刻意的**：宁可短暂显示「价格暂不可用」，
也绝不显示任何未经服务端确认的数字。代价是多一次 state 推送，
收益是热文件零改动 + 语义更清晰。

### 验证（8 条 + 2 次变异）

| 变异 | 结果 |
|---|---|
| 去掉 `loading` 单飞闸 | ❌ 并发打了 3 次服务端 |
| 取价失败兜硬编码价 | ❌ 抓住 |
| 还原 | ✅ 8/8 |

门禁：`check-debt-budget` / `check-gate-record-debt` / `check-text-encoding-integrity` /
`check-no-brand-residue` / **`check-max-lines`** / `max-lines.test.js` /
`check-locale-sync --cjk` —— **七个全过**。

### 过程中一次严重操作失误

`git add openspec` 后 `git diff --cached --stat origin/main` 显示
**「35 files changed, 2767 deletions」**——本地分支 base 落后于 main，
`git add` 把 main 上别人新增的 35 个文件误判为「删除」。

**没有提交**，改用 `git reset --hard origin/main` 重新起在最新 main 上，
只重放取价相关的 7 个文件（并确认这些文件在新 main 上零冲突）。

**教训：base 落后的分支上，任何 `git add -A` / 整目录 add 都可能把别人的新文件当成删除。**
先看 `git diff --cached --stat <base>` 的增删是否与预期相符，再提交。
