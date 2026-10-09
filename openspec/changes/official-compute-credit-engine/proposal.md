# Proposal: official-compute-credit-engine（官方内置算力供给链路 + 积分扣减引擎）

> 状态：🔴 **两轮对抗评审 VERDICT = FAIL，方案冻结，不可动手**
> 结案见同目录 `REVIEW-CONCLUSION.md`。第一轮 20 项：7 已闭合 / 5 部分 / 8 未闭合；
> 第二轮新增 3×CRITICAL（B9 Node 解不开 Fernet / A2 `unknown` 绕过守卫 / C15 迁移号冲突）。
> 决定性阻塞：**「服务端代理」这个方向本身需要先做 Node 加密体系重构，那是独立立项，不是本方案能定的。**
> 修订记录：2026-10-09 收到对抗评审 5×CRITICAL / 8×MAJOR，全部或部分接受；
> **决策 1 结论保留、论证废弃重写；决策 3（精度方案）作废重做；批次顺序重排。**
> 对抗评审执行说明：CCG 跨家族双模型评审在本环境**无法执行**——引擎驱动 `ccg-deep-review.js` 全盘不存在，
> 后端 `claude` / `opencode` / `codex` / `codeagent-wrapper` 四者全不可用。改用 `Verifier` 子 Agent 承担
> 对抗评审角色并实测复现核心缺陷，**属降级替代，不等同于 CCG 双家族评审**。
> 关联：`01-docs/DEEP-ANALYSIS-CREDIT-PRICING-2026-10-08.md`（PR #3120 报告）
> 定案前提：PR #3178 已把定价落进 `plan-matrix.js`（`PLAN_MATRIX_VERSION=2026-10-08`）
> 取证基线：`origin/main` @ `ceb99875`

---

## Why

**当前定价体系是一个「收得到钱、给不出东西」的状态。** PR #3178 已把标准版 ¥59 / 1600 积分写进服务端唯一真源，但：

| 事实 | 证据 |
|---|---|
| 桌面端**零处**引用 `official-keys` | `grep -rn "official-keys\|officialKey" apps/desktop/electron/` → 0 命中 |
| 服务端**零处**模型调用入口 | `grep -riE "chatCompletion\|generateVideo\|generateImage\|createTts" packages/api-publish-engine/src/` → 0 命中 |
| adapter 直连 provider `baseUrl`，且要求有 Key | `adapters/_base/openai-compatible.js:36`；`model-provider-manager.js:256` `hasUsableApiKey()` |

三条合起来：**官方内置 Key 池（`ops-center` 的 `official_keys` 表）存在于管理面，但从不下发；服务端不代理模型调用；桌面端只能用用户自己的 Key。**

**即：用户付 ¥59 买了 1600 积分，这 1600 积分买不到任何东西。** 因为没有官方算力供给。

而报告 §2.2 记录的 G1（`official_credit` 无扣减路径）/ G2（`consumeFeature` 只接受正整数）**不是阻塞点**——它们是小改动，改完那 1600 积分依然无法被消费，因为没有可扣的官方算力。

**先做 G1/G2 是本末倒置。** 本 proposal 处理的是它前面的那一步：把「官方算力」这件事从「表存在」变成「用户能用」。

---

## What Changes

### ADDED Capabilities

- `official-compute-proxy`：服务端模型代理契约——`quote` / `reserve` / `execute` / `settle` 四段式接口，官方 Key 永不下发桌面端。
- `credit-ledger`：积分账本——预扣（reserve）/ 结算（settle）/ 退还（refund）三态，支持定点小数与并发安全扣减。
- `compute-cost-ledger`：成本台账——`model_price_cards`（单价历史）+ `generation_requests`（应有成本 vs 实际成本对账）。
- `compute-guardrails`：防亏三道闸——`tier_access` 档位分层、fallback 链接线、`_writeLog` 补 usage 字段。

### MODIFIED Requirements

- `plan-matrix`：`consumeFeature` 的 `amount` 从「正整数」放宽为「定点小数 ≥ 0.01」（G2）。
- `model-provider-manager`：provider 增加 `source: 'official' | 'byok'` 维度；`official` 走服务端代理，`byok` 保持直连（**现有行为零改动**）。

### 不在本 change 范围

- 真实支付接入（G12，阶段 2）
- 单价卡 UI 管理页（先有表与 CLI/API，UI 后置）
- 数字人、音频克隆等高阶能力（先只做 LLM / 生图 / 生视频 / TTS 四类）

---

## Design

### 决策 1：官方算力必须走服务端代理（不可回避）

**问题**：官方 Key 怎么给到桌面端？

| 方案 | 描述 | 判定 |
|---|---|---|
| A 下发 Key | 官方 Key 加密后下发桌面端 | ❌ **否决**。桌面端可被逆向取 Key → 无限白嫖；且 Key 泄露面从 1 处变 N 处 |
| B 服务端代理 | Key 留服务端，桌面端转发请求 | ✅ **采纳** |
| C 混合 | 文本代理、视频下发 | ❌ 否决。视频 Key 单价最高，正是最不能泄露的，分发它等于放弃防护 |

**为什么 B 是硬约束而不是偏好**：A 一旦成立，「防亏」整个命题失效——攻击成本是一次逆向，收益是无限定额使用。`official_keys.api_key` 已用 Fernet 加密存储（`models.py:124`），但那保护的是**静态存储**，不是**客户端进程内存**。

**B 的附带收益**（这些是 A 拿不到的）：

- 服务端知道**真实用量**（`usage` 字段），成本账才有原料
- 服务端能在 reserve 阶段就**拒绝超支请求**，而不是事后追讨
- 单价、模型可用性、`tier_access` 全在服务端，客户端改不动
- 熔断（`OfficialKey.is_active=false`）立刻全网生效，不依赖客户端拉配置

### 决策 2：四段式接口，扣减判据是「上游是否真的返回有效产出」

```
桌面端                                  服务端
  │                                        │
  │ ① POST /api/v1/compute/quote           │ 查 ModelPriceCard 算价
  │    {action, model, spec, duration}     │ 不扣，只报价
  │  ◄── {credits, breakdown, expires_in}  │
  │                                        │
  │ ② POST /api/v1/compute/reserve         │ 按报价预扣（原子）
  │    {quote_id}                          │ 返回 reservation_id
  │  ◄── {reservation_id, balance_after}   │
  │                                        │
  │ ③ POST /api/v1/compute/execute         │ 选 Key → 调上游 → 解析 usage
  │    {reservation_id, payload}           │ 流式透传
  │  ◄── SSE / JSON                        │
  │                                        │
  │ ④ POST /api/v1/compute/settle          │ 按真实 usage 重算
  │    {reservation_id, client_observed}    │ 退差额 / 全额退
  │  ◄── {actual_credits, refunded}         │
```

**为什么不是「一次性扣费」**：视频/生图上游失败率高（队列满、审核拒、超时），先扣后不认账会引发投诉。先扣后结算能把「用户实际承担 = 上游实际消耗」这条口径机械化，不依赖客户端自证。

**失败/超时/取消一律走 refund**，判据是 `generation_requests.status`，不是客户端传来的任何字段。

### 决策 3：并发安全的预扣，复用既有原子扣减 SQL

`postgres-identity-repository.js:367-380` 已有并发安全的 upsert：

```sql
INSERT INTO identity_entitlement_usage (...) SELECT $1..$6 WHERE $5 <= $6
ON CONFLICT (user_id, feature, period_start) DO UPDATE SET used = used + EXCLUDED.used
 WHERE used + EXCLUDED.used <= EXCLUDED.quota_limit
```

**本 change 不新写扣减路径**，只做两件事：

1. 放宽 `amount` 校验：`Number.isInteger(amount)` → 定点小数（`postgres-identity-repository.js:447-449`、`subscription-service` 侧同源校验）
2. 把 `official_credit` 加进 `plan-matrix.js` 的 `features` 数组（当前不在，`consumeFeature` 会先在 `:445` 抛 403）

**金额精度**：`official_credit` 用 `NUMERIC(12,3)`，扣减时换算为「积分 × 1000」的整数存储，避免浮点累积误差。**复用 `used` 的整数列，精度在换算层解决，不动表结构。**

### 决策 4：Key 选择在 reserve 阶段就锁定

`reserve` 时按 `tier_access` + `is_active` + `priority` 选出具体 `official_keys.id`，写进 `generation_requests.official_key_id`。**execute 用这把锁定的 Key，不再重新选。**

理由：reserve 与 execute 之间如果重新选，可能选中不同 Key，而不同 Key 单价不同 → 结算金额与报价不符。锁定后「报价 = 预扣 = 结算」的基准唯一。

**Key 轮换**用 `priority` 调整 + 熔断，不在请求路径上做。

### 决策 5：fallback 接线是 1 行，但必须做

`ProviderRouter` 已实现 `round_robin` / `failover` / `excludeIds`（`adapters/_base/router.js:22-135`，690 行测试），但唯一入口要求 `params.useFailover === true`（`ai-generator.js:87`），而该标志**生产零命中**。

**本 change 不重写它**，只做两件事：

1. 服务端代理路径**显式开启 failover**（reserve 时按 fallback 链选 Key）
2. 补一条**接线棘轮**：断言生产代码里存在 `useFailover: true` 的调用方（当前只有测试有）

> 判据来自本仓既有教训（PR #3066）：212 行模块、21 个单测全绿、**生产引用数 0**。`round_robin` / `failover` 字面量当前同样只出现在 `router.js` 定义处与测试里。

### 决策 6：降级必须同向降扣费

服务端切到更便宜的 Key 后，`settle` 按**实际使用的 Key 的单价**重算并退差额。客户端展示：

```
✓ 生成完成（已自动切换至省钱模式）
  原定 影视档 · 4K    1500 积分
  实际 标准档 · 720P   150 积分   已退回 1350 积分
```

**不允许「按原价扣、给降级结果」**——那是投诉的结构性来源。

### 决策 7：`_writeLog` 补 usage（成本账的地基）

`model-provider-manager.js:356-370` 的 `_writeLog` 只写 `provider_id / category / action / status / latency_ms / error_message`，**不写 `tokens_in` / `tokens_out` / `cost`** → 落库 NULL → `usage-reporter.js:123-125` 的 `Number(null)||0` → `model_usage_daily.cost` 恒为 0。

**本 change 让 usage 从服务端代理侧上报**（代理层本来就拿得到完整 `usage`），不指望修桌面端 `_writeLog`——BYOK 路径用户自掏腰包，官方路径的成本账归服务端管，**两条路径的账本分开**。

这比「修 `_writeLog` 让 BYOK 也上报成本」更准确：BYOK 的成本对运营方不是支出，是用户的账单。

### 数据模型（两张新表）

**`model_price_cards`**（单价历史，支持 `effective_from` / `effective_to` 版本化）

```sql
provider_id, model_id, action_type, spec, quality_tier,
unit, unit_price NUMERIC(12,6), currency, proc_discount NUMERIC(4,3),
effective_from DATE, effective_to DATE NULL, source, created_at
UNIQUE(provider_id, model_id, action_type, spec, quality_tier, effective_from)
```

**`generation_requests`**（预扣 → 结算 全生命周期）

```sql
id UUID, user_id, client_id, reservation_id UUID UNIQUE,
official_key_id, action_type, model_id, spec, duration_sec, count,
quality_tier, degraded_from,
quote_credits NUMERIC(12,3), reserved_credits NUMERIC(12,3),
settled_credits NUMERIC(12,3) NULL, refunded_credits NUMERIC(12,3),
expected_cost NUMERIC(12,6), actual_cost NUMERIC(12,6) NULL,
actual_usage JSONB NULL,
status TEXT,           -- reserved | completed | failed | refunded
created_at, settled_at
```

`status <> 'completed'` 建部分索引供对账扫描。

### 防亏三道闸（对应报告 §8 P0）

| 闸 | 落点 | 现状 |
|---|---|---|
| 熔断 | `official_keys.is_active` 改 0 → reserve 阶段即不可选 | 字段已在，**无专用 toggle 端点**，需补 |
| 成本阈值 | `alert_threshold_cost` 命中 → 告警 | 字段已在，`key_service.py:219` 在用但恒为 0 |
| fallback | reserve 阶段按链选 Key | 代码在，**未接线** |

### 分批实施

| 批次 | 内容 | 验收口径 | 可独立上线 |
|---|---|---|---|
| **P0-a** | `model_price_cards` 表 + 种子数据（2026-10-08 挂牌价） | 表建好，报价接口能返回价格 | ✅ 纯后端 |
| **P0-b** | `consumeFeature` 放宽定点小数 + `official_credit` 进 features | 并发预扣测试通过；越界请求 429 | ✅ 纯后端 |
| **P0-c** | `quote` / `reserve` / `settle` 三接口 + `generation_requests` | 预扣-结算-退还三态全覆盖，幂等 | ✅ 纯后端 |
| **P1-a** | `execute` 代理：**LLM 文本**（非流式优先） | 端到端出文本，扣费与报价一致 | ✅ 首个可用算力 |
| **P1-b** | 桌面端双路（`source: official \| byok`） | 官方档走代理、BYOK 档行为零变化（回归全绿） | ✅ 需发版 |
| **P1-c** | 熔断开关 + 成本阈值告警 | 熔断后 reserve 立刻拒；日成本超阈告警 | ✅ |
| **P2-a** | `execute` 扩 **TTS / 生图** | 同 P1-a | ✅ |
| **P2-b** | `execute` 扩 **生视频**（成本最高，最后开） | 同 P1-a + 差异对账 | ✅ |
| **P3** | fallback 接线 + 接线棘轮 | 生产代码存在 `useFailover: true` 调用方 | ✅ |
| **P4** | 「应有 vs 实际」对账报表 | 差异 >15% 可列出 | ✅ |
| **P5** | 单价卡管理 UI | 运营可改价并即时生效 | ✅ |

**灰度**：`official_compute_enabled` 开关，按档位逐步放开——先 free/standard 的文本类，确认成本账与扣费链路无偏差，再开视频类。**视频类必须最后开**（单价最高、对账最不确定）。

### Plan B（若本 change 不做）

会员费**只买平台能力**（账号数 / 并发 / 发布 / 排期 / 看板），积分权益**暂不对外承诺**，定价页不展示任何量化数字。

**当前 v1.2 定价在 Plan B 下依然成立**（¥59/¥79 与功能配额是实打实的），只是**不能宣传「每月 1600 积分」**。这正是 PR #3178 执行记录 L5 记录的现状。

---

## Impact

**新增**：
- `migrations/postgresql/006_compute_ledger.sql`（2 张表）
- `packages/api-publish-engine/src/compute/`（proxy / ledger / price-card / key-selector）
- `packages/api-publish-engine/src/publish-api-server.js` 新增 4 条路由（`_requiredFeature` 不变，不与 `cloud_publish` 抢）
- 桌面端 `model-provider-manager.js` 双路分支

**修改**：
- `plan-matrix.js`：`official_credit` 进 `features`
- `postgres-identity-repository.js:447-449`：`amount` 定点小数
- `ops-center`：熔断 toggle 端点

**风险**：
- **代理链路成为新单点** —— 服务端不可用 = 官方算力全挂。缓解：保留 BYOK 通路，代理故障时客户端明确提示「切回自有模型」，不静默失败。
- **服务端带宽与内存** —— 视频文件下载过服务端。缓解：视频**不落服务端**，只透传上游预签名 URL；或直接让客户端从上游 URL 拉取（见未决问题 Q1）。
- **成本超支** —— 恶意构造超长 duration。缓解：`quote` 与 `reserve` 都做上限校验（按 `ModelPriceCard` 的业务上限），且 reserve 是硬闸。

---

## 未决问题（需评审/决策拍板）

- **Q1 · 视频/图片大文件走不走服务端？** 若走，代理要处理二进制流与临时存储；若不走，服务端只签发一次性预签名 URL，客户端直连上游拉取。**后者省带宽但服务端拿不到最终文件大小**，对账只能靠上游回执。倾向后者。
- **Q2 · 充值积分是否本批次做？** 倾向**不做**——`reserve` 只消耗会员额度，额度耗尽返回 429 引导升级。充值包等支付接通（G12）后单独做，否则要同时处理支付与积分两条链路。
- **Q3 · `official_keys` 现有 4 条记录的 `tier_access` 与 `cost_per_1k_tokens` 是否可信？** 若不可信，P0-a 需先补种子数据再上线，否则第一笔请求就会算错价。
- **Q4 · 代理层是否需要 SSE 透传？** P1-a 建议先做非流式（缓冲完整响应），流式放 P2。流式会让「预扣 → 失败退还」的时序复杂化（客户端中断时上游可能仍在计费）。

---

# 附录 A：对抗评审回应与方案修订（2026-10-09）

> **执行说明**：CCG 跨家族双模型评审在本环境**无法执行**——引擎驱动 `ccg-deep-review.js` 全盘不存在
> （`plan-review.sh:119-125` 的三个搜索路径皆落空），后端 `claude` / `opencode` / `codex` /
> `codeagent-wrapper` 四者全部不可用。改用 `Verifier` 子 Agent 承担对抗评审角色，并**实测复现**了核心缺陷。
> **这是降级替代，不等同于 CCG 双家族评审**，也不得以自审冒充通过。

## A.1 评审结论与我的回应

| # | 评审发现 | 严重度 | 回应 |
|---|---|---|---|
| R1 | **Reserve 洪水**：无 outstanding 上限 + 无回收器 + 决策 4 锁 Key，攻击者持 N 个 reservation 后全部 execute、不 settle → 消耗 0 积分 | 🔴 CRITICAL | **全盘接受**。这是本方案自身设计的直接产物 |
| R2 | **退款路径不存在**：`UPDATE identity_entitlement_usage` 全仓 0 命中，`used` 纯增量；而 P0-c 验收口径却要求「退还三态」——**方案的范围声明禁掉了自己验收标准必需的东西** | 🔴 CRITICAL | **全盘接受**。P0-c 必须重写 |
| R3 | **没有任务宿主**：全仓零调度器（唯一 `setInterval` 是 `rate-limiter.js:8` 的内存清理），孤儿 reservation 无处回收 | 🔴 CRITICAL | **全盘接受**，并把「任务宿主」列为显式设计项与运维前提 |
| R4 | **`official_keys` 在 ops-center 的 SQLite，权益账本在 Postgres**（`models.py:116-117` / `database.py:11` / `002_logto_identity.sql:41`），决策 4 要求 reserve 原子读它，但**没有桥** | 🔴 CRITICAL | **全盘接受**。物理归属必须先拍板，见 D1 |
| R5 | **×1000 只缩放一边会炸**：`quota_limit` 来自 `plan-matrix.js:164` 未缩放，`used` 缩放后 `1600500 <= 1600` 恒 false → 付费用户用掉 1.5 积分就 429 | 🔴 CRITICAL | **全盘接受**。决策 3 作废重做，见 A.2 |
| R6 | **`officialCreditMonthly = -1` 触发每次扣费 503**：`plan-matrix.js:77` 该键在 `UNLIMITED_ALLOWED` 内 → `postgres-identity-repository.js:451-453` 判 `limit < 0` | 🔴 CRITICAL | **全盘接受**。解法就在同一个文件 `plan-matrix.js:76`，**本方案踩了 CCG C5 的同型坑** |
| R7 | **`api_key` 认证路径完全绕过扣费**：`publish-api-server.js:563` `if (!feature \|\| !this._usesLogtoIdentity(req)) return null` + `:476-477` 对 `authType==='api_key'` 返回 false | 🔴 CRITICAL | **全盘接受**。compute 路由必须强制 Logto 身份 |
| R8 | **`execute` 幂等契约不存在**：服务内 `idempot` 全文 0 命中；`reservation_id UNIQUE` 只给唯一性不给单次执行，并发 execute 会双打上游 | 🔴 CRITICAL | **全盘接受**。改用 CAS |
| R9 | **视频 10 分钟孤儿**：`story2video-stages.js:749/752` 超时后 `:745` 的 taskId 被丢弃、全函数无取消调用 → 上游继续计费而方案「失败即 refund」= 白送 | 🔴 CRITICAL | **全盘接受**。引入 `unknown` 第三态 + 服务端延迟对账 |
| R10 | **权益快照失效模型缺失**：快照物化（`postgres-commerce-store.js:32-38` / `subscription-service.js:103,209,258`），改 `plan-matrix` 对存量用户无效；降级竞态下退款可能使 `used` 变负，撞 `002_logto_identity.sql:46` 的 `CHECK (used >= 0)` | 🔴 CRITICAL | **全盘接受**。settle 必须锚定 reserve 时刻的快照版本 |
| R11 | 决策 1 的**论证**把「可复用凭证」与「一次性票据」混为一谈；`reservation_id` 已是票据原语的雏形 | 🟠 MAJOR | **结论保留、论证废弃重写**，见 A.3 |
| R12 | 方案点名的放宽点 `:447-449` 不完整，漏了 `:355-357`（所有 feature 共用、抛裸 `TypeError`→500） | 🟠 MAJOR | **全盘接受**，两处同改 |
| R13 | 方案引用的「`subscription-service` 侧同源校验」**不存在**（该文件 `isInteger` 只校验 `durationDays`/`count`） | 🟠 MAJOR | **承认事实错误**，本方案写错 |
| R14 | 批次顺序错：熔断排在桌面端双路之后、fallback 排在视频之后、P0-b 爆炸半径大于 P0-c | 🟠 MAJOR | **全盘接受**，批次重排见 A.4 |
| R15 | `expires_at` / `rate_per_minute` / `daily_limit` 未进选 Key 条件 → 过期 Key 会被选中 | 🟠 MAJOR | **全盘接受** |
| R16 | `key_service.py:226` 成本按 **provider** 聚合却判 **每个 Key** 阈值 → 同 provider 全 Key 同时误告警 | 🟠 MAJOR | **全盘接受** |
| R17 | 积分引擎在 DB 故障时 fail-open/fail-closed 未定义 → 一次 DB 抖动 = 无限免费算力 | 🔴 CRITICAL | **全盘接受**。定为 **fail-closed** |
| R18 | 无每账号 reserve 并发上限 / 每 IP 上限 / outstanding 数量上限 → `concurrentTasks` 未绑 reservation | 🔴 CRITICAL | **全盘接受**，见 A.2 决策 8 |
| R19 | free 档有 30 积分但任何 `tier_access>=2` 的 Key 都排除他们 → 30 积分永远花不出去 | 🟠 MAJOR | **全盘接受**。灰度期给 free 单独留至少一条 `tier_access=1` 的低价 Key |
| R20 | 引用漂移：方案引 `models.py:124` 指 `api_key`  Fernet 加密，实际 `:122` 才是 `api_key`，`:124` 是 `models = Column(Text)` | 🟢 MINOR | **承认并更正** |

**评审未能证实的**：部署层是否允许边缘签发（无 CDN/边缘运行时可见性）—— 保留为未决问题 Q5。

## A.2 决策修订

### 决策 3 作废重做（原「复用整数列，×1000 换算」）

**作废理由**：该方案只缩放 `used` 不缩放 `quota_limit`，实测付费用户用掉 1.5 积分即被 429；且 `used`/`quota_limit` 两列被 `cloud_publish`/`ai_write`/`video_create`/`official_credit` **四种语义共用**（PK 是 `(user_id, feature, period_start)`），把「按 feature 的单位约定」塞进全局共享列，下游读者无从判断单位。

**新方案**：`official_credit` 使用**独立列**，不复用 `used`。

```sql
-- 迁移 006：同表新增两列，只服务 official_credit
ALTER TABLE identity_entitlement_usage
  ADD COLUMN used_milli     INTEGER NOT NULL DEFAULT 0 CHECK (used_milli >= 0),
  ADD COLUMN quota_limit_milli INTEGER NOT NULL DEFAULT 0 CHECK (quota_limit_milli >= 0);
```

- `official_credit` 走 `used_milli` / `quota_limit_milli`，其余 feature 继续走 `used` / `quota_limit`，**互不污染**
- 精度：1 积分 = 1000 毫积分，INTEGER 上限 2,147,483,647 ÷ 1000 = **2,147,483 积分**，标准版 1600 / 专业版 2200 均有 3 个数量级余量
- **所有读 `used` 的路径必须同步**（评审实测这两处零换算）：`postgres-commerce-store.js:187-190`（`getUsageSummary`）、`subscription-service.js:140-141`（`getUsageView`）
- 新增契约测试：断言任意 feature 的 `getUsageSummary` 返回值与写入量一致（防止再次出现"写入放大、读出未放大"）

### 决策 4 修订（Key 选择与物理归属）

**物理归属未决**——见 D1。但**无论选哪种，选 Key 的判定条件必须包含**：

```
is_active = 1
AND (expires_at = '' OR expires_at > now)
AND (rate_per_minute IS NULL OR 本分钟用量 < rate_per_minute)
AND (daily_limit    IS NULL OR 今日用量   < daily_limit)
AND tier_access <= 用户档位
ORDER BY priority DESC
```

（后三个条件是评审 R15 指出的遗漏：过期 Key 会被选中、限流字段完全没进 criteria。）

### 决策 6 修订（幂等与状态机）

`status` 从三态改为**四态**，且每次迁移用 CAS 而非读后写：

```sql
-- execute 幂等：单次执行
UPDATE generation_requests SET status='executing', executed_at=NOW()
 WHERE id=$1 AND status='reserved'
 RETURNING *;                       -- 0 行 = 已被别人执行过，直接返回既有结果
```

```
reserved ──execute(CAS)──> executing ──上游成功──> completed
    │                          │
    │                          ├──上游明确拒绝──> failed ──> refunded
    │                          ├──超时/断连────> unknown ──> （延迟对账，见决策 9）
    │                          └──客户端取消──> cancelled ─> refunded
    └──超时未 execute ──> expired ──> refunded（回收器）
```

### 决策 7 新增（fail-closed）

积分链路在 Postgres 不可用时**一律拒绝**（503），**绝不 fail-open**。一次 DB 抖动 = 无限免费算力，这是评审 R17 指出的、防亏三道闸都没覆盖的场景。

### 决策 8 新增（outstanding 预留上限）—— 攻击 1 的唯一解药

`reserve` 的守卫从「一条」变成「三条」，缺一不可：

| 守卫 | 判据 | 建议初值 |
|---|---|---|
| 额度守卫 | `used_milli + amount <= quota_limit_milli` | 沿用 |
| **outstanding 守卫** | `count(status IN ('reserved','executing')) <= 5`（每账号） | **5** |
| **速率守卫** | 60 秒内 reserve 次数 <= 10（每账号） | **10** |

**没有 outstanding 上限，reserve 就不是「预扣」，是给上游算力开的一张信用额度。**

### 决策 9 新增（视频孤儿与延迟对账）

- `execute` 内部**持有 `taskId`**（不再像桌面端那样丢弃），超时**不立即判失败**，置 `status='unknown'`
- 回收器对 `unknown` 状态**主动向上游查证**（轮询/回执），拿到真实结果再 settle
- 上游**不支持取消**时，`unknown` 态的对账窗口按 action 类型配置（视频 30 分钟，文本 5 分钟）
- `expired` / `cancelled` 才走退款；`unknown` **既不退也不收**

### 决策 10 新增（快照锚定）

`generation_requests` 记录 `entitlement_version`（reserve 时刻的 `matrixVersion` + 快照 `updated_at`）。

- `settle` 的退款**锚定 reserve 时刻的 `quota_limit_milli`**，不读当前快照
- 用户在 reserve 后降级/退订：已预扣的部分按旧快照正常结算，未预扣的部分随降级失效
- 退款用 `used_milli = used_milli - $amount` 并加 `WHERE used_milli >= $amount` 防负数，撞 `CHECK` 也不会静默失败

## A.3 决策 1 论证重写（结论保留）

**原论证（废弃）**：「视频 Key 单价最高，正是最不能泄露的，分发它等于放弃防护」。

**问题**：这混淆了「客户端进程内可提取的**长期可复用凭证**」与「服务端铸造的**一次性票据**」。前者泄漏 = 无限额度；后者泄漏 = 恰好一次已被预扣的调用，相差上千倍。

**新论证**：真正的判据不是「Key 在哪」，而是**「这个凭证可复用吗」**。

| 方案 | 客户端持有的东西 | 泄漏后果 | 判定 |
|---|---|---|---|
| A 下发长期 Key | 可无限复用的 `api_key` | 无限白嫖 | ❌ |
| **B 服务端代理** | 无凭证，只有服务端返回的结果 | 无 | ✅ 默认形态 |
| **B′ 一次性票据直连** | 服务端签名、60s 过期、单次消费、绑定 `reservation_id`、有字节数上限的票据 | **恰好一次**，且已预扣 | ✅ **视频/图片应走这条** |

**B′ 同时解决 Q1 的大文件问题**：客户端用票据直连上游拉 URL，服务端不落二进制。代价是服务端拿不到最终文件大小，对账只能靠上游回执——**这个代价必须在 Q1 里显式接受或显式拒绝**，不能默认。

## A.4 批次重排

原顺序把爆炸半径最大的 P0-b（改共用校验器 + 打开全量付费用户活开关）排在最前，把最贵的品类放在 failover 之前。重排后：

| 批次 | 内容 | 前置 |
|---|---|---|
| **P0-a** | `model_price_cards` 表 + 种子数据 | 无（**唯一可立即动手的批次**） |
| **P0-b** | **Key 池物理归属落定**（D1 拍板）+ 桥接实现 | D1 |
| **P0-c** | `generation_requests` 表 + **outstanding/速率双守卫** + `execute` CAS 幂等 | P0-b |
| **P0-d** | **退款路径**（`used_milli` 减量）+ **回收器** + 任务宿主 | P0-c |
| **P0-e** | `official_credit` 进 `features` + `officialCreditMonthly` 移出 `UNLIMITED_ALLOWED` + 迁移 006 加列 + 两个零换算读点修正 | P0-d |
| **P1-a** | `quote` / `reserve` / `settle` + fail-closed | P0-e |
| **P1-b** | **`execute` 代理：LLM 文本** | P1-a |
| **P1-c** | **熔断 toggle 端点**（与 P1-b 同批，不排在桌面端之后） | — |
| **P1-d** | **fallback 接线 + 接线棘轮**（任何官方算力对用户可见之前） | P1-b |
| **P1-e** | 桌面端双路 `source: official \| byok` | P1-d |
| **P2-a** | `execute` 扩 TTS / 生图 | P1-e |
| **P2-b** | `execute` 扩生视频（`unknown` 态 + 延迟对账先行） | P2-a |
| **P3** | 「应有 vs 实际」对账报表 | P2-b |
| **P4** | 单价卡管理 UI | P3 |

**关键顺序变化**：
1. **退款路径 + 回收器（P0-d）先于 `official_credit` 进 features（P0-e）** —— 原顺序会出现「可扣但永不退」的用户可见状态
2. **熔断（P1-c）与首个算力（P1-b）同批** —— 原顺序下 P1-a→P1-b 期间运营方唯一的止损手段是手工改 SQLite
3. **fallback（P1-d）先于桌面端双路（P1-e）与视频（P2-b）** —— 最高成本品类不能在单 Key 无 failover 下先开
4. **P0-b 从"改共用校验器"降级为"定 Key 物理归属"** —— 原 P0-b 的爆炸半径（改所有 feature 共用的 `:355`）被推迟到 P0-e，且此时已有真实调用方做端到端验收，不会退化成「合成夹具自测」

## A.5 引用更正

| 位置 | 方案原文 | 实际 |
|---|---|---|
| A.3 原论证 | `models.py:124` 是 `api_key` Fernet 加密 | `models.py:122` 才是 `api_key`；`:124` 是 `models = Column(Text)` |
| 决策 3 引用 | 「`subscription-service` 侧同源校验」 | **不存在**。该文件 `isInteger` 只校验 `durationDays`（`:239,:283`）与 `count`（`:286`） |
| 决策 3 引用 | 贴的 SQL 是 `consumeEntitlementUsage` 全文 | 是删节版，漏了 `quota_limit = EXCLUDED.quota_limit`（`:374`）——正是 R5 变危险的原因 |

---

# 附录 B：D1 拍板 —— Key 池物理归属（方案 A：迁移到 Postgres）

> 2026-10-09 决策：`official_keys` 从 ops-center 的 SQLite 迁到 api-publish-engine 的 Postgres，
> 成为**单真源**。本附录是 P0-b 的实施依据。

## B.1 为什么必须单真源

决策 4 要求 `reserve` **原子地**读 `is_active / tier_access / priority / expires_at`。
决策 1 承诺「熔断**立刻**全网生效」。这两条都要求 Key 池和权益账本在**同一个事务边界**内。

任何形式的跨库（反向 HTTP、镜像同步）都会让这两条承诺打折：镜像有同步延迟，反向调用把原子性降级为最终一致。

## B.2 ops-center 侧的影响面（逐条取证）

| # | 触点 | 证据 | 迁移动作 |
|---|---|---|---|
| 1 | `OfficialKey` ORM 声明 | `ops-center/backend/models.py:116-136` | 列定义基本可移植（SQLAlchemy 双方言）；`id = Column(String, primary_key=True)` 需确认 Postgres 大小写行为 |
| 2 | **唯一 engine** | `ops-center/backend/database.py:8-11`，`sqlite+aiosqlite:///{db_path}` | **新增第二个 Postgres engine + session 工厂**，原 SQLite engine 保留给 config / feature_flag / model_presets 等其余表 |
| 3 | **缺 Postgres 驱动** | `ops-center/backend/requirements.txt:11` 只有 `sqlalchemy[asyncio]` | 加 `asyncpg`（或 `psycopg[binary]`），二选一并锁版本 |
| 4 | **运行时 ALTER 补列** | `key_service.py:140-166` `ensure_official_key_columns` 逐列 `ALTER TABLE official_keys ADD COLUMN`（`rate_per_minute` / `daily_limit` / `alert_threshold_cost` / `note`） | **删除该函数**，全部并入迁移文件 `006`。运行时 DDL 是 schema 漂移的根源，双库下更危险 |
| 5 | **第二消费方（方案漏项）** | `model_preset_service.py:1112-1122`：`/model-presets/{id}/test` 在 body 未带 `api_key` 时**按 provider 回退读 `official_keys` 并 `decrypt_key`** | 该回退查询改为走新的 Postgres session。**原方案 Impact 清单未列此项** |
| 6 | Fernet 加密 | `key_service.py:15-45` `_get_fernet()` | 迁移**必须复用同一个 `OPS_ENCRYPTION_KEY`**，密文原样 COPY，不重新加密 |
| 7 | 前端管理页 | `ops-center/frontend/src/views/Secrets.vue` | 走 REST API，不直接碰 DB，**零改动** |
| 8 | 告警聚合 | `key_service.py:214-233` `pool_summary`：成本按 **provider** 聚合却判**每 Key** 阈值 | 随迁移一并修：阈值判定改为按 Key 维度（评审 R16） |

### B.2.1 Fernet 密钥是迁移的硬前置

`key_service.py:22-36` 有一条危险分支：

```python
if os.environ.get("OPS_ALLOW_EPHEMERAL_KEY","").lower() == "true":
    logger.warning("... DEVELOPMENT ONLY — encrypted data unrecoverable after restart.")
    key = Fernet.generate_key().decode()
```

**若 `OPS_ENCRYPTION_KEY` 未配置且开了 `OPS_ALLOW_EPHEMERAL_KEY`，每次重启都会生成新密钥，所有已加密的官方 Key 永久不可解。**

**迁移前置条件（阻断性）**：

1. 确认生产环境 `OPS_ENCRYPTION_KEY` **已配置且固定**（`key_service.py:39` 的 fail-closed 分支应已在生效）
2. **绝不能**在迁移过程中改动该值
3. 迁移脚本上线前，先跑一次「用当前 key 解密全部存量行成功」的校验，把校验结果作为迁移的准入证据

> 这一条不写进迁移，迁移后 Key 池会静默变成一堆解不开的密文，而且**只有等用户用到那把 Key 才会发现**。

## B.3 数据迁移

```sql
-- 006_official_keys.sql（Postgres，与权益账本同库）
CREATE TABLE official_keys (
  id                    TEXT PRIMARY KEY,
  provider              TEXT NOT NULL,
  name                  TEXT NOT NULL,
  api_key               TEXT NOT NULL,           -- Fernet 密文，原样迁入
  base_url              TEXT NOT NULL DEFAULT '',
  models                TEXT NOT NULL DEFAULT '[]',
  priority              INTEGER NOT NULL DEFAULT 1,
  is_active             INTEGER NOT NULL DEFAULT 1,
  tier_access           INTEGER NOT NULL DEFAULT 1,
  cost_per_1k_tokens    DOUBLE PRECISION NOT NULL DEFAULT 0,
  expires_at            TEXT NOT NULL DEFAULT '',
  rate_per_minute       INTEGER NULL,
  daily_limit           INTEGER NULL,
  alert_threshold_cost  DOUBLE PRECISION NULL,
  note                  VARCHAR(200) NOT NULL DEFAULT '',
  created_at            TEXT NOT NULL DEFAULT '',
  updated_at            TEXT NOT NULL DEFAULT '',
  -- 新增：选 Key 需要的索引
  CONSTRAINT ck_official_keys_tier   CHECK (tier_access IN (1,2,3)),
  CONSTRAINT ck_official_keys_active CHECK (is_active IN (0,1))
);
CREATE INDEX idx_official_keys_select
  ON official_keys (is_active, tier_access, priority DESC);
```

**迁移步骤**：

| # | 步骤 | 校验点 |
|---|---|---|
| 1 | 确认 `OPS_ENCRYPTION_KEY` 已固定 | **阻断性**，不通过则停 |
| 2 | 导出 SQLite 全表 → JSON | 行数 = `SELECT count(*)` |
| 3 | 用**当前 key** 逐行 `decrypt` → 成功 → 立即 `re-encrypt` 校验（round-trip） | 全部成功才继续 |
| 4 | 建表 + 导入（密文原样 COPY） | 目标行数 = 源行数 |
| 5 | 目标侧逐行解密验证 | 全部成功 |
| 6 | **双读期**：ops-center 优先读 Postgres，回落 SQLite（读路径） | 新增/改 Key 只写 Postgres |
| 7 | 观察 7 天，确认无回落读 | — |
| 8 | 停 SQLite 写入，标记 `official_keys` 只读 | — |
| 9 | 删除 `ensure_official_key_columns` | grep 确认 0 命中 |

**回滚**：第 8 步之前，SQLite 侧数据未被破坏，代码可切回；第 8 步之后需反向导出。

## B.4 跨库事务边界的诚实说明

采纳 A 后，ops-center 同时持有两个连接：

```
SQLite  : config / feature_flag / model_presets / content_policy / ...
Postgres : official_keys
```

**`official_keys` 的 CRUD 不与 SQLite 侧任何表同事务**（`key_service.py` 的写路径是独立 CRUD），所以当前**没有跨库事务需求**。

**但这是新增的架构约束，必须写死**：今后**不得**设计任何「同时写 `official_keys` 和 SQLite 表」的操作。若将来出现这类需求（如「保存 ModelPreset 时同时锁定对应 Key」），必须先解决分布式事务，否则一律拆成两步 + 补偿。

## B.5 P0-b 的验收口径

- 目标库行数 = 源库行数，且逐行可解密
- ops-center 的 `/api/v1/secrets` CRUD 全量功能不变（前端零改动即证明）
- `/api/v1/model-presets/{id}/test` 的 Key 回退路径功能不变
- **端到端**：`reserve` 能读到 Postgres 的 Key；改 `is_active=0` 后 ≤1s 内新 `reserve` 选不到该 Key
- `grep -rn "ensure_official_key_columns" ops-center/` → 0 命中
