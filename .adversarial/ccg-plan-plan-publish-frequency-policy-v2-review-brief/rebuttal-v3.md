# Rebuttal v3 — 对 run B critique-v2 的逐条回应（收敛轮）

- 被评方案：`proposal-v2.md`（v3 简报的修订版）
- 评审：`critique-v2.md`（8 条：Critical **0** / Warning 4 / Info 4，最低维度分 6）
- 引擎裁决：**cleared**（无 Critical、无未解决 High ⇒ 放行）
- 本回应仍**逐条采纳全部 8 条**（其中 i1 属机制语义修正，必须改），并出 v4 简报再复评一次。

---

## i1 Warning · feasibility · `markSubmitted` 定在首次写之前 ⇒ 回滚永不触发

**裁决：指控成立（upheld），且这是本轮最重要的修正。**

- 反例（L1）：网络层失败（DNS 失败、连接被拒、代理不可达）发生在「首次平台写**之前**」。按 v3 的 D6，这类失败会因 `submittedAt` 已置位而**判为已提交** ⇒ 回滚永不触发 ⇒ **P0-1 对最需要它的场景失效**（报告点名的正是「登录失效 / 预检不过 / 文件缺失」这一族）。
- 修正（D6 改写为**双标记**）：
  - `markSubmitAttempted()`：传输层在**发起首次平台写尝试之前**调用 → `task.submitAttempted`；
  - `markSubmitted()`：平台**已接收/已确认发出**之后调用 → `task.submittedAt`；
  - **回滚允许条件（任一）**：① `task.submitAttempted === false`（从未发起任何写尝试——覆盖登录/预检/风控/缺文件）；② 传输层显式抛 `definitelyNotSent === true`（连接未建立、DNS 失败等**可确证未送出**）；
  - **不允许回滚**：已发起写尝试且无法确证未送出（超时、半途中断、平台非预期返回）。
  - `e.notSubmitted` 仍为佐证位，必须与上述结论一致，否则 fail-closed 占窗口 + error。

## i2 Warning · feasibility · 抖动路径的时间戳溢出

**裁决：指控成立（upheld）。** 修正：① 为间隔源声明**上界 7 天**，越界 ⇒ 钳到 7 天 + warn；② 对**含抖动系数后**的值保留溢出守卫：`wait > 2³¹−1` ⇒ 钳到 `2³¹−2 000`；该路径下任务处于 `_delayed`（被跳过）而非立即重判，**不产生忙循环**。补用例：`interval = 7 天` 且 `ratio = 0.4` ⇒ 不溢出且不忙循环。

## i3 Warning · clarity · tier 映射与跨档合并公式缺失

**裁决：指控成立（upheld）。** 修正：给出完整映射与公式（并入 v4 简报）：

| tier | 平台 | accountMinMs | platformMinMs | accountDailyMax |
|---|---|---|---|---|
| `long` | wechat_mp / zhihu / baijiahao / toutiao | 20 min | 2 min | 3 |
| `clip` | douyin / kuaishou / tencent_video / xiaohongshu / bilibili / youtube / tiktok / instagram / facebook | 10 min | 2 min | 5 |
| `short` | weibo / twitter | 3 min | 2 min | 20 |

- 合并公式：`remaining = max(accountRemaining, platformRemaining)`（两档取更严）；日配额为**独立否决项**；同时命中时 `bucket = 'daily'`。
- key 归属：间隔 → `platform:accountId` **与** `platform:*`（两键都写）；日配额 → **仅** `platform:accountId`。

## i4 Warning · completeness · 窗口存储介质未声明

**裁决：指控成立（upheld），结论是「已是持久化，需写明」。** 修正：窗口存储 = SQLite 表 `publish_timeline(owner_subject, key, last_publish_at)`（`store-schema.js:79-84`，经 `store/rate-limit-store.js` 读写，`container.setup.js:369-380` 注入），**跨重启持久**，owner 隔离。因此不存在「重启清空窗口 ⇒ 已提交任务不再受限」的路径。补一条用例：写入窗口 → 重建守卫实例 → 仍被拦。

## i5 Info · consistency · 「可立即重试」与 10 秒最小退避矛盾

**裁决：指控成立（upheld）。** 文案改为「**未提交到平台，约 10 秒后可重试**」（zh/en 成对）。

## i6 Info · consistency · 紧急放行的 10 分钟冷却与 1 次/日冗余、粒度未定义

**裁决：指控成立（upheld）。** 修正：① 上限粒度 = **每账号每日 1 次**；② 冷却改为「与上**一次任意账号的**紧急放行间隔 ≥10 分钟」并写明它与限次**正交**（限次防单账号滥用，冷却防脚本跨账号连点）。

## i7 Info · completeness · key 构造未校验 accountId

**裁决：指控成立（upheld）。** 修正：守卫与 store 的 key 一律经**唯一构造函数** `buildKey(platform, accountId)` 生成，对两段分别做 percent-encode ⇒ 分隔符 `:` 与 `#` 无法造成碰撞或越界；不再依赖调用方先校验。紧急放行 IPC 侧仍保留 `isSafePathSegment` 作为输入面校验（两层）。

## i8 Info · feasibility · 定时器截止与 `today()` 不同源

**裁决：指控成立（upheld）。** 修正：次日 00:00:05 的截止时间由**同一注入时钟**推导（`now()` + `today()` 共同决定），测试注入时钟时两者同源，消除漂移。
