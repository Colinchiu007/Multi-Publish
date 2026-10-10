# PRD — 发布频率策略 v2（publish-frequency-policy-v2）

- 日期：2026-10-10
- 状态：**已通过跨家族对抗评审（cleared），待实现**
- 上游依据：`01-docs/INVESTIGATE-PUBLISH-FREQUENCY-STRICTNESS-2026-10-10.md`（PR #3253）
- 方案与评审：`01-docs/PLAN-PUBLISH-FREQUENCY-POLICY-V2-review-brief.md`（v4）+ `.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/`（两轮 critique + 三轮 rebuttal）
- OpenSpec：`openspec/changes/publish-frequency-policy-v2/`
- 取代关系：本文取代 `01-docs/PRD-PUBLISH-FREQUENCY-CONTROL-2026-10-02.md` 的 §4 数值表与 §3 功能清单中关于「只有最小间隔」的部分；后者其余内容（两档模型、单一真源、提交前记账的**原则**）继续有效

---

## 1. 背景

现行发布频率门禁（`publish-frequency-control`，PR #2773）在四个方向上被调查报告判定为「方向正确、刻度失当、维度缺失」：

| # | 问题 | 关键证据 |
|---|---|---|
| 1 | 未提交到平台的失败也吃掉整个间隔窗口 | 本机真实历史：bilibili 连续 3 次失败间隔恰为 **120.0 / 30.0 分钟**；自动重试（`task-queue.js:587-597`）与手动重试（`:240-262`）同走守卫 |
| 2 | 只有最小间隔、没有日配额 | 公开资料唯一有依据的维度是「条/天」（微信订阅号 1 条/天；微博发博 30 次/小时、100 次/天） |
| 3 | 零抖动，发布点落在精确整数边界 | 守卫与队列内 `Math.random` 命中 0；微博官方口径为「非用户主动行为频繁调用（即使未超过频次限制）」 |
| 4 | 跨账号平台档无依据且实测空转 | `backend-data/accounts.json` 每平台恰好 1 账号 ⇒ 恒被更严的账号档支配 |

## 2. 目标与非目标

### 2.1 目标

| ID | 目标 | 可验证判据 |
|---|---|---|
| G1 | 未提交到平台的失败不再惩罚窗口，且判定不可被获益方伪造 | 阶段判据 + 双标记 + 三条独立约束；M11/M12 变异各让指定锁红 |
| G2 | 补上账号级日配额维度 | 跨日计数、独立否决、跨日自动恢复；M5/M6 变异红 |
| G3 | 发布节奏不再呈现机器级等周期 | 抖动只增不减、区间可断言；M4 变异红 |
| G4 | 数值下调到仍远保守于官方速率的量级 | 策略表单一真源；M9 变异红 |
| G5 | 渲染层口径与运行期门禁统一，可查/可覆盖/可紧急放行 | 文案四态 + 设置页 + 紧急放行三态；M10 变异红 |

### 2.2 非目标

- 不做设备/IP 级全局串行（跨平台并发是核心用途）。
- 不做「成功才记账」（会引入重复发布）。
- **不声称符合任何平台官方规定**（沿用上游 PRD §2）。
- 不做跨环境审计溯源、不做跨设备配额同步。
- 不在本期修 `publish:wechat` 的任务级 `accountId` 缺口（另立变更）。

## 3. 术语与口径（写死，避免歧义）

| 术语 | 定义 |
|---|---|
| **提交（submit）** | 传输层向平台发起**首次平台写操作尝试**的动作 |
| **已提交（submitted）** | 平台**已确认发出**（收到响应或等价确认） |
| **未提交失败** | `submitAttempted === false`，或传输层显式声明 `definitelyNotSent === true` |
| **窗口（window）** | 某个 `(platform, accountId)` 的「上次提交时刻」占位，存 SQLite `publish_timeline` |
| **本机运营日** | 本机时区自然日 `YYYY-MM-DD`；**不与平台日界换算，也不声称等价** |
| **回滚（release）** | 撤销一次**未提交**尝试所占的窗口与配额计数 |

## 4. 功能清单

| 优先级 | 功能 | 说明 |
|---|---|---|
| P0 | 阶段判据与双标记 | `submitAttempted` / `submittedAt` 由传输层打点；回滚仅在确证未送出时发生 |
| P0 | 未提交失败回滚 | 回滚窗口 + 配额回补（幂等）+ 回滚计数递增 |
| P0 | 重试放行 | 自动/手动重试走同一路径；满足最小退避即放行并发 `publish:released` |
| P1 | 账号级日配额 | 独立否决项；跨日自动恢复；超限不占用短定时器 |
| P1 | 间隔抖动 | 只增不减；可注入随机源；`ratio=0` 退化旧行为 |
| P1 | 防风约束 | 最小退避 10 s + 每账号每日回滚上限 + 回滚计数只增 |
| P1 | 未登记平台出声 | 回落最严档 + 每平台告警一次 |
| P2 | 数值下调与平台档定位 | 见 §5 |
| P2 | 渲染层口径统一 | 去承诺化提示 + 四态文案 + 三态归因 |
| P2 | 设置页策略区块 | 当前档位、实际间隔区间、日配额、回滚失效计数；可覆盖 |
| P2 | 一次性紧急放行 | 二次确认 + 每日上限 + 冷却 + 追加式审计 + 三态回显 |
| P2 | 校准基础设施 | 口径定义 + 可复现取数脚本 |
| P2 | 命名澄清 | `config/platforms.yaml` 的 `tencent_video` 注释 |

## 5. 策略表与数值依据

| tier | 平台 | 账号档 | 平台档 | 日配额 |
|---|---|---|---|---|
| `long` | wechat_mp, zhihu, baijiahao, toutiao | 20 分钟（原 60） | 2 分钟（原 5） | 3 条/天 |
| `clip` | douyin, kuaishou, tencent_video, xiaohongshu, bilibili, youtube, tiktok, instagram, facebook | 10 分钟（原 30） | 2 分钟（原 3） | 5 条/天 |
| `short` | weibo, twitter | 3 分钟（原 10） | 2 分钟（原 1） | 20 条/天 |
| 未登记回落 | 任意未知 | 20 分钟 | 2 分钟 | 3 条/天 |

**依据与自认弱点（公开资料没有分钟级下限，取值是「比官方速率更保守」的工程判断）**

| 数字 | 依据 | 弱点 |
|---|---|---|
| 账号档 20 / 10 / 3 | 微博官方发博 30 次/小时 ≈ 2 分钟/条，取 1.5–10 倍余量 | 无平台给出分钟级下限；本项目**不声称**符合官方规定 |
| 平台档 2 分钟 | 保留同平台多账号的近似设备级保护；相对 v1 的 3–5 分钟降到 40–67% | 公开资料零依据；**这是对调查报告 P1-1「默认关」的显式偏离**（理由见 §5.1） |
| 日配额 3 / 5 / 20 | 长文参照微信订阅号 1 条/天（本工具走「发布」而非「群发」，故不直接套用）；短视频参照第三方经验「抖音 2–4 条/天」；短内容取微博官方 100 条/天的 1/5 | **工程保守起点，非运营确认值**；env 与设置页双覆盖，设置页显式标注「待确认」 |

### 5.1 对调查报告 P1-1 的显式偏离

调查报告建议「跨账号平台档**默认关**」。本期改为 **默认开 2 分钟**：

1. 两轮跨家族评审各自独立指出「默认关会削弱同平台多账号（机构号矩阵）的共档保护」；
2. 成本有界：**1 账号/平台时该档完全惰性**（账号档 3–20 分钟恒严于 2 分钟）；
3. 它保留本项目唯一一条**设备/IP 邻域**保护（设备级串行明确不做）；
4. 相对 v1 已把代价降到 40–67%。

**代价**：同平台多账号时第二个账号需等约 2 分钟。**适用建议**：机构号矩阵用户建议保持默认；单人单号用户可显式设为 0 关闭。

## 6. 数据模型与迁移

### 6.1 新增表

```sql
CREATE TABLE IF NOT EXISTS publish_daily_count (
  owner_subject  TEXT NOT NULL,
  key            TEXT NOT NULL,   -- 'platform:accountId'（percent-encoded）
  day_key        TEXT NOT NULL,   -- 'YYYY-MM-DD'（本机运营日）
  count          INTEGER NOT NULL DEFAULT 0,   -- 已实际提交到平台的次数
  rollback_count INTEGER NOT NULL DEFAULT 0,   -- 回滚尝试次数，只增不减
  updated_at     INTEGER NOT NULL,
  PRIMARY KEY (owner_subject, key, day_key)
);
CREATE INDEX IF NOT EXISTS idx_daily_owner_key ON publish_daily_count(owner_subject, key);
```

**两个计数器的语义分离**（回应评审「双重计费」指控）：
- `count` = 平台负载代理量 ⇒ 未提交回滚**幂等回补**；
- `rollback_count` = 滥用面代理量 ⇒ **只增不减**，用于回滚上限。

### 6.2 迁移

| 项 | 处理 |
|---|---|
| `publish_timeline` 存量行 | **不动**（列 `last_publish_at TEXT`，语义不变） |
| 新表 | `CREATE TABLE IF NOT EXISTS`；`store-schema.js` 七处注册表同步登记（`TABLE_NAMES` / `OWNER_TABLE_SCHEMA_SQL` / `OWNER_INDEX_SQL` / `SCHEMA_SQL` / `OWNER_TABLE_COLUMNS` / `OWNER_TABLE_KEY_COLUMNS` / `OWNER_COLUMN_DEFAULTS`），缺一即 owner 隔离重建判定异常 |
| 无历史数据 | 计数从 0 起，当天即受配额约束 |
| 在途任务 | 新数值在**每轮 `check()`** 读取 ⇒ 即时生效；入队时旧值、执行时新值按新值判定 |

## 7. 数据校验

### 7.1 环境变量

| 变量 | 合法域 | `0` 的语义 | 非法/越界行为 |
|---|---|---|---|
| `MP_PUBLISH_MIN_INTERVAL_MS` | `[0, 7 天]` 有限数 | 关闭账号档 | 回落策略表 + warn；越界钳到 7 天 + warn |
| `MP_PUBLISH_PLATFORM_MIN_INTERVAL_MS` | `[0, 7 天]` | 关闭平台档 | 同上 |
| `MP_PUBLISH_DAILY_MAX_LONG` | `>=0` 整数 | 关闭 `long` 档配额 | 非整数（含 `"5.5"`）/负数/空白 ⇒ 回落 + warn |
| `MP_PUBLISH_DAILY_MAX_CLIP` | 同上 | 关闭 `clip` 档配额 | 同上 |
| `MP_PUBLISH_DAILY_MAX_SHORT` | 同上 | 关闭 `short` 档配额 | 同上 |
| `MP_PUBLISH_ACCOUNT_DAILY_MAX` | `>=0` 整数 | 关闭全部配额 | 设置该项 ⇒**覆盖三档为同值** |
| `MP_PUBLISH_JITTER_RATIO` | `[0, 1)` 有限数 | 关闭抖动 | 越界 ⇒ 回落默认 `0.4` + warn |
| `MP_PUBLISH_RELEASE_GRACE_MS` | `[10 000, 24 h]` 整数 | —（无关闭语义） | 低于下界钳到 10 s + warn |
| `MP_PUBLISH_EMERGENCY_MAX_PER_DAY` | `[0, 10]` 整数 | 关闭紧急放行 | 越界 ⇒ 回落默认 `1` + warn |

**统一纪律**：非法、越界、**空白**一律回落默认**并出声**（warn）；`0` 是**显式关闭**，不等于空白。

### 7.2 设置页覆盖对象

- 存储键：`publishFrequencyPolicy`（`store.getSetting`）。
- 结构：`{ accountMinMs?, platformMinMs?, dailyMaxLong?, dailyMaxClip?, dailyMaxShort?, jitterRatio?, emergencyMaxPerDay? }`。
- **任一字段非法 ⇒ 整个覆盖对象丢弃 + warn**（不允许部分生效，避免半生效态）。

### 7.3 key 构造（防注入与碰撞）

- 唯一构造函数 `buildKey(platform, accountId)`：两段分别 `encodeURIComponent` 后以 `:` 连接；`accountId` 缺席时用哨兵 `*`。
- 守卫与 store **禁止字符串拼接**（I8）。
- 紧急放行 IPC 输入面另用 `isSafePathSegment` 校验平台与账号格式（两层防御）。

### 7.4 计数读回

- 一律 `Number.parseInt(String(v), 10)`；非有限（`NaN`）⇒ 0 **并出声**。
- 历史先例：SQLite TEXT 亲和会让读回值形如 `'3.0'`，`parseInt` 归一为 3。

## 8. 功能逻辑

### 8.1 判定顺序与合并公式

```
check(platform, accountId):
  accountRemaining  = 有 accountId 且账号档 > 0 ? 剩余(accountKey, 账号档) : 0
  platformRemaining = 平台档 > 0               ? 剩余(platformKey, 平台档) : 0
  intervalRemaining = max(accountRemaining, platformRemaining)   ← 两档取更严
  dailyVeto         = dailyMax > 0 && used >= dailyMax

  dailyVeto ⇒ { allowed:false, remainingMs:0, bucket:'daily', reason:'daily_quota', daily:{used,max,dayKey} }
  intervalRemaining > 0 ⇒ { allowed:false, remainingMs: jitter(intervalRemaining), bucket: 更大的那档, reason:'interval' }
  否则    ⇒ { allowed:true,  remainingMs: 0, bucket: null, reason: null, daily:{...} }
```

**抖动**：`jitter(x) = min(round(x × (1 + ratio × random())), 2³¹−2 000)`。`ratio=0` ⇒ `jitter(x) === x`。

### 8.2 记账与回滚（核心）

```
hold = guard.recordPublish(platform, accountId)
      → { at, accountPrev, platformPrev, dailyPrev }
task._hold = hold                      // 必须保存（结构锁断言被消费）

执行失败时：
  rollbackable =
      (task.submitAttempted === false)                  // 从未发起写尝试
   || (e.definitelyNotSent === true)                    // 传输层确证未送出
  且 (e.notSubmitted !== true || <上述成立>)             // 佐证位不得与之矛盾
  且 (rollbackToday(accountKey) < max(2, dailyMax))     // 防风上限

  成立 ⇒ guard.release(platform, accountId, hold)
  否则 ⇒ 占窗口（现状不变）
```

`release()` 语义：
1. `store.get(key) === hold.at` 才回滚该键（否则不动 ⇒ **绝不回滚他人窗口**），按 `*Prev` 恢复或置 null；
2. `decrDay(accountKey, today, 'count')`（配额回补，下限 0，幂等）；
3. `incrDay(accountKey, today, 'rollback_count')`（只增）。

### 8.3 日配额与跨日

- 判定在**记账之前** ⇒ 被拒任务**从未占用窗口** ⇒ 无 hold 持久化需求。
- 队列新增 `_quotaBlocked: Set<taskId>`；`_processNext` **必须跳过**（防紧循环）。
- 定时器指向 **次日 00:00:05**，截止时间由**同一注入时钟**推导；`unref()` 必须调用。
- 溢出：次日上界 24 h ≪ 2³¹−1 ms，数学上不可能溢出；含抖动的间隔另有钳位（§8.1）。
- 重启：任务以 `pending` 持久化并恢复，重新判定 → 仍被拒则重新武装定时器。
- 通道释放：配额分支在 `try/finally` 之前 `return`，必须**显式释放通道**（与既有 `publish:blocked` 同因）。

### 8.4 重试放行

- 自动重试与手动重试同走 `add() → _executeTask → check()`。
- 放行条件：`task.lastAttemptNotSubmitted === true` 且 `now - lastAttemptAt >= max(RELEASE_GRACE_MS, 10 s)`。
- 必须发 `publish:released`（`{task, platform, accountId, reason:'not_submitted_retry', graceMs}`），经既有投影链到进度面板。

### 8.5 紧急放行

1. 入口：设置页「发布频率策略」→「立即解除本账号等待」（**仅当存在等待中的窗口时可用**）。
2. 校验：平台已登记 + `isSafePathSegment(accountId)` + 当日该账号次数 < 上限 + 距上次任意放行 ≥10 分钟。
3. 执行：取消该账号等待任务的定时器 → 从 `_delayed`/`_quotaBlocked` 移出 → 释放窗口 → 任务入队头 → `_processNext()`。
4. 审计：追加一行 JSONL（`ts / platform / accountId / operator / reason(≤200字) / result`），**UI 无编辑入口**。
5. 广播 `publish:emergencyReleased` → 设置页与进度面板刷新。
6. 结果如实回显：成功 / 超上限 / 无等待中的窗口（**三态都不得静默**）。

### 8.6 未登记平台

命中 `BASELINE` 时经注入 `warn` 输出**一次**（进程内按平台 Set 去重）：

```
[PublishFrequency] 平台 "xxx" 未登记频率策略，回落最严基线（账号 20 分钟 / 平台 2 分钟 / 日配额 3 条）；请登记到 PLATFORM_FREQUENCY_POLICY
```

## 9. 流程（时序）

### 9.1 正常发布

```
用户提交目标 → add() 入队 → _processNext（并发上限 3）
  → check() 通过 → recordPublish() → 传输层 markSubmitAttempted() → 平台写 → markSubmitted()
  → 成功：task:success（若 submittedAt 为空 ⇒ log.error + 计数，I4）
```

### 9.2 间隔未到

```
check() → allowed=false, bucket='account'|'platform', remainingMs=jitter(...)
  → status=pending、从 _running 移除、显式释放通道
  → publish:blocked → setTimeout(remainingMs) 重排队头（unref）
  → 进度面板：「等待 N 分钟后重试（本账号间隔）」
```

### 9.3 日配额用尽

```
check() → allowed=false, bucket='daily', remainingMs=0
  → 加入 _quotaBlocked → _processNext 跳过
  → publish:blocked(reason='daily_quota')
  → setTimeout(到次日 00:00:05)（同源时钟, unref）
  → 进度面板：「今日已达上限（3/3），将于明日 00:00 后自动继续」
```

### 9.4 未提交失败

```
传输层/预检抛错（submitAttempted=false）→ 回滚条件成立
  → release()：还原窗口 + 配额回补 + 回滚计数 +1
  → 失败卡片：「未提交到平台，约 10 秒后可重试」
  → 最小退避后再放行 → publish:released
```

### 9.5 已提交后失败/超时

```
错误或超时（submitAttempted=true 且无 definitelyNotSent）→ 不回滚
  → 窗口保持占用 → 卡片：「已提交，需等待约 N 分钟」
```

### 9.6 紧急放行

见 §8.5。

## 10. 交互逻辑

| 场景 | 用户动作 | 系统响应 |
|---|---|---|
| 提交后被挡 | 查看进度面板 | 等待行显示剩余分钟 + 归因标签 |
| 配额用尽 | 查看进度面板 | 显示「今日已达上限(used/max)，明日 00:00 后自动继续」；提供取消按钮 |
| 未提交失败 | 点重试 | 约 10 s 后可重试；卡片提示「未提交到平台，约 10 秒后可重试」 |
| 已提交失败 | 点重试 | 提示还需等待的分钟数；重试进入队列后被守卫拦 |
| 查看当前策略 | 打开设置 →「发布频率策略」 | 显示档位、实际间隔区间 `[base, base×1.4)`、日配额、回滚失效计数 |
| 覆盖策略 | 修改并保存 | 逐字段校验；任一字段非法 ⇒ 整体丢弃 + 明确错误提示 |
| 紧急放行 | 点「立即解除本账号等待」 | 二次确认 → 成功/超上限/无窗口三态回显 |
| 归因字段缺席 | — | **不渲染任何归因标签**（不得猜测档位） |

## 11. 显示项与提示文字

### 11.1 进度面板

| key | zh | en |
|---|---|---|
| `publishPage.progress.blockedWaitMinutes` | `等待 {minutes} 分钟后重试` | `Retry in {minutes} min` |
| `publishPage.progress.blockedBucketAccount` | `（本账号间隔）` | `(account interval)` |
| `publishPage.progress.blockedBucketPlatform` | `（同平台其他账号间隔）` | `(cross-account platform interval)` |
| `publishPage.progress.blockedBucketDaily`（新） | `（本账号每日上限）` | `(account daily limit)` |
| `publishPage.progress.blockedDailyQuota`（新） | `今日已达上限（{used}/{max}），将于明日 00:00 后自动继续` | `Daily limit reached ({used}/{max}); resumes after 00:00 tomorrow` |
| `publishPage.progress.failedNotSubmittedHint`（新） | `未提交到平台，约 10 秒后可重试` | `Not submitted; retry in about 10s` |
| `publishPage.progress.failedSubmittedHint`（新） | `已提交到平台，需等待约 {minutes} 分钟后重试` | `Submitted; retry in about {minutes} min` |
| `publishPage.progress.releasedNotSubmitted`（新） | `未提交到平台，已恢复可发布` | `Not submitted; publish window restored` |

### 11.2 定时发布提示（**改**，去承诺化）

| key | zh | en |
|---|---|---|
| `publishPage.scheduleHintWithLimits` | `留空 = 立即发布；可排期未来 {maxDays} 天内。实际发布节奏按「发布频率策略」执行（本表单仅做基础校验）` | `Leave empty to publish now; schedule within {maxDays} days. Actual pacing follows the Publish Frequency Policy (this form only does basic validation)` |
| `publishPage.scheduleValidation.scheduleIntervalTooShort` | `{platform} {accountId}的定时任务间隔必须至少 {minMinutes} 分钟` | `Scheduled tasks for {platform} {accountId} must be at least {minMinutes} minutes apart` |

### 11.3 设置页「发布频率策略」

| key | zh | en |
|---|---|---|
| `settings.publishFrequency.title` | `发布频率策略` | `Publish Frequency Policy` |
| `settings.publishFrequency.currentTier` | `当前档位：账号 {accountMinutes} 分钟 / 平台 {platformMinutes} 分钟 / 每日 {dailyMax} 条` | `Current: {accountMinutes} min per account / {platformMinutes} min per platform / {dailyMax} per day` |
| `settings.publishFrequency.effectiveRange` | `实际等待区间：{min}–{max} 分钟（含抖动）` | `Effective wait: {min}–{max} min (with jitter)` |
| `settings.publishFrequency.accountInterval` | `同账号最小间隔（分钟）` | `Min interval per account (minutes)` |
| `settings.publishFrequency.platformInterval` | `同平台跨账号最小间隔（分钟，0 = 关闭）` | `Cross-account platform interval (minutes, 0 = off)` |
| `settings.publishFrequency.dailyMax` | `每账号每日上限（0 = 不限）` | `Daily limit per account (0 = off)` |
| `settings.publishFrequency.jitterOn` | `加入随机抖动（更像人工节奏）` | `Add random jitter (more human-like pacing)` |
| `settings.publishFrequency.jitterHint` | `开启后实际等待比标称值长 0–40%，总吞吐略降` | `Wait becomes 0–40% longer; throughput drops slightly` |
| `settings.publishFrequency.rollbackFailures` | `回滚失效次数：{count}（>0 说明窗口已被后续提交覆盖）` | `Rollback failures: {count} (>0 means the window was already re-taken)` |
| `settings.publishFrequency.saveInvalid` | `策略配置非法，已整体丢弃并回退到上一份有效配置` | `Invalid policy; the whole override was discarded and the previous valid one kept` |
| `settings.publishFrequency.emergency` | `立即解除本账号等待` | `Release this account's wait now` |
| `settings.publishFrequency.emergencyConfirm` | `本次将跳过等待直接进入发布队列，操作会记入审计。确认继续？` | `This skips the wait and enqueues immediately; the action is audited. Continue?` |
| `settings.publishFrequency.emergencyOk` | `已解除等待，任务已重新入队` | `Wait released; the task was re-enqueued` |
| `settings.publishFrequency.emergencyExhausted` | `今日紧急放行次数已用尽（{max} 次/天）` | `Daily emergency releases exhausted ({max}/day)` |
| `settings.publishFrequency.emergencyCooldown` | `距上次放行不足 {minutes} 分钟，请稍后再试` | `Less than {minutes} min since the last release; try again later` |
| `settings.publishFrequency.emergencyNoWait` | `当前没有等待中的窗口` | `No pending wait window` |
| `settings.publishFrequency.dailyMaxPendingConfirm` | `默认值 3/5/20 待运营确认` | `Defaults 3/5/20 pending operator confirmation` |

**i18n 纪律**：zh/en 必须成对提交（CI Gate 7）；渲染端非 locales 文件不得新增中文字面量（CJK 基线扫描）。

## 12. 可观测与审计

| 通道 | 内容 |
|---|---|
| `publish:blocked`（扩展） | 新增 `reason`（`interval` / `daily_quota`）与 `daily`（`{used,max,dayKey}`） |
| `publish:released`（新） | `{task, platform, accountId, reason:'not_submitted_retry', graceMs}` |
| `publish:emergencyReleased`（新） | `{platform, accountId, at, operator}` |
| 日志 | 守卫在 release / 日配额否决 / 未登记回落 / 非法配置 / 佐证位不一致 / 成功而 `submittedAt` 为空（I4）六处出声。**禁止记录内容标题等用户文本** |
| 审计 | `publish-emergency-audit.jsonl` 追加式；`log.notify` 一条 INFO |
| 排查入口 | `publish_timeline`（最后提交）+ `publish_daily_count`（当日计数与回滚计数）两表即可复现任一次判定 |

**投影穷尽性**：新增字段必须同时改**所有**投影面 —— 已知 4 处投影白名单 + `emitPhaseNotify` 固定字段块，共 5 处（上游记录 QM-6 W1 的穷尽性审计结论）。

## 13. 配置优先级

```
设置页覆盖对象（整体有效或整体丢弃）
  > 环境变量（逐项）
  > 策略表（单一真源）
  > 未登记平台 → 最严基线
```

## 14. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 传输层漏接线 ⇒ 未提交失败被当已提交（多等，方向安全） | I4 成功路径自证 + 计数告警 |
| 传输层被绕过 ⇒ 已提交却判未提交（危险侧） | 双标记 + 佐证位一致 + 防风上限；M11/M12 变异反证 |
| 回滚风暴 | 最小退避 10 s + 每账号每日回滚上限 + 只增的回滚计数 |
| 抖动 + 下调导致吞吐显著下降 | 设置页显示实际区间与日配额；PRD 写明量级；抖动可关 |
| 新增表破坏 owner 隔离重建 | 七处注册表同步登记 + `store-schema` / `store-owner-isolation` 全量 |
| 紧急放行成为新绕过口 | 每账号每日 1 次 + ≥10 分钟冷却 + 追加式审计 + 设置页可见 |
| 长定时器溢出 | 次日上界 24 h 远小于上限；抖动值另有钳位；`unref()` |

## 15. 验收标准

| # | 场景 | 预期 |
|---|---|---|
| A1 | 未提交失败后重试 | 满足最小退避即放行；`publish:released` 存在 |
| A2 | 已提交（超时）失败后重试 | 被拦满窗口；**无** release |
| A3 | 佐证位与阶段标记不一致 | 占窗口 + `log.error` |
| A4 | 成功发布而 `submittedAt` 为空 | `log.error` + 计数 +1 |
| A5 | 同账号当日第 N+1 条 | `bucket='daily'`、不设长定时器以外的紧循环；`_processNext` 跳过 |
| A6 | 跨日 00:00 后 | 计数归零、可继续 |
| A7 | 抖动开启 100 次采样 | 全部 ∈ `[base, base×1.4)`，均值明显 > base |
| A8 | 抖动关闭 | 与 v1 逐值一致 |
| A9 | 同平台两账号（平台档默认 2 分钟） | 第二条被拦 `bucket='platform'`，约 2 分钟 |
| A10 | 平台档显式 0 | 第二条不被平台档拦（仍受账号档与配额约束） |
| A11 | 未登记平台 | 回落最严档 + warn **一次** |
| A12 | 非法 env（六种） | 各自回落 + warn，行为可预期 |
| A13 | 紧急放行 | 跳过等待、写审计、次日次数重置 |
| A14 | 紧急放行超上限 / 冷却中 / 无窗口 | 三态各自明确回显，队列状态不变 |
| A15 | 重启后 | 窗口仍生效（`publish_timeline`）；配额被拒任务恢复后重新判定 |
| A16 | 十六项变异 | 各自**恰好**让指定锁变红（实跑留证） |
| A17 | QM-1 | 打包 rc=0、asar 含新表 DDL 与新策略文件、启动 8 s stderr 无致命 |

## 16. 测试计划

见 `openspec/changes/publish-frequency-policy-v2/tasks.md` §1–§6 与本文 §15；变异清单 M1–M16 见 tasks §6。

## 17. 已知限制与遗留

- 审计**仅本地**，不做跨环境溯源（需新增出网通道，爆炸半径大于被保护对象）。
- 无设备/IP 级串行（沿用上游非目标）。
- 日配额 3/5/20 为工程保守起点，**待运营在设置页确认**。
- `publish:wechat` 的任务级 `accountId` 缺口（渲染层零生产调用方）留待另立变更。
- 公开资料对海外平台（YouTube / X / Instagram / TikTok）本轮**零取证**，故数值不对其做差异化。
