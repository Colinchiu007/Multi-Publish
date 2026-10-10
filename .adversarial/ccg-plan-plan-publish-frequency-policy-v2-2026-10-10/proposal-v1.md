# 技术方案 — 发布频率策略 v2（publish-frequency-policy-v2）

- 日期：2026-10-10
- 状态：**待对抗评审**（本文档是 `scripts/plan-review.sh` 的输入工件）
- 上游依据：[INVESTIGATE-PUBLISH-FREQUENCY-STRICTNESS-2026-10-10.md](./INVESTIGATE-PUBLISH-FREQUENCY-STRICTNESS-2026-10-10.md)（调查报告，已合并 `#3253`）
- 关联既有实现：`packages/shared-utils/src/publish-frequency-policy.js`、`publish-interval-guard.js`、`task-queue.js`；`apps/desktop/electron/core/container.setup.js`
- 关联历史决策：`openspec/records/publish-frequency-control.md`（PR #2773）、`01-docs/PRD-PUBLISH-FREQUENCY-CONTROL-2026-10-02.md`

---

## 0. 本方案要解决的四个问题（按调查报告的判定）

| # | 问题 | 证据 |
|---|---|---|
| 1 | **失败惩罚过重**：未提交到平台的失败也吃掉整个间隔窗口 | bilibili 连续 3 次失败间隔恰为 120.0 / 30.0 分钟；`task-queue.js:587-597` 自动重试与 `:240-262` 手动重试同走守卫 |
| 2 | **刻度无依据且维度选错**：只有最小间隔、没有日配额 | 公开资料唯一有依据的维度是「条/天」（微信订阅号 1 条/天、微博 30 次/小时·100 次/天） |
| 3 | **零抖动**：发布点落在精确的 30.0 / 60.0 分钟整数边界，是比「快」更强的机器人特征 | 守卫与队列内 `Math.random` 命中数 0；微博官方口径是「非用户主动行为频繁调用」 |
| 4 | **跨账号平台档无依据且实测空转** | `accounts.json` 每平台恰好 1 账号 ⇒ 该档恒被更严的账号档支配；公开资料无「跨账号共享发布窗口」依据 |

---

## 1. 范围

### 1.1 本方案实现（全部 P0/P1/P2）

| 编号 | 内容 | 类型 |
|---|---|---|
| P0-1 | 记账语义细分：未提交失败回滚窗口 | shared-utils + 桌面装配 |
| P0-2 | 重试（自动/手动）放行路径 | shared-utils |
| P1-1 | 跨账号平台档默认关 + 显式开关 | shared-utils |
| P1-2 | 账号级日配额维度（新） | shared-utils + store 新表 + 桌面装配 |
| P1-3 | 间隔抖动（可注入随机源） | shared-utils |
| P2-1 | 数值下调（60→20 / 30→10 / 10→3） | shared-utils |
| P2-2 | 渲染层口径统一 + 设置页策略区块 + 一次性紧急发布出口 | 渲染层 + IPC + locale |
| P2-3 | 未登记平台回落时出声告警 | shared-utils |
| P2-4 | 校准基础设施（口径定义 + 可复现取数脚本） | scripts/ |
| P2-5 | `tencent_video` 命名歧义注释；`publish:wechat` 补任务级 `accountId` | config + 主进程 |

### 1.2 非目标（明确不做）

- **不做设备/IP 级全局串行**：跨平台并发是本产品核心用途（沿用 `publish-frequency-control` PRD §2 的非目标）。
- **不做平台规则同步**：不声称符合任何平台官方规定。
- **不做「成功才记账」**：会引入重复发布（调查报告 §6.C 已否决）。
- **不做跨设备配额同步**：日配额按本机 owner 维度计数，不联网合并。
- **不改 `publish-capabilities.json`**：内容能力与调度节奏是两类关注点（沿用上游决策）。

---

## 2. 现状与改动点（file:line 基线）

| 文件 | 现状 | 本方案改动 |
|---|---|---|
| `packages/shared-utils/src/publish-frequency-policy.js` | 15 平台 × `{accountMinMs, platformMinMs}`；`BASELINE_INTERVALS` 60/5；两个 env | 新增 `accountDailyMax`、`jitter`、`platformTier` 语义；数值下调；未登记出声 |
| `packages/shared-utils/src/publish-interval-guard.js` | `check()` 两档取更严；`recordPublish()` 提交前写；无释放、无抖动、无日计数 | 新增 `release()`、抖动、日配额判定与计数；`verdict` 增字段 |
| `packages/shared-utils/src/task-queue.js` | `:514-547` 检查→记账→blocked 重排；`:587-597` 失败回队；`:240-262` 手动重试 | 失败分类：`notSubmitted` ⇒ 回滚窗口；重试放行窗口 |
| `apps/desktop/electron/core/container.setup.js` | `:369-380` 注入 `PublishIntervalGuard`（policy + store） | 注入 `dailyStore` + `jitter` 随机源；装配锁断言日配额已接线 |
| `apps/desktop/electron/services/store/`（`publish_timeline`） | `(owner_subject, key, value TEXT)`，只存最后一次提交时间 | 新增 `publish_daily_count(owner_subject, key, day_key, count)` 表（**只增不改**） |
| `apps/desktop/src/locales/publish-page/{zh,en}.js` | `:195` `scheduleHintWithLimits` 承诺扁平 5 分钟；`:83/:109-111` 等待文案 | 口径统一 + 新增策略区块与紧急放行文案（zh/en 成对） |
| `config/platforms.yaml` | `:93-100` id `tencent_video` 但 `name: 视频号` | 仅加注释澄清（不改 id，避免迁移面） |

---

## 3. 数据模型与校验

### 3.1 新增表 `publish_daily_count`

```sql
CREATE TABLE IF NOT EXISTS publish_daily_count (
  owner_subject TEXT NOT NULL,
  key           TEXT NOT NULL,   -- 'platform:accountId' 或 'platform:*'
  day_key       TEXT NOT NULL,   -- 'YYYY-MM-DD'（本地自然日，见 §3.3）
  count         INTEGER NOT NULL DEFAULT 0,
  updated_at    INTEGER NOT NULL,
  PRIMARY KEY (owner_subject, key, day_key)
);
```

**为什么新表而不是扩展 `publish_timeline` 的 `value`**：`value` 现为 TEXT 且被守卫做算术强转（实测读回形如 `"1791381214186.0"`，`store-owner-isolation.test.js:364` 把读回钉成字符串 `'100'`）。改成 JSON 会同时污染「最后一次提交时间」的消费者与既有断言；新表是纯增量，存量行零迁移。

**读回兼容**：`count` 列在 SQLite 中是 INTEGER 亲和，但既有库出现过 TEXT 亲和导致带回 `.0` 的先例。守卫读回一律 `Number.parseInt(String(v), 10) || 0`，非有限值按 0 处理**并出声告警**（不得静默当 0 —— 与 `parseEnvInterval` 同纪律）。

### 3.2 `publish_timeline` 语义不变

键仍为 `platform:accountId` 与 `platform:*`，值仍为最后一次**提交**时间戳（ms）。本方案不改其形状、不加列。

### 3.3 自然日定义（必须写死）

- `day_key` = **本地时区的自然日**，格式 `YYYY-MM-DD`。
- 判定函数由守卫注入：`today: () => string`，默认实现 `new Date().toLocaleDateString('sv-SE')`（`sv-SE` 即 ISO `YYYY-MM-DD`，避免手写补零）。
- **不用 UTC**：运营的「今天」是本地日；用 UTC 会让北京时间 00:00–08:00 的发布被算进前一天。
- 跨时区/跨日边界必须有测试：TZ 注入 + 23:59:59 → 00:00:01 两个 `day_key` 独立计数。
- `MP_PUBLISH_QUOTA_TZ` **不提供**（避免引入第二个时区真源）；如需可按本地日重算。

### 3.4 输入校验表（每个可配置项的契约）

| 配置项 | 来源 | 合法域 | 非法/越界行为 |
|---|---|---|---|
| `MP_PUBLISH_MIN_INTERVAL_MS` | env | `>=0` 有限数；`0` = 显式关闭账号档；`undefined` = 用策略表 | 空白/非有限数/负数 ⇒ 回落策略表 **并 warn 一次** |
| `MP_PUBLISH_PLATFORM_MIN_INTERVAL_MS` | env | 同上（`0` = 关闭平台档，**v2 默认即 0**） | 同上 |
| `MP_PUBLISH_ACCOUNT_DAILY_MAX` | env（新） | `>=0` 整数；`0` = 关闭日配额；`undefined` = 用策略表 | 非整数（含 `"5.5"`）/负数/空白 ⇒ 回落**并 warn**；`"5"` 视为 5 |
| `MP_PUBLISH_JITTER_RATIO` | env（新） | `[0, 1)` 有限数；`0` = 关闭抖动（回归等价旧行为） | 越界/非法 ⇒ 回落默认 `0.4` **并 warn** |
| 账号级覆盖（设置页） | `store.getSetting`（新键 `publishFrequencyPolicy`） | 对象，字段逐个走同一套校验 | 任一字段非法 ⇒ **整个覆盖对象丢弃**并 warn（不部分生效，避免半生效态） |
| 紧急放行 | IPC `publish:emergencyRelease` | `{platform, accountId}`，平台必须是已登记平台且 `isSafePathSegment(accountId)` | 校验失败 ⇒ `EC.VALIDATION_ERROR`，不落审计 |

**关键纪律**：所有回落都必须**出声**（warn），禁止静默把「配置写错」变成「关掉门禁」。

---

## 4. 策略表 v2

### 4.1 数值（P2-1 下调 + P1-2 新增日配额）

| 组 | 平台 | 账号档 | 平台档 | 日配额/账号 |
|---|---|---|---|---|
| 长文低频 | wechat_mp, zhihu, baijiahao, toutiao | **20 分钟**（原 60） | **0（关）**（原 5） | **3 条/天** |
| 短视频 / 图文社区 | douyin, kuaishou, tencent_video, xiaohongshu, bilibili, youtube, tiktok, instagram, facebook | **10 分钟**（原 30） | **0（关）**（原 3） | **5 条/天** |
| 短内容高频容忍 | weibo, twitter | **3 分钟**（原 10） | **0（关）**（原 1） | **20 条/天** |
| 未登记平台（回落） | 任意未知 | **20 分钟** | **0（关）** | **3 条/天**（最严档） |

### 4.2 每个数字的依据与自认的弱点（评审请重点打这里）

| 数字 | 依据 | 弱点（自认） |
|---|---|---|
| 账号档 20 / 10 / 3 分钟 | 微博官方发博 **30 次/小时** ≈ 2 分钟/条，取 1.5–10 倍余量 | **没有任何平台给出分钟级下限**；这是「比官方速率更保守」的工程取值，不是平台要求 |
| 日配额 3 / 5 / 20 | 长文：微信订阅号群发硬限 **1 条/天**（本工具走「发布」而非「群发」，故不直接套用）；短视频：第三方经验「抖音 2–4 条/天」；短内容：微博官方 **100 条/天** 的 1/5 | 3 / 5 / 20 是**工程保守起点**，不是运营确认过的数字。本方案提供 env + 设置页双覆盖，并**要求运营在设置页确认后才视为定稿** |
| 平台档默认 0 | 公开资料零依据 + 本机每平台 1 账号 ⇒ 实测空转 | 若未来同平台多账号（机构号矩阵），设备/IP 级风险确实存在；故保留显式开关而非删除字段 |
| 抖动 `[1, 1+0.4)` | 同仓 `batch-rate-controller.js:5-9` 先例 + 微博官方「非用户主动行为」口径 | 抖动让**平均**等待变长（×1.2），吞吐进一步下降；这是「更像人」的代价，需要在 PRD 里写明 |

### 4.3 抖动方向：只增不减

`wait = remainingMs × (1 + ratio × rand)`，`rand ∈ [0,1)`。
**只增加等待，绝不减少**——否则抖动会变成绕过门禁的通道。`ratio=0` 时严格退化为现值（保证既有测试与既有行为可回归）。

---

## 5. 守卫 v2（`publish-interval-guard.js`）

### 5.1 API

```js
new PublishIntervalGuard({
  policy,        // (platform) => {accountMinMs, platformMinMs, accountDailyMax}
  store,         // { get(key), set(key, value) }        —— 提交时间（不变）
  dailyStore,    // { getDay(key, dayKey), incrDay(key, dayKey) } —— 新增
  now,           // () => number                        —— 不变
  today,         // () => 'YYYY-MM-DD'                  —— 新增，默认本地日
  random,        // () => [0,1)                         —— 新增，默认 Math.random（可注入）
  jitterRatio,   // number                             —— 新增，默认 0.4
})
```

### 5.2 `check(platform, accountId)` 返回形状（向后兼容 + 新增字段）

```js
{
  allowed: boolean,
  remainingMs: number,          // 已含抖动；bucket 为 'daily' 时为 0
  bucket: 'account' | 'platform' | 'daily' | null,   // 新增 'daily'
  reason: null | 'interval' | 'daily_quota',          // 新增，便于下游区分
  daily: { used: number, max: number, dayKey: string } | null,  // 新增
}
```

**兼容性**：既有消费者只读 `allowed` / `remainingMs` / `bucket`，新增字段不影响；`bucket` 的取值域扩展需要同步 `publish-progress-events.js` 的投影白名单与 `PublishProgressTaskRow.vue` 的归因文案（**穷尽性审计：4 处投影面**，见上游记录 §QM-6 W1）。

### 5.3 判定顺序与「更严者胜」

1. 账号档 `remaining`（若 `accountMinMs > 0`）；
2. 平台档 `remaining`（若 `platformMinMs > 0`，v2 默认 0 ⇒ 跳过）；
3. 日配额：`used >= max` ⇒ `allowed=false`，`bucket='daily'`，`remainingMs=0`（**日配额不是「等一会儿」而是「今天到此为止」**）。

取 1/2 中更大者；日配额是**独立否决项**，与间隔二者任一不满足即 `allowed=false`。
当同时命中间隔与日配额时，`bucket` 取**日配额**（它是更强的约束，且用户可行动性不同：间隔是等待，配额是改期）。

### 5.4 `recordPublish(platform, accountId, at)` 语义变更

```
set(accountKey, at)            // 不变
set(platformKey, at)           // 不变（默认关档时仍写，开档即生效，避免「开了档没历史」）
incrDay(accountKey, today)     // 新增：仅账号档计数
incrDay(platformKey, today)    // 新增：平台档计数（跨账号汇总，供未来设备级分析）
```

**为什么平台档也计数**：默认关档时它不影响判定，但保留计数使「事后开启平台档」有历史可依；成本是一行 upsert。

### 5.5 `release(platform, accountId, at)`（新增，P0-1 的核心）

回滚一次**已发生但未提交到平台**的占位：

```
if (store.get(accountKey) === at) set(accountKey, previousAccountAt ?? null)
if (store.get(platformKey) === at) set(platformKey, previousPlatformAt ?? null)
decrDay(accountKey, today)     // 计数回退 1，下限 0
decrDay(platformKey, today)
```

**幂等与并发纪律**：
- `release` 只在 `store.get(key) === at` 时回滚（**乐观并发**：若窗口已被后续提交覆盖，则不回滚——回滚别人的窗口比多等一会儿危险得多）。
- `previousAt` 必须由**占位时返回**：`recordPublish` 返回 `{accountPrev, platformPrev, at}`，调用方保存并在 release 时回传；不提供就把该键**置 null**（等价于清除间隔），这是可接受的保守选择还是不可接受的放宽？→ **本方案选择：调用方必须回传 prev；未回传则 release 为 no-op 并 warn**（宁可多等，不可放宽）。
- `decrDay` 下限 0；`store` 不可用时 release 为 no-op + warn，**绝不抛**（失败路径上抛错会把原错误吞掉）。

### 5.6 未登记平台出声（P2-3）

`resolveIntervals` 命中 `BASELINE_INTERVALS` 时，通过注入的 `warn` 输出**一次**（按平台记忆，进程内 Set 去重）：

```
[PublishFrequency] 平台 "xxx" 未登记频率策略，回落最严基线（账号 20 分钟 / 日配额 3 条）；请登记到 PLATFORM_FREQUENCY_POLICY
```

---

## 6. TaskQueue v2

### 6.1 「是否已提交」的判据（P0-1 的正确性核心）

**唯一真源是抛出的错误对象上的 `notSubmitted === true`**，**不是**错误文案匹配。

置位场景（白名单，逐个落实到具体抛错点）：

| 场景 | 现状抛错点 | 是否 `notSubmitted` |
|---|---|---|
| 风控挂起（`RiskSuspendedError`） | `risk-suspender-store.js`（已带 `noRetry`） | **是** |
| 登录态失效/需要重登 | 发布器服务层 | **是** |
| 任务级参数校验失败（缺 media/路径） | `ipc-handlers/publish.js` 前置校验 | **是** |
| 权益/套餐拒绝（`ENTITLEMENT_*`） | `error-codes.js` 语义 | **是** |
| 执行器在**开始提交前**抛错（`task.startedAt` 后立即抛，无任何平台请求） | `_runTask` 的 `!this._executor` 分支 | **是** |
| 超时 | `task-queue.js:563` | **否**（可能已提交） |
| 网络中断/平台返回非预期 | 发布器/适配器 | **否** |
| 任何未显式标记的错误 | —— | **否**（默认保守） |

**默认必须是「占窗口」**：白名单之外一律不回滚（fail-closed 与现状一致）。

### 6.2 执行流程（v2）

```
_executeTask(task)
  ├─ guard.check(platform, accountId)
  │    ├─ !allowed(bucket='daily')  → status=pending + publish:blocked(reason='daily_quota')
  │    │                              + 不设 setTimeout 重排（跨日才可能放行）
  │    │                              + 重排策略：算到「次日 00:00:05」的 ms 后重排（见 §6.4）
  │    └─ !allowed(bucket='account'|'platform') → 现状逻辑（setTimeout remainingMs 重排）
  ├─ hold = guard.recordPublish(platform, accountId)   // 返回 {at, accountPrev, platformPrev}
  ├─ try { await executor }
  ├─ catch (e)
  │    ├─ if (e.notSubmitted === true) guard.release(platform, accountId, hold)  // ★ P0-1
  │    └─ 现状重试/失败逻辑
  └─ finally { 通道释放 + _processNext }
```

**顺序纪律**：`release` 必须在**通道释放之前**、且必须在 `_saveState()` 之前完成（否则崩溃恢复会把已释放的窗口当成占用）。

### 6.3 重试放行（P0-2）

- 自动重试（`:587-597`）与手动重试（`:240-262`）都经 `add()` → `_executeTask` → 守卫，**P0-1 落地后自然受益**，无需额外分支。
- 额外补充：`task.lastAttemptNotSubmitted === true` 且 `now - lastAttemptAt >= min(RELEASE_GRACE_MS, interval)` 时，`check()` 对该任务放行一次。`RELEASE_GRACE_MS` 默认 **60 000**（1 分钟），env `MP_PUBLISH_RELEASE_GRACE_MS` 可覆盖。
- 放行必须**可观测**：新增 `publish:released` 事件（字段 `{task, platform, accountId, reason:'not_submitted_retry', graceMs}`），经既有投影链到进度面板（文案见 §9）。

### 6.4 日配额用尽的排队语义

- 日配额用尽是**跨日**约束，不能用 `remainingMs`（可能要等十几小时）。
- 重排时刻 = 次日 `00:00:05`（5 秒余量避开边界），`setTimeout` 上限：若 ms 超过 `2^31-1`（约 24.8 天）则**不设定时器**，改为标 `pending` 并写 `publish:blocked(reason='daily_quota')`，由下一次用户操作或应用启动时的 `_processNext` 重新判定。
- **`unref()` 必须调用**（沿用既有 R28/R37 纪律）。
- 用户在界面上看到的是「今日已达上限（3/3），将于明日 00:00 后自动继续」+ 取消按钮（§9）。

---

## 7. 装配与配置（桌面端）

### 7.1 `container.setup.js`

```js
container.register("publishIntervalGuard", function (c) {
  const s = c.get("store");
  const overrides = resolvePolicyOverrides(s);        // 读 store 设置 + env，逐个校验
  return new PublishIntervalGuard({
    policy: (platform) => resolvePublishIntervals(platform, { overrides, warn: logger.warn }),
    store: { get: (k) => s.getPublishTimeline(k), set: (k, v) => s.setPublishTimeline(k, v) },
    dailyStore: { getDay: (k, d) => s.getPublishDailyCount(k, d), incrDay: (k, d) => s.incrPublishDailyCount(k, d), decrDay: (k, d) => s.decrPublishDailyCount(k, d) },
    jitterRatio: overrides.jitterRatio,
  });
});
```

**装配锁（新增 3 条断言）**：
1. `taskQueue._publishIntervalGuard === container.get('publishIntervalGuard')`（既有）；
2. 守卫的 `dailyStore` 三个方法均为函数（**摘掉日配额注入即红**）；
3. `guard.check()` 在 `dailyStore` 返回 `used=max` 时给出 `bucket='daily'`（**行为锁，不是结构锁**）。

### 7.2 环境变量清单（v2 全集）

| 变量 | 默认 | 语义 |
|---|---|---|
| `MP_PUBLISH_MIN_INTERVAL_MS` | 策略表 | 账号档覆盖；`0`=关 |
| `MP_PUBLISH_PLATFORM_MIN_INTERVAL_MS` | **0** | 平台档覆盖；`0`=关（v2 默认） |
| `MP_PUBLISH_ACCOUNT_DAILY_MAX` | 策略表 | 日配额覆盖；`0`=关 |
| `MP_PUBLISH_JITTER_RATIO` | `0.4` | 抖动比例；`0`=关 |
| `MP_PUBLISH_RELEASE_GRACE_MS` | `60000` | 未提交失败的重试宽限 |
| `MP_PUBLISH_EMERGENCY_MAX_PER_DAY` | `1` | 紧急放行每日次数上限 |

**非法值一律回落 + 出声**；`0` 是显式关闭，空白值不算 `0`。

---

## 8. 交互逻辑

### 8.1 主流程（用户点「一键发布」）

```
用户选择 N 个 (平台,账号) 目标 → 提交
  ↓
每个目标 add() 入队（现状不变）
  ↓
_processNext（并发上限 3）
  ├─ 守卫判定通过 → 记账 → 执行 → 成功/失败
  ├─ 间隔未到 → publish:blocked(remainingMs, bucket) → 进度面板显示「等待 N 分钟后重试（本账号间隔）」
  └─ 日配额用尽 → publish:blocked(reason='daily_quota') → 显示「今日已达上限（3/3），将于明日 00:00 后自动继续」
```

### 8.2 失败回滚（P0-1 的用户可见差异）

| 失败类型 | 用户看到 | 后续 |
|---|---|---|
| 未提交（登录失效等） | 失败卡片 + 「未提交到平台，可立即重试」 | 窗口已回滚 ⇒ 点重试立刻可发 |
| 已提交后失败/超时 | 失败卡片 + 「已提交，需等待 N 分钟后重试」 | 窗口保留（防重复发布） |

**这是本方案最重要的用户可见改进**：把「等 30 分钟」和「立刻重试」区分开，且依据是机器判定的 `notSubmitted`，不是文案猜测。

### 8.3 紧急放行（P2-2）

入口：设置页「发布频率策略」区块 → 「立即解除本账号等待」按钮（**仅在存在进行中的等待时可用**）。

交互：二次确认弹窗 → 确认后：
1. 主进程校验（平台格式、`accountId` 格式、当日次数上限）；
2. `guard.release(platform, accountId, hold)`（若任务正在等待，需先取消其 `setTimeout` 并重新入队）；
3. 写审计：`{ at, platform, accountId, operator: owner_subject, reason: 用户输入(选填，<=200 字) }` 落 `store`（新键 `publishEmergencyAudit`，环形上限 200 条）；
4. 广播 `publish:emergencyReleased` → 进度面板与设置页同步刷新；
5. **结果如实回显**：成功/被上限拒绝/无等待中的窗口，三种都要有明确文案（不得静默）。

---

## 9. 显示项与提示文字（zh/en 成对）

新增/修改的 locale 键（`apps/desktop/src/locales/publish-page/{zh,en}.js` 与 `settings/{zh,en}.js`）：

| key | zh | en |
|---|---|---|
| `publishPage.progress.blockedDailyQuota` | `今日已达上限（{used}/{max}），将于明日 00:00 后自动继续` | `Daily limit reached ({used}/{max}); will resume after 00:00 tomorrow` |
| `publishPage.progress.blockedBucketDaily` | `（本账号每日上限）` | `(account daily limit)` |
| `publishPage.progress.releasedNotSubmitted` | `未提交到平台，已恢复可发布` | `Not submitted to the platform; publish window restored` |
| `publishPage.progress.failedNotSubmittedHint` | `未提交到平台，可立即重试` | `Not submitted; you can retry immediately` |
| `publishPage.progress.failedSubmittedHint` | `已提交到平台，需等待约 {minutes} 分钟后重试` | `Submitted; retry in about {minutes} min` |
| `publishPage.scheduleHintWithLimits`（**改**） | `留空 = 立即发布；可排期未来 {maxDays} 天内。实际发布节奏按「发布频率策略」执行（表单仅做基础校验）` | `Leave empty to publish now; schedule within {maxDays} days. Actual pacing follows the Publish Frequency Policy (the form only does basic validation)` |
| `settings.publishFrequency.title` | `发布频率策略` | `Publish Frequency Policy` |
| `settings.publishFrequency.accountInterval` | `同账号最小间隔` | `Min interval per account` |
| `settings.publishFrequency.dailyMax` | `每账号每日上限` | `Daily limit per account` |
| `settings.publishFrequency.platformTierOn` | `启用同平台跨账号间隔` | `Enable cross-account platform interval` |
| `settings.publishFrequency.jitterOn` | `加入随机抖动（更像人工节奏）` | `Add random jitter (more human-like pacing)` |
| `settings.publishFrequency.jitterHint` | `开启后实际等待会比标称值长 0–40%，总吞吐略降` | `Enabling lengthens waits by 0–40%; overall throughput drops slightly` |
| `settings.publishFrequency.emergency` | `立即解除本账号等待` | `Release this account's wait now` |
| `settings.publishFrequency.emergencyConfirm` | `本次将跳过等待直接进入发布队列，操作会记入审计。确认继续？` | `This skips the wait and enqueues immediately; the action is audited. Continue?` |
| `settings.publishFrequency.emergencyExhausted` | `今日紧急放行次数已用尽（{max} 次/天）` | `Daily emergency releases exhausted ({max}/day)` |
| `settings.publishFrequency.emergencyNoWait` | `当前没有等待中的窗口` | `No pending wait window` |
| `settings.publishFrequency.currentTier` | `当前档位：账号 {accountMinutes} 分钟 / 每日 {dailyMax} 条` | `Current: {accountMinutes} min per account / {dailyMax} per day` |

**i18n 纪律**：zh/en 必须成对提交（CI Gate 7）；渲染端非 locales 文件不得新增中文字面量（CJK 基线扫描）。

---

## 10. 可观测与审计

- **事件**：`publish:blocked`（扩展 `reason`、`daily`）、新增 `publish:released`、新增 `publish:emergencyReleased`；投影面**穷尽清单 5 处**（`phase4-events` → `publish-progress-events` 白名单 → `publishProgress` store → `PublishProgressTaskRow.vue` → `publish-progress-events` 的 `emitPhaseNotify`）。
- **日志**：守卫在 release / 日配额否决 / 未登记回落 / 非法配置四处出声；**禁止记录内容标题等用户文本**（沿用既有脱敏纪律）。
- **审计**：紧急放行写 `publishEmergencyAudit`（环形 200 条）；同时 `log.notify` 一条 INFO。
- **排查入口**：`publish_timeline`（最后提交） + `publish_daily_count`（当日计数）两表即可复现任意一次判定。

---

## 11. 测试计划（TDD）

### 11.1 单元（`packages/shared-utils/tests/`）

| 文件 | 新增用例（要点） |
|---|---|
| `publish-frequency-policy.test.js` | 新数值表；`accountDailyMax` 回落；`MP_PUBLISH_ACCOUNT_DAILY_MAX` 合法/非法/`0`；`MP_PUBLISH_JITTER_RATIO` 合法/越界/`0`；未登记平台 warn **恰好一次** |
| `publish-interval-guard.test.js` | 抖动区间 `[interval, interval×1.4)`；`jitterRatio=0` 退化等价旧值；`bucket='daily'`；`reason` 精确值；`release` 幂等；**prev 未回传 ⇒ no-op + warn**；**窗口已被覆盖 ⇒ 不回滚**；跨日边界（23:59:59 → 00:00:01）；`dailyStore` 读回字符串 `'3'`/`'3.0'`/`'abc'` 三态 |
| `task-queue-guard-integration.test.js` | `notSubmitted` 失败 ⇒ 窗口回滚 ⇒ 立即重发成功；**已提交失败 ⇒ 窗口保留**（既有用例不得放宽）；重试宽限放行；日配额用尽 ⇒ 不设长定时器 + `blocked` 事件；`publish:released` 字段精确 |

### 11.2 桌面主进程（`apps/desktop/electron/`）

| 文件 | 要点 |
|---|---|
| `core/container.setup.test.js` | 装配锁 3 条（含 `dailyStore` 三方法存在 + 注入） |
| `services/store.test.js` | 新表 CRUD、owner 隔离、并发 upsert、`decrDay` 下限 0 |
| `ipc-handlers/publish.test.js` | `publish:emergencyRelease` 三种结果文案 + 审计落盘 + 上限 |
| `bootstrap/phase4-events.test.js` | 新事件透传与投影白名单（含 `reason`/`daily`） |

### 11.3 渲染层（`apps/desktop/src/`）

| 文件 | 要点 |
|---|---|
| `components/PublishProgressTaskRow` 用例 | 日配额文案、`released` 文案、归因标签三态（account/platform/daily），字段缺席**不渲染**标签 |
| `views/settings` 用例 | 策略区块渲染、覆盖保存回滚、紧急放行二次确认与三种结果 |

### 11.4 变异反证（每条先跑基线证明绿，再变异证明**恰好那一条**红）

| # | 变异 | 预期变红的锁 |
|---|---|---|
| M1 | 摘掉 `notSubmitted` 回滚 | 「未提交失败窗口回滚」 |
| M2 | 把「已提交失败」也回滚 | 「已提交失败仍占窗口」 |
| M3 | `release` 去掉 `prev` 一致性检查 | 「窗口已被覆盖时不回滚」 |
| M4 | 抖动改成 `[1-ratio, 1+ratio)` | 「抖动只增不减」 |
| M5 | 日配额判定移除 | 「日配额用尽被否决」 |
| M6 | `decrDay` 去掉下限 0 | 「计数下限 0」 |
| M7 | 摘掉 `dailyStore` 注入 | 装配锁 2 |
| M8 | 未登记平台 warn 改成静默 | 「未登记出声一次」 |
| M9 | `platformMinMs` 默认改回非 0 | 「平台档默认关」 |
| M10 | 紧急放行去掉次数上限 | 「紧急放行上限」 |

### 11.5 回归面（必须全跑，不是抽样）

- `packages/shared-utils` 全量（策略/守卫/队列/装配集成）。
- 桌面：`src/stores/**`、`PublishProgress*` 组件、`phase4-events`、`publish-progress-events`、`container.setup`、`store`、`ipc-handlers/publish`。
- QM-1 打包 + asar 清单 + require 链 + 启动 8s（含 stderr 捕获）。
- QM-4 视觉：进度面板与设置页均有像素基线时按门禁跑；无基线时以 DOM 行为锁承担并如实记录。

---

## 12. 迁移与兼容

| 项 | 处理 |
|---|---|
| `publish_timeline` 存量行 | **不动**。旧值语义（最后提交时间）不变 |
| 新表 `publish_daily_count` | `CREATE TABLE IF NOT EXISTS`（走既有 store 迁移链），无历史数据 ⇒ 计数从 0 开始（首次发布当天即受配额约束） |
| 既有测试「同平台换号被平台档拦截」 | **必须改写**为「默认不拦截 / 开启后拦截」两侧断言，并在 PR 说明里标注这是**产品决策变更**而非放宽 |
| 既有测试「无 accountId 仍受平台档约束」 | 平台档默认关 ⇒ 该用例改为「开启平台档时仍受约束」 |
| 既有测试「minInterval 兼容模式两档同值」 | 不变（`minInterval` 覆盖仍强制两档同值） |
| env 语义 | `MP_PUBLISH_PLATFORM_MIN_INTERVAL_MS` 默认由「策略表 5/3/1」变为 **0**；显式设置该变量恢复平台档 |

**风险**：把平台档默认关掉后，「同平台多账号」不再被节流。缓解：①设置页可一键开回；②PRD 写明适用场景（机构号矩阵建议开启）；③保留平台档计数，开启后立即有历史。

---

## 13. 分阶段落地（PR 切分）

| 阶段 | 内容 | 分支 | 风险 |
|---|---|---|---|
| A | shared-utils：策略 v2 + 守卫 v2（抖动/日配额/release）+ 队列 v2 | `publish-frequency-policy-v2` | 中（纯逻辑，测试充分） |
| B | 桌面：store 新表 + 装配 + IPC 紧急放行 + 渲染层 + locale | 同上分支的后续提交 | 中（跨主进程/渲染层） |
| C | `scripts/` 校准脚本 + config 注释 + `publish:wechat` 修 accountId | 同上 | 低 |

**决策**：A/B/C 合入**同一个 PR**（一个 feature 的完整闭环），但按 A→B→C 顺序提交，便于逐段 review 与回滚定位。

---

## 14. 验收标准

| # | 场景 | 预期 |
|---|---|---|
| A1 | 未提交失败后立即重试 | 不被守卫拦；`publish:released` 事件存在 |
| A2 | 已提交（超时）失败后重试 | 被拦满窗口；无 `release` |
| A3 | 同账号当日第 N+1 条 | `allowed=false`、`bucket='daily'`、不设长定时器 |
| A4 | 跨日 00:00 后 | 计数归零、可继续发布 |
| A5 | 抖动开启 100 次采样 | 所有等待 `∈ [base, base×1.4)`，均值明显 > base |
| A6 | 抖动关闭 | 等待严格等于旧值（与 v1 逐值对齐） |
| A7 | 同平台两账号（平台档关） | 第二条不等 3 分钟（仅受账号档与日配额约束） |
| A8 | 平台档显式开启 | 第二条被拦 `bucket='platform'` |
| A9 | 未登记平台 | 回落最严档 + warn 一次 |
| A10 | 非法 env（三种） | 各自回落 + warn，**不改变门禁行为** |
| A11 | 紧急放行 | 跳过等待、写审计、次日次数重置 |
| A12 | 紧急放行超上限 | 拒绝且有明确文案，队列状态不变 |
| A13 | 十项变异 | 各自**恰好**让指定锁变红（实跑留证） |
| A14 | QM-1 | 打包 rc=0、asar 含新表 DDL 与新策略文件、启动 8s stderr 无致命 |

---

## 15. 自认的弱点（请评审重点攻击）

1. **日配额数值 3/5/20 仍是工程拍板**，虽标注「待运营确认 + 可覆盖」，但默认值一旦生效就会影响真实运营。是否存在「默认即生效」与「未经确认不得生效」的取舍问题？
2. **`release` 的一致性方案依赖调用方回传 `prev`**，若 `task-queue` 与守卫之间被重构掉这个回传，会静默退化为 no-op（多等一会儿，方向安全但难以发现）。是否需要一条结构锁断言「`recordPublish` 的返回值必须被使用」？
3. **日配额用尽时的长定时器**：跨日等待可能长达十几小时，`unref()` + 应用重启后的恢复语义是否足够？（重启会重新 `_processNext`，但 `hold` 丢失。）
4. **抖动只增不减**会让平均吞吐下降约 20%，与「P2-1 数值下调」叠加后总吞吐可能下降 3 倍以上。是否应在设置页给出「吞吐预估」提示？
5. **平台档默认关**削弱了对「同平台多账号」的保护（设备/IP 风险），而调查报告承认这部分公开资料不足。默认关是否过于激进？是否应改为默认开但把值调到 1–3 分钟？
6. **紧急放行本身是一个绕过口**：每日 1 次的默认上限是否足够？审计只落本地，运营不可远程发现滥用。
7. **`publish:wechat` 补 `accountId`** 属于顺手修，但该路径在渲染层无生产调用方 —— 改它是否属于「扩大爆炸半径」？是否应只加注释标注为死路径？
8. **改动面**：shared-utils + store 迁移 + 主进程 + 渲染层 + locale + scripts，跨 6 个模块一个 PR，是否应拆成 2–3 个 PR？
