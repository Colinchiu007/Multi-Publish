# 官方算力方案：两轮对抗评审结案

> 日期：2026-10-09 ｜ 方案：`official-compute-credit-engine/proposal.md`
> 执行方式：**CCG 跨家族双模型评审在本环境无法执行**（引擎 `ccg-deep-review.js` 全盘不存在；
> 后端 `claude` / `opencode` / `codex` / `codeagent-wrapper` 四者全不可用）。
> 两轮均由 `Verifier` 子 Agent 承担对抗角色并**实测复现**核心缺陷，属**降级替代**。

## 结论：VERDICT = FAIL，不可动手

两轮合计发现 **28 项**（第一轮 20、第二轮新增 8+），最终状态：

| 轮次 | CRITICAL | MAJOR | MINOR |
|---|---|---|---|
| 第一轮 | 5 | 8 | 7 |
| 第二轮 | 3 | 9 | 1 |
| **结案** | **7 项实质未闭合** | 部分 5 / 未闭合 8 | — |

## 三个决定性阻塞项

### B9 · Node 解不开 Fernet 密文（第二轮新增，CRITICAL）

附录 B 定的迁移方案是「`official_keys` 整表搬进 Postgres，**密文原样 COPY**」。

**问题**：`key_service.py:57` 的 `decrypt_key()` 是**全仓唯一的 Fernet 实现**（Python + `cryptography`）。
`packages/api-publish-engine` 的依赖里**没有 Fernet**，Node 侧只有 `cloud-accounts/envelope-crypto.js` 的 AES-256-GCM。

于是：迁库保住了 ops-center 的解密能力，却让**唯一需要读明文的那一方彻底锁死**——
而决策 1 承诺的正是「服务端代理持有 Key 去调上游」，服务端代理是 Node 进程。

**这不是附录 B 的执行疏漏，是「服务端代理」这个方向的前置依赖，方案从头到尾没看见。**

三条出路（必须选一）：① Node 侧实现 Fernet ② 迁库时重加密进已有的 AES-256-GCM 信封体系
③ 加 key-broker HTTP 回调 ops-center——**而 ③ 恰好是附录 B 开篇花整段论证要排除的跨服务依赖**。

### A2 · `unknown` 态整体绕过 outstanding 守卫（第一轮 R1 未闭合，CRITICAL）

守卫判据是 `count(status IN ('reserved','executing')) <= 5`，**不含 `unknown`**。
而 `unknown` 按设计是「既不退也不收」——上游已消耗、账没收口的状态。

```
reserve×5 → execute×5（真实烧上游）→ 全部超时转 unknown → outstanding 归零 → 立刻再 reserve×5
文本类对账窗口 5 分钟 ⇒ 约 60 次/小时、1440 次/天的免费上游算力，守卫全程绿灯
```

**第一轮最致命的攻击面，修订只把速率从 O(N) 降到 O(1/窗口)，判据本身没动。**

### C15 · 迁移号 006 被三个批次、两个文件名同时占用（第二轮新增，CRITICAL）

| 引用 | 文件 | 归属批次 |
|---|---|---|
| `proposal.md:224` | `006_compute_ledger.sql` | P0-a + P0-c |
| `proposal.md:293` | 「迁移 006：同表新增两列」 | P0-e |
| `proposal.md:471` | `006_official_keys.sql` | P0-b |

迁移台账锁 checksum（`postgres-migrations.js:104-106`），`assertReady` 用 `allowPending:false`
（`postgres-identity-repository.js:293`）。

**P0-a 一旦上线 006，P0-c / P0-e 的任何追加都会让整个商务仓储硬失败** →
`publish-api-server.js:830` 打 `MEMBERSHIP_UNAVAILABLE` → 会员中心整体降级。

**即：P0-a 不是「可以立刻动手」，它会焊死后面两批。**

## 第一轮 20 项结案

| # | 结论 | 依据 |
|---|---|---|
| R1 Reserve 洪水 | ❌ **未闭合** | A2：`unknown` 不计入守卫 |
| R2 退款路径不存在 | ✅ 已闭合 | P0-d + 减量 SQL |
| R3 没有任务宿主 | ⚠️ 部分 | `reserved` 有回收器，`executing` 无终态计时器 |
| R4 Key 池跨库无桥 | ❌ **未闭合** | B9：搬过去了但 Node 读不了，单点前置更脆 |
| R5 ×1000 单边缩放 | ⚠️ 部分 | 列拆对了，换算落点未指定（会落回共用函数 `:451`） |
| R6 `officialCreditMonthly=-1` | ✅ 已闭合 | 移出 `UNLIMITED_ALLOWED` |
| R7 api_key 绕扣费 | ❌ **未闭合** | 与 Impact 段「`_requiredFeature` 不变」直接矛盾 |
| R8 execute 幂等 | ⚠️ 部分 | CAS 正确，但「返回既有结果」无处可存（无结果列） |
| R9 视频 10 分钟孤儿 | ❌ **未闭合** | 对账器无上游契约、无实现归属，`unknown` 是单向门 |
| R10 权益快照失效 | ⚠️ 部分 | `entitlement_version` 已加，但锚定 `quota_limit_milli` 需要一个不存在的列 |
| R11 决策 1 论证 | ✅ 已闭合 | 论证重写成立 |
| R12 `:355-357` 漏点 | ✅ 已闭合 | 两处同改正确 |
| R13 `subscription-service` 引用不存在 | ✅ 已闭合 | 已认错 |
| R14 批次顺序 | ⚠️ 部分 | 熔断/fallback 前移正确；P0-b ↔ P1-a 验收成环 |
| R15 过期/限流字段未入选型 | ❌ **未闭合** | `expires_at` 是 TEXT，Postgres `text > timestamptz` 报 42883；限流项无数据源 |
| R16 provider 聚合 vs Key 阈值 | ❌ **未闭合** | `model_usage_daily` 无 `key_id` 列，修法不可实现 |
| R17 fail-open/closed | ✅ 已闭合 | fail-closed 定义清晰 |
| R18 无 reserve 上限 | ❌ **未闭合** | A1 守卫有 TOCTOU + A2 被 `unknown` 绕过 |
| R19 free 档积分花不出去 | ✅ 已闭合 | 灰度期留 `tier_access=1` Key |
| R20 引用漂移 | ✅ 已闭合 | 已更正 |

**统计：7 已闭合 / 5 部分 / 8 未闭合。**

## 顺手挖出的既有缺陷（与本方案无关，但应单独立项）

| # | 缺陷 | 证据 |
|---|---|---|
| X1 | `/model-presets/{id}/test` 的 Key 回退是**死代码**——用 `preset_id` 匹配 `OfficialKey.provider`，但 `ModelPreset` 没有 `provider` 列（`models.py:68-87`）。该功能今天就永远报「未配置 API Key」 | `model_preset_service.py:1115-1117` |
| X2 | `get_active_keys_for_tier` 生产引用数 **0**（只有定义 + 4 处测试） | `key_service.py:360` |
| X3 | `ORDER BY priority` 现实现是 **ASC**，方案改成 DESC 未说明理由；`priority` 语义无定义（`models.py:125` 只有 `default=1`） | `key_service.py:373` |
| X4 | `model_provider_logs` 的 `tokens_in/out/cost` 恒为 NULL（`_writeLog` 不传），全链路成本账为 0 | `model-provider-manager.js:356-370` |
| X5 | `identity_entitlement_usage` 无 schema 漂移锁（只有 `cloud-accounts` 有一道） | `postgres-identity-repository.js:55-64` |

## 关于本方案自身的取证纪律

第一轮我承认了 3 处引用漂移（`models.py:124`、`subscription-service` 同源校验、SQL 删节版）。
第二轮又查出**第 4 处**：我写「服务内 `idempot` 全文 0 命中」——在方案自己声明的取证基线 `ceb99875` 上
实际是 **4 处命中**（`subscription-service.js:155,159,189,220`）。

**结论的成立**（execute 无幂等契约）不依赖这条错误证据，但**证据是假的**。
**在承诺了证据纪律的文档里出现第 4 处，说明我的自查没有 uniformly 执行。**
