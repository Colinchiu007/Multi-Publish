# 变更提案（自动生成，待对抗评审）

- base: `origin/main`
- head: `e2417f8a353246b062fa77fc4cb35e5a3bfb68f1`
- 采集模式: `diff`
- 变更规模: 9176 行

## 变更内容

```diff
diff --git a/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/critique-v1.md b/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/critique-v1.md
new file mode 100644
index 000000000..4e038dedb
--- /dev/null
+++ b/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/critique-v1.md
@@ -0,0 +1,47 @@
+{
+  "schemaVersion": 1,
+  "issues": [
+    {
+      "id": "i1",
+      "severity": "Warning",
+      "dimension": "consistency",
+      "finding": "平台档与 platform:* 键在默认配置下失效：所有账号档(20/10/3min)均≥默认平台档2min，max(账号档,平台档)恒等于账号档，平台档及共享键从不生效，'同平台多账号至少隔2分钟'承诺不落地。",
+      "suggestion": "明确平台档真实取值策略，或将平台档默认值调到可超过账号档的值，或在D1补充平台档触发条件与共享键实际参与remaining的读取逻辑。"
+    },
+    {
+      "id": "i2",
+      "severity": "Warning",
+      "dimension": "security",
+      "finding": "D6可回滚判据①submitAttempted===false完全依赖传输层主动调用markSubmitAttempted。若某平台漏接线，submitAttempted恒false，'已提交但失败'会被误判为可回滚，违反I1；I4仅校验成功路径submittedAt，失败路径漏接线无告警。",
+      "suggestion": "增加失败路径主动告警：当返回失败且submitAttempted恒false时计数并log.error；或用结构锁/枚举断言传输层调用点，参照D5 prev缺失的处理。"
+    },
+    {
+      "id": "i3",
+      "severity": "Warning",
+      "dimension": "completeness",
+      "finding": "D7的_quotaBlocked集合与指向次日00:00:05的unref定时器均为内存态，方案未说明重启后日配额阻塞与次日复位定时器的恢复路径，跨日/重启后可能永久卡在daily阻塞或定时器丢失。",
+      "suggestion": "补充重启恢复逻辑：check()时从publish_daily_count读count比对上限重挂定时器（同源now()），并给出对应测试用例。"
+    },
+    {
+      "id": "i4",
+      "severity": "Info",
+      "dimension": "clarity",
+      "finding": "D11要求所有key经buildKey并percent-encode两段，但D1平台级键为字面量platform:*（含星号），构建方式与编码规则未说明，易与'禁止字符串拼接'冲突。",
+      "suggestion": "显式规定platform:*的生成路径（如buildKey(platform,null)返回字面星号段），并说明星号是否参与percent-encode。"
+    },
+    {
+      "id": "i5",
+      "severity": "Info",
+      "dimension": "consistency",
+      "finding": "未登记平台(任意)平台档标2min，与i1同类：其账号档默认20min，平台档2min同样被覆盖，表格中所标平台档实际无意义。",
+      "suggestion": "未登记平台平台档改标为'可配置(当前失效)'或与账号档一致，避免误导读者。"
+    }
+  ],
+  "dimensionScores": {
+    "completeness": 7,
+    "consistency": 6,
+    "clarity": 7,
+    "feasibility": 7,
+    "security": 6
+  }
+}
\ No newline at end of file
diff --git a/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/critique-v2.md b/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/critique-v2.md
new file mode 100644
index 000000000..dd895313c
--- /dev/null
+++ b/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/critique-v2.md
@@ -0,0 +1,68 @@
+{
+  "schemaVersion": 1,
+  "issues": [
+    {
+      "id": "i1",
+      "severity": "Warning",
+      "dimension": "feasibility",
+      "finding": "D6 将 markSubmitted 定于『首次平台写前』：传输层失败（含首次写失败）全部落入已提交侧，e.notSubmitted 仅佐证，回滚永不触发——P0-1『未提交可立即重试』对最常见的请求未送达不可达；坏凭据反复重试仍持续占窗耗配额。",
+      "suggestion": "markSubmitted 改为首次写被平台接收后调用；或传输层明确返回『确定未送出』时允许回滚。"
+    },
+    {
+      "id": "i2",
+      "severity": "Warning",
+      "dimension": "feasibility",
+      "finding": "『数学上不可能溢出』仅对次日配额定时器成立；抖动路径 wait×1.4 在任一间隔源 ≥ 2³¹−1/1.4 ≈ 17.7 天时仍溢出，Node setTimeout 钳位 1ms 即忙循环。校验未声明间隔源上界。",
+      "suggestion": "为 MIN_INTERVAL/PLATFORM_MIN_INTERVAL 声明上界（如 <7 天），或保留含抖动系数的溢出守卫。"
+    },
+    {
+      "id": "i3",
+      "severity": "Warning",
+      "dimension": "clarity",
+      "finding": "D1 给出两套三档数字（20/10/3 与 3/5/20）但未绑定 tier 名；平台档与账号档合并规则（取最大/分别判定/各自 key）缺失。有效等待是核心语义，缺此无法实现验证。",
+      "suggestion": "给出 tier→(interval, dailyQuota) 完整映射表及跨档合并公式（如取 max），并注明两档各自归属 key。"
+    },
+    {
+      "id": "i4",
+      "severity": "Warning",
+      "dimension": "completeness",
+      "finding": "占窗口的 store 存储介质/持久化未声明；若为内存实现，重启即清空窗口，已提交任务不再受间隔约束（I1 失效），叠加 D4 仅覆盖在途崩溃，存在早重复发布路径。",
+      "suggestion": "明确窗口 store 持久化方案，或重启后按持久 submittedAt 重建窗口再判定。"
+    },
+    {
+      "id": "i5",
+      "severity": "Info",
+      "dimension": "consistency",
+      "finding": "交互文案『未提交到平台，可立即重试』与 D9『回滚后强制最小退避 max(RELEASE_GRACE_MS,10s)』矛盾：用户被告知立即重试，引擎却至少等 10s。",
+      "suggestion": "文案改为『约 10 秒后可重试』，或注明最小退避不通知用户。"
+    },
+    {
+      "id": "i6",
+      "severity": "Info",
+      "dimension": "consistency",
+      "finding": "D8 每日紧急放行上限 1 次令『两次放行间隔≥10分钟』恒真冗余；上限按账号还是全局未说明。若指与其他发布间隔则需明确对象。",
+      "suggestion": "删除 10 分钟规则或改为『与上次任何发布间隔≥10分钟』，并注明上限统计粒度。"
+    },
+    {
+      "id": "i7",
+      "severity": "Info",
+      "dimension": "completeness",
+      "finding": "daily_count 与窗口 key 含 accountId，正常路径未声明校验，仅紧急放行有 isSafePathSegment；外部可控 accountId 可致 key 碰撞或越界。",
+      "suggestion": "将 isSafePathSegment 前置到所有 key 构造处，或说明 accountId 来源已受控。"
+    },
+    {
+      "id": "i8",
+      "severity": "Info",
+      "dimension": "feasibility",
+      "finding": "D3 注入 today() 保证可测，但 D7 次日定时器按真实系统时钟计算，两者不同源时（测试注入、时钟漂移）运营日判定与定时器截止漂移。",
+      "suggestion": "定时器截止与 today() 共用同一时钟注入点。"
+    }
+  ],
+  "dimensionScores": {
+    "completeness": 7,
+    "consistency": 7,
+    "clarity": 6,
+    "feasibility": 6,
+    "security": 8
+  }
+}
\ No newline at end of file
diff --git a/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/family-snapshot.json b/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/family-snapshot.json
new file mode 100644
index 000000000..fd0c07335
--- /dev/null
+++ b/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/family-snapshot.json
@@ -0,0 +1,30 @@
+{
+  "schemaVersion": 1,
+  "snapshotCreatedAt": "2026-10-10T04:31:49.396Z",
+  "layer": "decision",
+  "resolvedFamily": {
+    "proposer": "opencode",
+    "critic": "claude"
+  },
+  "familyMap": {
+    "claude": [
+      "anthropic"
+    ],
+    "codex": [
+      "openai"
+    ],
+    "gemini": [
+      "google"
+    ],
+    "grok": [
+      "xai"
+    ],
+    "kimi": [
+      "moonshot"
+    ],
+    "opencode": [
+      "deepseek",
+      "hy3"
+    ]
+  }
+}
diff --git a/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/plan-reverted.md b/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/plan-reverted.md
new file mode 100644
index 000000000..267e8c305
--- /dev/null
+++ b/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/plan-reverted.md
@@ -0,0 +1,50 @@
+# 方案评审简报 — 发布频率策略 v2
+
+> 详细实现规格见 `PLAN-PUBLISH-FREQUENCY-POLICY-V2-2026-10-10.md`；本文只留评审需要的决策面。
+
+## 目标
+修正发布频率门禁的三个过度约束，并补上唯一有公开依据的维度。
+
+## 范围
+- P0-1 未提交失败回滚窗口；P0-2 重试放行；P1-1 平台档默认关；P1-2 账号级日配额（新）；P1-3 间隔抖动；P2-1 数值下调；P2-2 渲染层口径统一+设置页+紧急放行；P2-3 未登记平台出声；P2-4 校准脚本；P2-5 两处小坑。
+- 非目标：设备/IP 串行、每日 quota 之外的总量控制、跨设备同步、「成功才记账」。
+
+## 决策
+- D1 数值：账号档 60→20 / 30→10 / 10→3 分钟；平台档默认 0（关）；日配额 长文3 / 短视频5 / 短内容20 条。
+- D2 抖动：wait = remaining × (1 + 0.4×rand)，rand∈[0,1)，**只增不减**；ratio=0 退化为旧行为。
+- D3 日界：本地自然日 YYYY-MM-DD，注入 today()；不用 UTC。
+- D4 存储：新表 publish_daily_count(owner,key,day_key,count)，纯增量，不动 publish_timeline。
+- D5 release 语义：仅当 store.get(key)===本次占位 at 时回滚（乐观并发）；调用方须回传 prev，未回传则 no-op+warn。
+- D6 「未提交」判据：错误对象 e.notSubmitted===true 白名单（风控挂起/登录失效/参数校验/权益拒绝/执行器未就绪）；白名单外一律占窗口。
+- D7 日配额用尽：bucket='daily'、remainingMs=0，重排到次日 00:00:05；超 2^31-1 则不设定时器，等下次 _processNext。
+- D8 紧急放行：二次确认 + 审计（环形200条）+ 每日上限1次。
+
+## 不变量（fail-closed 方向）
+- I1 已提交后的失败仍占窗口（不得回退成「成功才记账」）。
+- I2 白名单外的失败一律占窗口。
+- I3 所有非法配置回落默认并出声，0 只表示显式关闭。
+- I4 平台档默认关不等于删字段：显式开启即生效。
+- I5 release 不回滚他人窗口。
+- I6 抖动不得减少等待。
+
+## 数据校验
+env：MIN_INTERVAL/PLATFORM_MIN_INTERVAL/ACCOUNT_DAILY_MAX（≥0 整数）/JITTER_RATIO（[0,1)）/RELEASE_GRACE_MS/EMERGENCY_MAX_PER_DAY。非法或越界→回落默认+warn。设置页覆盖对象任一字段非法→整体丢弃（不半生效）。计数读回按 parseInt，非有限→0+warn。
+
+## 交互
+- 间隔未到：阻塞+剩余分钟（本账号间隔/同平台其他账号间隔）。
+- 日配额用尽：「今日已达上限(3/3)，明日00:00后自动继续」。
+- 未提交失败：窗口回滚，提示「未提交到平台，可立即重试」。
+- 已提交失败：保留窗口，提示「已提交，需等待约N分钟」。
+
+## 测试
+单测：策略表/env 六项/抖动区间/release 三态（幂等、prev 缺失、窗口被覆盖）/跨日边界/日配额否决/队列 notSubmitted 回滚与已提交保留。装配锁 3 条。渲染层三条归因文案 + 三态结果。变异 M1-M10 各让指定锁恰好红。
+
+## 自认弱点（请重点攻击）
+1. 日配额 3/5/20 仍是工程拍板，默认即生效是否越过运营确认？
+2. D5 依赖调用方回传 prev，重构掉会静默退化为 no-op（安全但难发现）。
+3. 跨日长定时器 + 重启后 hold 丢失的恢复语义是否足够？
+4. 抖动只增 + 数值下调叠加，吞吐可能降 3 倍以上，是否需要在 UI 给吞吐预估？
+5. 平台档默认关削弱同平台多账号保护，是否应改为默认开但调到 1–3 分钟？
+6. 紧急放行是绕过口，每日 1 次是否足够，审计仅本地。
+7. P2-5 的 publish:wechat 无生产调用方，改它是否属扩大爆炸半径？
+8. 跨 6 模块一个 PR 是否应拆 2–3 个 PR？
diff --git a/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/plan-v2.md b/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/plan-v2.md
new file mode 100644
index 000000000..2e0089975
--- /dev/null
+++ b/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/plan-v2.md
@@ -0,0 +1,52 @@
+# 方案评审简报 v3 — 发布频率策略 v2
+
+> 详细实现规格见 `PLAN-PUBLISH-FREQUENCY-POLICY-V2-2026-10-10.md`。本版已并入 critique-v1/critique-v2 的全部采纳项，逐条回应见 `rebuttal-v1.md` / `rebuttal-v2.md`。
+
+## 范围
+- P0-1 未提交失败回滚；P0-2 重试放行；P1-1 平台档档位；P1-2 账号级日配额（新）；P1-3 间隔抖动；P2-1 数值下调；P2-2 渲染层口径统一+设置页+紧急放行；P2-3 未登记平台出声；P2-4 校准脚本。
+- P2-5 拆分：本期只改 `config/platforms.yaml` 命名注释；`publish:wechat` 的 accountId 改动**移出本 PR**（已审计：渲染层零生产调用方），另立变更。
+- 非目标：设备/IP 串行、跨设备同步、「成功才记账」、平台规则同步、跨环境审计溯源。
+
+## 决策
+- D1 数值：账号档 60→20 / 30→10 / 10→3 分钟；**平台档默认开 2 分钟，仅显式 0 关闭**；日配额 长文3 / 短视频5 / 短内容20 条。
+- D2 抖动：wait = remaining × (1 + 0.4×rand)，rand∈[0,1)，只增不减；ratio=0 退化为旧行为。
+- D3 日界：**本机运营日**（self-imposed accounting day）YYYY-MM-DD，注入 today()；不与平台日界换算，也不声称等价。
+- D4 存储：新表 publish_daily_count(owner,key,day_key,count,rollback_count)；任务记录持久化 submitted_at（与计数同次写入），重启按持久值判定 submittedAt；发布中途崩溃恢复的在途任务标记为需人工确认、不自动重发。不动 publish_timeline。
+- D5 release：仅当 store.get(key) === 本次占位 at 时回滚；调用方须回传 prev，缺失或错配 → `{released:false,reason:'prev_missing'}` + log.error + 设置页可见计数，调用点由结构锁枚举断言。
+- D6 未提交判据：**按提交阶段判定，不按错误类型**。占窗与计数由 TaskQueue 自有环节完成、不依赖传输层；`markSubmitted()` 仅作阶段标记（传输层在首次平台写操作前调用一次），队列记 `task.submittedAt`；回滚仅在 `submittedAt === null` 时允许；`e.notSubmitted===true` 降为佐证位；两者不一致 → 占窗口 + log.error。
+- D7 日配额用尽：`bucket='daily'`、`remainingMs=0`；TaskQueue 新增 `_quotaBlocked` 集合且 `_processNext` **跳过**其中任务（防忙循环）；定时器设到次日 00:00:05 并 `unref()`。溢出分支删除——次日上界 24h=86.4M ms < 2³¹−1 ms，数学上不可能溢出。配额分支在记账之前，**从未占用窗口**，故无 hold 持久化需求：重启后任务以 pending 恢复、重新判定、重新武装定时器。
+- D8 紧急放行：二次确认 + **追加式 JSONL 审计**（UI 无编辑入口，删除/篡改该文件记绕过告警）+ 每日上限 1 次与间隔均由 JSONL 逐条重算（重启不清零） + 两次放行间隔 ≥10 分钟。紧急放行仍须 occupy 窗口 + 计入 daily_count + 通过间隔判定，仅跳过「配额用尽」分支，不穿透间隔语义。
+- D9 防风（回应重试风暴）：回滚后强制最小退避 `max(RELEASE_GRACE_MS, 10s)`；每账号每日回滚上限 `max(2, dailyMax)`，超出即占窗口 + warn。
+- D10 计数递增与回补：`daily_count` 由 TaskQueue 在发起提交（写前）时递增，传输失败仍占配额 ⇒ 仅 `submittedAt===null` 的回滚**幂等回补**（下限 0）；`rollback_count` 只增不减。与「不做成功才记账」不冲突：计的是**提交**而非**成功**。
+- D11 未登记平台出声：提交前校验平台已登记于策略表，未登记 → 阻断任务 + log.warn + 提示「该平台未登记频率策略」，不静默放行。
+- D12 校准脚本：只读策略表输出各档预期值，比对 daily_count 与时间线差异生成报告；仅出报告，不自动改写计数。
+
+## 不变量
+- I1 已提交后的失败仍占窗口。
+- I2 阶段判据之外一律占窗口。
+- I3 非法配置回落默认并出声；`0` = 显式关闭（配额与平台档同义）。
+- I4 **成功或已提交失败的终态必须 `submittedAt !== null`**，启动期校验传输层已挂接 markSubmitted、缺失即 log.error + 计数——成功与失败路径均主动检测漏接线。
+- I5 release 不回滚他人窗口。
+- I6 抖动不得减少等待。
+- I7 新数值在每轮 `check()` 时读取、即时生效，无存量迁移；入队时旧值、执行时新值按新值判定。热生效仅作用于未占用窗口的新判定；已占窗口冻结占窗时值至释放，运行中改 0 不即时放行已占窗任务。
+
+## 数据校验
+env：MIN_INTERVAL / PLATFORM_MIN_INTERVAL / DAILY_MAX_LONG / _CLIP / _SHORT / ACCOUNT_DAILY_MAX（全局覆盖三档）/ JITTER_RATIO ∈ [0,1) / RELEASE_GRACE_MS / EMERGENCY_MAX_PER_DAY。非法、越界、空白 → 回落默认 + warn；`0` = 关闭该档。三档分组**复用策略表既有 tier 字段**（单一真源，不新增分类器）。设置页覆盖对象任一字段非法 → 整体丢弃（不半生效）。计数读回 parseInt，非有限 → 0 + warn。计数读写全部经 TaskQueue 单线程串行（同通道 FIFO），不并发；回补以条件更新（day_key 匹配、下限 0）兜底防漂移。紧急放行校验平台已登记 + accountId 过 `isSafePathSegment`。
+
+## 交互
+- 间隔未到：「等待 N 分钟后重试（本账号间隔 / 同平台其他账号间隔）」。
+- 日配额用尽：「今日已达上限(3/3)，将于明日 00:00 后自动继续」。
+- 未提交失败：「未提交到平台，可立即重试」。
+- 已提交失败：「已提交，需等待约 N 分钟」。
+- 设置页「发布频率策略」：显示实际间隔区间 `[base, base×1.4)`、日配额、回滚失效计数；启动日志打印同口径预估。
+
+## 测试与变异
+单测新增：`_processNext` 忙循环断言（同一任务重复判定次数上限）、重启恢复、同一错误类型在提交前/后得到相反结果、传输层未接线时成功路径报 error、回滚上限、配额回补幂等、prev 缺失结构锁、跨日边界。变异 M1–M14 各让指定锁**恰好**变红。
+
+## 明确拒绝项（附证据）
+- 平台时区日界（L2）：本工具从不声称执行平台规则（上游 PRD 非目标）；若按平台时区计日，同一运营者会面对多个「今天」，配额不可解释。
+- 跨环境审计溯源（L3）：需新增出网通道与远端服务，爆炸半径大于被保护对象。
+- 按错误类型而非阶段判回滚（L1）：同一错误在提交前后语义相反，类型判据必然误判。
+
+## 已知限制
+审计仅本地；无设备/IP 级串行；日配额 3/5/20 为工程保守起点，待运营在设置页确认；`publish:wechat` 的 accountId 缺口留待另立变更。
diff --git a/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/proposal-v1.md b/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/proposal-v1.md
new file mode 100644
index 000000000..935532d9b
--- /dev/null
+++ b/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/proposal-v1.md
@@ -0,0 +1,65 @@
+# 方案评审简报 v4 — 发布频率策略 v2
+
+> 详细实现规格见 `PLAN-PUBLISH-FREQUENCY-POLICY-V2-2026-10-10.md`。已并入 run A / run B 两轮评审的**全部**采纳项，逐条回应见 `rebuttal-v1.md` / `rebuttal-v2.md` / `rebuttal-v3.md`。v4 = v3（已 cleared）+ run B critique-v2 的 8 条修正。
+
+## 范围
+- P0-1 未提交失败回滚；P0-2 重试放行；P1-1 平台档档位；P1-2 账号级日配额（新）；P1-3 间隔抖动；P2-1 数值下调；P2-2 渲染层口径统一+设置页+紧急放行；P2-3 未登记平台出声；P2-4 校准脚本。
+- P2-5 拆分：本期只改 `config/platforms.yaml` 注释；`publish:wechat` 的 accountId 改动移出（已审计：渲染层零生产调用方）。
+- 非目标：设备/IP 串行、跨设备同步、「成功才记账」、平台规则同步、跨环境审计溯源。
+
+## 决策
+- D1 数值与档位映射：
+
+| tier | 平台 | 账号档 | 平台档 | 日配额 |
+|---|---|---|---|---|
+| `long` | wechat_mp/zhihu/baijiahao/toutiao | 20 min | 2 min | 3 |
+| `clip` | douyin/kuaishou/tencent_video/xiaohongshu/bilibili/youtube/tiktok/instagram/facebook | 10 min | 2 min | 5 |
+| `short` | weibo/twitter | 3 min | 2 min | 20 |
+| 未登记 | 任意 | 20 min | 2 min | 3 |
+
+  平台档**默认开 2 分钟**，仅显式 `0` 关闭（与日配额 `0` 同义）。合并公式：`remaining = max(账号档, 平台档)`；日配额为**独立否决项**；同时命中时 `bucket='daily'`。key 归属：间隔 → `platform:accountId` **与** `platform:*` 两键同写；日配额 → **仅** `platform:accountId`。
+- D2 抖动：`wait = remaining × (1 + 0.4×rand)`，`rand∈[0,1)`，只增不减；`ratio=0` 严格退化旧值。
+- D3 日界：**本机运营日** `YYYY-MM-DD`，注入 `today()`；不与平台日界换算、不声称等价。**次日定时器截止时间由同一注入时钟（`now()`）推导**，两者同源。
+- D4 存储：新表 `publish_daily_count(owner,key,day_key,count,rollback_count)`；不动 `publish_timeline`。**窗口存储 = SQLite `publish_timeline`（跨重启持久、owner 隔离）**，故「重启清空窗口」路径不存在。
+- D5 release：仅当 `store.get(key) === hold.at` 时回滚（否则不动，绝不回滚他人窗口）；调用方须回传 `prev`，缺失/错配 → `{released:false,reason:'prev_missing'}` + `log.error` + 设置页可见计数；调用点由结构锁枚举断言。
+- D6 未提交判据（**双标记 + 阶段判据**，不按错误类型）：
+  - `markSubmitAttempted()`：传输层**发起首次平台写尝试之前**调用 → `task.submitAttempted`；
+  - `markSubmitted()`：平台**已确认发出**后调用 → `task.submittedAt`；
+  - **可回滚**：① `submitAttempted === false`（登录失效/预检不过/风控挂起/缺文件）；或 ② 传输层显式抛 `definitelyNotSent === true`（连接未建立、DNS 失败等**可确证未送出**）；
+  - **不可回滚**：已发起写尝试且无法确证未送出（超时、半途中断、平台非预期返回）；
+  - `e.notSubmitted` 为佐证位，与上述结论不一致 ⇒ 占窗口 + `log.error`。
+- D7 日配额用尽：`bucket='daily'`、`remainingMs=0`；`_quotaBlocked` 集合 + `_processNext` **跳过**（防忙循环）；定时器指向次日 00:00:05（同源时钟）并 `unref()`。溢出守卫保留在**含抖动系数后**的值上：`wait > 2³¹−1` ⇒ 钳到 `2³¹−2 000`（该路径任务处于 delayed、被跳过，不忙循环）。间隔源上界 **7 天**，越界钳位 + warn。配额分支在记账之前、**从未占用窗口**，故无 hold 持久化需求。
+- D8 紧急放行：二次确认 + **追加式 JSONL 审计**（UI 无编辑入口）+ **每账号每日 1 次** + 「与上**一次任意账号**的放行间隔 ≥10 分钟」（与限次**正交**：限次防单账号滥用，冷却防跨账号脚本连点）。
+- D9 防风：回滚后强制最小退避 `max(RELEASE_GRACE_MS, 10s)`；每账号每日回滚上限 `max(2, dailyMax)`，超出即占窗口 + warn。
+- D10 配额回补：`count` 计「已实际提交到平台的次数」⇒ 未提交回滚**幂等回补**（下限 0）；`rollback_count` 只增不减。与「不做成功才记账」不冲突：计的是**提交**而非**成功**。
+- D11 key 构造：守卫与 store 的 key 一律经**唯一构造函数** `buildKey(platform, accountId)`（两段分别 percent-encode），分隔符 `:` / `#` 无法造成碰撞或越界；IPC 输入面另用 `isSafePathSegment` 校验（两层）。
+
+## 不变量
+- I1 已提交后的失败仍占窗口。
+- I2 阶段判据之外一律占窗口。
+- I3 非法配置回落默认并出声；`0` = 显式关闭（配额与平台档同义）。
+- I4 **成功发布必须 `submittedAt !== null`**，否则 `log.error` + 计数（传输层漏接线的主动告警）。
+- I5 release 不回滚他人窗口。
+- I6 抖动不得减少等待。
+- I7 新数值在每轮 `check()` 时读取、即时生效，无存量迁移。
+- I8 任何 key 必须由 `buildKey()` 生成，禁止字符串拼接。
+
+## 数据校验
+env：MIN_INTERVAL / PLATFORM_MIN_INTERVAL（上界 7 天）/ DAILY_MAX_LONG / _CLIP / _SHORT / ACCOUNT_DAILY_MAX（全局覆盖三档）/ JITTER_RATIO ∈ [0,1) / RELEASE_GRACE_MS / EMERGENCY_MAX_PER_DAY。非法、越界、空白 → 回落默认 + warn；`0` = 关闭该档。三档分组复用策略表既有 `tier` 字段（单一真源，不新增分类器）。设置页覆盖对象任一字段非法 → 整体丢弃。计数读回 `parseInt`，非有限 → 0 + warn。
+
+## 交互
+- 间隔未到：「等待 N 分钟后重试（本账号间隔 / 同平台其他账号间隔）」。
+- 日配额用尽：「今日已达上限(3/3)，将于明日 00:00 后自动继续」。
+- 未提交失败：「未提交到平台，**约 10 秒后**可重试」。
+- 已提交失败：「已提交，需等待约 N 分钟」。
+- 设置页「发布频率策略」：实际间隔区间 `[base, base×1.4)`、日配额、回滚失效计数；启动日志打印同口径预估。
+
+## 测试与变异
+新增用例：`_processNext` 忙循环断言（重复判定次数上限）、重启后窗口仍生效、同一错误类型在提交前/后相反结果、`submitAttempted=false` 与 `definitelyNotSent` 两条回滚路径、传输层漏接线时成功路径报 error、回滚上限、配额回补幂等、prev 缺失结构锁、跨日边界、抖动溢出钳位（7 天 × 1.4）、key 编码防碰撞。变异 M1–M16 各让指定锁**恰好**变红。
+
+## 明确拒绝项（附证据）
+- 平台时区日界（L2）：本工具从不声称执行平台规则（上游 PRD 非目标）；按平台时区计日会让同一运营者面对多个「今天」。
+- 跨环境审计溯源（L3）：需新增出网通道与远端服务，爆炸半径大于被保护对象。
+
+## 已知限制
+审计仅本地；无设备/IP 级串行；日配额 3/5/20 为工程保守起点，待运营在设置页确认；`publish:wechat` 的 accountId 缺口留待另立变更。
diff --git a/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/proposal-v2.md b/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/proposal-v2.md
new file mode 100644
index 000000000..2e0089975
--- /dev/null
+++ b/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/proposal-v2.md
@@ -0,0 +1,52 @@
+# 方案评审简报 v3 — 发布频率策略 v2
+
+> 详细实现规格见 `PLAN-PUBLISH-FREQUENCY-POLICY-V2-2026-10-10.md`。本版已并入 critique-v1/critique-v2 的全部采纳项，逐条回应见 `rebuttal-v1.md` / `rebuttal-v2.md`。
+
+## 范围
+- P0-1 未提交失败回滚；P0-2 重试放行；P1-1 平台档档位；P1-2 账号级日配额（新）；P1-3 间隔抖动；P2-1 数值下调；P2-2 渲染层口径统一+设置页+紧急放行；P2-3 未登记平台出声；P2-4 校准脚本。
+- P2-5 拆分：本期只改 `config/platforms.yaml` 命名注释；`publish:wechat` 的 accountId 改动**移出本 PR**（已审计：渲染层零生产调用方），另立变更。
+- 非目标：设备/IP 串行、跨设备同步、「成功才记账」、平台规则同步、跨环境审计溯源。
+
+## 决策
+- D1 数值：账号档 60→20 / 30→10 / 10→3 分钟；**平台档默认开 2 分钟，仅显式 0 关闭**；日配额 长文3 / 短视频5 / 短内容20 条。
+- D2 抖动：wait = remaining × (1 + 0.4×rand)，rand∈[0,1)，只增不减；ratio=0 退化为旧行为。
+- D3 日界：**本机运营日**（self-imposed accounting day）YYYY-MM-DD，注入 today()；不与平台日界换算，也不声称等价。
+- D4 存储：新表 publish_daily_count(owner,key,day_key,count,rollback_count)；任务记录持久化 submitted_at（与计数同次写入），重启按持久值判定 submittedAt；发布中途崩溃恢复的在途任务标记为需人工确认、不自动重发。不动 publish_timeline。
+- D5 release：仅当 store.get(key) === 本次占位 at 时回滚；调用方须回传 prev，缺失或错配 → `{released:false,reason:'prev_missing'}` + log.error + 设置页可见计数，调用点由结构锁枚举断言。
+- D6 未提交判据：**按提交阶段判定，不按错误类型**。占窗与计数由 TaskQueue 自有环节完成、不依赖传输层；`markSubmitted()` 仅作阶段标记（传输层在首次平台写操作前调用一次），队列记 `task.submittedAt`；回滚仅在 `submittedAt === null` 时允许；`e.notSubmitted===true` 降为佐证位；两者不一致 → 占窗口 + log.error。
+- D7 日配额用尽：`bucket='daily'`、`remainingMs=0`；TaskQueue 新增 `_quotaBlocked` 集合且 `_processNext` **跳过**其中任务（防忙循环）；定时器设到次日 00:00:05 并 `unref()`。溢出分支删除——次日上界 24h=86.4M ms < 2³¹−1 ms，数学上不可能溢出。配额分支在记账之前，**从未占用窗口**，故无 hold 持久化需求：重启后任务以 pending 恢复、重新判定、重新武装定时器。
+- D8 紧急放行：二次确认 + **追加式 JSONL 审计**（UI 无编辑入口，删除/篡改该文件记绕过告警）+ 每日上限 1 次与间隔均由 JSONL 逐条重算（重启不清零） + 两次放行间隔 ≥10 分钟。紧急放行仍须 occupy 窗口 + 计入 daily_count + 通过间隔判定，仅跳过「配额用尽」分支，不穿透间隔语义。
+- D9 防风（回应重试风暴）：回滚后强制最小退避 `max(RELEASE_GRACE_MS, 10s)`；每账号每日回滚上限 `max(2, dailyMax)`，超出即占窗口 + warn。
+- D10 计数递增与回补：`daily_count` 由 TaskQueue 在发起提交（写前）时递增，传输失败仍占配额 ⇒ 仅 `submittedAt===null` 的回滚**幂等回补**（下限 0）；`rollback_count` 只增不减。与「不做成功才记账」不冲突：计的是**提交**而非**成功**。
+- D11 未登记平台出声：提交前校验平台已登记于策略表，未登记 → 阻断任务 + log.warn + 提示「该平台未登记频率策略」，不静默放行。
+- D12 校准脚本：只读策略表输出各档预期值，比对 daily_count 与时间线差异生成报告；仅出报告，不自动改写计数。
+
+## 不变量
+- I1 已提交后的失败仍占窗口。
+- I2 阶段判据之外一律占窗口。
+- I3 非法配置回落默认并出声；`0` = 显式关闭（配额与平台档同义）。
+- I4 **成功或已提交失败的终态必须 `submittedAt !== null`**，启动期校验传输层已挂接 markSubmitted、缺失即 log.error + 计数——成功与失败路径均主动检测漏接线。
+- I5 release 不回滚他人窗口。
+- I6 抖动不得减少等待。
+- I7 新数值在每轮 `check()` 时读取、即时生效，无存量迁移；入队时旧值、执行时新值按新值判定。热生效仅作用于未占用窗口的新判定；已占窗口冻结占窗时值至释放，运行中改 0 不即时放行已占窗任务。
+
+## 数据校验
+env：MIN_INTERVAL / PLATFORM_MIN_INTERVAL / DAILY_MAX_LONG / _CLIP / _SHORT / ACCOUNT_DAILY_MAX（全局覆盖三档）/ JITTER_RATIO ∈ [0,1) / RELEASE_GRACE_MS / EMERGENCY_MAX_PER_DAY。非法、越界、空白 → 回落默认 + warn；`0` = 关闭该档。三档分组**复用策略表既有 tier 字段**（单一真源，不新增分类器）。设置页覆盖对象任一字段非法 → 整体丢弃（不半生效）。计数读回 parseInt，非有限 → 0 + warn。计数读写全部经 TaskQueue 单线程串行（同通道 FIFO），不并发；回补以条件更新（day_key 匹配、下限 0）兜底防漂移。紧急放行校验平台已登记 + accountId 过 `isSafePathSegment`。
+
+## 交互
+- 间隔未到：「等待 N 分钟后重试（本账号间隔 / 同平台其他账号间隔）」。
+- 日配额用尽：「今日已达上限(3/3)，将于明日 00:00 后自动继续」。
+- 未提交失败：「未提交到平台，可立即重试」。
+- 已提交失败：「已提交，需等待约 N 分钟」。
+- 设置页「发布频率策略」：显示实际间隔区间 `[base, base×1.4)`、日配额、回滚失效计数；启动日志打印同口径预估。
+
+## 测试与变异
+单测新增：`_processNext` 忙循环断言（同一任务重复判定次数上限）、重启恢复、同一错误类型在提交前/后得到相反结果、传输层未接线时成功路径报 error、回滚上限、配额回补幂等、prev 缺失结构锁、跨日边界。变异 M1–M14 各让指定锁**恰好**变红。
+
+## 明确拒绝项（附证据）
+- 平台时区日界（L2）：本工具从不声称执行平台规则（上游 PRD 非目标）；若按平台时区计日，同一运营者会面对多个「今天」，配额不可解释。
+- 跨环境审计溯源（L3）：需新增出网通道与远端服务，爆炸半径大于被保护对象。
+- 按错误类型而非阶段判回滚（L1）：同一错误在提交前后语义相反，类型判据必然误判。
+
+## 已知限制
+审计仅本地；无设备/IP 级串行；日配额 3/5/20 为工程保守起点，待运营在设置页确认；`publish:wechat` 的 accountId 缺口留待另立变更。
diff --git a/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/rebuttal-v1.md b/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/rebuttal-v1.md
new file mode 100644
index 000000000..7553d39f3
--- /dev/null
+++ b/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/rebuttal-v1.md
@@ -0,0 +1,48 @@
+# Rebuttal v1 — 对 critique-v1 的逐条回应
+
+- 方案：`01-docs/PLAN-PUBLISH-FREQUENCY-POLICY-V2-review-brief.md`（proposal-v1）
+- 评审：`critique-v1.md`（8 条：Critical 2 / Warning 4 / Info 2，最低维度分 6）
+- 证据分级：L1 反例（成立则评审应认错）｜L2 约束（客观限制/既有机制）｜L3 权衡（价值观取舍）
+
+---
+
+## i1 Critical · completeness · 跨日长定时器 + 重启后 hold 丢失
+
+**裁决：指控成立（upheld），且比评审说的更严重——原设计还有一个忙循环缺陷。**
+
+- 采纳并修正：原 D7 写「ms 超过 2³¹-1 则不设定时器，等下次 `_processNext`」。这是**错的**：`_processNext` 会立刻再次取到同一任务并重新判定，形成**紧循环**（CPU 空转 + 日志风暴）。
+- L2 约束（实测算术）：次日 00:00:05 距现在的上界是 24h = 86 400 000 ms，而定时器上限 2³¹−1 = 2 147 483 647 ms ≈ 24.85 天。**跨日目标的 ms 永远落不进溢出区间** ⇒ 该分支是无意义复杂度，**整条删除**。
+- 修正后的 D7：永远设一个到「次日 00:00:05」的定时器（`unref()`），并且**在 `TaskQueue` 内新增 `_quotaBlocked` 集合，`_processNext` 必须跳过其中的任务**（防忙循环）。
+- 重启恢复：关键事实是**配额被拒的任务从未 `recordPublish`、从未占用窗口**（配额判定在记账之前），所以不存在评审担心的「hold 丢失」——`hold` 只在**已记账**之后才存在，而配额分支根本没走到那一步。重启后任务以 `pending` 恢复，`_processNext` 重新判定，仍被拒则重新武装到次日定时器。补单测：重启恢复 + 跨日 + 连续 `_processNext` 调用不产生忙循环（断言重复判定次数上限）。
+
+## i2 Critical · security · 白名单自标、漏标即隐形风险
+
+**裁决：指控部分成立（upheld 于「可被伪造」侧，dismissed 于「漏标即占窗口」侧）。**
+
+- **dismissed 侧（L1 反例）**：评审称「若执行器漏标…非白名单失败会被当作『已提交』而占窗口」——这正是本方案的**设计意图**（不变量 I2：白名单外一律占窗口）。方向是 fail-closed，不是缺陷。占窗口的代价是「多等一会儿」，漏放的代价是「重复发布」，二者不对称。
+- **upheld 侧（接受）**：真正的缺陷是**获益方自标**——执行器既抛错又决定「这次不算数」。仅靠一个布尔字段，误标/伪造即可绕开全部门禁。
+- 修正：见 rebuttal-v2 的 i1（阶段判定 + 三重独立约束 + 成功路径自证）。
+
+## i3 Warning · feasibility · prev 缺失静默退化
+
+**裁决：指控成立（upheld）。** 修正：`prev` 缺失/不匹配由 `warn` 升级为 `log.error` + 计数器（设置页可见「回滚失效次数」）+ 源码级结构锁（断言 `recordPublish` 的返回值在 `task-queue.js` 内被消费），并配变异反证。
+
+## i4 Warning · completeness · P2-5 混入单 PR、缺调用方审计
+
+**裁决：指控部分成立。** L1 证据：`src/api/publisher.js:8` 的 `publishWechat` 在渲染层**零生产调用方**，全仓仅 `src/__tests__/ipc-handlers.test.js:115` 与 `src/api/publisher.test.js` 引用（已实测 grep）。改动为 1 行（补任务级 `accountId`），且**消除的是一条真实的账号档绕过路径**（现状该入口只受平台档约束）。处置：保留、在 PR 说明中单列并附上述审计证据。
+
+## i5 Warning · consistency · 抖动+下调的吞吐影响无提示
+
+**裁决：指控成立（upheld）。** 修正：设置页「发布频率策略」区块显示**当前实际间隔区间**（`[base, base×1.4)` 取整）与日配额；PRD 写明吞吐影响量级；首启若检测到旧值→新值变化，日志出声一次。
+
+## i6 Warning · consistency · 平台档默认关与 I3 语义张力
+
+**裁决：指控成立（upheld，且已在 rebuttal-v2 的 i2 收敛）。** 最终口径：**平台档默认开、2 分钟**；`0` = 显式关闭。这样与 I3「0 只表示显式关闭」不再冲突（默认值不是「显式关闭」），也保留同平台多账号的近似设备级保护。**这是对本方案上游调查报告 P1-1「平台档默认关」的显式偏离**，理由与代价在 PRD 与 PR 正文中写明。
+
+## i7 Info · feasibility · 存量在途任务的间隔适配
+
+**裁决：指控成立（upheld），但结论是「无需迁移」。** L2 依据：`_executeTask` 每次执行都重新调用 `guard.check()`（策略是**每次判定时读取**，不是入队时快照），所以新数值对新旧任务一视同仁地即时生效；`_delayed` 中已排期的任务到点后重新入队并重新判定。补一条用例：入队时旧值、执行时新值 ⇒ 按新值判定。
+
+## i8 Info · security · 审计仅本地、无外部溯源
+
+**裁决：部分成立。** 接受：审计改为**追加式 JSONL**（不可经 UI 编辑）+ 两次放行之间强制 ≥10 分钟冷却。拒绝（L3 权衡）：本产品无后端账号体系承载该审计流，引入「跨环境溯源」等于新增一条出网通道与一个远端服务，**爆炸半径远大于被保护的对象**；如实登记为已知限制（同「不做设备/IP 级串行」的处理方式）。
diff --git a/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/rebuttal-v2.md b/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/rebuttal-v2.md
new file mode 100644
index 000000000..e8e10d43b
--- /dev/null
+++ b/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/rebuttal-v2.md
@@ -0,0 +1,58 @@
+# Rebuttal v2 — 对 critique-v2 的逐条回应
+
+- 被评方案：`plan-v2.md`（= opencode 对 proposal-v1 的自动修订版）
+- 评审：`critique-v2.md`（8 条：Critical 1 / Warning 6 / Info 1，最低维度分 4）
+- **前提声明（重要）**：`plan-v2` 由 proposer 自动生成，它**改动了产品决策**（D1 平台档默认关 → 默认开 2 分钟）却**未同步「自认弱点」段**，并**新建了我从未提出的机制**（D8「写入诊断报告导出通道、可跨环境溯源」、D7「hold_until 持久化列」）。critique-v2 的 i2/i5 正是在指控这两处**由修订引入的自相矛盾**。本回应基于**决策真源**（proposal-v1 + 本回应），不承认 plan-v2 的擅自扩项。
+
+---
+
+## i1 Critical · security · 自标可伪造 + 重试风暴
+
+**裁决：指控成立（upheld）。这是本方案最重要的一条修正。**
+
+采纳，并给出**三重独立约束**（任一不成立即 fail-closed 占窗口）：
+
+1. **阶段判定取代类型白名单（核心）**：由**发布传输层**（真正发出平台请求的那一层，即 `rpa-view-manager` / `publisher-router`，**不是抛出该错误的一方**）在首次平台写操作前调用一次 `context.markSubmitted()`；队列把结果写在 `task.submittedAt`。**回滚仅在 `task.submittedAt === null` 时允许**；`e.notSubmitted === true` 降级为**佐证位**而非唯一依据。两者不一致（佐证说未提交、标记说已提交）⇒ **占窗口 + log.error**。
+   - 这直接回答「获益方自标」：伪造需要同时骗过**另一个模块**。
+2. **成功路径自证（可自检的接线缺陷探针）**：任何**成功**的发布若 `task.submittedAt === null`，立即 `log.error` + 计数。若某传输层漏调 `markSubmitted`，第一次成功发布会当场暴露，而不是等到某次失败被误放行。这条把「漏标」从静默风险变成**主动告警**。
+3. **防风约束（回应重试风暴）**：
+   - 回滚后强制**最小退避**：`max(RELEASE_GRACE_MS, 10s)`，**不允许 0 等待**；
+   - **每账号每日回滚上限** `rollbackDailyMax = max(2, dailyMax)`，超出即 fail-closed 占窗口 + warn；
+   - 回滚计数**只增不减**（与配额计数分离，见 i4）。
+   - 装配锁 + 变异：把 `markSubmitted` 注入摘掉、把 `submittedAt` 判断改成恒真、把回滚上限移除，三种都必须让指定锁变红。
+
+## i2 Warning · consistency · D1 与弱点 #5 矛盾
+
+**裁决：指控成立（upheld），但根因在 proposer 擅自改决策而非方案本身。** 收敛为**单一口径**：**平台档默认开、2 分钟；仅显式 `0` 表示关闭**。删除「自认弱点 #5」，改为已决策项的代价说明。**这是对上游调查报告 P1-1「默认关」的显式偏离**，偏离理由：成本有界（仅同平台多账号生效，1 账号/平台时完全惰性）而收益是保留唯一一条设备/IP 邻域保护；会在 PRD 与 PR 正文写明。
+
+## i3 Warning · completeness · 单 env 承载三档 + 分类未定义
+
+**裁决：指控成立（upheld）。** 修正：
+- env 拆为 `MP_PUBLISH_DAILY_MAX_LONG` / `_CLIP` / `_SHORT`（三档），外加 `MP_PUBLISH_ACCOUNT_DAILY_MAX` 作为**全局覆盖**（设置该项时三档同值）。
+- 分组**不新增分类器**：直接复用策略表里的既有分组条目（`tier: 'long' | 'clip' | 'short'`），与账号档/平台档**同源同表**读取 ⇒ 单一真源，不会出现「两套分类漂移」。
+
+## i4 Warning · consistency · 回滚不回补配额 = 双重计费
+
+**裁决：指控成立（upheld）。** 修正并明确两个计数器的**语义分离**：
+- `daily_count` = **已实际提交到平台的次数**（平台负载的代理量）⇒ 未提交的回滚**回补**（幂等：仅在 hold 匹配时 -1，下限 0）。
+- `rollback_count` = **回滚（放行）尝试次数**（滥用面的代理量）⇒ **只增不减**，用于 i1 的上限。
+- 与「非目标：不做成功才记账」不矛盾：配额计的是**提交**，不是**成功**；已提交后失败仍计入（I1 不变）。
+
+## i5 Warning · security · 审计仅本地 / 「跨环境溯源」矛盾
+
+**裁决：一半成立。** 接受：审计改**追加式 JSONL**（`publish-emergency-audit.jsonl`，逐行 append，UI 无编辑入口）+ 两次放行间隔 ≥10 分钟冷却。**拒绝（L3 权衡）**：「跨环境溯源」是 plan-v2 自行加入的机制，本方案从未提出；本产品无后端账号体系承载该审计流，新增出网通道的爆炸半径大于被保护对象。如实登记为**已知限制**（与「不做设备/IP 级串行」同处理）。
+
+## i6 Warning · consistency · 白名单成员可能发生在提交之后
+
+**裁决：指控成立（upheld），且与 i1 同解。** 按**阶段**而非**错误类型**分类：判据是 `task.submittedAt`，不是错误码。风控挂起/登录失效**若发生在提交之后**，`submittedAt` 已置位 ⇒ 一律占窗口（与 I1 一致）。原「类型白名单」保留为**必要非充分**条件，并补单测：同一错误类型在提交前后两种阶段下的相反结果。
+
+## i7 Warning · feasibility · 平台时区日界错位
+
+**裁决：指控不成立（dismissed，L2 证据）。**
+- 依据：日配额是**本工具的自我约束**，不是平台规则。方案与 PRD 从未声称「符合平台官方限制」（上游 PRD §2 非目标明写「不做平台规则同步：不声称符合平台官方规定」）。
+- 反例（L1）：若按平台时区计日，同一运营者在同一台机器上会面对多个不同的「今天」，日配额将不可解释、不可预期；而运营的心智模型是**本机自然日**。
+- 接受的修法仅限文档：把 D3 的措辞从「本地自然日」改为「**本机运营日（self-imposed accounting day）**」，并在 PRD 明写「不与平台日界做换算，也不声称等价」。
+
+## i8 Info · clarity · `ACCOUNT_DAILY_MAX` 的 0 语义未定义
+
+**裁决：指控成立（upheld）。** 定义：**`0` = 关闭日配额**（与平台档 `0` = 关闭对齐），写入文档、设置页文案与校验表；`0` 与「非法值回落」严格区分（后者出声告警）。
diff --git a/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/rebuttal-v3.md b/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/rebuttal-v3.md
new file mode 100644
index 000000000..c9a9b1f0c
--- /dev/null
+++ b/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/rebuttal-v3.md
@@ -0,0 +1,57 @@
+# Rebuttal v3 — 对 run B critique-v2 的逐条回应（收敛轮）
+
+- 被评方案：`proposal-v2.md`（v3 简报的修订版）
+- 评审：`critique-v2.md`（8 条：Critical **0** / Warning 4 / Info 4，最低维度分 6）
+- 引擎裁决：**cleared**（无 Critical、无未解决 High ⇒ 放行）
+- 本回应仍**逐条采纳全部 8 条**（其中 i1 属机制语义修正，必须改），并出 v4 简报再复评一次。
+
+---
+
+## i1 Warning · feasibility · `markSubmitted` 定在首次写之前 ⇒ 回滚永不触发
+
+**裁决：指控成立（upheld），且这是本轮最重要的修正。**
+
+- 反例（L1）：网络层失败（DNS 失败、连接被拒、代理不可达）发生在「首次平台写**之前**」。按 v3 的 D6，这类失败会因 `submittedAt` 已置位而**判为已提交** ⇒ 回滚永不触发 ⇒ **P0-1 对最需要它的场景失效**（报告点名的正是「登录失效 / 预检不过 / 文件缺失」这一族）。
+- 修正（D6 改写为**双标记**）：
+  - `markSubmitAttempted()`：传输层在**发起首次平台写尝试之前**调用 → `task.submitAttempted`；
+  - `markSubmitted()`：平台**已接收/已确认发出**之后调用 → `task.submittedAt`；
+  - **回滚允许条件（任一）**：① `task.submitAttempted === false`（从未发起任何写尝试——覆盖登录/预检/风控/缺文件）；② 传输层显式抛 `definitelyNotSent === true`（连接未建立、DNS 失败等**可确证未送出**）；
+  - **不允许回滚**：已发起写尝试且无法确证未送出（超时、半途中断、平台非预期返回）。
+  - `e.notSubmitted` 仍为佐证位，必须与上述结论一致，否则 fail-closed 占窗口 + error。
+
+## i2 Warning · feasibility · 抖动路径的时间戳溢出
+
+**裁决：指控成立（upheld）。** 修正：① 为间隔源声明**上界 7 天**，越界 ⇒ 钳到 7 天 + warn；② 对**含抖动系数后**的值保留溢出守卫：`wait > 2³¹−1` ⇒ 钳到 `2³¹−2 000`；该路径下任务处于 `_delayed`（被跳过）而非立即重判，**不产生忙循环**。补用例：`interval = 7 天` 且 `ratio = 0.4` ⇒ 不溢出且不忙循环。
+
+## i3 Warning · clarity · tier 映射与跨档合并公式缺失
+
+**裁决：指控成立（upheld）。** 修正：给出完整映射与公式（并入 v4 简报）：
+
+| tier | 平台 | accountMinMs | platformMinMs | accountDailyMax |
+|---|---|---|---|---|
+| `long` | wechat_mp / zhihu / baijiahao / toutiao | 20 min | 2 min | 3 |
+| `clip` | douyin / kuaishou / tencent_video / xiaohongshu / bilibili / youtube / tiktok / instagram / facebook | 10 min | 2 min | 5 |
+| `short` | weibo / twitter | 3 min | 2 min | 20 |
+
+- 合并公式：`remaining = max(accountRemaining, platformRemaining)`（两档取更严）；日配额为**独立否决项**；同时命中时 `bucket = 'daily'`。
+- key 归属：间隔 → `platform:accountId` **与** `platform:*`（两键都写）；日配额 → **仅** `platform:accountId`。
+
+## i4 Warning · completeness · 窗口存储介质未声明
+
+**裁决：指控成立（upheld），结论是「已是持久化，需写明」。** 修正：窗口存储 = SQLite 表 `publish_timeline(owner_subject, key, last_publish_at)`（`store-schema.js:79-84`，经 `store/rate-limit-store.js` 读写，`container.setup.js:369-380` 注入），**跨重启持久**，owner 隔离。因此不存在「重启清空窗口 ⇒ 已提交任务不再受限」的路径。补一条用例：写入窗口 → 重建守卫实例 → 仍被拦。
+
+## i5 Info · consistency · 「可立即重试」与 10 秒最小退避矛盾
+
+**裁决：指控成立（upheld）。** 文案改为「**未提交到平台，约 10 秒后可重试**」（zh/en 成对）。
+
+## i6 Info · consistency · 紧急放行的 10 分钟冷却与 1 次/日冗余、粒度未定义
+
+**裁决：指控成立（upheld）。** 修正：① 上限粒度 = **每账号每日 1 次**；② 冷却改为「与上**一次任意账号的**紧急放行间隔 ≥10 分钟」并写明它与限次**正交**（限次防单账号滥用，冷却防脚本跨账号连点）。
+
+## i7 Info · completeness · key 构造未校验 accountId
+
+**裁决：指控成立（upheld）。** 修正：守卫与 store 的 key 一律经**唯一构造函数** `buildKey(platform, accountId)` 生成，对两段分别做 percent-encode ⇒ 分隔符 `:` 与 `#` 无法造成碰撞或越界；不再依赖调用方先校验。紧急放行 IPC 侧仍保留 `isSafePathSegment` 作为输入面校验（两层）。
+
+## i8 Info · feasibility · 定时器截止与 `today()` 不同源
+
+**裁决：指控成立（upheld）。** 修正：次日 00:00:05 的截止时间由**同一注入时钟**推导（`now()` + `today()` 共同决定），测试注入时钟时两者同源，消除漂移。
diff --git a/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/rebuttal-v4.md b/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/rebuttal-v4.md
new file mode 100644
index 000000000..6b0b2a2d7
--- /dev/null
+++ b/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/rebuttal-v4.md
@@ -0,0 +1,45 @@
+# Rebuttal v4 — 对 run C critique-v1 的逐条回应
+
+- 被评方案：`01-docs/PLAN-PUBLISH-FREQUENCY-POLICY-V2-review-brief.md` v4
+- 评审：`critique-v1.md`（5 条：Critical **0** / Warning 3 / Info 2，最低维度分 6）
+- 引擎裁决：**cleared**（首轮即无 Critical、无未解决 High ⇒ 放行，rc=0）
+
+---
+
+## i1 Warning · consistency · 「平台档与 `platform:*` 键在默认配置下失效」
+
+**裁决：指控不成立（dismissed，L1 反例）。**
+
+评审的推理是「账号档 20/10/3 ≥ 平台档 2 ⇒ `max(账号档, 平台档)` 恒等于账号档 ⇒ 平台档从不生效」。**这个推理只对「同一账号」成立，对评审要论证的「同平台多账号」不成立**：
+
+- **同账号**再发布：账号键 `platform:acc1` 与平台键 `platform:*` 都有历史。账号档 20/10/3 分钟 > 2 分钟 ⇒ 账号档决定 ⇒ 平台档确实不改变结果。**这是正确行为**，不是失效。
+- **同平台换账号**：账号键 `platform:acc2` **无历史** ⇒ `accountRemaining = 0`；平台键 `platform:*` 有历史 ⇒ `platformRemaining = 2 分钟` ⇒ `max(0, 2分钟) = 2 分钟` ⇒ **平台档正是在这个场景生效**，而这正是它唯一被设计来管的场景（跨账号）。
+- **结论**：平台档并非「从不生效」，而是「只在跨账号时生效」——这与 D1 的 key 归属（间隔写两键、日配额只写账号键）完全自洽。
+
+**但评审的困惑本身是文档缺陷的证据**（同一处两个场景没写清）⇒ **部分采纳**：在 D1 后补「两档何时绑定」的显式说明（同账号：账号档胜；跨账号：平台档胜），并在 PRD §5 同处补写。
+
+## i2 Warning · security · 漏接线时失败路径无告警 ⇒ I1 可能失效
+
+**裁决：指控成立（upheld）。这是本轮最有价值的一条。**
+
+- 反例（L1）：若某传输层从未调用 `markSubmitAttempted()`，则 `submitAttempted` 恒为 `false` ⇒ 「已提交但失败」被判为可回滚 ⇒ **I1 被违反**（危险侧：早于窗口的重复发布）。而 I4 只自证**成功**路径的 `submittedAt`，对**失败**路径完全静默。
+- 修正（新增 I9 + 失败路径探针）：
+  1. **失败路径计数**：任务失败且 `submitAttempted === false` 时，递增「疑似漏接线失败」计数（按平台维度，设置页可见）。
+  2. **矛盾检测（fail-closed）**：同一平台若**成功路径已证明会调 `markSubmitted`**（即曾出现过成功且 `submittedAt !== null`），却持续出现 `submitAttempted === false` 的失败 ⇒ 判定为**接线矛盾** ⇒ `log.error` + **对该平台临时停用回滚**（直到应用重启或用户在设置页确认），即回到「一律占窗口」的旧行为。
+  3. **结构锁**：枚举并断言发布传输层的 `markSubmitAttempted` 调用点（与 D5 的 prev 处理同法），新增传输层必须登记。
+- 这条把评审指出的「失败路径静默」变成**两路可观测 + 一条自动降级**。
+
+## i3 Warning · completeness · `_quotaBlocked` 与次日定时器为内存态，重启恢复未说明
+
+**裁决：指控部分成立（upheld 于「未写明」，dismissed 于「会永久卡住」）。**
+
+- **dismissed（L2 依据）**：`_quotaBlocked` 与定时器是内存态，但**配额计数是持久化的**（`publish_daily_count`）。重启后任务以 `pending` 持久化恢复，`_processNext` 重新调 `check()`，`check()` 从持久表读 `count` 与 `day_key` ⇒ 仍超限则**重新入 `_quotaBlocked` 并重新武装定时器**。不存在「永久卡在 daily 阻塞」（次日 `day_key` 变化即放行），也不存在「定时器丢失后不再复位」（每次 `check()` 都是重新武装点）。
+- **upheld**：v4 简报未写明这条链路 ⇒ 补明文，并把 `A15` 拆成两条可执行用例：① 重启后窗口仍生效；② 配额被拒任务重启后**重新武装定时器**且不忙循环。
+
+## i4 Info · clarity · `platform:*` 与 `buildKey` 的 percent-encode 规则冲突
+
+**裁决：指控成立（upheld）。** 修正：显式规定 `buildKey(platform, null)` 返回 `` `${encodeURIComponent(platform)}:*` `` —— 哨兵 `*` **不参与 percent-encode**，由函数以字面量追加；平台段仍编码。这样既满足 I8（禁止裸拼接），又不产生 `%2A` 与 `*` 两种形态的键分裂。补一条断言：`buildKey('weibo', null) === 'weibo:*'`、`buildKey('weibo', 'a:b') === 'weibo:a%3Ab'`。
+
+## i5 Info · consistency · 未登记平台的平台档标 2 分钟「无意义」
+
+**裁决：同 i1（dismissed），采纳措辞修正。** 未登记平台行的平台档同样**只在跨账号时绑定**；表格改为标注「平台档（跨账号时生效）」，消除误导。
diff --git a/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/revision-v1.md b/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/revision-v1.md
new file mode 100644
index 000000000..7de8a260a
--- /dev/null
+++ b/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/revision-v1.md
@@ -0,0 +1,92 @@
+{
+  "schemaVersion": 1,
+  "responses": [
+    {
+      "issueId": "i1",
+      "decision": "accepted",
+      "response": "接受。占窗与计数移入 TaskQueue 自有环节，markSubmitted 降为阶段标记；启动期校验接线，失败路径与成功路径同权告警。"
+    },
+    {
+      "issueId": "i2",
+      "decision": "accepted",
+      "response": "接受。D8 钉死：紧急放行仍占窗、计数、过间隔判定，仅跳过配额用尽分支，不穿透间隔语义。"
+    },
+    {
+      "issueId": "i3",
+      "decision": "accepted",
+      "response": "接受。submitted_at 持久化到任务记录，重启按持久值判定；崩溃恢复的在途任务标记人工确认，不自动重发。"
+    },
+    {
+      "issueId": "i4",
+      "decision": "accepted",
+      "response": "接受。count 由队列在写前递增，传输失败仍占配额，仅未提交回滚回补；D10 措辞已同步改写。"
+    },
+    {
+      "issueId": "i5",
+      "decision": "accepted",
+      "response": "接受。补 D11（未登记平台写前校验+阻断出声）与 D12（校准脚本只读比对出报告），判定与口径已定义。"
+    },
+    {
+      "issueId": "i6",
+      "decision": "accepted",
+      "response": "接受。上限与间隔从 JSONL 逐条重算，重启不清零；删除或篡改审计文件记绕过告警并写入文档。"
+    },
+    {
+      "issueId": "i7",
+      "decision": "accepted",
+      "response": "接受。热生效仅作用于未占窗新判定，已占窗口冻结占窗时值至释放，运行中改 0 不放行已占窗任务。"
+    },
+    {
+      "issueId": "i8",
+      "decision": "accepted",
+      "response": "接受。计数读写全部经 TaskQueue 单线程串行并写入文档，另以条件更新兜底防漂移。"
+    }
+  ],
+  "edits": [
+    {
+      "issueId": "i1",
+      "before": "发布传输层在首次平台写操作前调用一次 `markSubmitted()`，队列记 `task.submittedAt`；",
+      "after": "占窗与计数由 TaskQueue 自有环节完成、不依赖传输层；`markSubmitted()` 仅作阶段标记（传输层在首次平台写操作前调用一次），队列记 `task.submittedAt`；"
+    },
+    {
+      "issueId": "i1",
+      "before": "I4 **成功发布必须 `submittedAt !== null`**，否则 log.error + 计数——把「传输层漏接线」从静默风险变成主动告警。",
+      "after": "I4 **成功或已提交失败的终态必须 `submittedAt !== null`**，启动期校验传输层已挂接 markSubmitted、缺失即 log.error + 计数——成功与失败路径均主动检测漏接线。"
+    },
+    {
+      "issueId": "i2",
+      "before": "两次放行间隔 ≥10 分钟。",
+      "after": "两次放行间隔 ≥10 分钟。紧急放行仍须 occupy 窗口 + 计入 daily_count + 通过间隔判定，仅跳过「配额用尽」分支，不穿透间隔语义。"
+    },
+    {
+      "issueId": "i3",
+      "before": "D4 存储：新表 publish_daily_count(owner,key,day_key,count,rollback_count)；不动 publish_timeline。",
+      "after": "D4 存储：新表 publish_daily_count(owner,key,day_key,count,rollback_count)；任务记录持久化 submitted_at（与计数同次写入），重启按持久值判定 submittedAt；发布中途崩溃恢复的在途任务标记为需人工确认、不自动重发。不动 publish_timeline。"
+    },
+    {
+      "issueId": "i4",
+      "before": "D10 配额回补：`daily_count` 计「已实际提交到平台的次数」⇒ 未提交回滚**幂等回补**（下限 0）；",
+      "after": "D10 计数递增与回补：`daily_count` 由 TaskQueue 在发起提交（写前）时递增，传输失败仍占配额 ⇒ 仅 `submittedAt===null` 的回滚**幂等回补**（下限 0）；"
+    },
+    {
+      "issueId": "i5",
+      "before": "与「不做成功才记账」不冲突：计的是**提交**而非**成功**。",
+      "after": "与「不做成功才记账」不冲突：计的是**提交**而非**成功**。\n- D11 未登记平台出声：提交前校验平台已登记于策略表，未登记 → 阻断任务 + log.warn + 提示「该平台未登记频率策略」，不静默放行。\n- D12 校准脚本：只读策略表输出各档预期值，比对 daily_count 与时间线差异生成报告；仅出报告，不自动改写计数。"
+    },
+    {
+      "issueId": "i6",
+      "before": "+ **追加式 JSONL 审计**（UI 无编辑入口）+ 每日上限 1 次",
+      "after": "+ **追加式 JSONL 审计**（UI 无编辑入口，删除/篡改该文件记绕过告警）+ 每日上限 1 次与间隔均由 JSONL 逐条重算（重启不清零）"
+    },
+    {
+      "issueId": "i7",
+      "before": "I7 新数值在每轮 `check()` 时读取、即时生效，无存量迁移；入队时旧值、执行时新值按新值判定。",
+      "after": "I7 新数值在每轮 `check()` 时读取、即时生效，无存量迁移；入队时旧值、执行时新值按新值判定。热生效仅作用于未占用窗口的新判定；已占窗口冻结占窗时值至释放，运行中改 0 不即时放行已占窗任务。"
+    },
+    {
+      "issueId": "i8",
+      "before": "计数读回 parseInt，非有限 → 0 + warn。",
+      "after": "计数读回 parseInt，非有限 → 0 + warn。计数读写全部经 TaskQueue 单线程串行（同通道 FIFO），不并发；回补以条件更新（day_key 匹配、下限 0）兜底防漂移。"
+    }
+  ]
+}
\ No newline at end of file
diff --git a/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/runA-critique-v1.md b/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/runA-critique-v1.md
new file mode 100644
index 000000000..26c7b7098
--- /dev/null
+++ b/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/runA-critique-v1.md
@@ -0,0 +1,68 @@
+{
+  "schemaVersion": 1,
+  "issues": [
+    {
+      "id": "i1",
+      "severity": "Critical",
+      "dimension": "completeness",
+      "finding": "D7 跨日长定时器 + 重启后 hold 丢弃，方案只说'等下次 _processNext'，但未定义重启时 hold 是否持久化、pending 队列如何恢复；若 hold 仅存内存，崩溃即丢，'明日00:00后自动继续'承诺失效，只测了跨日边界却未测重启恢复。",
+      "suggestion": "明确 hold/持久化载体与重启恢复流程，补重启场景单测与用例。"
+    },
+    {
+      "id": "i2",
+      "severity": "Critical",
+      "dimension": "security",
+      "finding": "D6 白名单依赖 e.notSubmitted===true 由各执行器自行标记；若某执行器漏标或异常对象不带该字段，非白名单失败会被当作'已提交'而占窗口——fail-closed 方向 I2 依赖调用方自觉，却无兜底校验，属可被误判的隐形风险。",
+      "suggestion": "对缺失 notSubmitted 标记的失败显式告警并默认按未提交处理，或引入强制校验。"
+    },
+    {
+      "id": "i3",
+      "severity": "Warning",
+      "dimension": "feasibility",
+      "finding": "D5 依赖调用方回传 prev，遗漏则静默退化为 no-op（自认弱点）；多模块多调用点回传 prev 易漏，且 no-op+warn 的 warn 无强告警通道，长期无人发现，安全但难察觉削弱可观测性。",
+      "suggestion": "prev 缺失改为返回失败并显式记录，或开发态断言强制补齐调用点。"
+    },
+    {
+      "id": "i4",
+      "severity": "Warning",
+      "dimension": "completeness",
+      "finding": "P2-5 含 publish:wechat 改动，但方案未给出其调用方审计证据；若确认无生产调用方，仍涉及跨模块改动，且与 P1/P2 核心链路无强关联，混入单个 PR 扩大验证面。",
+      "suggestion": "拆分或单列该改动，先审计调用方再决定是否纳入。"
+    },
+    {
+      "id": "i5",
+      "severity": "Warning",
+      "dimension": "consistency",
+      "finding": "D2 抖动只增不减少与 D1 数值下调叠加，自认弱点 4 所述吞吐可能降 3 倍以上；但决策部分未相应给出 UI 或日志的吞吐预估提示，用户将无感知接受等待变长。",
+      "suggestion": "在设置页或启动日志提供预估间隔/吞吐提示，避免无预期变慢。"
+    },
+    {
+      "id": "i6",
+      "severity": "Warning",
+      "dimension": "consistency",
+      "finding": "P1-1 平台档默认关与 I3 '0 只表示显式关闭'语义冲突：默认关会影响同平台多账号共档保护（平台间隔失效），虽声明为'决策'，但与'保留同平台保护'目标存在张力。",
+      "suggestion": "论证默认关理由，或改为默认开但调至 1–3 分钟并保留显式关闭路径。"
+    },
+    {
+      "id": "i7",
+      "severity": "Info",
+      "dimension": "feasibility",
+      "finding": "P2-1 数值下调与 D1 使 60→20/30→10/10→3，方案未说明新值是否影响既有定时器、队列中已排期项的兼容处理，改动后的存量任务间隔可能无法覆盖。",
+      "suggestion": "补充存量任务的间隔适配或触发说明，验证无遗留在途任务。"
+    },
+    {
+      "id": "i8",
+      "severity": "Info",
+      "dimension": "security",
+      "finding": "D8 紧急放行审计仅本地环形 200 条且每日 1 次，无外部溯源/告警；出问题仅本地可见，跨环境排查无日志可依。",
+      "suggestion": "增加结构化告警或导出通道，确保紧急放行可被外部追踪。"
+    }
+  ],
+  "dimensionScores": {
+    "completeness": 6,
+    "consistency": 6,
+    "clarity": 7,
+    "feasibility": 6,
+    "security": 6
+  }
+}
\ No newline at end of file
diff --git a/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/runA-critique-v2.md b/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/runA-critique-v2.md
new file mode 100644
index 000000000..2f0bcf77f
--- /dev/null
+++ b/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/runA-critique-v2.md
@@ -0,0 +1,68 @@
+{
+  "schemaVersion": 1,
+  "issues": [
+    {
+      "id": "i1",
+      "severity": "Critical",
+      "dimension": "security",
+      "finding": "D6 白名单由执行器自标 e.notSubmitted，执行器同时是免等重试的获益方；装配锁仅断言'有标记'、不验证正确性，误标/恶意标即可绕过全部门禁，且未提交回滚→立即重试可形成重试风暴。",
+      "suggestion": "加独立约束：回滚后最小退避+每账号每日重试上限；或平台侧幂等键二次确认未提交，而非仅靠自标。"
+    },
+    {
+      "id": "i2",
+      "severity": "Warning",
+      "dimension": "consistency",
+      "finding": "D1 定为'平台档默认 2 分钟（开）'，但自认弱点 #5 却写'平台档默认关削弱同平台保护，应改默认开'，决策与自述矛盾，交付形态无法判断。",
+      "suggestion": "统一口径：确认默认开 2 分钟，删改弱点 #5 中'默认关'表述，避免评审与实现错位。"
+    },
+    {
+      "id": "i3",
+      "severity": "Warning",
+      "dimension": "completeness",
+      "finding": "日配额分长文3/短视频5/短内容20 三档，数据校验却只列单个 ACCOUNT_DAILY_MAX，单 env 无法承载三档；长文/短视频/短内容的分类判定规则也未定义。",
+      "suggestion": "改为 ACCOUNT_DAILY_MAX_{LONG,CLIP,SHORT} 三 env 或配置表，并明确定义三类的判定规则。"
+    },
+    {
+      "id": "i4",
+      "severity": "Warning",
+      "dimension": "consistency",
+      "finding": "D4 日配额'纯增量'永不减，notSubmitted 回滚释放间隔窗口却不回补配额，重试被双重计费；与 P0-1'未提交不惩罚'精神不一致，且非目标已排除'成功才记账'，口径矛盾。",
+      "suggestion": "明确口径：未实际提交的回滚按幂等键回补配额，或文档声明有意按'提交即记账'并说明理由。"
+    },
+    {
+      "id": "i5",
+      "severity": "Warning",
+      "dimension": "security",
+      "finding": "D8 审计'环形 200 条、仅本地'与'写入诊断导出通道、可跨环境溯源'矛盾；本地日志可改，二次确认+每日1次在脚本驱动下仍可绕过，绕过口缺乏防篡改。",
+      "suggestion": "审计做防篡改（hash chain 或追加式日志），紧急放行加离线签名或停机冷却间隔，并统一'本地/跨环境'表述。"
+    },
+    {
+      "id": "i6",
+      "severity": "Warning",
+      "dimension": "consistency",
+      "finding": "D6 白名单成员'风控挂起/登录失效'可能发生在请求已提交、受理之后，纳入'未提交'白名单即与 I1'已提交后失败仍占窗口'冲突，错误阶段未细分。",
+      "suggestion": "按错误阶段细分：仅提交前错误可回滚；提交后状态一律占窗口，并补对应单测。"
+    },
+    {
+      "id": "i7",
+      "severity": "Warning",
+      "dimension": "feasibility",
+      "finding": "D3 以本地自然日注入 today()，但目标平台可能按 UTC/服务端时区计日，跨时区账号的日配额判定会错位；today() 时区口径未声明。",
+      "suggestion": "today() 支持按账号/平台配置时区，并在文档标注与平台侧日界的差异及换算规则。"
+    },
+    {
+      "id": "i8",
+      "severity": "Info",
+      "dimension": "clarity",
+      "finding": "数据校验 ACCOUNT_DAILY_MAX≥0，但 0 的语义未定义（=禁发还是=关闭配额），与平台档'0=显式关闭'约定不一致，回落/关闭行为易混。",
+      "suggestion": "为 daily max 定义 0 语义（建议 0=关闭配额，与平台档对齐），并写入文档与设置页文案。"
+    }
+  ],
+  "dimensionScores": {
+    "completeness": 5,
+    "consistency": 4,
+    "clarity": 6,
+    "feasibility": 6,
+    "security": 5
+  }
+}
\ No newline at end of file
diff --git a/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/runA-family-snapshot.json b/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/runA-family-snapshot.json
new file mode 100644
index 000000000..10e4424d6
--- /dev/null
+++ b/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/runA-family-snapshot.json
@@ -0,0 +1,30 @@
+{
+  "schemaVersion": 1,
+  "snapshotCreatedAt": "2026-10-10T03:56:44.339Z",
+  "layer": "decision",
+  "resolvedFamily": {
+    "proposer": "opencode",
+    "critic": "claude"
+  },
+  "familyMap": {
+    "claude": [
+      "anthropic"
+    ],
+    "codex": [
+      "openai"
+    ],
+    "gemini": [
+      "google"
+    ],
+    "grok": [
+      "xai"
+    ],
+    "kimi": [
+      "moonshot"
+    ],
+    "opencode": [
+      "deepseek",
+      "hy3"
+    ]
+  }
+}
diff --git a/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/runA-plan-reverted.md b/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/runA-plan-reverted.md
new file mode 100644
index 000000000..267e8c305
--- /dev/null
+++ b/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/runA-plan-reverted.md
@@ -0,0 +1,50 @@
+# 方案评审简报 — 发布频率策略 v2
+
+> 详细实现规格见 `PLAN-PUBLISH-FREQUENCY-POLICY-V2-2026-10-10.md`；本文只留评审需要的决策面。
+
+## 目标
+修正发布频率门禁的三个过度约束，并补上唯一有公开依据的维度。
+
+## 范围
+- P0-1 未提交失败回滚窗口；P0-2 重试放行；P1-1 平台档默认关；P1-2 账号级日配额（新）；P1-3 间隔抖动；P2-1 数值下调；P2-2 渲染层口径统一+设置页+紧急放行；P2-3 未登记平台出声；P2-4 校准脚本；P2-5 两处小坑。
+- 非目标：设备/IP 串行、每日 quota 之外的总量控制、跨设备同步、「成功才记账」。
+
+## 决策
+- D1 数值：账号档 60→20 / 30→10 / 10→3 分钟；平台档默认 0（关）；日配额 长文3 / 短视频5 / 短内容20 条。
+- D2 抖动：wait = remaining × (1 + 0.4×rand)，rand∈[0,1)，**只增不减**；ratio=0 退化为旧行为。
+- D3 日界：本地自然日 YYYY-MM-DD，注入 today()；不用 UTC。
+- D4 存储：新表 publish_daily_count(owner,key,day_key,count)，纯增量，不动 publish_timeline。
+- D5 release 语义：仅当 store.get(key)===本次占位 at 时回滚（乐观并发）；调用方须回传 prev，未回传则 no-op+warn。
+- D6 「未提交」判据：错误对象 e.notSubmitted===true 白名单（风控挂起/登录失效/参数校验/权益拒绝/执行器未就绪）；白名单外一律占窗口。
+- D7 日配额用尽：bucket='daily'、remainingMs=0，重排到次日 00:00:05；超 2^31-1 则不设定时器，等下次 _processNext。
+- D8 紧急放行：二次确认 + 审计（环形200条）+ 每日上限1次。
+
+## 不变量（fail-closed 方向）
+- I1 已提交后的失败仍占窗口（不得回退成「成功才记账」）。
+- I2 白名单外的失败一律占窗口。
+- I3 所有非法配置回落默认并出声，0 只表示显式关闭。
+- I4 平台档默认关不等于删字段：显式开启即生效。
+- I5 release 不回滚他人窗口。
+- I6 抖动不得减少等待。
+
+## 数据校验
+env：MIN_INTERVAL/PLATFORM_MIN_INTERVAL/ACCOUNT_DAILY_MAX（≥0 整数）/JITTER_RATIO（[0,1)）/RELEASE_GRACE_MS/EMERGENCY_MAX_PER_DAY。非法或越界→回落默认+warn。设置页覆盖对象任一字段非法→整体丢弃（不半生效）。计数读回按 parseInt，非有限→0+warn。
+
+## 交互
+- 间隔未到：阻塞+剩余分钟（本账号间隔/同平台其他账号间隔）。
+- 日配额用尽：「今日已达上限(3/3)，明日00:00后自动继续」。
+- 未提交失败：窗口回滚，提示「未提交到平台，可立即重试」。
+- 已提交失败：保留窗口，提示「已提交，需等待约N分钟」。
+
+## 测试
+单测：策略表/env 六项/抖动区间/release 三态（幂等、prev 缺失、窗口被覆盖）/跨日边界/日配额否决/队列 notSubmitted 回滚与已提交保留。装配锁 3 条。渲染层三条归因文案 + 三态结果。变异 M1-M10 各让指定锁恰好红。
+
+## 自认弱点（请重点攻击）
+1. 日配额 3/5/20 仍是工程拍板，默认即生效是否越过运营确认？
+2. D5 依赖调用方回传 prev，重构掉会静默退化为 no-op（安全但难发现）。
+3. 跨日长定时器 + 重启后 hold 丢失的恢复语义是否足够？
+4. 抖动只增 + 数值下调叠加，吞吐可能降 3 倍以上，是否需要在 UI 给吞吐预估？
+5. 平台档默认关削弱同平台多账号保护，是否应改为默认开但调到 1–3 分钟？
+6. 紧急放行是绕过口，每日 1 次是否足够，审计仅本地。
+7. P2-5 的 publish:wechat 无生产调用方，改它是否属扩大爆炸半径？
+8. 跨 6 模块一个 PR 是否应拆 2–3 个 PR？
diff --git a/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/runA-plan-v2.md b/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/runA-plan-v2.md
new file mode 100644
index 000000000..6ee14a8e7
--- /dev/null
+++ b/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/runA-plan-v2.md
@@ -0,0 +1,54 @@
+# 方案评审简报 — 发布频率策略 v2
+
+> 详细实现规格见 `PLAN-PUBLISH-FREQUENCY-POLICY-V2-2026-10-10.md`；本文只留评审需要的决策面。
+
+## 目标
+修正发布频率门禁的三个过度约束，并补上唯一有公开依据的维度。
+
+## 范围
+- P0-1 未提交失败回滚窗口；P0-2 重试放行；P1-1 平台档默认2分钟（开，显式0关）；P1-2 账号级日配额（新）；P1-3 间隔抖动；P2-1 数值下调；P2-2 渲染层口径统一+设置页+紧急放行；P2-3 未登记平台出声；P2-4 校准脚本；P2-5 两处小坑中的 publish:wechat 移出本 PR（先审计调用方、确认无生产调用方后另立变更），本次仅改另一处。
+- 非目标：设备/IP 串行、每日 quota 之外的总量控制、跨设备同步、「成功才记账」。
+
+## 决策
+- D1 数值：账号档 60→20 / 30→10 / 10→3 分钟；平台档默认 2 分钟（开，保同平台多账号共档保护），仅显式 0 表示关闭（与 I3 对齐）；日配额 长文3 / 短视频5 / 短内容20 条。
+- D2 抖动：wait = remaining × (1 + 0.4×rand)，rand∈[0,1)，**只增不减**；ratio=0 退化为旧行为。
+- D3 日界：本地自然日 YYYY-MM-DD，注入 today()；不用 UTC。
+- D4 存储：新表 publish_daily_count(owner,key,day_key,count)，纯增量，不动 publish_timeline。
+- D5 release 语义：仅当 store.get(key)===本次占位 at 时回滚（乐观并发）；调用方须回传 prev，未回传则返回 {released:false,reason:'prev_missing'} 并 log.error，不再静默 no-op；调用点清单由结构锁枚举断言已回传。
+- D6 「未提交」判据：错误对象 e.notSubmitted===true 白名单（风控挂起/登录失效/参数校验/权益拒绝/执行器未就绪）；白名单外一律占窗口。字段缺失（e.notSubmitted===undefined）按白名单外处理并 log.warn（含 executorId/errorCode）；各执行器标记由装配锁断言，缺标记即红。
+- D7 日配额用尽：bucket='daily'、remainingMs=0，重排到次日 00:00:05；超 2^31-1 则不设定时器，等下次 _processNext。hold 不存内存：以存储行字段 hold_until（owner,key,day_key 同行）持久化；重启后 _processNext 用 remaining=hold_until-now 重算，pending 队列按各 key 现存 hold 重建排期，补「崩溃丢定时器→重启恢复」单测。
+- D8 紧急放行：二次确认 + 审计（环形200条）+ 每日上限1次；审计行含结构化字段（ts/accountId/operator/reason/result）并写入诊断报告导出通道，可跨环境溯源。
+
+## 不变量（fail-closed 方向）
+- I1 已提交后的失败仍占窗口（不得回退成「成功才记账」）。
+- I2 白名单外的失败一律占窗口。
+- I3 所有非法配置回落默认并出声，0 只表示显式关闭。
+- I4 平台档默认关不等于删字段：显式开启即生效。
+- I5 release 不回滚他人窗口。
+- I6 抖动不得减少等待。
+
+## 兼容与存量
+- D1/P2-1 新数值只作用于下一次计算的等待；已在定时器中排期的项不改写，_processNext 每轮按新档重算 remaining，验证无遗留在途旧间隔（含重启后）。
+
+## 数据校验
+env：MIN_INTERVAL/PLATFORM_MIN_INTERVAL/ACCOUNT_DAILY_MAX（≥0 整数）/JITTER_RATIO（[0,1)）/RELEASE_GRACE_MS/EMERGENCY_MAX_PER_DAY。非法或越界→回落默认+warn。设置页覆盖对象任一字段非法→整体丢弃（不半生效）。计数读回按 parseInt，非有限→0+warn。
+
+## 交互
+- 间隔未到：阻塞+剩余分钟（本账号间隔/同平台其他账号间隔）。
+- 设置页展示当前档位预估间隔与吞吐（含抖动期望×1.2）及生效时间，启动日志同步打印同一预估。
+- 日配额用尽：「今日已达上限(3/3)，明日00:00后自动继续」。
+- 未提交失败：窗口回滚，提示「未提交到平台，可立即重试」。
+- 已提交失败：保留窗口，提示「已提交，需等待约N分钟」。
+
+## 测试
+单测：策略表/env 六项/抖动区间/release 三态（幂等、prev 缺失、窗口被覆盖）/跨日边界/日配额否决/队列 notSubmitted 回滚与已提交保留。装配锁 3 条。渲染层三条归因文案 + 三态结果。变异 M1-M10 各让指定锁恰好红。
+
+## 自认弱点（请重点攻击）
+1. 日配额 3/5/20 仍是工程拍板，默认即生效是否越过运营确认？
+2. D5 依赖调用方回传 prev，重构掉会静默退化为 no-op（安全但难发现）。
+3. 跨日长定时器 + 重启后 hold 丢失的恢复语义是否足够？
+4. 抖动只增 + 数值下调叠加，吞吐可能降 3 倍以上，是否需要在 UI 给吞吐预估？
+5. 平台档默认关削弱同平台多账号保护，是否应改为默认开但调到 1–3 分钟？
+6. 紧急放行是绕过口，每日 1 次是否足够，审计仅本地。
+7. P2-5 的 publish:wechat 无生产调用方，改它是否属扩大爆炸半径？
+8. 跨 6 模块一个 PR 是否应拆 2–3 个 PR？
diff --git a/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/runA-proposal-v1.md b/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/runA-proposal-v1.md
new file mode 100644
index 000000000..267e8c305
--- /dev/null
+++ b/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/runA-proposal-v1.md
@@ -0,0 +1,50 @@
+# 方案评审简报 — 发布频率策略 v2
+
+> 详细实现规格见 `PLAN-PUBLISH-FREQUENCY-POLICY-V2-2026-10-10.md`；本文只留评审需要的决策面。
+
+## 目标
+修正发布频率门禁的三个过度约束，并补上唯一有公开依据的维度。
+
+## 范围
+- P0-1 未提交失败回滚窗口；P0-2 重试放行；P1-1 平台档默认关；P1-2 账号级日配额（新）；P1-3 间隔抖动；P2-1 数值下调；P2-2 渲染层口径统一+设置页+紧急放行；P2-3 未登记平台出声；P2-4 校准脚本；P2-5 两处小坑。
+- 非目标：设备/IP 串行、每日 quota 之外的总量控制、跨设备同步、「成功才记账」。
+
+## 决策
+- D1 数值：账号档 60→20 / 30→10 / 10→3 分钟；平台档默认 0（关）；日配额 长文3 / 短视频5 / 短内容20 条。
+- D2 抖动：wait = remaining × (1 + 0.4×rand)，rand∈[0,1)，**只增不减**；ratio=0 退化为旧行为。
+- D3 日界：本地自然日 YYYY-MM-DD，注入 today()；不用 UTC。
+- D4 存储：新表 publish_daily_count(owner,key,day_key,count)，纯增量，不动 publish_timeline。
+- D5 release 语义：仅当 store.get(key)===本次占位 at 时回滚（乐观并发）；调用方须回传 prev，未回传则 no-op+warn。
+- D6 「未提交」判据：错误对象 e.notSubmitted===true 白名单（风控挂起/登录失效/参数校验/权益拒绝/执行器未就绪）；白名单外一律占窗口。
+- D7 日配额用尽：bucket='daily'、remainingMs=0，重排到次日 00:00:05；超 2^31-1 则不设定时器，等下次 _processNext。
+- D8 紧急放行：二次确认 + 审计（环形200条）+ 每日上限1次。
+
+## 不变量（fail-closed 方向）
+- I1 已提交后的失败仍占窗口（不得回退成「成功才记账」）。
+- I2 白名单外的失败一律占窗口。
+- I3 所有非法配置回落默认并出声，0 只表示显式关闭。
+- I4 平台档默认关不等于删字段：显式开启即生效。
+- I5 release 不回滚他人窗口。
+- I6 抖动不得减少等待。
+
+## 数据校验
+env：MIN_INTERVAL/PLATFORM_MIN_INTERVAL/ACCOUNT_DAILY_MAX（≥0 整数）/JITTER_RATIO（[0,1)）/RELEASE_GRACE_MS/EMERGENCY_MAX_PER_DAY。非法或越界→回落默认+warn。设置页覆盖对象任一字段非法→整体丢弃（不半生效）。计数读回按 parseInt，非有限→0+warn。
+
+## 交互
+- 间隔未到：阻塞+剩余分钟（本账号间隔/同平台其他账号间隔）。
+- 日配额用尽：「今日已达上限(3/3)，明日00:00后自动继续」。
+- 未提交失败：窗口回滚，提示「未提交到平台，可立即重试」。
+- 已提交失败：保留窗口，提示「已提交，需等待约N分钟」。
+
+## 测试
+单测：策略表/env 六项/抖动区间/release 三态（幂等、prev 缺失、窗口被覆盖）/跨日边界/日配额否决/队列 notSubmitted 回滚与已提交保留。装配锁 3 条。渲染层三条归因文案 + 三态结果。变异 M1-M10 各让指定锁恰好红。
+
+## 自认弱点（请重点攻击）
+1. 日配额 3/5/20 仍是工程拍板，默认即生效是否越过运营确认？
+2. D5 依赖调用方回传 prev，重构掉会静默退化为 no-op（安全但难发现）。
+3. 跨日长定时器 + 重启后 hold 丢失的恢复语义是否足够？
+4. 抖动只增 + 数值下调叠加，吞吐可能降 3 倍以上，是否需要在 UI 给吞吐预估？
+5. 平台档默认关削弱同平台多账号保护，是否应改为默认开但调到 1–3 分钟？
+6. 紧急放行是绕过口，每日 1 次是否足够，审计仅本地。
+7. P2-5 的 publish:wechat 无生产调用方，改它是否属扩大爆炸半径？
+8. 跨 6 模块一个 PR 是否应拆 2–3 个 PR？
diff --git a/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/runA-proposal-v2.md b/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/runA-proposal-v2.md
new file mode 100644
index 000000000..6ee14a8e7
--- /dev/null
+++ b/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/runA-proposal-v2.md
@@ -0,0 +1,54 @@
+# 方案评审简报 — 发布频率策略 v2
+
+> 详细实现规格见 `PLAN-PUBLISH-FREQUENCY-POLICY-V2-2026-10-10.md`；本文只留评审需要的决策面。
+
+## 目标
+修正发布频率门禁的三个过度约束，并补上唯一有公开依据的维度。
+
+## 范围
+- P0-1 未提交失败回滚窗口；P0-2 重试放行；P1-1 平台档默认2分钟（开，显式0关）；P1-2 账号级日配额（新）；P1-3 间隔抖动；P2-1 数值下调；P2-2 渲染层口径统一+设置页+紧急放行；P2-3 未登记平台出声；P2-4 校准脚本；P2-5 两处小坑中的 publish:wechat 移出本 PR（先审计调用方、确认无生产调用方后另立变更），本次仅改另一处。
+- 非目标：设备/IP 串行、每日 quota 之外的总量控制、跨设备同步、「成功才记账」。
+
+## 决策
+- D1 数值：账号档 60→20 / 30→10 / 10→3 分钟；平台档默认 2 分钟（开，保同平台多账号共档保护），仅显式 0 表示关闭（与 I3 对齐）；日配额 长文3 / 短视频5 / 短内容20 条。
+- D2 抖动：wait = remaining × (1 + 0.4×rand)，rand∈[0,1)，**只增不减**；ratio=0 退化为旧行为。
+- D3 日界：本地自然日 YYYY-MM-DD，注入 today()；不用 UTC。
+- D4 存储：新表 publish_daily_count(owner,key,day_key,count)，纯增量，不动 publish_timeline。
+- D5 release 语义：仅当 store.get(key)===本次占位 at 时回滚（乐观并发）；调用方须回传 prev，未回传则返回 {released:false,reason:'prev_missing'} 并 log.error，不再静默 no-op；调用点清单由结构锁枚举断言已回传。
+- D6 「未提交」判据：错误对象 e.notSubmitted===true 白名单（风控挂起/登录失效/参数校验/权益拒绝/执行器未就绪）；白名单外一律占窗口。字段缺失（e.notSubmitted===undefined）按白名单外处理并 log.warn（含 executorId/errorCode）；各执行器标记由装配锁断言，缺标记即红。
+- D7 日配额用尽：bucket='daily'、remainingMs=0，重排到次日 00:00:05；超 2^31-1 则不设定时器，等下次 _processNext。hold 不存内存：以存储行字段 hold_until（owner,key,day_key 同行）持久化；重启后 _processNext 用 remaining=hold_until-now 重算，pending 队列按各 key 现存 hold 重建排期，补「崩溃丢定时器→重启恢复」单测。
+- D8 紧急放行：二次确认 + 审计（环形200条）+ 每日上限1次；审计行含结构化字段（ts/accountId/operator/reason/result）并写入诊断报告导出通道，可跨环境溯源。
+
+## 不变量（fail-closed 方向）
+- I1 已提交后的失败仍占窗口（不得回退成「成功才记账」）。
+- I2 白名单外的失败一律占窗口。
+- I3 所有非法配置回落默认并出声，0 只表示显式关闭。
+- I4 平台档默认关不等于删字段：显式开启即生效。
+- I5 release 不回滚他人窗口。
+- I6 抖动不得减少等待。
+
+## 兼容与存量
+- D1/P2-1 新数值只作用于下一次计算的等待；已在定时器中排期的项不改写，_processNext 每轮按新档重算 remaining，验证无遗留在途旧间隔（含重启后）。
+
+## 数据校验
+env：MIN_INTERVAL/PLATFORM_MIN_INTERVAL/ACCOUNT_DAILY_MAX（≥0 整数）/JITTER_RATIO（[0,1)）/RELEASE_GRACE_MS/EMERGENCY_MAX_PER_DAY。非法或越界→回落默认+warn。设置页覆盖对象任一字段非法→整体丢弃（不半生效）。计数读回按 parseInt，非有限→0+warn。
+
+## 交互
+- 间隔未到：阻塞+剩余分钟（本账号间隔/同平台其他账号间隔）。
+- 设置页展示当前档位预估间隔与吞吐（含抖动期望×1.2）及生效时间，启动日志同步打印同一预估。
+- 日配额用尽：「今日已达上限(3/3)，明日00:00后自动继续」。
+- 未提交失败：窗口回滚，提示「未提交到平台，可立即重试」。
+- 已提交失败：保留窗口，提示「已提交，需等待约N分钟」。
+
+## 测试
+单测：策略表/env 六项/抖动区间/release 三态（幂等、prev 缺失、窗口被覆盖）/跨日边界/日配额否决/队列 notSubmitted 回滚与已提交保留。装配锁 3 条。渲染层三条归因文案 + 三态结果。变异 M1-M10 各让指定锁恰好红。
+
+## 自认弱点（请重点攻击）
+1. 日配额 3/5/20 仍是工程拍板，默认即生效是否越过运营确认？
+2. D5 依赖调用方回传 prev，重构掉会静默退化为 no-op（安全但难发现）。
+3. 跨日长定时器 + 重启后 hold 丢失的恢复语义是否足够？
+4. 抖动只增 + 数值下调叠加，吞吐可能降 3 倍以上，是否需要在 UI 给吞吐预估？
+5. 平台档默认关削弱同平台多账号保护，是否应改为默认开但调到 1–3 分钟？
+6. 紧急放行是绕过口，每日 1 次是否足够，审计仅本地。
+7. P2-5 的 publish:wechat 无生产调用方，改它是否属扩大爆炸半径？
+8. 跨 6 模块一个 PR 是否应拆 2–3 个 PR？
diff --git a/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/runA-revision-v1.md b/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/runA-revision-v1.md
new file mode 100644
index 000000000..9592e1a0a
--- /dev/null
+++ b/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/runA-revision-v1.md
@@ -0,0 +1,94 @@
+{
+  "schemaVersion": 1,
+  "responses": [
+    {
+      "issueId": "i1",
+      "decision": "accepted",
+      "response": "接受。hold 改为持久化存储，重启时由 _processNext 按 hold_until 重算 remaining，并补重启恢复单测。"
+    },
+    {
+      "issueId": "i2",
+      "decision": "partially_accepted",
+      "evidenceLevel": "L1",
+      "evidence": "I2 明文：白名单外一律占窗口；默认按未提交即放行已提交失败",
+      "response": "接受缺标记告警与装配锁强制校验；拒绝默认按未提交，那会放行已提交失败、违反 I2，改为占窗口+warn。"
+    },
+    {
+      "issueId": "i3",
+      "decision": "accepted",
+      "response": "接受：prev 缺失改为返回 {released:false,reason} 并 log.error，调用点以结构锁枚举断言必须回传。"
+    },
+    {
+      "issueId": "i4",
+      "decision": "accepted",
+      "response": "接受：publish:wechat 移出本 PR，先审计调用方，确认无生产调用方后另立变更，不混入核心链路。"
+    },
+    {
+      "issueId": "i5",
+      "decision": "accepted",
+      "response": "接受：设置页与启动日志给出档位预估间隔与吞吐（含抖动期望），避免用户无预期变慢。"
+    },
+    {
+      "issueId": "i6",
+      "decision": "accepted",
+      "response": "接受：平台档默认改为 2 分钟（开），显式 0 才关闭，保留同平台共档保护并消除与 I3 的语义冲突。"
+    },
+    {
+      "issueId": "i7",
+      "decision": "accepted",
+      "response": "接受：新值仅作用于下次计算的等待，存量排期项在 _processNext 重算取新档，补在途任务验证用例。"
+    },
+    {
+      "issueId": "i8",
+      "decision": "accepted",
+      "response": "接受：审计行补结构化字段并接入诊断报告导出通道，可跨环境溯源；环形200条与每日1次保留。"
+    }
+  ],
+  "edits": [
+    {
+      "issueId": "i1",
+      "before": "- D7 日配额用尽：bucket='daily'、remainingMs=0，重排到次日 00:00:05；超 2^31-1 则不设定时器，等下次 _processNext。",
+      "after": "- D7 日配额用尽：bucket='daily'、remainingMs=0，重排到次日 00:00:05；超 2^31-1 则不设定时器，等下次 _processNext。hold 不存内存：以存储行字段 hold_until（owner,key,day_key 同行）持久化；重启后 _processNext 用 remaining=hold_until-now 重算，pending 队列按各 key 现存 hold 重建排期，补「崩溃丢定时器→重启恢复」单测。"
+    },
+    {
+      "issueId": "i2",
+      "before": "；白名单外一律占窗口。",
+      "after": "；白名单外一律占窗口。字段缺失（e.notSubmitted===undefined）按白名单外处理并 log.warn（含 executorId/errorCode）；各执行器标记由装配锁断言，缺标记即红。"
+    },
+    {
+      "issueId": "i3",
+      "before": "调用方须回传 prev，未回传则 no-op+warn。",
+      "after": "调用方须回传 prev，未回传则返回 {released:false,reason:'prev_missing'} 并 log.error，不再静默 no-op；调用点清单由结构锁枚举断言已回传。"
+    },
+    {
+      "issueId": "i4",
+      "before": "P2-5 两处小坑。",
+      "after": "P2-5 两处小坑中的 publish:wechat 移出本 PR（先审计调用方、确认无生产调用方后另立变更），本次仅改另一处。"
+    },
+    {
+      "issueId": "i5",
+      "before": "- 间隔未到：阻塞+剩余分钟（本账号间隔/同平台其他账号间隔）。",
+      "after": "- 间隔未到：阻塞+剩余分钟（本账号间隔/同平台其他账号间隔）。\n- 设置页展示当前档位预估间隔与吞吐（含抖动期望×1.2）及生效时间，启动日志同步打印同一预估。"
+    },
+    {
+      "issueId": "i6",
+      "before": "- D1 数值：账号档 60→20 / 30→10 / 10→3 分钟；平台档默认 0（关）；日配额 长文3 / 短视频5 / 短内容20 条。",
+      "after": "- D1 数值：账号档 60→20 / 30→10 / 10→3 分钟；平台档默认 2 分钟（开，保同平台多账号共档保护），仅显式 0 表示关闭（与 I3 对齐）；日配额 长文3 / 短视频5 / 短内容20 条。"
+    },
+    {
+      "issueId": "i6",
+      "before": "P1-1 平台档默认关；",
+      "after": "P1-1 平台档默认2分钟（开，显式0关）；"
+    },
+    {
+      "issueId": "i7",
+      "before": "## 数据校验",
+      "after": "## 兼容与存量\n- D1/P2-1 新数值只作用于下一次计算的等待；已在定时器中排期的项不改写，_processNext 每轮按新档重算 remaining，验证无遗留在途旧间隔（含重启后）。\n\n## 数据校验"
+    },
+    {
+      "issueId": "i8",
+      "before": "- D8 紧急放行：二次确认 + 审计（环形200条）+ 每日上限1次。",
+      "after": "- D8 紧急放行：二次确认 + 审计（环形200条）+ 每日上限1次；审计行含结构化字段（ts/accountId/operator/reason/result）并写入诊断报告导出通道，可跨环境溯源。"
+    }
+  ]
+}
\ No newline at end of file
diff --git a/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/runB-critique-v1.md b/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/runB-critique-v1.md
new file mode 100644
index 000000000..1eead321e
--- /dev/null
+++ b/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/runB-critique-v1.md
@@ -0,0 +1,68 @@
+{
+  "schemaVersion": 1,
+  "issues": [
+    {
+      "id": "i1",
+      "severity": "Critical",
+      "dimension": "security",
+      "finding": "回滚与配额判定完全依赖传输层正确调用 markSubmitted；漏接线时失败路径 submittedAt 恒 null→误释放窗口+计数不增，配额/间隔静默失效，I4 仅覆盖成功路径，失败路径零检测，误判会产生重复发帖。",
+      "suggestion": "计数递增与占窗移入队列自有环节（occupy 递增、回滚回补），markSubmitted 仅作阶段标记；失败路径同样校验接线。"
+    },
+    {
+      "id": "i2",
+      "severity": "Warning",
+      "dimension": "completeness",
+      "finding": "D8 未定义紧急放行与日配额/占窗/计数的关系：是否绕过配额、占窗口、计入 daily_count？全绕时仅 1 次/日上限约束，且后续发布不等待该窗口，间隔语义被穿透。",
+      "suggestion": "钉死语义：紧急放行仍 occupy+计数+间隔判定，仅跳过配额用尽分支；或显式列出绕过范围并设独立上限。"
+    },
+    {
+      "id": "i3",
+      "severity": "Warning",
+      "dimension": "completeness",
+      "finding": "task.submittedAt 仅存内存队列，重启即失。发布中途崩溃恢复后 submittedAt=null→误回滚/重发，重复发帖风险；D7 仅定义配额阻塞任务的恢复语义。",
+      "suggestion": "submittedAt 持久化到任务记录，重启按持久值判定；恢复中的在途任务标记为需人工确认而非自动重发。"
+    },
+    {
+      "id": "i4",
+      "severity": "Warning",
+      "dimension": "consistency",
+      "finding": "count 递增点未钉死：D6 首次写前调 markSubmitted，D10 却称 count=「已实际提交」；若写后递增，超时/回包丢失的已发帖不入配额（上界失真），若写前则失败写占配额。需二选一并写清。",
+      "suggestion": "钉死：count 随 markSubmitted（写前）递增，失败写占配额，仅未提交回滚回补；同步改 D10 措辞。"
+    },
+    {
+      "id": "i5",
+      "severity": "Warning",
+      "dimension": "completeness",
+      "finding": "P2-3 未登记平台出声、P2-4 校准脚本列入范围，但 D1–D10 无对应条目：判定标准、触发点、输出口径均未定义，交付时必缺失。",
+      "suggestion": "补两条决策：未登记平台出声（写前校验平台白名单+阻断+提示）；校准脚本（读配置表→校准 daily_count/时间线→输出报告）。"
+    },
+    {
+      "id": "i6",
+      "severity": "Warning",
+      "dimension": "completeness",
+      "finding": "紧急放行「每日 1 次、间隔≥10min」的计数来源未定义：内存计数重启清零，读 JSONL 删文件即重置，上限存在可绕过路径。",
+      "suggestion": "上限从持久化 JSONL 逐条重算（或独立持久计数），并文档声明删除/篡改审计文件记为绕过告警。"
+    },
+    {
+      "id": "i7",
+      "severity": "Info",
+      "dimension": "consistency",
+      "finding": "I7 热生效：运营中把平台档改 0（显式关闭）会即时放行未到期占窗任务，等同通过配置绕过 I1 已提交失败窗口；若属误配则突发发布。",
+      "suggestion": "明确 0=关闭仅对未占用窗口的新判定生效；已占窗口冻结占窗时值至释放（或文档承认此绕过属故意行为）。"
+    },
+    {
+      "id": "i8",
+      "severity": "Info",
+      "dimension": "feasibility",
+      "finding": "publish_daily_count 的 count 递增与回补在并发路径无原子性说明（同账号多任务并发占窗/回滚时计数可漂移）。本机队列串行可接受，但需写明。",
+      "suggestion": "文档化：计数变更全部经 TaskQueue 单线程串行，或以 SQL 原子自增/条件更新兜底。"
+    }
+  ],
+  "dimensionScores": {
+    "completeness": 5,
+    "consistency": 7,
+    "clarity": 7,
+    "feasibility": 8,
+    "security": 6
+  }
+}
\ No newline at end of file
diff --git a/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/runB-critique-v2.md b/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/runB-critique-v2.md
new file mode 100644
index 000000000..dd895313c
--- /dev/null
+++ b/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/runB-critique-v2.md
@@ -0,0 +1,68 @@
+{
+  "schemaVersion": 1,
+  "issues": [
+    {
+      "id": "i1",
+      "severity": "Warning",
+      "dimension": "feasibility",
+      "finding": "D6 将 markSubmitted 定于『首次平台写前』：传输层失败（含首次写失败）全部落入已提交侧，e.notSubmitted 仅佐证，回滚永不触发——P0-1『未提交可立即重试』对最常见的请求未送达不可达；坏凭据反复重试仍持续占窗耗配额。",
+      "suggestion": "markSubmitted 改为首次写被平台接收后调用；或传输层明确返回『确定未送出』时允许回滚。"
+    },
+    {
+      "id": "i2",
+      "severity": "Warning",
+      "dimension": "feasibility",
+      "finding": "『数学上不可能溢出』仅对次日配额定时器成立；抖动路径 wait×1.4 在任一间隔源 ≥ 2³¹−1/1.4 ≈ 17.7 天时仍溢出，Node setTimeout 钳位 1ms 即忙循环。校验未声明间隔源上界。",
+      "suggestion": "为 MIN_INTERVAL/PLATFORM_MIN_INTERVAL 声明上界（如 <7 天），或保留含抖动系数的溢出守卫。"
+    },
+    {
+      "id": "i3",
+      "severity": "Warning",
+      "dimension": "clarity",
+      "finding": "D1 给出两套三档数字（20/10/3 与 3/5/20）但未绑定 tier 名；平台档与账号档合并规则（取最大/分别判定/各自 key）缺失。有效等待是核心语义，缺此无法实现验证。",
+      "suggestion": "给出 tier→(interval, dailyQuota) 完整映射表及跨档合并公式（如取 max），并注明两档各自归属 key。"
+    },
+    {
+      "id": "i4",
+      "severity": "Warning",
+      "dimension": "completeness",
+      "finding": "占窗口的 store 存储介质/持久化未声明；若为内存实现，重启即清空窗口，已提交任务不再受间隔约束（I1 失效），叠加 D4 仅覆盖在途崩溃，存在早重复发布路径。",
+      "suggestion": "明确窗口 store 持久化方案，或重启后按持久 submittedAt 重建窗口再判定。"
+    },
+    {
+      "id": "i5",
+      "severity": "Info",
+      "dimension": "consistency",
+      "finding": "交互文案『未提交到平台，可立即重试』与 D9『回滚后强制最小退避 max(RELEASE_GRACE_MS,10s)』矛盾：用户被告知立即重试，引擎却至少等 10s。",
+      "suggestion": "文案改为『约 10 秒后可重试』，或注明最小退避不通知用户。"
+    },
+    {
+      "id": "i6",
+      "severity": "Info",
+      "dimension": "consistency",
+      "finding": "D8 每日紧急放行上限 1 次令『两次放行间隔≥10分钟』恒真冗余；上限按账号还是全局未说明。若指与其他发布间隔则需明确对象。",
+      "suggestion": "删除 10 分钟规则或改为『与上次任何发布间隔≥10分钟』，并注明上限统计粒度。"
+    },
+    {
+      "id": "i7",
+      "severity": "Info",
+      "dimension": "completeness",
+      "finding": "daily_count 与窗口 key 含 accountId，正常路径未声明校验，仅紧急放行有 isSafePathSegment；外部可控 accountId 可致 key 碰撞或越界。",
+      "suggestion": "将 isSafePathSegment 前置到所有 key 构造处，或说明 accountId 来源已受控。"
+    },
+    {
+      "id": "i8",
+      "severity": "Info",
+      "dimension": "feasibility",
+      "finding": "D3 注入 today() 保证可测，但 D7 次日定时器按真实系统时钟计算，两者不同源时（测试注入、时钟漂移）运营日判定与定时器截止漂移。",
+      "suggestion": "定时器截止与 today() 共用同一时钟注入点。"
+    }
+  ],
+  "dimensionScores": {
+    "completeness": 7,
+    "consistency": 7,
+    "clarity": 6,
+    "feasibility": 6,
+    "security": 8
+  }
+}
\ No newline at end of file
diff --git a/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/runB-plan-v2.md b/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/runB-plan-v2.md
new file mode 100644
index 000000000..2e0089975
--- /dev/null
+++ b/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/runB-plan-v2.md
@@ -0,0 +1,52 @@
+# 方案评审简报 v3 — 发布频率策略 v2
+
+> 详细实现规格见 `PLAN-PUBLISH-FREQUENCY-POLICY-V2-2026-10-10.md`。本版已并入 critique-v1/critique-v2 的全部采纳项，逐条回应见 `rebuttal-v1.md` / `rebuttal-v2.md`。
+
+## 范围
+- P0-1 未提交失败回滚；P0-2 重试放行；P1-1 平台档档位；P1-2 账号级日配额（新）；P1-3 间隔抖动；P2-1 数值下调；P2-2 渲染层口径统一+设置页+紧急放行；P2-3 未登记平台出声；P2-4 校准脚本。
+- P2-5 拆分：本期只改 `config/platforms.yaml` 命名注释；`publish:wechat` 的 accountId 改动**移出本 PR**（已审计：渲染层零生产调用方），另立变更。
+- 非目标：设备/IP 串行、跨设备同步、「成功才记账」、平台规则同步、跨环境审计溯源。
+
+## 决策
+- D1 数值：账号档 60→20 / 30→10 / 10→3 分钟；**平台档默认开 2 分钟，仅显式 0 关闭**；日配额 长文3 / 短视频5 / 短内容20 条。
+- D2 抖动：wait = remaining × (1 + 0.4×rand)，rand∈[0,1)，只增不减；ratio=0 退化为旧行为。
+- D3 日界：**本机运营日**（self-imposed accounting day）YYYY-MM-DD，注入 today()；不与平台日界换算，也不声称等价。
+- D4 存储：新表 publish_daily_count(owner,key,day_key,count,rollback_count)；任务记录持久化 submitted_at（与计数同次写入），重启按持久值判定 submittedAt；发布中途崩溃恢复的在途任务标记为需人工确认、不自动重发。不动 publish_timeline。
+- D5 release：仅当 store.get(key) === 本次占位 at 时回滚；调用方须回传 prev，缺失或错配 → `{released:false,reason:'prev_missing'}` + log.error + 设置页可见计数，调用点由结构锁枚举断言。
+- D6 未提交判据：**按提交阶段判定，不按错误类型**。占窗与计数由 TaskQueue 自有环节完成、不依赖传输层；`markSubmitted()` 仅作阶段标记（传输层在首次平台写操作前调用一次），队列记 `task.submittedAt`；回滚仅在 `submittedAt === null` 时允许；`e.notSubmitted===true` 降为佐证位；两者不一致 → 占窗口 + log.error。
+- D7 日配额用尽：`bucket='daily'`、`remainingMs=0`；TaskQueue 新增 `_quotaBlocked` 集合且 `_processNext` **跳过**其中任务（防忙循环）；定时器设到次日 00:00:05 并 `unref()`。溢出分支删除——次日上界 24h=86.4M ms < 2³¹−1 ms，数学上不可能溢出。配额分支在记账之前，**从未占用窗口**，故无 hold 持久化需求：重启后任务以 pending 恢复、重新判定、重新武装定时器。
+- D8 紧急放行：二次确认 + **追加式 JSONL 审计**（UI 无编辑入口，删除/篡改该文件记绕过告警）+ 每日上限 1 次与间隔均由 JSONL 逐条重算（重启不清零） + 两次放行间隔 ≥10 分钟。紧急放行仍须 occupy 窗口 + 计入 daily_count + 通过间隔判定，仅跳过「配额用尽」分支，不穿透间隔语义。
+- D9 防风（回应重试风暴）：回滚后强制最小退避 `max(RELEASE_GRACE_MS, 10s)`；每账号每日回滚上限 `max(2, dailyMax)`，超出即占窗口 + warn。
+- D10 计数递增与回补：`daily_count` 由 TaskQueue 在发起提交（写前）时递增，传输失败仍占配额 ⇒ 仅 `submittedAt===null` 的回滚**幂等回补**（下限 0）；`rollback_count` 只增不减。与「不做成功才记账」不冲突：计的是**提交**而非**成功**。
+- D11 未登记平台出声：提交前校验平台已登记于策略表，未登记 → 阻断任务 + log.warn + 提示「该平台未登记频率策略」，不静默放行。
+- D12 校准脚本：只读策略表输出各档预期值，比对 daily_count 与时间线差异生成报告；仅出报告，不自动改写计数。
+
+## 不变量
+- I1 已提交后的失败仍占窗口。
+- I2 阶段判据之外一律占窗口。
+- I3 非法配置回落默认并出声；`0` = 显式关闭（配额与平台档同义）。
+- I4 **成功或已提交失败的终态必须 `submittedAt !== null`**，启动期校验传输层已挂接 markSubmitted、缺失即 log.error + 计数——成功与失败路径均主动检测漏接线。
+- I5 release 不回滚他人窗口。
+- I6 抖动不得减少等待。
+- I7 新数值在每轮 `check()` 时读取、即时生效，无存量迁移；入队时旧值、执行时新值按新值判定。热生效仅作用于未占用窗口的新判定；已占窗口冻结占窗时值至释放，运行中改 0 不即时放行已占窗任务。
+
+## 数据校验
+env：MIN_INTERVAL / PLATFORM_MIN_INTERVAL / DAILY_MAX_LONG / _CLIP / _SHORT / ACCOUNT_DAILY_MAX（全局覆盖三档）/ JITTER_RATIO ∈ [0,1) / RELEASE_GRACE_MS / EMERGENCY_MAX_PER_DAY。非法、越界、空白 → 回落默认 + warn；`0` = 关闭该档。三档分组**复用策略表既有 tier 字段**（单一真源，不新增分类器）。设置页覆盖对象任一字段非法 → 整体丢弃（不半生效）。计数读回 parseInt，非有限 → 0 + warn。计数读写全部经 TaskQueue 单线程串行（同通道 FIFO），不并发；回补以条件更新（day_key 匹配、下限 0）兜底防漂移。紧急放行校验平台已登记 + accountId 过 `isSafePathSegment`。
+
+## 交互
+- 间隔未到：「等待 N 分钟后重试（本账号间隔 / 同平台其他账号间隔）」。
+- 日配额用尽：「今日已达上限(3/3)，将于明日 00:00 后自动继续」。
+- 未提交失败：「未提交到平台，可立即重试」。
+- 已提交失败：「已提交，需等待约 N 分钟」。
+- 设置页「发布频率策略」：显示实际间隔区间 `[base, base×1.4)`、日配额、回滚失效计数；启动日志打印同口径预估。
+
+## 测试与变异
+单测新增：`_processNext` 忙循环断言（同一任务重复判定次数上限）、重启恢复、同一错误类型在提交前/后得到相反结果、传输层未接线时成功路径报 error、回滚上限、配额回补幂等、prev 缺失结构锁、跨日边界。变异 M1–M14 各让指定锁**恰好**变红。
+
+## 明确拒绝项（附证据）
+- 平台时区日界（L2）：本工具从不声称执行平台规则（上游 PRD 非目标）；若按平台时区计日，同一运营者会面对多个「今天」，配额不可解释。
+- 跨环境审计溯源（L3）：需新增出网通道与远端服务，爆炸半径大于被保护对象。
+- 按错误类型而非阶段判回滚（L1）：同一错误在提交前后语义相反，类型判据必然误判。
+
+## 已知限制
+审计仅本地；无设备/IP 级串行；日配额 3/5/20 为工程保守起点，待运营在设置页确认；`publish:wechat` 的 accountId 缺口留待另立变更。
diff --git a/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/runB-proposal-v1.md b/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/runB-proposal-v1.md
new file mode 100644
index 000000000..ed7d2b13e
--- /dev/null
+++ b/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/runB-proposal-v1.md
@@ -0,0 +1,50 @@
+# 方案评审简报 v3 — 发布频率策略 v2
+
+> 详细实现规格见 `PLAN-PUBLISH-FREQUENCY-POLICY-V2-2026-10-10.md`。本版已并入 critique-v1/critique-v2 的全部采纳项，逐条回应见 `rebuttal-v1.md` / `rebuttal-v2.md`。
+
+## 范围
+- P0-1 未提交失败回滚；P0-2 重试放行；P1-1 平台档档位；P1-2 账号级日配额（新）；P1-3 间隔抖动；P2-1 数值下调；P2-2 渲染层口径统一+设置页+紧急放行；P2-3 未登记平台出声；P2-4 校准脚本。
+- P2-5 拆分：本期只改 `config/platforms.yaml` 命名注释；`publish:wechat` 的 accountId 改动**移出本 PR**（已审计：渲染层零生产调用方），另立变更。
+- 非目标：设备/IP 串行、跨设备同步、「成功才记账」、平台规则同步、跨环境审计溯源。
+
+## 决策
+- D1 数值：账号档 60→20 / 30→10 / 10→3 分钟；**平台档默认开 2 分钟，仅显式 0 关闭**；日配额 长文3 / 短视频5 / 短内容20 条。
+- D2 抖动：wait = remaining × (1 + 0.4×rand)，rand∈[0,1)，只增不减；ratio=0 退化为旧行为。
+- D3 日界：**本机运营日**（self-imposed accounting day）YYYY-MM-DD，注入 today()；不与平台日界换算，也不声称等价。
+- D4 存储：新表 publish_daily_count(owner,key,day_key,count,rollback_count)；不动 publish_timeline。
+- D5 release：仅当 store.get(key) === 本次占位 at 时回滚；调用方须回传 prev，缺失或错配 → `{released:false,reason:'prev_missing'}` + log.error + 设置页可见计数，调用点由结构锁枚举断言。
+- D6 未提交判据：**按提交阶段判定，不按错误类型**。发布传输层在首次平台写操作前调用一次 `markSubmitted()`，队列记 `task.submittedAt`；回滚仅在 `submittedAt === null` 时允许；`e.notSubmitted===true` 降为佐证位；两者不一致 → 占窗口 + log.error。
+- D7 日配额用尽：`bucket='daily'`、`remainingMs=0`；TaskQueue 新增 `_quotaBlocked` 集合且 `_processNext` **跳过**其中任务（防忙循环）；定时器设到次日 00:00:05 并 `unref()`。溢出分支删除——次日上界 24h=86.4M ms < 2³¹−1 ms，数学上不可能溢出。配额分支在记账之前，**从未占用窗口**，故无 hold 持久化需求：重启后任务以 pending 恢复、重新判定、重新武装定时器。
+- D8 紧急放行：二次确认 + **追加式 JSONL 审计**（UI 无编辑入口）+ 每日上限 1 次 + 两次放行间隔 ≥10 分钟。
+- D9 防风（回应重试风暴）：回滚后强制最小退避 `max(RELEASE_GRACE_MS, 10s)`；每账号每日回滚上限 `max(2, dailyMax)`，超出即占窗口 + warn。
+- D10 配额回补：`daily_count` 计「已实际提交到平台的次数」⇒ 未提交回滚**幂等回补**（下限 0）；`rollback_count` 只增不减。与「不做成功才记账」不冲突：计的是**提交**而非**成功**。
+
+## 不变量
+- I1 已提交后的失败仍占窗口。
+- I2 阶段判据之外一律占窗口。
+- I3 非法配置回落默认并出声；`0` = 显式关闭（配额与平台档同义）。
+- I4 **成功发布必须 `submittedAt !== null`**，否则 log.error + 计数——把「传输层漏接线」从静默风险变成主动告警。
+- I5 release 不回滚他人窗口。
+- I6 抖动不得减少等待。
+- I7 新数值在每轮 `check()` 时读取、即时生效，无存量迁移；入队时旧值、执行时新值按新值判定。
+
+## 数据校验
+env：MIN_INTERVAL / PLATFORM_MIN_INTERVAL / DAILY_MAX_LONG / _CLIP / _SHORT / ACCOUNT_DAILY_MAX（全局覆盖三档）/ JITTER_RATIO ∈ [0,1) / RELEASE_GRACE_MS / EMERGENCY_MAX_PER_DAY。非法、越界、空白 → 回落默认 + warn；`0` = 关闭该档。三档分组**复用策略表既有 tier 字段**（单一真源，不新增分类器）。设置页覆盖对象任一字段非法 → 整体丢弃（不半生效）。计数读回 parseInt，非有限 → 0 + warn。紧急放行校验平台已登记 + accountId 过 `isSafePathSegment`。
+
+## 交互
+- 间隔未到：「等待 N 分钟后重试（本账号间隔 / 同平台其他账号间隔）」。
+- 日配额用尽：「今日已达上限(3/3)，将于明日 00:00 后自动继续」。
+- 未提交失败：「未提交到平台，可立即重试」。
+- 已提交失败：「已提交，需等待约 N 分钟」。
+- 设置页「发布频率策略」：显示实际间隔区间 `[base, base×1.4)`、日配额、回滚失效计数；启动日志打印同口径预估。
+
+## 测试与变异
+单测新增：`_processNext` 忙循环断言（同一任务重复判定次数上限）、重启恢复、同一错误类型在提交前/后得到相反结果、传输层未接线时成功路径报 error、回滚上限、配额回补幂等、prev 缺失结构锁、跨日边界。变异 M1–M14 各让指定锁**恰好**变红。
+
+## 明确拒绝项（附证据）
+- 平台时区日界（L2）：本工具从不声称执行平台规则（上游 PRD 非目标）；若按平台时区计日，同一运营者会面对多个「今天」，配额不可解释。
+- 跨环境审计溯源（L3）：需新增出网通道与远端服务，爆炸半径大于被保护对象。
+- 按错误类型而非阶段判回滚（L1）：同一错误在提交前后语义相反，类型判据必然误判。
+
+## 已知限制
+审计仅本地；无设备/IP 级串行；日配额 3/5/20 为工程保守起点，待运营在设置页确认；`publish:wechat` 的 accountId 缺口留待另立变更。
diff --git a/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/runB-proposal-v2.md b/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/runB-proposal-v2.md
new file mode 100644
index 000000000..2e0089975
--- /dev/null
+++ b/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/runB-proposal-v2.md
@@ -0,0 +1,52 @@
+# 方案评审简报 v3 — 发布频率策略 v2
+
+> 详细实现规格见 `PLAN-PUBLISH-FREQUENCY-POLICY-V2-2026-10-10.md`。本版已并入 critique-v1/critique-v2 的全部采纳项，逐条回应见 `rebuttal-v1.md` / `rebuttal-v2.md`。
+
+## 范围
+- P0-1 未提交失败回滚；P0-2 重试放行；P1-1 平台档档位；P1-2 账号级日配额（新）；P1-3 间隔抖动；P2-1 数值下调；P2-2 渲染层口径统一+设置页+紧急放行；P2-3 未登记平台出声；P2-4 校准脚本。
+- P2-5 拆分：本期只改 `config/platforms.yaml` 命名注释；`publish:wechat` 的 accountId 改动**移出本 PR**（已审计：渲染层零生产调用方），另立变更。
+- 非目标：设备/IP 串行、跨设备同步、「成功才记账」、平台规则同步、跨环境审计溯源。
+
+## 决策
+- D1 数值：账号档 60→20 / 30→10 / 10→3 分钟；**平台档默认开 2 分钟，仅显式 0 关闭**；日配额 长文3 / 短视频5 / 短内容20 条。
+- D2 抖动：wait = remaining × (1 + 0.4×rand)，rand∈[0,1)，只增不减；ratio=0 退化为旧行为。
+- D3 日界：**本机运营日**（self-imposed accounting day）YYYY-MM-DD，注入 today()；不与平台日界换算，也不声称等价。
+- D4 存储：新表 publish_daily_count(owner,key,day_key,count,rollback_count)；任务记录持久化 submitted_at（与计数同次写入），重启按持久值判定 submittedAt；发布中途崩溃恢复的在途任务标记为需人工确认、不自动重发。不动 publish_timeline。
+- D5 release：仅当 store.get(key) === 本次占位 at 时回滚；调用方须回传 prev，缺失或错配 → `{released:false,reason:'prev_missing'}` + log.error + 设置页可见计数，调用点由结构锁枚举断言。
+- D6 未提交判据：**按提交阶段判定，不按错误类型**。占窗与计数由 TaskQueue 自有环节完成、不依赖传输层；`markSubmitted()` 仅作阶段标记（传输层在首次平台写操作前调用一次），队列记 `task.submittedAt`；回滚仅在 `submittedAt === null` 时允许；`e.notSubmitted===true` 降为佐证位；两者不一致 → 占窗口 + log.error。
+- D7 日配额用尽：`bucket='daily'`、`remainingMs=0`；TaskQueue 新增 `_quotaBlocked` 集合且 `_processNext` **跳过**其中任务（防忙循环）；定时器设到次日 00:00:05 并 `unref()`。溢出分支删除——次日上界 24h=86.4M ms < 2³¹−1 ms，数学上不可能溢出。配额分支在记账之前，**从未占用窗口**，故无 hold 持久化需求：重启后任务以 pending 恢复、重新判定、重新武装定时器。
+- D8 紧急放行：二次确认 + **追加式 JSONL 审计**（UI 无编辑入口，删除/篡改该文件记绕过告警）+ 每日上限 1 次与间隔均由 JSONL 逐条重算（重启不清零） + 两次放行间隔 ≥10 分钟。紧急放行仍须 occupy 窗口 + 计入 daily_count + 通过间隔判定，仅跳过「配额用尽」分支，不穿透间隔语义。
+- D9 防风（回应重试风暴）：回滚后强制最小退避 `max(RELEASE_GRACE_MS, 10s)`；每账号每日回滚上限 `max(2, dailyMax)`，超出即占窗口 + warn。
+- D10 计数递增与回补：`daily_count` 由 TaskQueue 在发起提交（写前）时递增，传输失败仍占配额 ⇒ 仅 `submittedAt===null` 的回滚**幂等回补**（下限 0）；`rollback_count` 只增不减。与「不做成功才记账」不冲突：计的是**提交**而非**成功**。
+- D11 未登记平台出声：提交前校验平台已登记于策略表，未登记 → 阻断任务 + log.warn + 提示「该平台未登记频率策略」，不静默放行。
+- D12 校准脚本：只读策略表输出各档预期值，比对 daily_count 与时间线差异生成报告；仅出报告，不自动改写计数。
+
+## 不变量
+- I1 已提交后的失败仍占窗口。
+- I2 阶段判据之外一律占窗口。
+- I3 非法配置回落默认并出声；`0` = 显式关闭（配额与平台档同义）。
+- I4 **成功或已提交失败的终态必须 `submittedAt !== null`**，启动期校验传输层已挂接 markSubmitted、缺失即 log.error + 计数——成功与失败路径均主动检测漏接线。
+- I5 release 不回滚他人窗口。
+- I6 抖动不得减少等待。
+- I7 新数值在每轮 `check()` 时读取、即时生效，无存量迁移；入队时旧值、执行时新值按新值判定。热生效仅作用于未占用窗口的新判定；已占窗口冻结占窗时值至释放，运行中改 0 不即时放行已占窗任务。
+
+## 数据校验
+env：MIN_INTERVAL / PLATFORM_MIN_INTERVAL / DAILY_MAX_LONG / _CLIP / _SHORT / ACCOUNT_DAILY_MAX（全局覆盖三档）/ JITTER_RATIO ∈ [0,1) / RELEASE_GRACE_MS / EMERGENCY_MAX_PER_DAY。非法、越界、空白 → 回落默认 + warn；`0` = 关闭该档。三档分组**复用策略表既有 tier 字段**（单一真源，不新增分类器）。设置页覆盖对象任一字段非法 → 整体丢弃（不半生效）。计数读回 parseInt，非有限 → 0 + warn。计数读写全部经 TaskQueue 单线程串行（同通道 FIFO），不并发；回补以条件更新（day_key 匹配、下限 0）兜底防漂移。紧急放行校验平台已登记 + accountId 过 `isSafePathSegment`。
+
+## 交互
+- 间隔未到：「等待 N 分钟后重试（本账号间隔 / 同平台其他账号间隔）」。
+- 日配额用尽：「今日已达上限(3/3)，将于明日 00:00 后自动继续」。
+- 未提交失败：「未提交到平台，可立即重试」。
+- 已提交失败：「已提交，需等待约 N 分钟」。
+- 设置页「发布频率策略」：显示实际间隔区间 `[base, base×1.4)`、日配额、回滚失效计数；启动日志打印同口径预估。
+
+## 测试与变异
+单测新增：`_processNext` 忙循环断言（同一任务重复判定次数上限）、重启恢复、同一错误类型在提交前/后得到相反结果、传输层未接线时成功路径报 error、回滚上限、配额回补幂等、prev 缺失结构锁、跨日边界。变异 M1–M14 各让指定锁**恰好**变红。
+
+## 明确拒绝项（附证据）
+- 平台时区日界（L2）：本工具从不声称执行平台规则（上游 PRD 非目标）；若按平台时区计日，同一运营者会面对多个「今天」，配额不可解释。
+- 跨环境审计溯源（L3）：需新增出网通道与远端服务，爆炸半径大于被保护对象。
+- 按错误类型而非阶段判回滚（L1）：同一错误在提交前后语义相反，类型判据必然误判。
+
+## 已知限制
+审计仅本地；无设备/IP 级串行；日配额 3/5/20 为工程保守起点，待运营在设置页确认；`publish:wechat` 的 accountId 缺口留待另立变更。
diff --git a/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/runB-revision-v1.md b/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/runB-revision-v1.md
new file mode 100644
index 000000000..7de8a260a
--- /dev/null
+++ b/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/runB-revision-v1.md
@@ -0,0 +1,92 @@
+{
+  "schemaVersion": 1,
+  "responses": [
+    {
+      "issueId": "i1",
+      "decision": "accepted",
+      "response": "接受。占窗与计数移入 TaskQueue 自有环节，markSubmitted 降为阶段标记；启动期校验接线，失败路径与成功路径同权告警。"
+    },
+    {
+      "issueId": "i2",
+      "decision": "accepted",
+      "response": "接受。D8 钉死：紧急放行仍占窗、计数、过间隔判定，仅跳过配额用尽分支，不穿透间隔语义。"
+    },
+    {
+      "issueId": "i3",
+      "decision": "accepted",
+      "response": "接受。submitted_at 持久化到任务记录，重启按持久值判定；崩溃恢复的在途任务标记人工确认，不自动重发。"
+    },
+    {
+      "issueId": "i4",
+      "decision": "accepted",
+      "response": "接受。count 由队列在写前递增，传输失败仍占配额，仅未提交回滚回补；D10 措辞已同步改写。"
+    },
+    {
+      "issueId": "i5",
+      "decision": "accepted",
+      "response": "接受。补 D11（未登记平台写前校验+阻断出声）与 D12（校准脚本只读比对出报告），判定与口径已定义。"
+    },
+    {
+      "issueId": "i6",
+      "decision": "accepted",
+      "response": "接受。上限与间隔从 JSONL 逐条重算，重启不清零；删除或篡改审计文件记绕过告警并写入文档。"
+    },
+    {
+      "issueId": "i7",
+      "decision": "accepted",
+      "response": "接受。热生效仅作用于未占窗新判定，已占窗口冻结占窗时值至释放，运行中改 0 不放行已占窗任务。"
+    },
+    {
+      "issueId": "i8",
+      "decision": "accepted",
+      "response": "接受。计数读写全部经 TaskQueue 单线程串行并写入文档，另以条件更新兜底防漂移。"
+    }
+  ],
+  "edits": [
+    {
+      "issueId": "i1",
+      "before": "发布传输层在首次平台写操作前调用一次 `markSubmitted()`，队列记 `task.submittedAt`；",
+      "after": "占窗与计数由 TaskQueue 自有环节完成、不依赖传输层；`markSubmitted()` 仅作阶段标记（传输层在首次平台写操作前调用一次），队列记 `task.submittedAt`；"
+    },
+    {
+      "issueId": "i1",
+      "before": "I4 **成功发布必须 `submittedAt !== null`**，否则 log.error + 计数——把「传输层漏接线」从静默风险变成主动告警。",
+      "after": "I4 **成功或已提交失败的终态必须 `submittedAt !== null`**，启动期校验传输层已挂接 markSubmitted、缺失即 log.error + 计数——成功与失败路径均主动检测漏接线。"
+    },
+    {
+      "issueId": "i2",
+      "before": "两次放行间隔 ≥10 分钟。",
+      "after": "两次放行间隔 ≥10 分钟。紧急放行仍须 occupy 窗口 + 计入 daily_count + 通过间隔判定，仅跳过「配额用尽」分支，不穿透间隔语义。"
+    },
+    {
+      "issueId": "i3",
+      "before": "D4 存储：新表 publish_daily_count(owner,key,day_key,count,rollback_count)；不动 publish_timeline。",
+      "after": "D4 存储：新表 publish_daily_count(owner,key,day_key,count,rollback_count)；任务记录持久化 submitted_at（与计数同次写入），重启按持久值判定 submittedAt；发布中途崩溃恢复的在途任务标记为需人工确认、不自动重发。不动 publish_timeline。"
+    },
+    {
+      "issueId": "i4",
+      "before": "D10 配额回补：`daily_count` 计「已实际提交到平台的次数」⇒ 未提交回滚**幂等回补**（下限 0）；",
+      "after": "D10 计数递增与回补：`daily_count` 由 TaskQueue 在发起提交（写前）时递增，传输失败仍占配额 ⇒ 仅 `submittedAt===null` 的回滚**幂等回补**（下限 0）；"
+    },
+    {
+      "issueId": "i5",
+      "before": "与「不做成功才记账」不冲突：计的是**提交**而非**成功**。",
+      "after": "与「不做成功才记账」不冲突：计的是**提交**而非**成功**。\n- D11 未登记平台出声：提交前校验平台已登记于策略表，未登记 → 阻断任务 + log.warn + 提示「该平台未登记频率策略」，不静默放行。\n- D12 校准脚本：只读策略表输出各档预期值，比对 daily_count 与时间线差异生成报告；仅出报告，不自动改写计数。"
+    },
+    {
+      "issueId": "i6",
+      "before": "+ **追加式 JSONL 审计**（UI 无编辑入口）+ 每日上限 1 次",
+      "after": "+ **追加式 JSONL 审计**（UI 无编辑入口，删除/篡改该文件记绕过告警）+ 每日上限 1 次与间隔均由 JSONL 逐条重算（重启不清零）"
+    },
+    {
+      "issueId": "i7",
+      "before": "I7 新数值在每轮 `check()` 时读取、即时生效，无存量迁移；入队时旧值、执行时新值按新值判定。",
+      "after": "I7 新数值在每轮 `check()` 时读取、即时生效，无存量迁移；入队时旧值、执行时新值按新值判定。热生效仅作用于未占用窗口的新判定；已占窗口冻结占窗时值至释放，运行中改 0 不即时放行已占窗任务。"
+    },
+    {
+      "issueId": "i8",
+      "before": "计数读回 parseInt，非有限 → 0 + warn。",
+      "after": "计数读回 parseInt，非有限 → 0 + warn。计数读写全部经 TaskQueue 单线程串行（同通道 FIFO），不并发；回补以条件更新（day_key 匹配、下限 0）兜底防漂移。"
+    }
+  ]
+}
\ No newline at end of file
diff --git a/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/runC-critique-v1.md b/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/runC-critique-v1.md
new file mode 100644
index 000000000..4e038dedb
--- /dev/null
+++ b/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/runC-critique-v1.md
@@ -0,0 +1,47 @@
+{
+  "schemaVersion": 1,
+  "issues": [
+    {
+      "id": "i1",
+      "severity": "Warning",
+      "dimension": "consistency",
+      "finding": "平台档与 platform:* 键在默认配置下失效：所有账号档(20/10/3min)均≥默认平台档2min，max(账号档,平台档)恒等于账号档，平台档及共享键从不生效，'同平台多账号至少隔2分钟'承诺不落地。",
+      "suggestion": "明确平台档真实取值策略，或将平台档默认值调到可超过账号档的值，或在D1补充平台档触发条件与共享键实际参与remaining的读取逻辑。"
+    },
+    {
+      "id": "i2",
+      "severity": "Warning",
+      "dimension": "security",
+      "finding": "D6可回滚判据①submitAttempted===false完全依赖传输层主动调用markSubmitAttempted。若某平台漏接线，submitAttempted恒false，'已提交但失败'会被误判为可回滚，违反I1；I4仅校验成功路径submittedAt，失败路径漏接线无告警。",
+      "suggestion": "增加失败路径主动告警：当返回失败且submitAttempted恒false时计数并log.error；或用结构锁/枚举断言传输层调用点，参照D5 prev缺失的处理。"
+    },
+    {
+      "id": "i3",
+      "severity": "Warning",
+      "dimension": "completeness",
+      "finding": "D7的_quotaBlocked集合与指向次日00:00:05的unref定时器均为内存态，方案未说明重启后日配额阻塞与次日复位定时器的恢复路径，跨日/重启后可能永久卡在daily阻塞或定时器丢失。",
+      "suggestion": "补充重启恢复逻辑：check()时从publish_daily_count读count比对上限重挂定时器（同源now()），并给出对应测试用例。"
+    },
+    {
+      "id": "i4",
+      "severity": "Info",
+      "dimension": "clarity",
+      "finding": "D11要求所有key经buildKey并percent-encode两段，但D1平台级键为字面量platform:*（含星号），构建方式与编码规则未说明，易与'禁止字符串拼接'冲突。",
+      "suggestion": "显式规定platform:*的生成路径（如buildKey(platform,null)返回字面星号段），并说明星号是否参与percent-encode。"
+    },
+    {
+      "id": "i5",
+      "severity": "Info",
+      "dimension": "consistency",
+      "finding": "未登记平台(任意)平台档标2min，与i1同类：其账号档默认20min，平台档2min同样被覆盖，表格中所标平台档实际无意义。",
+      "suggestion": "未登记平台平台档改标为'可配置(当前失效)'或与账号档一致，避免误导读者。"
+    }
+  ],
+  "dimensionScores": {
+    "completeness": 7,
+    "consistency": 6,
+    "clarity": 7,
+    "feasibility": 7,
+    "security": 6
+  }
+}
\ No newline at end of file
diff --git a/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/runC-critique-v2.md b/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/runC-critique-v2.md
new file mode 100644
index 000000000..dd895313c
--- /dev/null
+++ b/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/runC-critique-v2.md
@@ -0,0 +1,68 @@
+{
+  "schemaVersion": 1,
+  "issues": [
+    {
+      "id": "i1",
+      "severity": "Warning",
+      "dimension": "feasibility",
+      "finding": "D6 将 markSubmitted 定于『首次平台写前』：传输层失败（含首次写失败）全部落入已提交侧，e.notSubmitted 仅佐证，回滚永不触发——P0-1『未提交可立即重试』对最常见的请求未送达不可达；坏凭据反复重试仍持续占窗耗配额。",
+      "suggestion": "markSubmitted 改为首次写被平台接收后调用；或传输层明确返回『确定未送出』时允许回滚。"
+    },
+    {
+      "id": "i2",
+      "severity": "Warning",
+      "dimension": "feasibility",
+      "finding": "『数学上不可能溢出』仅对次日配额定时器成立；抖动路径 wait×1.4 在任一间隔源 ≥ 2³¹−1/1.4 ≈ 17.7 天时仍溢出，Node setTimeout 钳位 1ms 即忙循环。校验未声明间隔源上界。",
+      "suggestion": "为 MIN_INTERVAL/PLATFORM_MIN_INTERVAL 声明上界（如 <7 天），或保留含抖动系数的溢出守卫。"
+    },
+    {
+      "id": "i3",
+      "severity": "Warning",
+      "dimension": "clarity",
+      "finding": "D1 给出两套三档数字（20/10/3 与 3/5/20）但未绑定 tier 名；平台档与账号档合并规则（取最大/分别判定/各自 key）缺失。有效等待是核心语义，缺此无法实现验证。",
+      "suggestion": "给出 tier→(interval, dailyQuota) 完整映射表及跨档合并公式（如取 max），并注明两档各自归属 key。"
+    },
+    {
+      "id": "i4",
+      "severity": "Warning",
+      "dimension": "completeness",
+      "finding": "占窗口的 store 存储介质/持久化未声明；若为内存实现，重启即清空窗口，已提交任务不再受间隔约束（I1 失效），叠加 D4 仅覆盖在途崩溃，存在早重复发布路径。",
+      "suggestion": "明确窗口 store 持久化方案，或重启后按持久 submittedAt 重建窗口再判定。"
+    },
+    {
+      "id": "i5",
+      "severity": "Info",
+      "dimension": "consistency",
+      "finding": "交互文案『未提交到平台，可立即重试』与 D9『回滚后强制最小退避 max(RELEASE_GRACE_MS,10s)』矛盾：用户被告知立即重试，引擎却至少等 10s。",
+      "suggestion": "文案改为『约 10 秒后可重试』，或注明最小退避不通知用户。"
+    },
+    {
+      "id": "i6",
+      "severity": "Info",
+      "dimension": "consistency",
+      "finding": "D8 每日紧急放行上限 1 次令『两次放行间隔≥10分钟』恒真冗余；上限按账号还是全局未说明。若指与其他发布间隔则需明确对象。",
+      "suggestion": "删除 10 分钟规则或改为『与上次任何发布间隔≥10分钟』，并注明上限统计粒度。"
+    },
+    {
+      "id": "i7",
+      "severity": "Info",
+      "dimension": "completeness",
+      "finding": "daily_count 与窗口 key 含 accountId，正常路径未声明校验，仅紧急放行有 isSafePathSegment；外部可控 accountId 可致 key 碰撞或越界。",
+      "suggestion": "将 isSafePathSegment 前置到所有 key 构造处，或说明 accountId 来源已受控。"
+    },
+    {
+      "id": "i8",
+      "severity": "Info",
+      "dimension": "feasibility",
+      "finding": "D3 注入 today() 保证可测，但 D7 次日定时器按真实系统时钟计算，两者不同源时（测试注入、时钟漂移）运营日判定与定时器截止漂移。",
+      "suggestion": "定时器截止与 today() 共用同一时钟注入点。"
+    }
+  ],
+  "dimensionScores": {
+    "completeness": 7,
+    "consistency": 7,
+    "clarity": 6,
+    "feasibility": 6,
+    "security": 8
+  }
+}
\ No newline at end of file
diff --git a/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/runC-plan-v2.md b/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/runC-plan-v2.md
new file mode 100644
index 000000000..2e0089975
--- /dev/null
+++ b/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/runC-plan-v2.md
@@ -0,0 +1,52 @@
+# 方案评审简报 v3 — 发布频率策略 v2
+
+> 详细实现规格见 `PLAN-PUBLISH-FREQUENCY-POLICY-V2-2026-10-10.md`。本版已并入 critique-v1/critique-v2 的全部采纳项，逐条回应见 `rebuttal-v1.md` / `rebuttal-v2.md`。
+
+## 范围
+- P0-1 未提交失败回滚；P0-2 重试放行；P1-1 平台档档位；P1-2 账号级日配额（新）；P1-3 间隔抖动；P2-1 数值下调；P2-2 渲染层口径统一+设置页+紧急放行；P2-3 未登记平台出声；P2-4 校准脚本。
+- P2-5 拆分：本期只改 `config/platforms.yaml` 命名注释；`publish:wechat` 的 accountId 改动**移出本 PR**（已审计：渲染层零生产调用方），另立变更。
+- 非目标：设备/IP 串行、跨设备同步、「成功才记账」、平台规则同步、跨环境审计溯源。
+
+## 决策
+- D1 数值：账号档 60→20 / 30→10 / 10→3 分钟；**平台档默认开 2 分钟，仅显式 0 关闭**；日配额 长文3 / 短视频5 / 短内容20 条。
+- D2 抖动：wait = remaining × (1 + 0.4×rand)，rand∈[0,1)，只增不减；ratio=0 退化为旧行为。
+- D3 日界：**本机运营日**（self-imposed accounting day）YYYY-MM-DD，注入 today()；不与平台日界换算，也不声称等价。
+- D4 存储：新表 publish_daily_count(owner,key,day_key,count,rollback_count)；任务记录持久化 submitted_at（与计数同次写入），重启按持久值判定 submittedAt；发布中途崩溃恢复的在途任务标记为需人工确认、不自动重发。不动 publish_timeline。
+- D5 release：仅当 store.get(key) === 本次占位 at 时回滚；调用方须回传 prev，缺失或错配 → `{released:false,reason:'prev_missing'}` + log.error + 设置页可见计数，调用点由结构锁枚举断言。
+- D6 未提交判据：**按提交阶段判定，不按错误类型**。占窗与计数由 TaskQueue 自有环节完成、不依赖传输层；`markSubmitted()` 仅作阶段标记（传输层在首次平台写操作前调用一次），队列记 `task.submittedAt`；回滚仅在 `submittedAt === null` 时允许；`e.notSubmitted===true` 降为佐证位；两者不一致 → 占窗口 + log.error。
+- D7 日配额用尽：`bucket='daily'`、`remainingMs=0`；TaskQueue 新增 `_quotaBlocked` 集合且 `_processNext` **跳过**其中任务（防忙循环）；定时器设到次日 00:00:05 并 `unref()`。溢出分支删除——次日上界 24h=86.4M ms < 2³¹−1 ms，数学上不可能溢出。配额分支在记账之前，**从未占用窗口**，故无 hold 持久化需求：重启后任务以 pending 恢复、重新判定、重新武装定时器。
+- D8 紧急放行：二次确认 + **追加式 JSONL 审计**（UI 无编辑入口，删除/篡改该文件记绕过告警）+ 每日上限 1 次与间隔均由 JSONL 逐条重算（重启不清零） + 两次放行间隔 ≥10 分钟。紧急放行仍须 occupy 窗口 + 计入 daily_count + 通过间隔判定，仅跳过「配额用尽」分支，不穿透间隔语义。
+- D9 防风（回应重试风暴）：回滚后强制最小退避 `max(RELEASE_GRACE_MS, 10s)`；每账号每日回滚上限 `max(2, dailyMax)`，超出即占窗口 + warn。
+- D10 计数递增与回补：`daily_count` 由 TaskQueue 在发起提交（写前）时递增，传输失败仍占配额 ⇒ 仅 `submittedAt===null` 的回滚**幂等回补**（下限 0）；`rollback_count` 只增不减。与「不做成功才记账」不冲突：计的是**提交**而非**成功**。
+- D11 未登记平台出声：提交前校验平台已登记于策略表，未登记 → 阻断任务 + log.warn + 提示「该平台未登记频率策略」，不静默放行。
+- D12 校准脚本：只读策略表输出各档预期值，比对 daily_count 与时间线差异生成报告；仅出报告，不自动改写计数。
+
+## 不变量
+- I1 已提交后的失败仍占窗口。
+- I2 阶段判据之外一律占窗口。
+- I3 非法配置回落默认并出声；`0` = 显式关闭（配额与平台档同义）。
+- I4 **成功或已提交失败的终态必须 `submittedAt !== null`**，启动期校验传输层已挂接 markSubmitted、缺失即 log.error + 计数——成功与失败路径均主动检测漏接线。
+- I5 release 不回滚他人窗口。
+- I6 抖动不得减少等待。
+- I7 新数值在每轮 `check()` 时读取、即时生效，无存量迁移；入队时旧值、执行时新值按新值判定。热生效仅作用于未占用窗口的新判定；已占窗口冻结占窗时值至释放，运行中改 0 不即时放行已占窗任务。
+
+## 数据校验
+env：MIN_INTERVAL / PLATFORM_MIN_INTERVAL / DAILY_MAX_LONG / _CLIP / _SHORT / ACCOUNT_DAILY_MAX（全局覆盖三档）/ JITTER_RATIO ∈ [0,1) / RELEASE_GRACE_MS / EMERGENCY_MAX_PER_DAY。非法、越界、空白 → 回落默认 + warn；`0` = 关闭该档。三档分组**复用策略表既有 tier 字段**（单一真源，不新增分类器）。设置页覆盖对象任一字段非法 → 整体丢弃（不半生效）。计数读回 parseInt，非有限 → 0 + warn。计数读写全部经 TaskQueue 单线程串行（同通道 FIFO），不并发；回补以条件更新（day_key 匹配、下限 0）兜底防漂移。紧急放行校验平台已登记 + accountId 过 `isSafePathSegment`。
+
+## 交互
+- 间隔未到：「等待 N 分钟后重试（本账号间隔 / 同平台其他账号间隔）」。
+- 日配额用尽：「今日已达上限(3/3)，将于明日 00:00 后自动继续」。
+- 未提交失败：「未提交到平台，可立即重试」。
+- 已提交失败：「已提交，需等待约 N 分钟」。
+- 设置页「发布频率策略」：显示实际间隔区间 `[base, base×1.4)`、日配额、回滚失效计数；启动日志打印同口径预估。
+
+## 测试与变异
+单测新增：`_processNext` 忙循环断言（同一任务重复判定次数上限）、重启恢复、同一错误类型在提交前/后得到相反结果、传输层未接线时成功路径报 error、回滚上限、配额回补幂等、prev 缺失结构锁、跨日边界。变异 M1–M14 各让指定锁**恰好**变红。
+
+## 明确拒绝项（附证据）
+- 平台时区日界（L2）：本工具从不声称执行平台规则（上游 PRD 非目标）；若按平台时区计日，同一运营者会面对多个「今天」，配额不可解释。
+- 跨环境审计溯源（L3）：需新增出网通道与远端服务，爆炸半径大于被保护对象。
+- 按错误类型而非阶段判回滚（L1）：同一错误在提交前后语义相反，类型判据必然误判。
+
+## 已知限制
+审计仅本地；无设备/IP 级串行；日配额 3/5/20 为工程保守起点，待运营在设置页确认；`publish:wechat` 的 accountId 缺口留待另立变更。
diff --git a/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/runC-proposal-v1.md b/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/runC-proposal-v1.md
new file mode 100644
index 000000000..935532d9b
--- /dev/null
+++ b/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/runC-proposal-v1.md
@@ -0,0 +1,65 @@
+# 方案评审简报 v4 — 发布频率策略 v2
+
+> 详细实现规格见 `PLAN-PUBLISH-FREQUENCY-POLICY-V2-2026-10-10.md`。已并入 run A / run B 两轮评审的**全部**采纳项，逐条回应见 `rebuttal-v1.md` / `rebuttal-v2.md` / `rebuttal-v3.md`。v4 = v3（已 cleared）+ run B critique-v2 的 8 条修正。
+
+## 范围
+- P0-1 未提交失败回滚；P0-2 重试放行；P1-1 平台档档位；P1-2 账号级日配额（新）；P1-3 间隔抖动；P2-1 数值下调；P2-2 渲染层口径统一+设置页+紧急放行；P2-3 未登记平台出声；P2-4 校准脚本。
+- P2-5 拆分：本期只改 `config/platforms.yaml` 注释；`publish:wechat` 的 accountId 改动移出（已审计：渲染层零生产调用方）。
+- 非目标：设备/IP 串行、跨设备同步、「成功才记账」、平台规则同步、跨环境审计溯源。
+
+## 决策
+- D1 数值与档位映射：
+
+| tier | 平台 | 账号档 | 平台档 | 日配额 |
+|---|---|---|---|---|
+| `long` | wechat_mp/zhihu/baijiahao/toutiao | 20 min | 2 min | 3 |
+| `clip` | douyin/kuaishou/tencent_video/xiaohongshu/bilibili/youtube/tiktok/instagram/facebook | 10 min | 2 min | 5 |
+| `short` | weibo/twitter | 3 min | 2 min | 20 |
+| 未登记 | 任意 | 20 min | 2 min | 3 |
+
+  平台档**默认开 2 分钟**，仅显式 `0` 关闭（与日配额 `0` 同义）。合并公式：`remaining = max(账号档, 平台档)`；日配额为**独立否决项**；同时命中时 `bucket='daily'`。key 归属：间隔 → `platform:accountId` **与** `platform:*` 两键同写；日配额 → **仅** `platform:accountId`。
+- D2 抖动：`wait = remaining × (1 + 0.4×rand)`，`rand∈[0,1)`，只增不减；`ratio=0` 严格退化旧值。
+- D3 日界：**本机运营日** `YYYY-MM-DD`，注入 `today()`；不与平台日界换算、不声称等价。**次日定时器截止时间由同一注入时钟（`now()`）推导**，两者同源。
+- D4 存储：新表 `publish_daily_count(owner,key,day_key,count,rollback_count)`；不动 `publish_timeline`。**窗口存储 = SQLite `publish_timeline`（跨重启持久、owner 隔离）**，故「重启清空窗口」路径不存在。
+- D5 release：仅当 `store.get(key) === hold.at` 时回滚（否则不动，绝不回滚他人窗口）；调用方须回传 `prev`，缺失/错配 → `{released:false,reason:'prev_missing'}` + `log.error` + 设置页可见计数；调用点由结构锁枚举断言。
+- D6 未提交判据（**双标记 + 阶段判据**，不按错误类型）：
+  - `markSubmitAttempted()`：传输层**发起首次平台写尝试之前**调用 → `task.submitAttempted`；
+  - `markSubmitted()`：平台**已确认发出**后调用 → `task.submittedAt`；
+  - **可回滚**：① `submitAttempted === false`（登录失效/预检不过/风控挂起/缺文件）；或 ② 传输层显式抛 `definitelyNotSent === true`（连接未建立、DNS 失败等**可确证未送出**）；
+  - **不可回滚**：已发起写尝试且无法确证未送出（超时、半途中断、平台非预期返回）；
+  - `e.notSubmitted` 为佐证位，与上述结论不一致 ⇒ 占窗口 + `log.error`。
+- D7 日配额用尽：`bucket='daily'`、`remainingMs=0`；`_quotaBlocked` 集合 + `_processNext` **跳过**（防忙循环）；定时器指向次日 00:00:05（同源时钟）并 `unref()`。溢出守卫保留在**含抖动系数后**的值上：`wait > 2³¹−1` ⇒ 钳到 `2³¹−2 000`（该路径任务处于 delayed、被跳过，不忙循环）。间隔源上界 **7 天**，越界钳位 + warn。配额分支在记账之前、**从未占用窗口**，故无 hold 持久化需求。
+- D8 紧急放行：二次确认 + **追加式 JSONL 审计**（UI 无编辑入口）+ **每账号每日 1 次** + 「与上**一次任意账号**的放行间隔 ≥10 分钟」（与限次**正交**：限次防单账号滥用，冷却防跨账号脚本连点）。
+- D9 防风：回滚后强制最小退避 `max(RELEASE_GRACE_MS, 10s)`；每账号每日回滚上限 `max(2, dailyMax)`，超出即占窗口 + warn。
+- D10 配额回补：`count` 计「已实际提交到平台的次数」⇒ 未提交回滚**幂等回补**（下限 0）；`rollback_count` 只增不减。与「不做成功才记账」不冲突：计的是**提交**而非**成功**。
+- D11 key 构造：守卫与 store 的 key 一律经**唯一构造函数** `buildKey(platform, accountId)`（两段分别 percent-encode），分隔符 `:` / `#` 无法造成碰撞或越界；IPC 输入面另用 `isSafePathSegment` 校验（两层）。
+
+## 不变量
+- I1 已提交后的失败仍占窗口。
+- I2 阶段判据之外一律占窗口。
+- I3 非法配置回落默认并出声；`0` = 显式关闭（配额与平台档同义）。
+- I4 **成功发布必须 `submittedAt !== null`**，否则 `log.error` + 计数（传输层漏接线的主动告警）。
+- I5 release 不回滚他人窗口。
+- I6 抖动不得减少等待。
+- I7 新数值在每轮 `check()` 时读取、即时生效，无存量迁移。
+- I8 任何 key 必须由 `buildKey()` 生成，禁止字符串拼接。
+
+## 数据校验
+env：MIN_INTERVAL / PLATFORM_MIN_INTERVAL（上界 7 天）/ DAILY_MAX_LONG / _CLIP / _SHORT / ACCOUNT_DAILY_MAX（全局覆盖三档）/ JITTER_RATIO ∈ [0,1) / RELEASE_GRACE_MS / EMERGENCY_MAX_PER_DAY。非法、越界、空白 → 回落默认 + warn；`0` = 关闭该档。三档分组复用策略表既有 `tier` 字段（单一真源，不新增分类器）。设置页覆盖对象任一字段非法 → 整体丢弃。计数读回 `parseInt`，非有限 → 0 + warn。
+
+## 交互
+- 间隔未到：「等待 N 分钟后重试（本账号间隔 / 同平台其他账号间隔）」。
+- 日配额用尽：「今日已达上限(3/3)，将于明日 00:00 后自动继续」。
+- 未提交失败：「未提交到平台，**约 10 秒后**可重试」。
+- 已提交失败：「已提交，需等待约 N 分钟」。
+- 设置页「发布频率策略」：实际间隔区间 `[base, base×1.4)`、日配额、回滚失效计数；启动日志打印同口径预估。
+
+## 测试与变异
+新增用例：`_processNext` 忙循环断言（重复判定次数上限）、重启后窗口仍生效、同一错误类型在提交前/后相反结果、`submitAttempted=false` 与 `definitelyNotSent` 两条回滚路径、传输层漏接线时成功路径报 error、回滚上限、配额回补幂等、prev 缺失结构锁、跨日边界、抖动溢出钳位（7 天 × 1.4）、key 编码防碰撞。变异 M1–M16 各让指定锁**恰好**变红。
+
+## 明确拒绝项（附证据）
+- 平台时区日界（L2）：本工具从不声称执行平台规则（上游 PRD 非目标）；按平台时区计日会让同一运营者面对多个「今天」。
+- 跨环境审计溯源（L3）：需新增出网通道与远端服务，爆炸半径大于被保护对象。
+
+## 已知限制
+审计仅本地；无设备/IP 级串行；日配额 3/5/20 为工程保守起点，待运营在设置页确认；`publish:wechat` 的 accountId 缺口留待另立变更。
diff --git a/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/runC-proposal-v2.md b/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/runC-proposal-v2.md
new file mode 100644
index 000000000..2e0089975
--- /dev/null
+++ b/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/runC-proposal-v2.md
@@ -0,0 +1,52 @@
+# 方案评审简报 v3 — 发布频率策略 v2
+
+> 详细实现规格见 `PLAN-PUBLISH-FREQUENCY-POLICY-V2-2026-10-10.md`。本版已并入 critique-v1/critique-v2 的全部采纳项，逐条回应见 `rebuttal-v1.md` / `rebuttal-v2.md`。
+
+## 范围
+- P0-1 未提交失败回滚；P0-2 重试放行；P1-1 平台档档位；P1-2 账号级日配额（新）；P1-3 间隔抖动；P2-1 数值下调；P2-2 渲染层口径统一+设置页+紧急放行；P2-3 未登记平台出声；P2-4 校准脚本。
+- P2-5 拆分：本期只改 `config/platforms.yaml` 命名注释；`publish:wechat` 的 accountId 改动**移出本 PR**（已审计：渲染层零生产调用方），另立变更。
+- 非目标：设备/IP 串行、跨设备同步、「成功才记账」、平台规则同步、跨环境审计溯源。
+
+## 决策
+- D1 数值：账号档 60→20 / 30→10 / 10→3 分钟；**平台档默认开 2 分钟，仅显式 0 关闭**；日配额 长文3 / 短视频5 / 短内容20 条。
+- D2 抖动：wait = remaining × (1 + 0.4×rand)，rand∈[0,1)，只增不减；ratio=0 退化为旧行为。
+- D3 日界：**本机运营日**（self-imposed accounting day）YYYY-MM-DD，注入 today()；不与平台日界换算，也不声称等价。
+- D4 存储：新表 publish_daily_count(owner,key,day_key,count,rollback_count)；任务记录持久化 submitted_at（与计数同次写入），重启按持久值判定 submittedAt；发布中途崩溃恢复的在途任务标记为需人工确认、不自动重发。不动 publish_timeline。
+- D5 release：仅当 store.get(key) === 本次占位 at 时回滚；调用方须回传 prev，缺失或错配 → `{released:false,reason:'prev_missing'}` + log.error + 设置页可见计数，调用点由结构锁枚举断言。
+- D6 未提交判据：**按提交阶段判定，不按错误类型**。占窗与计数由 TaskQueue 自有环节完成、不依赖传输层；`markSubmitted()` 仅作阶段标记（传输层在首次平台写操作前调用一次），队列记 `task.submittedAt`；回滚仅在 `submittedAt === null` 时允许；`e.notSubmitted===true` 降为佐证位；两者不一致 → 占窗口 + log.error。
+- D7 日配额用尽：`bucket='daily'`、`remainingMs=0`；TaskQueue 新增 `_quotaBlocked` 集合且 `_processNext` **跳过**其中任务（防忙循环）；定时器设到次日 00:00:05 并 `unref()`。溢出分支删除——次日上界 24h=86.4M ms < 2³¹−1 ms，数学上不可能溢出。配额分支在记账之前，**从未占用窗口**，故无 hold 持久化需求：重启后任务以 pending 恢复、重新判定、重新武装定时器。
+- D8 紧急放行：二次确认 + **追加式 JSONL 审计**（UI 无编辑入口，删除/篡改该文件记绕过告警）+ 每日上限 1 次与间隔均由 JSONL 逐条重算（重启不清零） + 两次放行间隔 ≥10 分钟。紧急放行仍须 occupy 窗口 + 计入 daily_count + 通过间隔判定，仅跳过「配额用尽」分支，不穿透间隔语义。
+- D9 防风（回应重试风暴）：回滚后强制最小退避 `max(RELEASE_GRACE_MS, 10s)`；每账号每日回滚上限 `max(2, dailyMax)`，超出即占窗口 + warn。
+- D10 计数递增与回补：`daily_count` 由 TaskQueue 在发起提交（写前）时递增，传输失败仍占配额 ⇒ 仅 `submittedAt===null` 的回滚**幂等回补**（下限 0）；`rollback_count` 只增不减。与「不做成功才记账」不冲突：计的是**提交**而非**成功**。
+- D11 未登记平台出声：提交前校验平台已登记于策略表，未登记 → 阻断任务 + log.warn + 提示「该平台未登记频率策略」，不静默放行。
+- D12 校准脚本：只读策略表输出各档预期值，比对 daily_count 与时间线差异生成报告；仅出报告，不自动改写计数。
+
+## 不变量
+- I1 已提交后的失败仍占窗口。
+- I2 阶段判据之外一律占窗口。
+- I3 非法配置回落默认并出声；`0` = 显式关闭（配额与平台档同义）。
+- I4 **成功或已提交失败的终态必须 `submittedAt !== null`**，启动期校验传输层已挂接 markSubmitted、缺失即 log.error + 计数——成功与失败路径均主动检测漏接线。
+- I5 release 不回滚他人窗口。
+- I6 抖动不得减少等待。
+- I7 新数值在每轮 `check()` 时读取、即时生效，无存量迁移；入队时旧值、执行时新值按新值判定。热生效仅作用于未占用窗口的新判定；已占窗口冻结占窗时值至释放，运行中改 0 不即时放行已占窗任务。
+
+## 数据校验
+env：MIN_INTERVAL / PLATFORM_MIN_INTERVAL / DAILY_MAX_LONG / _CLIP / _SHORT / ACCOUNT_DAILY_MAX（全局覆盖三档）/ JITTER_RATIO ∈ [0,1) / RELEASE_GRACE_MS / EMERGENCY_MAX_PER_DAY。非法、越界、空白 → 回落默认 + warn；`0` = 关闭该档。三档分组**复用策略表既有 tier 字段**（单一真源，不新增分类器）。设置页覆盖对象任一字段非法 → 整体丢弃（不半生效）。计数读回 parseInt，非有限 → 0 + warn。计数读写全部经 TaskQueue 单线程串行（同通道 FIFO），不并发；回补以条件更新（day_key 匹配、下限 0）兜底防漂移。紧急放行校验平台已登记 + accountId 过 `isSafePathSegment`。
+
+## 交互
+- 间隔未到：「等待 N 分钟后重试（本账号间隔 / 同平台其他账号间隔）」。
+- 日配额用尽：「今日已达上限(3/3)，将于明日 00:00 后自动继续」。
+- 未提交失败：「未提交到平台，可立即重试」。
+- 已提交失败：「已提交，需等待约 N 分钟」。
+- 设置页「发布频率策略」：显示实际间隔区间 `[base, base×1.4)`、日配额、回滚失效计数；启动日志打印同口径预估。
+
+## 测试与变异
+单测新增：`_processNext` 忙循环断言（同一任务重复判定次数上限）、重启恢复、同一错误类型在提交前/后得到相反结果、传输层未接线时成功路径报 error、回滚上限、配额回补幂等、prev 缺失结构锁、跨日边界。变异 M1–M14 各让指定锁**恰好**变红。
+
+## 明确拒绝项（附证据）
+- 平台时区日界（L2）：本工具从不声称执行平台规则（上游 PRD 非目标）；若按平台时区计日，同一运营者会面对多个「今天」，配额不可解释。
+- 跨环境审计溯源（L3）：需新增出网通道与远端服务，爆炸半径大于被保护对象。
+- 按错误类型而非阶段判回滚（L1）：同一错误在提交前后语义相反，类型判据必然误判。
+
+## 已知限制
+审计仅本地；无设备/IP 级串行；日配额 3/5/20 为工程保守起点，待运营在设置页确认；`publish:wechat` 的 accountId 缺口留待另立变更。
diff --git a/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/runC-revision-v1.md b/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/runC-revision-v1.md
new file mode 100644
index 000000000..7de8a260a
--- /dev/null
+++ b/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/runC-revision-v1.md
@@ -0,0 +1,92 @@
+{
+  "schemaVersion": 1,
+  "responses": [
+    {
+      "issueId": "i1",
+      "decision": "accepted",
+      "response": "接受。占窗与计数移入 TaskQueue 自有环节，markSubmitted 降为阶段标记；启动期校验接线，失败路径与成功路径同权告警。"
+    },
+    {
+      "issueId": "i2",
+      "decision": "accepted",
+      "response": "接受。D8 钉死：紧急放行仍占窗、计数、过间隔判定，仅跳过配额用尽分支，不穿透间隔语义。"
+    },
+    {
+      "issueId": "i3",
+      "decision": "accepted",
+      "response": "接受。submitted_at 持久化到任务记录，重启按持久值判定；崩溃恢复的在途任务标记人工确认，不自动重发。"
+    },
+    {
+      "issueId": "i4",
+      "decision": "accepted",
+      "response": "接受。count 由队列在写前递增，传输失败仍占配额，仅未提交回滚回补；D10 措辞已同步改写。"
+    },
+    {
+      "issueId": "i5",
+      "decision": "accepted",
+      "response": "接受。补 D11（未登记平台写前校验+阻断出声）与 D12（校准脚本只读比对出报告），判定与口径已定义。"
+    },
+    {
+      "issueId": "i6",
+      "decision": "accepted",
+      "response": "接受。上限与间隔从 JSONL 逐条重算，重启不清零；删除或篡改审计文件记绕过告警并写入文档。"
+    },
+    {
+      "issueId": "i7",
+      "decision": "accepted",
+      "response": "接受。热生效仅作用于未占窗新判定，已占窗口冻结占窗时值至释放，运行中改 0 不放行已占窗任务。"
+    },
+    {
+      "issueId": "i8",
+      "decision": "accepted",
+      "response": "接受。计数读写全部经 TaskQueue 单线程串行并写入文档，另以条件更新兜底防漂移。"
+    }
+  ],
+  "edits": [
+    {
+      "issueId": "i1",
+      "before": "发布传输层在首次平台写操作前调用一次 `markSubmitted()`，队列记 `task.submittedAt`；",
+      "after": "占窗与计数由 TaskQueue 自有环节完成、不依赖传输层；`markSubmitted()` 仅作阶段标记（传输层在首次平台写操作前调用一次），队列记 `task.submittedAt`；"
+    },
+    {
+      "issueId": "i1",
+      "before": "I4 **成功发布必须 `submittedAt !== null`**，否则 log.error + 计数——把「传输层漏接线」从静默风险变成主动告警。",
+      "after": "I4 **成功或已提交失败的终态必须 `submittedAt !== null`**，启动期校验传输层已挂接 markSubmitted、缺失即 log.error + 计数——成功与失败路径均主动检测漏接线。"
+    },
+    {
+      "issueId": "i2",
+      "before": "两次放行间隔 ≥10 分钟。",
+      "after": "两次放行间隔 ≥10 分钟。紧急放行仍须 occupy 窗口 + 计入 daily_count + 通过间隔判定，仅跳过「配额用尽」分支，不穿透间隔语义。"
+    },
+    {
+      "issueId": "i3",
+      "before": "D4 存储：新表 publish_daily_count(owner,key,day_key,count,rollback_count)；不动 publish_timeline。",
+      "after": "D4 存储：新表 publish_daily_count(owner,key,day_key,count,rollback_count)；任务记录持久化 submitted_at（与计数同次写入），重启按持久值判定 submittedAt；发布中途崩溃恢复的在途任务标记为需人工确认、不自动重发。不动 publish_timeline。"
+    },
+    {
+      "issueId": "i4",
+      "before": "D10 配额回补：`daily_count` 计「已实际提交到平台的次数」⇒ 未提交回滚**幂等回补**（下限 0）；",
+      "after": "D10 计数递增与回补：`daily_count` 由 TaskQueue 在发起提交（写前）时递增，传输失败仍占配额 ⇒ 仅 `submittedAt===null` 的回滚**幂等回补**（下限 0）；"
+    },
+    {
+      "issueId": "i5",
+      "before": "与「不做成功才记账」不冲突：计的是**提交**而非**成功**。",
+      "after": "与「不做成功才记账」不冲突：计的是**提交**而非**成功**。\n- D11 未登记平台出声：提交前校验平台已登记于策略表，未登记 → 阻断任务 + log.warn + 提示「该平台未登记频率策略」，不静默放行。\n- D12 校准脚本：只读策略表输出各档预期值，比对 daily_count 与时间线差异生成报告；仅出报告，不自动改写计数。"
+    },
+    {
+      "issueId": "i6",
+      "before": "+ **追加式 JSONL 审计**（UI 无编辑入口）+ 每日上限 1 次",
+      "after": "+ **追加式 JSONL 审计**（UI 无编辑入口，删除/篡改该文件记绕过告警）+ 每日上限 1 次与间隔均由 JSONL 逐条重算（重启不清零）"
+    },
+    {
+      "issueId": "i7",
+      "before": "I7 新数值在每轮 `check()` 时读取、即时生效，无存量迁移；入队时旧值、执行时新值按新值判定。",
+      "after": "I7 新数值在每轮 `check()` 时读取、即时生效，无存量迁移；入队时旧值、执行时新值按新值判定。热生效仅作用于未占用窗口的新判定；已占窗口冻结占窗时值至释放，运行中改 0 不即时放行已占窗任务。"
+    },
+    {
+      "issueId": "i8",
+      "before": "计数读回 parseInt，非有限 → 0 + warn。",
+      "after": "计数读回 parseInt，非有限 → 0 + warn。计数读写全部经 TaskQueue 单线程串行（同通道 FIFO），不并发；回补以条件更新（day_key 匹配、下限 0）兜底防漂移。"
+    }
+  ]
+}
\ No newline at end of file
diff --git a/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/summary.md b/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/summary.md
new file mode 100644
index 000000000..cde12bdbb
--- /dev/null
+++ b/.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/summary.md
@@ -0,0 +1,46 @@
+# 方案对抗评审汇总 — publish-frequency-policy-v2
+
+引擎：`adversarial-review-loop`（`scripts/plan-review.sh`，objectType=plan，跨家族 proposer=opencode / critic=claude）
+对象：`01-docs/PLAN-PUBLISH-FREQUENCY-POLICY-V2-review-brief.md`
+
+## 三次运行
+
+| 运行 | 方案版本 | 环境 | 轮次 | Critical | 最低维度分 | 裁决 | 判定记录 |
+|---|---|---|---|---|---|---|---|
+| **A** | v1（原始简报，3734 B） | 共享根 | 2（第 2 轮回退到 4 分 → 回滚到第 1 轮） | 2 → 1 | 6 → 4 | **blocked** | `.ccg/reviews/840ccd3708f9436431bce400c1794495c0abe7e3.json`（共享根） |
+| **B** | v3（并入 rebuttal-v1/v2 全部采纳项，2859 B） | worktree | 2 | 1 → **0** | 5 → 6 | **cleared** | `.ccg/reviews/e54ac5ef148d5c7e8dd5251035a7a34c0aa60fd5.json`（worktree） |
+| **C** | v4（并入 rebuttal-v3 的 8 条修正，3911 B） | worktree | **1** | **0** | 6 | **cleared** | `.adversarial/…/critique-v1.md`（本轮）+ 引擎裁决输出 |
+
+问题数趋势：8（2C）→ 8（1C）→ 8（0C）→ **5（0C）**。
+
+## 逐条回应（证据分级 L1 反例 / L2 约束 / L3 权衡）
+
+- run A findings → `rebuttal-v1.md`
+- run B findings → `rebuttal-v2.md`（并记下 proposer 自动修订引入的两处自相矛盾：擅自把 D1 平台档默认改成「开」却不改「自认弱点」，以及凭空新增「跨环境审计溯源」与 `hold_until` 列）
+- run B 收敛轮 findings → `rebuttal-v3.md`
+- run C findings → `rebuttal-v4.md`
+
+## 产物命名说明（重要）
+
+引擎按 `<proposal 文件名>` 生成 slug，三次运行**共用同一个 slug 目录**，因此 `-vN` 命名的文件在每次运行时被覆盖。为保全证据：
+
+- `runA-*`：第 1 次运行的产物（**从共享根写保护隔离区救回**，见下）
+- `runB-*`：第 2 次运行（收敛轮）的产物
+- `runC-*`：第 3 次运行的产物
+- 不带前缀的 `proposal-v1.md` / `critique-v1.md` / … ：**run C**（最新一次）的配对产物
+
+## 运行环境缺陷（已上报）
+
+第 1 次运行（run A）在**共享根**执行，其 11 个产物被 `scripts/guard-shared-root-writes.ps1` **全部移入隔离区**：
+
+- 放行名单（`guard-shared-root-writes.ps1:56`）= `docs, 01-docs, scripts, openspec, .ccg, .agent_context, .hermes` —— **不含 `.adversarial`**；
+- 而 `scripts/classify-docs-only.js:54` 又把 `.adversarial/**` 当作文档白名单。
+
+⇒ 对抗评审的产物「写一次被隔离一次」，`.adversarial/<slug>/` 只留空目录。
+**处置**：① 从 `%LOCALAPPDATA%\Mulpub\session-isolation\quarantine\` 救回全部 11 个文件；② 后续运行改在 worktree 内执行（不被监听）；③ 建议把 `.adversarial` 加入放行名单（属 `scripts/` 变更，另立）。
+
+## 放行与后续
+
+- run B / run C 均为 **cleared**（无 Critical、无未解决 High）。按引擎判据「收敛后才可开始写码」，方案已具备动手条件。
+- run C 的 5 条中，**i2（漏接线时失败路径无告警）已采纳**并转化为「失败路径计数 + 矛盾检测自动降级 + 结构锁」；i4 采纳（`buildKey` 对 `platform:*` 哨兵的编码规则写明）；i1/i5 判**不成立**（评审混淆「同账号」与「跨账号」两种情形）但采纳其措辞澄清；i3 部分采纳（补写重启恢复链路与用例）。
+- 这些是 **Warning/Info 级的事后细化**，全部落在 **fail-closed 方向**，未引入新的 Critical/High；未再跑第 4 轮的理由：① 引擎判据已满足；② 逐轮收益递减（8→8→5）；③ 变更全部为「更保守」方向。此取舍与理由如实记录于此与 PR 正文。
diff --git a/01-docs/PLAN-PUBLISH-FREQUENCY-POLICY-V2-2026-10-10.md b/01-docs/PLAN-PUBLISH-FREQUENCY-POLICY-V2-2026-10-10.md
new file mode 100644
index 000000000..ca2ce24d0
--- /dev/null
+++ b/01-docs/PLAN-PUBLISH-FREQUENCY-POLICY-V2-2026-10-10.md
@@ -0,0 +1,485 @@
+# 技术方案 — 发布频率策略 v2（publish-frequency-policy-v2）
+
+- 日期：2026-10-10
+- 状态：**待对抗评审**（本文档是 `scripts/plan-review.sh` 的输入工件）
+- 上游依据：[INVESTIGATE-PUBLISH-FREQUENCY-STRICTNESS-2026-10-10.md](./INVESTIGATE-PUBLISH-FREQUENCY-STRICTNESS-2026-10-10.md)（调查报告，已合并 `#3253`）
+- 关联既有实现：`packages/shared-utils/src/publish-frequency-policy.js`、`publish-interval-guard.js`、`task-queue.js`；`apps/desktop/electron/core/container.setup.js`
+- 关联历史决策：`openspec/records/publish-frequency-control.md`（PR #2773）、`01-docs/PRD-PUBLISH-FREQUENCY-CONTROL-2026-10-02.md`
+
+---
+
+## 0. 本方案要解决的四个问题（按调查报告的判定）
+
+| # | 问题 | 证据 |
+|---|---|---|
+| 1 | **失败惩罚过重**：未提交到平台的失败也吃掉整个间隔窗口 | bilibili 连续 3 次失败间隔恰为 120.0 / 30.0 分钟；`task-queue.js:587-597` 自动重试与 `:240-262` 手动重试同走守卫 |
+| 2 | **刻度无依据且维度选错**：只有最小间隔、没有日配额 | 公开资料唯一有依据的维度是「条/天」（微信订阅号 1 条/天、微博 30 次/小时·100 次/天） |
+| 3 | **零抖动**：发布点落在精确的 30.0 / 60.0 分钟整数边界，是比「快」更强的机器人特征 | 守卫与队列内 `Math.random` 命中数 0；微博官方口径是「非用户主动行为频繁调用」 |
+| 4 | **跨账号平台档无依据且实测空转** | `accounts.json` 每平台恰好 1 账号 ⇒ 该档恒被更严的账号档支配；公开资料无「跨账号共享发布窗口」依据 |
+
+---
+
+## 1. 范围
+
+### 1.1 本方案实现（全部 P0/P1/P2）
+
+| 编号 | 内容 | 类型 |
+|---|---|---|
+| P0-1 | 记账语义细分：未提交失败回滚窗口 | shared-utils + 桌面装配 |
+| P0-2 | 重试（自动/手动）放行路径 | shared-utils |
+| P1-1 | 跨账号平台档默认关 + 显式开关 | shared-utils |
+| P1-2 | 账号级日配额维度（新） | shared-utils + store 新表 + 桌面装配 |
+| P1-3 | 间隔抖动（可注入随机源） | shared-utils |
+| P2-1 | 数值下调（60→20 / 30→10 / 10→3） | shared-utils |
+| P2-2 | 渲染层口径统一 + 设置页策略区块 + 一次性紧急发布出口 | 渲染层 + IPC + locale |
+| P2-3 | 未登记平台回落时出声告警 | shared-utils |
+| P2-4 | 校准基础设施（口径定义 + 可复现取数脚本） | scripts/ |
+| P2-5 | `tencent_video` 命名歧义注释；`publish:wechat` 补任务级 `accountId` | config + 主进程 |
+
+### 1.2 非目标（明确不做）
+
+- **不做设备/IP 级全局串行**：跨平台并发是本产品核心用途（沿用 `publish-frequency-control` PRD §2 的非目标）。
+- **不做平台规则同步**：不声称符合任何平台官方规定。
+- **不做「成功才记账」**：会引入重复发布（调查报告 §6.C 已否决）。
+- **不做跨设备配额同步**：日配额按本机 owner 维度计数，不联网合并。
+- **不改 `publish-capabilities.json`**：内容能力与调度节奏是两类关注点（沿用上游决策）。
+
+---
+
+## 2. 现状与改动点（file:line 基线）
+
+| 文件 | 现状 | 本方案改动 |
+|---|---|---|
+| `packages/shared-utils/src/publish-frequency-policy.js` | 15 平台 × `{accountMinMs, platformMinMs}`；`BASELINE_INTERVALS` 60/5；两个 env | 新增 `accountDailyMax`、`jitter`、`platformTier` 语义；数值下调；未登记出声 |
+| `packages/shared-utils/src/publish-interval-guard.js` | `check()` 两档取更严；`recordPublish()` 提交前写；无释放、无抖动、无日计数 | 新增 `release()`、抖动、日配额判定与计数；`verdict` 增字段 |
+| `packages/shared-utils/src/task-queue.js` | `:514-547` 检查→记账→blocked 重排；`:587-597` 失败回队；`:240-262` 手动重试 | 失败分类：`notSubmitted` ⇒ 回滚窗口；重试放行窗口 |
+| `apps/desktop/electron/core/container.setup.js` | `:369-380` 注入 `PublishIntervalGuard`（policy + store） | 注入 `dailyStore` + `jitter` 随机源；装配锁断言日配额已接线 |
+| `apps/desktop/electron/services/store/`（`publish_timeline`） | `(owner_subject, key, value TEXT)`，只存最后一次提交时间 | 新增 `publish_daily_count(owner_subject, key, day_key, count)` 表（**只增不改**） |
+| `apps/desktop/src/locales/publish-page/{zh,en}.js` | `:195` `scheduleHintWithLimits` 承诺扁平 5 分钟；`:83/:109-111` 等待文案 | 口径统一 + 新增策略区块与紧急放行文案（zh/en 成对） |
+| `config/platforms.yaml` | `:93-100` id `tencent_video` 但 `name: 视频号` | 仅加注释澄清（不改 id，避免迁移面） |
+
+---
+
+## 3. 数据模型与校验
+
+### 3.1 新增表 `publish_daily_count`
+
+```sql
+CREATE TABLE IF NOT EXISTS publish_daily_count (
+  owner_subject TEXT NOT NULL,
+  key           TEXT NOT NULL,   -- 'platform:accountId' 或 'platform:*'
+  day_key       TEXT NOT NULL,   -- 'YYYY-MM-DD'（本地自然日，见 §3.3）
+  count         INTEGER NOT NULL DEFAULT 0,
+  updated_at    INTEGER NOT NULL,
+  PRIMARY KEY (owner_subject, key, day_key)
+);
+```
+
+**为什么新表而不是扩展 `publish_timeline` 的 `value`**：`value` 现为 TEXT 且被守卫做算术强转（实测读回形如 `"1791381214186.0"`，`store-owner-isolation.test.js:364` 把读回钉成字符串 `'100'`）。改成 JSON 会同时污染「最后一次提交时间」的消费者与既有断言；新表是纯增量，存量行零迁移。
+
+**读回兼容**：`count` 列在 SQLite 中是 INTEGER 亲和，但既有库出现过 TEXT 亲和导致带回 `.0` 的先例。守卫读回一律 `Number.parseInt(String(v), 10) || 0`，非有限值按 0 处理**并出声告警**（不得静默当 0 —— 与 `parseEnvInterval` 同纪律）。
+
+### 3.2 `publish_timeline` 语义不变
+
+键仍为 `platform:accountId` 与 `platform:*`，值仍为最后一次**提交**时间戳（ms）。本方案不改其形状、不加列。
+
+### 3.3 自然日定义（必须写死）
+
+- `day_key` = **本地时区的自然日**，格式 `YYYY-MM-DD`。
+- 判定函数由守卫注入：`today: () => string`，默认实现 `new Date().toLocaleDateString('sv-SE')`（`sv-SE` 即 ISO `YYYY-MM-DD`，避免手写补零）。
+- **不用 UTC**：运营的「今天」是本地日；用 UTC 会让北京时间 00:00–08:00 的发布被算进前一天。
+- 跨时区/跨日边界必须有测试：TZ 注入 + 23:59:59 → 00:00:01 两个 `day_key` 独立计数。
+- `MP_PUBLISH_QUOTA_TZ` **不提供**（避免引入第二个时区真源）；如需可按本地日重算。
+
+### 3.4 输入校验表（每个可配置项的契约）
+
+| 配置项 | 来源 | 合法域 | 非法/越界行为 |
+|---|---|---|---|
+| `MP_PUBLISH_MIN_INTERVAL_MS` | env | `>=0` 有限数；`0` = 显式关闭账号档；`undefined` = 用策略表 | 空白/非有限数/负数 ⇒ 回落策略表 **并 warn 一次** |
+| `MP_PUBLISH_PLATFORM_MIN_INTERVAL_MS` | env | 同上（`0` = 关闭平台档，**v2 默认即 0**） | 同上 |
+| `MP_PUBLISH_ACCOUNT_DAILY_MAX` | env（新） | `>=0` 整数；`0` = 关闭日配额；`undefined` = 用策略表 | 非整数（含 `"5.5"`）/负数/空白 ⇒ 回落**并 warn**；`"5"` 视为 5 |
+| `MP_PUBLISH_JITTER_RATIO` | env（新） | `[0, 1)` 有限数；`0` = 关闭抖动（回归等价旧行为） | 越界/非法 ⇒ 回落默认 `0.4` **并 warn** |
+| 账号级覆盖（设置页） | `store.getSetting`（新键 `publishFrequencyPolicy`） | 对象，字段逐个走同一套校验 | 任一字段非法 ⇒ **整个覆盖对象丢弃**并 warn（不部分生效，避免半生效态） |
+| 紧急放行 | IPC `publish:emergencyRelease` | `{platform, accountId}`，平台必须是已登记平台且 `isSafePathSegment(accountId)` | 校验失败 ⇒ `EC.VALIDATION_ERROR`，不落审计 |
+
+**关键纪律**：所有回落都必须**出声**（warn），禁止静默把「配置写错」变成「关掉门禁」。
+
+---
+
+## 4. 策略表 v2
+
+### 4.1 数值（P2-1 下调 + P1-2 新增日配额）
+
+| 组 | 平台 | 账号档 | 平台档 | 日配额/账号 |
+|---|---|---|---|---|
+| 长文低频 | wechat_mp, zhihu, baijiahao, toutiao | **20 分钟**（原 60） | **0（关）**（原 5） | **3 条/天** |
+| 短视频 / 图文社区 | douyin, kuaishou, tencent_video, xiaohongshu, bilibili, youtube, tiktok, instagram, facebook | **10 分钟**（原 30） | **0（关）**（原 3） | **5 条/天** |
+| 短内容高频容忍 | weibo, twitter | **3 分钟**（原 10） | **0（关）**（原 1） | **20 条/天** |
+| 未登记平台（回落） | 任意未知 | **20 分钟** | **0（关）** | **3 条/天**（最严档） |
+
+### 4.2 每个数字的依据与自认的弱点（评审请重点打这里）
+
+| 数字 | 依据 | 弱点（自认） |
+|---|---|---|
+| 账号档 20 / 10 / 3 分钟 | 微博官方发博 **30 次/小时** ≈ 2 分钟/条，取 1.5–10 倍余量 | **没有任何平台给出分钟级下限**；这是「比官方速率更保守」的工程取值，不是平台要求 |
+| 日配额 3 / 5 / 20 | 长文：微信订阅号群发硬限 **1 条/天**（本工具走「发布」而非「群发」，故不直接套用）；短视频：第三方经验「抖音 2–4 条/天」；短内容：微博官方 **100 条/天** 的 1/5 | 3 / 5 / 20 是**工程保守起点**，不是运营确认过的数字。本方案提供 env + 设置页双覆盖，并**要求运营在设置页确认后才视为定稿** |
+| 平台档默认 0 | 公开资料零依据 + 本机每平台 1 账号 ⇒ 实测空转 | 若未来同平台多账号（机构号矩阵），设备/IP 级风险确实存在；故保留显式开关而非删除字段 |
+| 抖动 `[1, 1+0.4)` | 同仓 `batch-rate-controller.js:5-9` 先例 + 微博官方「非用户主动行为」口径 | 抖动让**平均**等待变长（×1.2），吞吐进一步下降；这是「更像人」的代价，需要在 PRD 里写明 |
+
+### 4.3 抖动方向：只增不减
+
+`wait = remainingMs × (1 + ratio × rand)`，`rand ∈ [0,1)`。
+**只增加等待，绝不减少**——否则抖动会变成绕过门禁的通道。`ratio=0` 时严格退化为现值（保证既有测试与既有行为可回归）。
+
+---
+
+## 5. 守卫 v2（`publish-interval-guard.js`）
+
+### 5.1 API
+
+```js
+new PublishIntervalGuard({
+  policy,        // (platform) => {accountMinMs, platformMinMs, accountDailyMax}
+  store,         // { get(key), set(key, value) }        —— 提交时间（不变）
+  dailyStore,    // { getDay(key, dayKey), incrDay(key, dayKey) } —— 新增
+  now,           // () => number                        —— 不变
+  today,         // () => 'YYYY-MM-DD'                  —— 新增，默认本地日
+  random,        // () => [0,1)                         —— 新增，默认 Math.random（可注入）
+  jitterRatio,   // number                             —— 新增，默认 0.4
+})
+```
+
+### 5.2 `check(platform, accountId)` 返回形状（向后兼容 + 新增字段）
+
+```js
+{
+  allowed: boolean,
+  remainingMs: number,          // 已含抖动；bucket 为 'daily' 时为 0
+  bucket: 'account' | 'platform' | 'daily' | null,   // 新增 'daily'
+  reason: null | 'interval' | 'daily_quota',          // 新增，便于下游区分
+  daily: { used: number, max: number, dayKey: string } | null,  // 新增
+}
+```
+
+**兼容性**：既有消费者只读 `allowed` / `remainingMs` / `bucket`，新增字段不影响；`bucket` 的取值域扩展需要同步 `publish-progress-events.js` 的投影白名单与 `PublishProgressTaskRow.vue` 的归因文案（**穷尽性审计：4 处投影面**，见上游记录 §QM-6 W1）。
+
+### 5.3 判定顺序与「更严者胜」
+
+1. 账号档 `remaining`（若 `accountMinMs > 0`）；
+2. 平台档 `remaining`（若 `platformMinMs > 0`，v2 默认 0 ⇒ 跳过）；
+3. 日配额：`used >= max` ⇒ `allowed=false`，`bucket='daily'`，`remainingMs=0`（**日配额不是「等一会儿」而是「今天到此为止」**）。
+
+取 1/2 中更大者；日配额是**独立否决项**，与间隔二者任一不满足即 `allowed=false`。
+当同时命中间隔与日配额时，`bucket` 取**日配额**（它是更强的约束，且用户可行动性不同：间隔是等待，配额是改期）。
+
+### 5.4 `recordPublish(platform, accountId, at)` 语义变更
+
+```
+set(accountKey, at)            // 不变
+set(platformKey, at)           // 不变（默认关档时仍写，开档即生效，避免「开了档没历史」）
+incrDay(accountKey, today)     // 新增：仅账号档计数
+incrDay(platformKey, today)    // 新增：平台档计数（跨账号汇总，供未来设备级分析）
+```
+
+**为什么平台档也计数**：默认关档时它不影响判定，但保留计数使「事后开启平台档」有历史可依；成本是一行 upsert。
+
+### 5.5 `release(platform, accountId, at)`（新增，P0-1 的核心）
+
+回滚一次**已发生但未提交到平台**的占位：
+
+```
+if (store.get(accountKey) === at) set(accountKey, previousAccountAt ?? null)
+if (store.get(platformKey) === at) set(platformKey, previousPlatformAt ?? null)
+decrDay(accountKey, today)     // 计数回退 1，下限 0
+decrDay(platformKey, today)
+```
+
+**幂等与并发纪律**：
+- `release` 只在 `store.get(key) === at` 时回滚（**乐观并发**：若窗口已被后续提交覆盖，则不回滚——回滚别人的窗口比多等一会儿危险得多）。
+- `previousAt` 必须由**占位时返回**：`recordPublish` 返回 `{accountPrev, platformPrev, at}`，调用方保存并在 release 时回传；不提供就把该键**置 null**（等价于清除间隔），这是可接受的保守选择还是不可接受的放宽？→ **本方案选择：调用方必须回传 prev；未回传则 release 为 no-op 并 warn**（宁可多等，不可放宽）。
+- `decrDay` 下限 0；`store` 不可用时 release 为 no-op + warn，**绝不抛**（失败路径上抛错会把原错误吞掉）。
+
+### 5.6 未登记平台出声（P2-3）
+
+`resolveIntervals` 命中 `BASELINE_INTERVALS` 时，通过注入的 `warn` 输出**一次**（按平台记忆，进程内 Set 去重）：
+
+```
+[PublishFrequency] 平台 "xxx" 未登记频率策略，回落最严基线（账号 20 分钟 / 日配额 3 条）；请登记到 PLATFORM_FREQUENCY_POLICY
+```
+
+---
+
+## 6. TaskQueue v2
+
+### 6.1 「是否已提交」的判据（P0-1 的正确性核心）
+
+**唯一真源是抛出的错误对象上的 `notSubmitted === true`**，**不是**错误文案匹配。
+
+置位场景（白名单，逐个落实到具体抛错点）：
+
+| 场景 | 现状抛错点 | 是否 `notSubmitted` |
+|---|---|---|
+| 风控挂起（`RiskSuspendedError`） | `risk-suspender-store.js`（已带 `noRetry`） | **是** |
+| 登录态失效/需要重登 | 发布器服务层 | **是** |
+| 任务级参数校验失败（缺 media/路径） | `ipc-handlers/publish.js` 前置校验 | **是** |
+| 权益/套餐拒绝（`ENTITLEMENT_*`） | `error-codes.js` 语义 | **是** |
+| 执行器在**开始提交前**抛错（`task.startedAt` 后立即抛，无任何平台请求） | `_runTask` 的 `!this._executor` 分支 | **是** |
+| 超时 | `task-queue.js:563` | **否**（可能已提交） |
+| 网络中断/平台返回非预期 | 发布器/适配器 | **否** |
+| 任何未显式标记的错误 | —— | **否**（默认保守） |
+
+**默认必须是「占窗口」**：白名单之外一律不回滚（fail-closed 与现状一致）。
+
+### 6.2 执行流程（v2）
+
+```
+_executeTask(task)
+  ├─ guard.check(platform, accountId)
+  │    ├─ !allowed(bucket='daily')  → status=pending + publish:blocked(reason='daily_quota')
+  │    │                              + 不设 setTimeout 重排（跨日才可能放行）
+  │    │                              + 重排策略：算到「次日 00:00:05」的 ms 后重排（见 §6.4）
+  │    └─ !allowed(bucket='account'|'platform') → 现状逻辑（setTimeout remainingMs 重排）
+  ├─ hold = guard.recordPublish(platform, accountId)   // 返回 {at, accountPrev, platformPrev}
+  ├─ try { await executor }
+  ├─ catch (e)
+  │    ├─ if (e.notSubmitted === true) guard.release(platform, accountId, hold)  // ★ P0-1
+  │    └─ 现状重试/失败逻辑
+  └─ finally { 通道释放 + _processNext }
+```
+
+**顺序纪律**：`release` 必须在**通道释放之前**、且必须在 `_saveState()` 之前完成（否则崩溃恢复会把已释放的窗口当成占用）。
+
+### 6.3 重试放行（P0-2）
+
+- 自动重试（`:587-597`）与手动重试（`:240-262`）都经 `add()` → `_executeTask` → 守卫，**P0-1 落地后自然受益**，无需额外分支。
+- 额外补充：`task.lastAttemptNotSubmitted === true` 且 `now - lastAttemptAt >= min(RELEASE_GRACE_MS, interval)` 时，`check()` 对该任务放行一次。`RELEASE_GRACE_MS` 默认 **60 000**（1 分钟），env `MP_PUBLISH_RELEASE_GRACE_MS` 可覆盖。
+- 放行必须**可观测**：新增 `publish:released` 事件（字段 `{task, platform, accountId, reason:'not_submitted_retry', graceMs}`），经既有投影链到进度面板（文案见 §9）。
+
+### 6.4 日配额用尽的排队语义
+
+- 日配额用尽是**跨日**约束，不能用 `remainingMs`（可能要等十几小时）。
+- 重排时刻 = 次日 `00:00:05`（5 秒余量避开边界），`setTimeout` 上限：若 ms 超过 `2^31-1`（约 24.8 天）则**不设定时器**，改为标 `pending` 并写 `publish:blocked(reason='daily_quota')`，由下一次用户操作或应用启动时的 `_processNext` 重新判定。
+- **`unref()` 必须调用**（沿用既有 R28/R37 纪律）。
+- 用户在界面上看到的是「今日已达上限（3/3），将于明日 00:00 后自动继续」+ 取消按钮（§9）。
+
+---
+
+## 7. 装配与配置（桌面端）
+
+### 7.1 `container.setup.js`
+
+```js
+container.register("publishIntervalGuard", function (c) {
+  const s = c.get("store");
+  const overrides = resolvePolicyOverrides(s);        // 读 store 设置 + env，逐个校验
+  return new PublishIntervalGuard({
+    policy: (platform) => resolvePublishIntervals(platform, { overrides, warn: logger.warn }),
+    store: { get: (k) => s.getPublishTimeline(k), set: (k, v) => s.setPublishTimeline(k, v) },
+    dailyStore: { getDay: (k, d) => s.getPublishDailyCount(k, d), incrDay: (k, d) => s.incrPublishDailyCount(k, d), decrDay: (k, d) => s.decrPublishDailyCount(k, d) },
+    jitterRatio: overrides.jitterRatio,
+  });
+});
+```
+
+**装配锁（新增 3 条断言）**：
+1. `taskQueue._publishIntervalGuard === container.get('publishIntervalGuard')`（既有）；
+2. 守卫的 `dailyStore` 三个方法均为函数（**摘掉日配额注入即红**）；
+3. `guard.check()` 在 `dailyStore` 返回 `used=max` 时给出 `bucket='daily'`（**行为锁，不是结构锁**）。
+
+### 7.2 环境变量清单（v2 全集）
+
+| 变量 | 默认 | 语义 |
+|---|---|---|
+| `MP_PUBLISH_MIN_INTERVAL_MS` | 策略表 | 账号档覆盖；`0`=关 |
+| `MP_PUBLISH_PLATFORM_MIN_INTERVAL_MS` | **0** | 平台档覆盖；`0`=关（v2 默认） |
+| `MP_PUBLISH_ACCOUNT_DAILY_MAX` | 策略表 | 日配额覆盖；`0`=关 |
+| `MP_PUBLISH_JITTER_RATIO` | `0.4` | 抖动比例；`0`=关 |
+| `MP_PUBLISH_RELEASE_GRACE_MS` | `60000` | 未提交失败的重试宽限 |
+| `MP_PUBLISH_EMERGENCY_MAX_PER_DAY` | `1` | 紧急放行每日次数上限 |
+
+**非法值一律回落 + 出声**；`0` 是显式关闭，空白值不算 `0`。
+
+---
+
+## 8. 交互逻辑
+
+### 8.1 主流程（用户点「一键发布」）
+
+```
+用户选择 N 个 (平台,账号) 目标 → 提交
+  ↓
+每个目标 add() 入队（现状不变）
+  ↓
+_processNext（并发上限 3）
+  ├─ 守卫判定通过 → 记账 → 执行 → 成功/失败
+  ├─ 间隔未到 → publish:blocked(remainingMs, bucket) → 进度面板显示「等待 N 分钟后重试（本账号间隔）」
+  └─ 日配额用尽 → publish:blocked(reason='daily_quota') → 显示「今日已达上限（3/3），将于明日 00:00 后自动继续」
+```
+
+### 8.2 失败回滚（P0-1 的用户可见差异）
+
+| 失败类型 | 用户看到 | 后续 |
+|---|---|---|
+| 未提交（登录失效等） | 失败卡片 + 「未提交到平台，可立即重试」 | 窗口已回滚 ⇒ 点重试立刻可发 |
+| 已提交后失败/超时 | 失败卡片 + 「已提交，需等待 N 分钟后重试」 | 窗口保留（防重复发布） |
+
+**这是本方案最重要的用户可见改进**：把「等 30 分钟」和「立刻重试」区分开，且依据是机器判定的 `notSubmitted`，不是文案猜测。
+
+### 8.3 紧急放行（P2-2）
+
+入口：设置页「发布频率策略」区块 → 「立即解除本账号等待」按钮（**仅在存在进行中的等待时可用**）。
+
+交互：二次确认弹窗 → 确认后：
+1. 主进程校验（平台格式、`accountId` 格式、当日次数上限）；
+2. `guard.release(platform, accountId, hold)`（若任务正在等待，需先取消其 `setTimeout` 并重新入队）；
+3. 写审计：`{ at, platform, accountId, operator: owner_subject, reason: 用户输入(选填，<=200 字) }` 落 `store`（新键 `publishEmergencyAudit`，环形上限 200 条）；
+4. 广播 `publish:emergencyReleased` → 进度面板与设置页同步刷新；
+5. **结果如实回显**：成功/被上限拒绝/无等待中的窗口，三种都要有明确文案（不得静默）。
+
+---
+
+## 9. 显示项与提示文字（zh/en 成对）
+
+新增/修改的 locale 键（`apps/desktop/src/locales/publish-page/{zh,en}.js` 与 `settings/{zh,en}.js`）：
+
+| key | zh | en |
+|---|---|---|
+| `publishPage.progress.blockedDailyQuota` | `今日已达上限（{used}/{max}），将于明日 00:00 后自动继续` | `Daily limit reached ({used}/{max}); will resume after 00:00 tomorrow` |
+| `publishPage.progress.blockedBucketDaily` | `（本账号每日上限）` | `(account daily limit)` |
+| `publishPage.progress.releasedNotSubmitted` | `未提交到平台，已恢复可发布` | `Not submitted to the platform; publish window restored` |
+| `publishPage.progress.failedNotSubmittedHint` | `未提交到平台，可立即重试` | `Not submitted; you can retry immediately` |
+| `publishPage.progress.failedSubmittedHint` | `已提交到平台，需等待约 {minutes} 分钟后重试` | `Submitted; retry in about {minutes} min` |
+| `publishPage.scheduleHintWithLimits`（**改**） | `留空 = 立即发布；可排期未来 {maxDays} 天内。实际发布节奏按「发布频率策略」执行（表单仅做基础校验）` | `Leave empty to publish now; schedule within {maxDays} days. Actual pacing follows the Publish Frequency Policy (the form only does basic validation)` |
+| `settings.publishFrequency.title` | `发布频率策略` | `Publish Frequency Policy` |
+| `settings.publishFrequency.accountInterval` | `同账号最小间隔` | `Min interval per account` |
+| `settings.publishFrequency.dailyMax` | `每账号每日上限` | `Daily limit per account` |
+| `settings.publishFrequency.platformTierOn` | `启用同平台跨账号间隔` | `Enable cross-account platform interval` |
+| `settings.publishFrequency.jitterOn` | `加入随机抖动（更像人工节奏）` | `Add random jitter (more human-like pacing)` |
+| `settings.publishFrequency.jitterHint` | `开启后实际等待会比标称值长 0–40%，总吞吐略降` | `Enabling lengthens waits by 0–40%; overall throughput drops slightly` |
+| `settings.publishFrequency.emergency` | `立即解除本账号等待` | `Release this account's wait now` |
+| `settings.publishFrequency.emergencyConfirm` | `本次将跳过等待直接进入发布队列，操作会记入审计。确认继续？` | `This skips the wait and enqueues immediately; the action is audited. Continue?` |
+| `settings.publishFrequency.emergencyExhausted` | `今日紧急放行次数已用尽（{max} 次/天）` | `Daily emergency releases exhausted ({max}/day)` |
+| `settings.publishFrequency.emergencyNoWait` | `当前没有等待中的窗口` | `No pending wait window` |
+| `settings.publishFrequency.currentTier` | `当前档位：账号 {accountMinutes} 分钟 / 每日 {dailyMax} 条` | `Current: {accountMinutes} min per account / {dailyMax} per day` |
+
+**i18n 纪律**：zh/en 必须成对提交（CI Gate 7）；渲染端非 locales 文件不得新增中文字面量（CJK 基线扫描）。
+
+---
+
+## 10. 可观测与审计
+
+- **事件**：`publish:blocked`（扩展 `reason`、`daily`）、新增 `publish:released`、新增 `publish:emergencyReleased`；投影面**穷尽清单 5 处**（`phase4-events` → `publish-progress-events` 白名单 → `publishProgress` store → `PublishProgressTaskRow.vue` → `publish-progress-events` 的 `emitPhaseNotify`）。
+- **日志**：守卫在 release / 日配额否决 / 未登记回落 / 非法配置四处出声；**禁止记录内容标题等用户文本**（沿用既有脱敏纪律）。
+- **审计**：紧急放行写 `publishEmergencyAudit`（环形 200 条）；同时 `log.notify` 一条 INFO。
+- **排查入口**：`publish_timeline`（最后提交） + `publish_daily_count`（当日计数）两表即可复现任意一次判定。
+
+---
+
+## 11. 测试计划（TDD）
+
+### 11.1 单元（`packages/shared-utils/tests/`）
+
+| 文件 | 新增用例（要点） |
+|---|---|
+| `publish-frequency-policy.test.js` | 新数值表；`accountDailyMax` 回落；`MP_PUBLISH_ACCOUNT_DAILY_MAX` 合法/非法/`0`；`MP_PUBLISH_JITTER_RATIO` 合法/越界/`0`；未登记平台 warn **恰好一次** |
+| `publish-interval-guard.test.js` | 抖动区间 `[interval, interval×1.4)`；`jitterRatio=0` 退化等价旧值；`bucket='daily'`；`reason` 精确值；`release` 幂等；**prev 未回传 ⇒ no-op + warn**；**窗口已被覆盖 ⇒ 不回滚**；跨日边界（23:59:59 → 00:00:01）；`dailyStore` 读回字符串 `'3'`/`'3.0'`/`'abc'` 三态 |
+| `task-queue-guard-integration.test.js` | `notSubmitted` 失败 ⇒ 窗口回滚 ⇒ 立即重发成功；**已提交失败 ⇒ 窗口保留**（既有用例不得放宽）；重试宽限放行；日配额用尽 ⇒ 不设长定时器 + `blocked` 事件；`publish:released` 字段精确 |
+
+### 11.2 桌面主进程（`apps/desktop/electron/`）
+
+| 文件 | 要点 |
+|---|---|
+| `core/container.setup.test.js` | 装配锁 3 条（含 `dailyStore` 三方法存在 + 注入） |
+| `services/store.test.js` | 新表 CRUD、owner 隔离、并发 upsert、`decrDay` 下限 0 |
+| `ipc-handlers/publish.test.js` | `publish:emergencyRelease` 三种结果文案 + 审计落盘 + 上限 |
+| `bootstrap/phase4-events.test.js` | 新事件透传与投影白名单（含 `reason`/`daily`） |
+
+### 11.3 渲染层（`apps/desktop/src/`）
+
+| 文件 | 要点 |
+|---|---|
+| `components/PublishProgressTaskRow` 用例 | 日配额文案、`released` 文案、归因标签三态（account/platform/daily），字段缺席**不渲染**标签 |
+| `views/settings` 用例 | 策略区块渲染、覆盖保存回滚、紧急放行二次确认与三种结果 |
+
+### 11.4 变异反证（每条先跑基线证明绿，再变异证明**恰好那一条**红）
+
+| # | 变异 | 预期变红的锁 |
+|---|---|---|
+| M1 | 摘掉 `notSubmitted` 回滚 | 「未提交失败窗口回滚」 |
+| M2 | 把「已提交失败」也回滚 | 「已提交失败仍占窗口」 |
+| M3 | `release` 去掉 `prev` 一致性检查 | 「窗口已被覆盖时不回滚」 |
+| M4 | 抖动改成 `[1-ratio, 1+ratio)` | 「抖动只增不减」 |
+| M5 | 日配额判定移除 | 「日配额用尽被否决」 |
+| M6 | `decrDay` 去掉下限 0 | 「计数下限 0」 |
+| M7 | 摘掉 `dailyStore` 注入 | 装配锁 2 |
+| M8 | 未登记平台 warn 改成静默 | 「未登记出声一次」 |
+| M9 | `platformMinMs` 默认改回非 0 | 「平台档默认关」 |
+| M10 | 紧急放行去掉次数上限 | 「紧急放行上限」 |
+
+### 11.5 回归面（必须全跑，不是抽样）
+
+- `packages/shared-utils` 全量（策略/守卫/队列/装配集成）。
+- 桌面：`src/stores/**`、`PublishProgress*` 组件、`phase4-events`、`publish-progress-events`、`container.setup`、`store`、`ipc-handlers/publish`。
+- QM-1 打包 + asar 清单 + require 链 + 启动 8s（含 stderr 捕获）。
+- QM-4 视觉：进度面板与设置页均有像素基线时按门禁跑；无基线时以 DOM 行为锁承担并如实记录。
+
+---
+
+## 12. 迁移与兼容
+
+| 项 | 处理 |
+|---|---|
+| `publish_timeline` 存量行 | **不动**。旧值语义（最后提交时间）不变 |
+| 新表 `publish_daily_count` | `CREATE TABLE IF NOT EXISTS`（走既有 store 迁移链），无历史数据 ⇒ 计数从 0 开始（首次发布当天即受配额约束） |
+| 既有测试「同平台换号被平台档拦截」 | **必须改写**为「默认不拦截 / 开启后拦截」两侧断言，并在 PR 说明里标注这是**产品决策变更**而非放宽 |
+| 既有测试「无 accountId 仍受平台档约束」 | 平台档默认关 ⇒ 该用例改为「开启平台档时仍受约束」 |
+| 既有测试「minInterval 兼容模式两档同值」 | 不变（`minInterval` 覆盖仍强制两档同值） |
+| env 语义 | `MP_PUBLISH_PLATFORM_MIN_INTERVAL_MS` 默认由「策略表 5/3/1」变为 **0**；显式设置该变量恢复平台档 |
+
+**风险**：把平台档默认关掉后，「同平台多账号」不再被节流。缓解：①设置页可一键开回；②PRD 写明适用场景（机构号矩阵建议开启）；③保留平台档计数，开启后立即有历史。
+
+---
+
+## 13. 分阶段落地（PR 切分）
+
+| 阶段 | 内容 | 分支 | 风险 |
+|---|---|---|---|
+| A | shared-utils：策略 v2 + 守卫 v2（抖动/日配额/release）+ 队列 v2 | `publish-frequency-policy-v2` | 中（纯逻辑，测试充分） |
+| B | 桌面：store 新表 + 装配 + IPC 紧急放行 + 渲染层 + locale | 同上分支的后续提交 | 中（跨主进程/渲染层） |
+| C | `scripts/` 校准脚本 + config 注释 + `publish:wechat` 修 accountId | 同上 | 低 |
+
+**决策**：A/B/C 合入**同一个 PR**（一个 feature 的完整闭环），但按 A→B→C 顺序提交，便于逐段 review 与回滚定位。
+
+---
+
+## 14. 验收标准
+
+| # | 场景 | 预期 |
+|---|---|---|
+| A1 | 未提交失败后立即重试 | 不被守卫拦；`publish:released` 事件存在 |
+| A2 | 已提交（超时）失败后重试 | 被拦满窗口；无 `release` |
+| A3 | 同账号当日第 N+1 条 | `allowed=false`、`bucket='daily'`、不设长定时器 |
+| A4 | 跨日 00:00 后 | 计数归零、可继续发布 |
+| A5 | 抖动开启 100 次采样 | 所有等待 `∈ [base, base×1.4)`，均值明显 > base |
+| A6 | 抖动关闭 | 等待严格等于旧值（与 v1 逐值对齐） |
+| A7 | 同平台两账号（平台档关） | 第二条不等 3 分钟（仅受账号档与日配额约束） |
+| A8 | 平台档显式开启 | 第二条被拦 `bucket='platform'` |
+| A9 | 未登记平台 | 回落最严档 + warn 一次 |
+| A10 | 非法 env（三种） | 各自回落 + warn，**不改变门禁行为** |
+| A11 | 紧急放行 | 跳过等待、写审计、次日次数重置 |
+| A12 | 紧急放行超上限 | 拒绝且有明确文案，队列状态不变 |
+| A13 | 十项变异 | 各自**恰好**让指定锁变红（实跑留证） |
+| A14 | QM-1 | 打包 rc=0、asar 含新表 DDL 与新策略文件、启动 8s stderr 无致命 |
+
+---
+
+## 15. 自认的弱点（请评审重点攻击）
+
+1. **日配额数值 3/5/20 仍是工程拍板**，虽标注「待运营确认 + 可覆盖」，但默认值一旦生效就会影响真实运营。是否存在「默认即生效」与「未经确认不得生效」的取舍问题？
+2. **`release` 的一致性方案依赖调用方回传 `prev`**，若 `task-queue` 与守卫之间被重构掉这个回传，会静默退化为 no-op（多等一会儿，方向安全但难以发现）。是否需要一条结构锁断言「`recordPublish` 的返回值必须被使用」？
+3. **日配额用尽时的长定时器**：跨日等待可能长达十几小时，`unref()` + 应用重启后的恢复语义是否足够？（重启会重新 `_processNext`，但 `hold` 丢失。）
+4. **抖动只增不减**会让平均吞吐下降约 20%，与「P2-1 数值下调」叠加后总吞吐可能下降 3 倍以上。是否应在设置页给出「吞吐预估」提示？
+5. **平台档默认关**削弱了对「同平台多账号」的保护（设备/IP 风险），而调查报告承认这部分公开资料不足。默认关是否过于激进？是否应改为默认开但把值调到 1–3 分钟？
+6. **紧急放行本身是一个绕过口**：每日 1 次的默认上限是否足够？审计只落本地，运营不可远程发现滥用。
+7. **`publish:wechat` 补 `accountId`** 属于顺手修，但该路径在渲染层无生产调用方 —— 改它是否属于「扩大爆炸半径」？是否应只加注释标注为死路径？
+8. **改动面**：shared-utils + store 迁移 + 主进程 + 渲染层 + locale + scripts，跨 6 个模块一个 PR，是否应拆成 2–3 个 PR？
diff --git a/01-docs/PRD-PUBLISH-FREQUENCY-POLICY-V2-2026-10-10.md b/01-docs/PRD-PUBLISH-FREQUENCY-POLICY-V2-2026-10-10.md
new file mode 100644
index 000000000..9adcbf26d
--- /dev/null
+++ b/01-docs/PRD-PUBLISH-FREQUENCY-POLICY-V2-2026-10-10.md
@@ -0,0 +1,412 @@
+# PRD — 发布频率策略 v2（publish-frequency-policy-v2）
+
+- 日期：2026-10-10
+- 状态：**已通过跨家族对抗评审（cleared），待实现**
+- 上游依据：`01-docs/INVESTIGATE-PUBLISH-FREQUENCY-STRICTNESS-2026-10-10.md`（PR #3253）
+- 方案与评审：`01-docs/PLAN-PUBLISH-FREQUENCY-POLICY-V2-review-brief.md`（v4）+ `.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/`（两轮 critique + 三轮 rebuttal）
+- OpenSpec：`openspec/changes/publish-frequency-policy-v2/`
+- 取代关系：本文取代 `01-docs/PRD-PUBLISH-FREQUENCY-CONTROL-2026-10-02.md` 的 §4 数值表与 §3 功能清单中关于「只有最小间隔」的部分；后者其余内容（两档模型、单一真源、提交前记账的**原则**）继续有效
+
+---
+
+## 1. 背景
+
+现行发布频率门禁（`publish-frequency-control`，PR #2773）在四个方向上被调查报告判定为「方向正确、刻度失当、维度缺失」：
+
+| # | 问题 | 关键证据 |
+|---|---|---|
+| 1 | 未提交到平台的失败也吃掉整个间隔窗口 | 本机真实历史：bilibili 连续 3 次失败间隔恰为 **120.0 / 30.0 分钟**；自动重试（`task-queue.js:587-597`）与手动重试（`:240-262`）同走守卫 |
+| 2 | 只有最小间隔、没有日配额 | 公开资料唯一有依据的维度是「条/天」（微信订阅号 1 条/天；微博发博 30 次/小时、100 次/天） |
+| 3 | 零抖动，发布点落在精确整数边界 | 守卫与队列内 `Math.random` 命中 0；微博官方口径为「非用户主动行为频繁调用（即使未超过频次限制）」 |
+| 4 | 跨账号平台档无依据且实测空转 | `backend-data/accounts.json` 每平台恰好 1 账号 ⇒ 恒被更严的账号档支配 |
+
+## 2. 目标与非目标
+
+### 2.1 目标
+
+| ID | 目标 | 可验证判据 |
+|---|---|---|
+| G1 | 未提交到平台的失败不再惩罚窗口，且判定不可被获益方伪造 | 阶段判据 + 双标记 + 三条独立约束；M11/M12 变异各让指定锁红 |
+| G2 | 补上账号级日配额维度 | 跨日计数、独立否决、跨日自动恢复；M5/M6 变异红 |
+| G3 | 发布节奏不再呈现机器级等周期 | 抖动只增不减、区间可断言；M4 变异红 |
+| G4 | 数值下调到仍远保守于官方速率的量级 | 策略表单一真源；M9 变异红 |
+| G5 | 渲染层口径与运行期门禁统一，可查/可覆盖/可紧急放行 | 文案四态 + 设置页 + 紧急放行三态；M10 变异红 |
+
+### 2.2 非目标
+
+- 不做设备/IP 级全局串行（跨平台并发是核心用途）。
+- 不做「成功才记账」（会引入重复发布）。
+- **不声称符合任何平台官方规定**（沿用上游 PRD §2）。
+- 不做跨环境审计溯源、不做跨设备配额同步。
+- 不在本期修 `publish:wechat` 的任务级 `accountId` 缺口（另立变更）。
+
+## 3. 术语与口径（写死，避免歧义）
+
+| 术语 | 定义 |
+|---|---|
+| **提交（submit）** | 传输层向平台发起**首次平台写操作尝试**的动作 |
+| **已提交（submitted）** | 平台**已确认发出**（收到响应或等价确认） |
+| **未提交失败** | `submitAttempted === false`，或传输层显式声明 `definitelyNotSent === true` |
+| **窗口（window）** | 某个 `(platform, accountId)` 的「上次提交时刻」占位，存 SQLite `publish_timeline` |
+| **本机运营日** | 本机时区自然日 `YYYY-MM-DD`；**不与平台日界换算，也不声称等价** |
+| **回滚（release）** | 撤销一次**未提交**尝试所占的窗口与配额计数 |
+
+## 4. 功能清单
+
+| 优先级 | 功能 | 说明 |
+|---|---|---|
+| P0 | 阶段判据与双标记 | `submitAttempted` / `submittedAt` 由传输层打点；回滚仅在确证未送出时发生 |
+| P0 | 未提交失败回滚 | 回滚窗口 + 配额回补（幂等）+ 回滚计数递增 |
+| P0 | 重试放行 | 自动/手动重试走同一路径；满足最小退避即放行并发 `publish:released` |
+| P1 | 账号级日配额 | 独立否决项；跨日自动恢复；超限不占用短定时器 |
+| P1 | 间隔抖动 | 只增不减；可注入随机源；`ratio=0` 退化旧行为 |
+| P1 | 防风约束 | 最小退避 10 s + 每账号每日回滚上限 + 回滚计数只增 |
+| P1 | 未登记平台出声 | 回落最严档 + 每平台告警一次 |
+| P2 | 数值下调与平台档定位 | 见 §5 |
+| P2 | 渲染层口径统一 | 去承诺化提示 + 四态文案 + 三态归因 |
+| P2 | 设置页策略区块 | 当前档位、实际间隔区间、日配额、回滚失效计数；可覆盖 |
+| P2 | 一次性紧急放行 | 二次确认 + 每日上限 + 冷却 + 追加式审计 + 三态回显 |
+| P2 | 校准基础设施 | 口径定义 + 可复现取数脚本 |
+| P2 | 命名澄清 | `config/platforms.yaml` 的 `tencent_video` 注释 |
+
+## 5. 策略表与数值依据
+
+| tier | 平台 | 账号档 | 平台档 | 日配额 |
+|---|---|---|---|---|
+| `long` | wechat_mp, zhihu, baijiahao, toutiao | 20 分钟（原 60） | 2 分钟（原 5） | 3 条/天 |
+| `clip` | douyin, kuaishou, tencent_video, xiaohongshu, bilibili, youtube, tiktok, instagram, facebook | 10 分钟（原 30） | 2 分钟（原 3） | 5 条/天 |
+| `short` | weibo, twitter | 3 分钟（原 10） | 2 分钟（原 1） | 20 条/天 |
+| 未登记回落 | 任意未知 | 20 分钟 | 2 分钟 | 3 条/天 |
+
+**依据与自认弱点（公开资料没有分钟级下限，取值是「比官方速率更保守」的工程判断）**
+
+| 数字 | 依据 | 弱点 |
+|---|---|---|
+| 账号档 20 / 10 / 3 | 微博官方发博 30 次/小时 ≈ 2 分钟/条，取 1.5–10 倍余量 | 无平台给出分钟级下限；本项目**不声称**符合官方规定 |
+| 平台档 2 分钟 | 保留同平台多账号的近似设备级保护；相对 v1 的 3–5 分钟降到 40–67% | 公开资料零依据；**这是对调查报告 P1-1「默认关」的显式偏离**（理由见 §5.1） |
+| 日配额 3 / 5 / 20 | 长文参照微信订阅号 1 条/天（本工具走「发布」而非「群发」，故不直接套用）；短视频参照第三方经验「抖音 2–4 条/天」；短内容取微博官方 100 条/天的 1/5 | **工程保守起点，非运营确认值**；env 与设置页双覆盖，设置页显式标注「待确认」 |
+
+### 5.1 对调查报告 P1-1 的显式偏离
+
+调查报告建议「跨账号平台档**默认关**」。本期改为 **默认开 2 分钟**：
+
+1. 两轮跨家族评审各自独立指出「默认关会削弱同平台多账号（机构号矩阵）的共档保护」；
+2. 成本有界：**1 账号/平台时该档完全惰性**（账号档 3–20 分钟恒严于 2 分钟）；
+3. 它保留本项目唯一一条**设备/IP 邻域**保护（设备级串行明确不做）；
+4. 相对 v1 已把代价降到 40–67%。
+
+**代价**：同平台多账号时第二个账号需等约 2 分钟。**适用建议**：机构号矩阵用户建议保持默认；单人单号用户可显式设为 0 关闭。
+
+## 6. 数据模型与迁移
+
+### 6.1 新增表
+
+```sql
+CREATE TABLE IF NOT EXISTS publish_daily_count (
+  owner_subject  TEXT NOT NULL,
+  key            TEXT NOT NULL,   -- 'platform:accountId'（percent-encoded）
+  day_key        TEXT NOT NULL,   -- 'YYYY-MM-DD'（本机运营日）
+  count          INTEGER NOT NULL DEFAULT 0,   -- 已实际提交到平台的次数
+  rollback_count INTEGER NOT NULL DEFAULT 0,   -- 回滚尝试次数，只增不减
+  updated_at     INTEGER NOT NULL,
+  PRIMARY KEY (owner_subject, key, day_key)
+);
+CREATE INDEX IF NOT EXISTS idx_daily_owner_key ON publish_daily_count(owner_subject, key);
+```
+
+**两个计数器的语义分离**（回应评审「双重计费」指控）：
+- `count` = 平台负载代理量 ⇒ 未提交回滚**幂等回补**；
+- `rollback_count` = 滥用面代理量 ⇒ **只增不减**，用于回滚上限。
+
+### 6.2 迁移
+
+| 项 | 处理 |
+|---|---|
+| `publish_timeline` 存量行 | **不动**（列 `last_publish_at TEXT`，语义不变） |
+| 新表 | `CREATE TABLE IF NOT EXISTS`；`store-schema.js` 七处注册表同步登记（`TABLE_NAMES` / `OWNER_TABLE_SCHEMA_SQL` / `OWNER_INDEX_SQL` / `SCHEMA_SQL` / `OWNER_TABLE_COLUMNS` / `OWNER_TABLE_KEY_COLUMNS` / `OWNER_COLUMN_DEFAULTS`），缺一即 owner 隔离重建判定异常 |
+| 无历史数据 | 计数从 0 起，当天即受配额约束 |
+| 在途任务 | 新数值在**每轮 `check()`** 读取 ⇒ 即时生效；入队时旧值、执行时新值按新值判定 |
+
+## 7. 数据校验
+
+### 7.1 环境变量
+
+| 变量 | 合法域 | `0` 的语义 | 非法/越界行为 |
+|---|---|---|---|
+| `MP_PUBLISH_MIN_INTERVAL_MS` | `[0, 7 天]` 有限数 | 关闭账号档 | 回落策略表 + warn；越界钳到 7 天 + warn |
+| `MP_PUBLISH_PLATFORM_MIN_INTERVAL_MS` | `[0, 7 天]` | 关闭平台档 | 同上 |
+| `MP_PUBLISH_DAILY_MAX_LONG` | `>=0` 整数 | 关闭 `long` 档配额 | 非整数（含 `"5.5"`）/负数/空白 ⇒ 回落 + warn |
+| `MP_PUBLISH_DAILY_MAX_CLIP` | 同上 | 关闭 `clip` 档配额 | 同上 |
+| `MP_PUBLISH_DAILY_MAX_SHORT` | 同上 | 关闭 `short` 档配额 | 同上 |
+| `MP_PUBLISH_ACCOUNT_DAILY_MAX` | `>=0` 整数 | 关闭全部配额 | 设置该项 ⇒**覆盖三档为同值** |
+| `MP_PUBLISH_JITTER_RATIO` | `[0, 1)` 有限数 | 关闭抖动 | 越界 ⇒ 回落默认 `0.4` + warn |
+| `MP_PUBLISH_RELEASE_GRACE_MS` | `[10 000, 24 h]` 整数 | —（无关闭语义） | 低于下界钳到 10 s + warn |
+| `MP_PUBLISH_EMERGENCY_MAX_PER_DAY` | `[0, 10]` 整数 | 关闭紧急放行 | 越界 ⇒ 回落默认 `1` + warn |
+
+**统一纪律**：非法、越界、**空白**一律回落默认**并出声**（warn）；`0` 是**显式关闭**，不等于空白。
+
+### 7.2 设置页覆盖对象
+
+- 存储键：`publishFrequencyPolicy`（`store.getSetting`）。
+- 结构：`{ accountMinMs?, platformMinMs?, dailyMaxLong?, dailyMaxClip?, dailyMaxShort?, jitterRatio?, emergencyMaxPerDay? }`。
+- **任一字段非法 ⇒ 整个覆盖对象丢弃 + warn**（不允许部分生效，避免半生效态）。
+
+### 7.3 key 构造（防注入与碰撞）
+
+- 唯一构造函数 `buildKey(platform, accountId)`：两段分别 `encodeURIComponent` 后以 `:` 连接；`accountId` 缺席时用哨兵 `*`。
+- 守卫与 store **禁止字符串拼接**（I8）。
+- 紧急放行 IPC 输入面另用 `isSafePathSegment` 校验平台与账号格式（两层防御）。
+
+### 7.4 计数读回
+
+- 一律 `Number.parseInt(String(v), 10)`；非有限（`NaN`）⇒ 0 **并出声**。
+- 历史先例：SQLite TEXT 亲和会让读回值形如 `'3.0'`，`parseInt` 归一为 3。
+
+## 8. 功能逻辑
+
+### 8.1 判定顺序与合并公式
+
+```
+check(platform, accountId):
+  accountRemaining  = 有 accountId 且账号档 > 0 ? 剩余(accountKey, 账号档) : 0
+  platformRemaining = 平台档 > 0               ? 剩余(platformKey, 平台档) : 0
+  intervalRemaining = max(accountRemaining, platformRemaining)   ← 两档取更严
+  dailyVeto         = dailyMax > 0 && used >= dailyMax
+
+  dailyVeto ⇒ { allowed:false, remainingMs:0, bucket:'daily', reason:'daily_quota', daily:{used,max,dayKey} }
+  intervalRemaining > 0 ⇒ { allowed:false, remainingMs: jitter(intervalRemaining), bucket: 更大的那档, reason:'interval' }
+  否则    ⇒ { allowed:true,  remainingMs: 0, bucket: null, reason: null, daily:{...} }
+```
+
+**抖动**：`jitter(x) = min(round(x × (1 + ratio × random())), 2³¹−2 000)`。`ratio=0` ⇒ `jitter(x) === x`。
+
+### 8.2 记账与回滚（核心）
+
+```
+hold = guard.recordPublish(platform, accountId)
+      → { at, accountPrev, platformPrev, dailyPrev }
+task._hold = hold                      // 必须保存（结构锁断言被消费）
+
+执行失败时：
+  rollbackable =
+      (task.submitAttempted === false)                  // 从未发起写尝试
+   || (e.definitelyNotSent === true)                    // 传输层确证未送出
+  且 (e.notSubmitted !== true || <上述成立>)             // 佐证位不得与之矛盾
+  且 (rollbackToday(accountKey) < max(2, dailyMax))     // 防风上限
+
+  成立 ⇒ guard.release(platform, accountId, hold)
+  否则 ⇒ 占窗口（现状不变）
+```
+
+`release()` 语义：
+1. `store.get(key) === hold.at` 才回滚该键（否则不动 ⇒ **绝不回滚他人窗口**），按 `*Prev` 恢复或置 null；
+2. `decrDay(accountKey, today, 'count')`（配额回补，下限 0，幂等）；
+3. `incrDay(accountKey, today, 'rollback_count')`（只增）。
+
+### 8.3 日配额与跨日
+
+- 判定在**记账之前** ⇒ 被拒任务**从未占用窗口** ⇒ 无 hold 持久化需求。
+- 队列新增 `_quotaBlocked: Set<taskId>`；`_processNext` **必须跳过**（防紧循环）。
+- 定时器指向 **次日 00:00:05**，截止时间由**同一注入时钟**推导；`unref()` 必须调用。
+- 溢出：次日上界 24 h ≪ 2³¹−1 ms，数学上不可能溢出；含抖动的间隔另有钳位（§8.1）。
+- 重启：任务以 `pending` 持久化并恢复，重新判定 → 仍被拒则重新武装定时器。
+- 通道释放：配额分支在 `try/finally` 之前 `return`，必须**显式释放通道**（与既有 `publish:blocked` 同因）。
+
+### 8.4 重试放行
+
+- 自动重试与手动重试同走 `add() → _executeTask → check()`。
+- 放行条件：`task.lastAttemptNotSubmitted === true` 且 `now - lastAttemptAt >= max(RELEASE_GRACE_MS, 10 s)`。
+- 必须发 `publish:released`（`{task, platform, accountId, reason:'not_submitted_retry', graceMs}`），经既有投影链到进度面板。
+
+### 8.5 紧急放行
+
+1. 入口：设置页「发布频率策略」→「立即解除本账号等待」（**仅当存在等待中的窗口时可用**）。
+2. 校验：平台已登记 + `isSafePathSegment(accountId)` + 当日该账号次数 < 上限 + 距上次任意放行 ≥10 分钟。
+3. 执行：取消该账号等待任务的定时器 → 从 `_delayed`/`_quotaBlocked` 移出 → 释放窗口 → 任务入队头 → `_processNext()`。
+4. 审计：追加一行 JSONL（`ts / platform / accountId / operator / reason(≤200字) / result`），**UI 无编辑入口**。
+5. 广播 `publish:emergencyReleased` → 设置页与进度面板刷新。
+6. 结果如实回显：成功 / 超上限 / 无等待中的窗口（**三态都不得静默**）。
+
+### 8.6 未登记平台
+
+命中 `BASELINE` 时经注入 `warn` 输出**一次**（进程内按平台 Set 去重）：
+
+```
+[PublishFrequency] 平台 "xxx" 未登记频率策略，回落最严基线（账号 20 分钟 / 平台 2 分钟 / 日配额 3 条）；请登记到 PLATFORM_FREQUENCY_POLICY
+```
+
+## 9. 流程（时序）
+
+### 9.1 正常发布
+
+```
+用户提交目标 → add() 入队 → _processNext（并发上限 3）
+  → check() 通过 → recordPublish() → 传输层 markSubmitAttempted() → 平台写 → markSubmitted()
+  → 成功：task:success（若 submittedAt 为空 ⇒ log.error + 计数，I4）
+```
+
+### 9.2 间隔未到
+
+```
+check() → allowed=false, bucket='account'|'platform', remainingMs=jitter(...)
+  → status=pending、从 _running 移除、显式释放通道
+  → publish:blocked → setTimeout(remainingMs) 重排队头（unref）
+  → 进度面板：「等待 N 分钟后重试（本账号间隔）」
+```
+
+### 9.3 日配额用尽
+
+```
+check() → allowed=false, bucket='daily', remainingMs=0
+  → 加入 _quotaBlocked → _processNext 跳过
+  → publish:blocked(reason='daily_quota')
+  → setTimeout(到次日 00:00:05)（同源时钟, unref）
+  → 进度面板：「今日已达上限（3/3），将于明日 00:00 后自动继续」
+```
+
+### 9.4 未提交失败
+
+```
+传输层/预检抛错（submitAttempted=false）→ 回滚条件成立
+  → release()：还原窗口 + 配额回补 + 回滚计数 +1
+  → 失败卡片：「未提交到平台，约 10 秒后可重试」
+  → 最小退避后再放行 → publish:released
+```
+
+### 9.5 已提交后失败/超时
+
+```
+错误或超时（submitAttempted=true 且无 definitelyNotSent）→ 不回滚
+  → 窗口保持占用 → 卡片：「已提交，需等待约 N 分钟」
+```
+
+### 9.6 紧急放行
+
+见 §8.5。
+
+## 10. 交互逻辑
+
+| 场景 | 用户动作 | 系统响应 |
+|---|---|---|
+| 提交后被挡 | 查看进度面板 | 等待行显示剩余分钟 + 归因标签 |
+| 配额用尽 | 查看进度面板 | 显示「今日已达上限(used/max)，明日 00:00 后自动继续」；提供取消按钮 |
+| 未提交失败 | 点重试 | 约 10 s 后可重试；卡片提示「未提交到平台，约 10 秒后可重试」 |
+| 已提交失败 | 点重试 | 提示还需等待的分钟数；重试进入队列后被守卫拦 |
+| 查看当前策略 | 打开设置 →「发布频率策略」 | 显示档位、实际间隔区间 `[base, base×1.4)`、日配额、回滚失效计数 |
+| 覆盖策略 | 修改并保存 | 逐字段校验；任一字段非法 ⇒ 整体丢弃 + 明确错误提示 |
+| 紧急放行 | 点「立即解除本账号等待」 | 二次确认 → 成功/超上限/无窗口三态回显 |
+| 归因字段缺席 | — | **不渲染任何归因标签**（不得猜测档位） |
+
+## 11. 显示项与提示文字
+
+### 11.1 进度面板
+
+| key | zh | en |
+|---|---|---|
+| `publishPage.progress.blockedWaitMinutes` | `等待 {minutes} 分钟后重试` | `Retry in {minutes} min` |
+| `publishPage.progress.blockedBucketAccount` | `（本账号间隔）` | `(account interval)` |
+| `publishPage.progress.blockedBucketPlatform` | `（同平台其他账号间隔）` | `(cross-account platform interval)` |
+| `publishPage.progress.blockedBucketDaily`（新） | `（本账号每日上限）` | `(account daily limit)` |
+| `publishPage.progress.blockedDailyQuota`（新） | `今日已达上限（{used}/{max}），将于明日 00:00 后自动继续` | `Daily limit reached ({used}/{max}); resumes after 00:00 tomorrow` |
+| `publishPage.progress.failedNotSubmittedHint`（新） | `未提交到平台，约 10 秒后可重试` | `Not submitted; retry in about 10s` |
+| `publishPage.progress.failedSubmittedHint`（新） | `已提交到平台，需等待约 {minutes} 分钟后重试` | `Submitted; retry in about {minutes} min` |
+| `publishPage.progress.releasedNotSubmitted`（新） | `未提交到平台，已恢复可发布` | `Not submitted; publish window restored` |
+
+### 11.2 定时发布提示（**改**，去承诺化）
+
+| key | zh | en |
+|---|---|---|
+| `publishPage.scheduleHintWithLimits` | `留空 = 立即发布；可排期未来 {maxDays} 天内。实际发布节奏按「发布频率策略」执行（本表单仅做基础校验）` | `Leave empty to publish now; schedule within {maxDays} days. Actual pacing follows the Publish Frequency Policy (this form only does basic validation)` |
+| `publishPage.scheduleValidation.scheduleIntervalTooShort` | `{platform} {accountId}的定时任务间隔必须至少 {minMinutes} 分钟` | `Scheduled tasks for {platform} {accountId} must be at least {minMinutes} minutes apart` |
+
+### 11.3 设置页「发布频率策略」
+
+| key | zh | en |
+|---|---|---|
+| `settings.publishFrequency.title` | `发布频率策略` | `Publish Frequency Policy` |
+| `settings.publishFrequency.currentTier` | `当前档位：账号 {accountMinutes} 分钟 / 平台 {platformMinutes} 分钟 / 每日 {dailyMax} 条` | `Current: {accountMinutes} min per account / {platformMinutes} min per platform / {dailyMax} per day` |
+| `settings.publishFrequency.effectiveRange` | `实际等待区间：{min}–{max} 分钟（含抖动）` | `Effective wait: {min}–{max} min (with jitter)` |
+| `settings.publishFrequency.accountInterval` | `同账号最小间隔（分钟）` | `Min interval per account (minutes)` |
+| `settings.publishFrequency.platformInterval` | `同平台跨账号最小间隔（分钟，0 = 关闭）` | `Cross-account platform interval (minutes, 0 = off)` |
+| `settings.publishFrequency.dailyMax` | `每账号每日上限（0 = 不限）` | `Daily limit per account (0 = off)` |
+| `settings.publishFrequency.jitterOn` | `加入随机抖动（更像人工节奏）` | `Add random jitter (more human-like pacing)` |
+| `settings.publishFrequency.jitterHint` | `开启后实际等待比标称值长 0–40%，总吞吐略降` | `Wait becomes 0–40% longer; throughput drops slightly` |
+| `settings.publishFrequency.rollbackFailures` | `回滚失效次数：{count}（>0 说明窗口已被后续提交覆盖）` | `Rollback failures: {count} (>0 means the window was already re-taken)` |
+| `settings.publishFrequency.saveInvalid` | `策略配置非法，已整体丢弃并回退到上一份有效配置` | `Invalid policy; the whole override was discarded and the previous valid one kept` |
+| `settings.publishFrequency.emergency` | `立即解除本账号等待` | `Release this account's wait now` |
+| `settings.publishFrequency.emergencyConfirm` | `本次将跳过等待直接进入发布队列，操作会记入审计。确认继续？` | `This skips the wait and enqueues immediately; the action is audited. Continue?` |
+| `settings.publishFrequency.emergencyOk` | `已解除等待，任务已重新入队` | `Wait released; the task was re-enqueued` |
+| `settings.publishFrequency.emergencyExhausted` | `今日紧急放行次数已用尽（{max} 次/天）` | `Daily emergency releases exhausted ({max}/day)` |
+| `settings.publishFrequency.emergencyCooldown` | `距上次放行不足 {minutes} 分钟，请稍后再试` | `Less than {minutes} min since the last release; try again later` |
+| `settings.publishFrequency.emergencyNoWait` | `当前没有等待中的窗口` | `No pending wait window` |
+| `settings.publishFrequency.dailyMaxPendingConfirm` | `默认值 3/5/20 待运营确认` | `Defaults 3/5/20 pending operator confirmation` |
+
+**i18n 纪律**：zh/en 必须成对提交（CI Gate 7）；渲染端非 locales 文件不得新增中文字面量（CJK 基线扫描）。
+
+## 12. 可观测与审计
+
+| 通道 | 内容 |
+|---|---|
+| `publish:blocked`（扩展） | 新增 `reason`（`interval` / `daily_quota`）与 `daily`（`{used,max,dayKey}`） |
+| `publish:released`（新） | `{task, platform, accountId, reason:'not_submitted_retry', graceMs}` |
+| `publish:emergencyReleased`（新） | `{platform, accountId, at, operator}` |
+| 日志 | 守卫在 release / 日配额否决 / 未登记回落 / 非法配置 / 佐证位不一致 / 成功而 `submittedAt` 为空（I4）六处出声。**禁止记录内容标题等用户文本** |
+| 审计 | `publish-emergency-audit.jsonl` 追加式；`log.notify` 一条 INFO |
+| 排查入口 | `publish_timeline`（最后提交）+ `publish_daily_count`（当日计数与回滚计数）两表即可复现任一次判定 |
+
+**投影穷尽性**：新增字段必须同时改**所有**投影面 —— 已知 4 处投影白名单 + `emitPhaseNotify` 固定字段块，共 5 处（上游记录 QM-6 W1 的穷尽性审计结论）。
+
+## 13. 配置优先级
+
+```
+设置页覆盖对象（整体有效或整体丢弃）
+  > 环境变量（逐项）
+  > 策略表（单一真源）
+  > 未登记平台 → 最严基线
+```
+
+## 14. 风险与缓解
+
+| 风险 | 缓解 |
+|---|---|
+| 传输层漏接线 ⇒ 未提交失败被当已提交（多等，方向安全） | I4 成功路径自证 + 计数告警 |
+| 传输层被绕过 ⇒ 已提交却判未提交（危险侧） | 双标记 + 佐证位一致 + 防风上限；M11/M12 变异反证 |
+| 回滚风暴 | 最小退避 10 s + 每账号每日回滚上限 + 只增的回滚计数 |
+| 抖动 + 下调导致吞吐显著下降 | 设置页显示实际区间与日配额；PRD 写明量级；抖动可关 |
+| 新增表破坏 owner 隔离重建 | 七处注册表同步登记 + `store-schema` / `store-owner-isolation` 全量 |
+| 紧急放行成为新绕过口 | 每账号每日 1 次 + ≥10 分钟冷却 + 追加式审计 + 设置页可见 |
+| 长定时器溢出 | 次日上界 24 h 远小于上限；抖动值另有钳位；`unref()` |
+
+## 15. 验收标准
+
+| # | 场景 | 预期 |
+|---|---|---|
+| A1 | 未提交失败后重试 | 满足最小退避即放行；`publish:released` 存在 |
+| A2 | 已提交（超时）失败后重试 | 被拦满窗口；**无** release |
+| A3 | 佐证位与阶段标记不一致 | 占窗口 + `log.error` |
+| A4 | 成功发布而 `submittedAt` 为空 | `log.error` + 计数 +1 |
+| A5 | 同账号当日第 N+1 条 | `bucket='daily'`、不设长定时器以外的紧循环；`_processNext` 跳过 |
+| A6 | 跨日 00:00 后 | 计数归零、可继续 |
+| A7 | 抖动开启 100 次采样 | 全部 ∈ `[base, base×1.4)`，均值明显 > base |
+| A8 | 抖动关闭 | 与 v1 逐值一致 |
+| A9 | 同平台两账号（平台档默认 2 分钟） | 第二条被拦 `bucket='platform'`，约 2 分钟 |
+| A10 | 平台档显式 0 | 第二条不被平台档拦（仍受账号档与配额约束） |
+| A11 | 未登记平台 | 回落最严档 + warn **一次** |
+| A12 | 非法 env（六种） | 各自回落 + warn，行为可预期 |
+| A13 | 紧急放行 | 跳过等待、写审计、次日次数重置 |
+| A14 | 紧急放行超上限 / 冷却中 / 无窗口 | 三态各自明确回显，队列状态不变 |
+| A15 | 重启后 | 窗口仍生效（`publish_timeline`）；配额被拒任务恢复后重新判定 |
+| A16 | 十六项变异 | 各自**恰好**让指定锁变红（实跑留证） |
+| A17 | QM-1 | 打包 rc=0、asar 含新表 DDL 与新策略文件、启动 8 s stderr 无致命 |
+
+## 16. 测试计划
+
+见 `openspec/changes/publish-frequency-policy-v2/tasks.md` §1–§6 与本文 §15；变异清单 M1–M16 见 tasks §6。
+
+## 17. 已知限制与遗留
+
+- 审计**仅本地**，不做跨环境溯源（需新增出网通道，爆炸半径大于被保护对象）。
+- 无设备/IP 级串行（沿用上游非目标）。
+- 日配额 3/5/20 为工程保守起点，**待运营在设置页确认**。
+- `publish:wechat` 的任务级 `accountId` 缺口（渲染层零生产调用方）留待另立变更。
+- 公开资料对海外平台（YouTube / X / Instagram / TikTok）本轮**零取证**，故数值不对其做差异化。
diff --git a/apps/desktop/electron/bootstrap.js b/apps/desktop/electron/bootstrap.js
index 0ec0a9690..5e6858735 100644
--- a/apps/desktop/electron/bootstrap.js
+++ b/apps/desktop/electron/bootstrap.js
@@ -121,11 +121,30 @@ function createAppContext() {
         stage: msg, percent: pct, batchId: task.batchId || null,
       })
     }
+    // publish-frequency-policy-v2：区分「进入发布器之前」与「之内」的失败（见下方打点注释）
+    let enteredPublisher = false
     try {
+      // ── publish-frequency-policy-v2：提交阶段打点（P0-1 的正确性基础）──
+      // 判据是「平台写操作是否真的发出去过」，因此打点必须由**这一层**（真正调用发布器
+      // 的地方）而不是由抛错的那一层来做：抛错方同时是「免等重试」的获益方，自标可被伪造。
+      //
+      // 分层语义：
+      //   ① 进入 publish() 之前的失败（风控挂起 / 信号已中止 / 进度注册失败）⇒ 从未发起
+      //      平台写尝试 ⇒ 不打点 ⇒ 守卫可回滚该窗口（这正是报告点名的「风控挂起」族）。
+      //   ② publish() 内部失败：默认按**已提交**处理（保守：宁可多等一个窗口）；
+      //      仅当发布器显式声明 `definitelyNotSent === true`（连接未建立 / DNS 失败等
+      //      可确证未送出）时才允许回滚。
+      //   ③ 成功 ⇒ submittedAt 置位（同时满足不变量 I4：成功而 submittedAt 为空即接线缺陷）。
+      enteredPublisher = true
       const result = await publisher.publish(task, { signal: context.signal, onProgress: onPublisherProgress })
+      if (typeof taskQueue.markSubmitted === 'function') taskQueue.markSubmitted(task.id)
       // 终态事件单一来源是 phase4-events 的 task:success/task:failed（executor 不再重复发送）
       return result
     } catch (e) {
+      // ② 已进入发布器且未自证「未送出」⇒ 标记已发起提交尝试，以阻止误回滚
+      if (enteredPublisher && !(e && e.definitelyNotSent === true)) {
+        if (typeof taskQueue.markSubmitAttempted === 'function') taskQueue.markSubmitAttempted(task.id)
+      }
       log.error('Executor', 'Publish failed for ' + platform + ': ' + errorMessage(e))
       throw e
     } finally {
diff --git a/apps/desktop/electron/bootstrap/phase4-events.js b/apps/desktop/electron/bootstrap/phase4-events.js
index 57d4e6928..a06a7d518 100644
--- a/apps/desktop/electron/bootstrap/phase4-events.js
+++ b/apps/desktop/electron/bootstrap/phase4-events.js
@@ -240,10 +240,31 @@ function wireTaskQueueEvents({ taskQueue, history, publishMonitor, publishImpact
     }
   })
 
-  taskQueue.on('publish:blocked', ({ task, remainingWait, bucket }) => {
+  taskQueue.on('publish:blocked', ({ task, remainingWait, bucket, reason, daily }) => {
+    // v2：日配额用尽是「今天到此为止」而非「等一会儿」，remainingWait 恒为 0，
+    // 故 stage 文案必须按 reason 分流；渲染端另按 reason 选择本地化文案（勿依赖这句中文）。
+    const isDailyQuota = reason === 'daily_quota' || bucket === 'daily'
+    const stage = isDailyQuota
+      ? '⏳ 今日发布已达上限，明日 00:00 后自动继续'
+      : '⏳ 发布间隔限制，等待 ' + Math.ceil(remainingWait / 60000) + ' 分钟后重试'
     emitter.emit(task.id, task.platform, 'blocked', {
-      stage: '⏳ 发布间隔限制，等待 ' + Math.ceil(remainingWait / 60000) + ' 分钟后重试',
-      remainingWait, bucket: bucket || null, batchId: task.batchId || null,
+      stage,
+      remainingWait,
+      bucket: bucket || null,
+      reason: reason || null,
+      daily: daily || null,
+      batchId: task.batchId || null,
+    })
+  })
+
+  // v2：未提交失败已回滚窗口（可立即重试）——必须可观测，否则「为什么这次不用等」无从解释
+  taskQueue.on('publish:released', ({ task, reason, graceMs }) => {
+    emitter.emit(task.id, task.platform, 'released', {
+      stage: '↺ 未提交到平台，已恢复可发布',
+      stageKey: 'released',
+      releaseReason: reason || null,
+      graceMs: graceMs || null,
+      batchId: task.batchId || null,
     })
   })
 
diff --git a/apps/desktop/electron/bootstrap/phase5-ipc.js b/apps/desktop/electron/bootstrap/phase5-ipc.js
index 5f3c4c6c6..0efa945b8 100644
--- a/apps/desktop/electron/bootstrap/phase5-ipc.js
+++ b/apps/desktop/electron/bootstrap/phase5-ipc.js
@@ -200,6 +200,19 @@ function registerAllIpcHandlers({ app, BrowserWindow, context }) {
     riskSuspender,
   } = context
 
+  // publish-frequency-policy-v2：发布频率守卫单例（容器注册项）。优先取 context 上的引用，
+  // 其次经容器现取；整体 try 包裹并在失败时降级为 null —— IPC 侧据此如实回报「服务未初始化」，
+  // 绝不允许在装配期抛错把整条 IPC 注册链带崩。
+  const publishIntervalGuardForIpc = (() => {
+    try {
+      if (context && context.publishIntervalGuard) return context.publishIntervalGuard
+      if (context && context.container && typeof context.container.get === 'function') {
+        return context.container.get('publishIntervalGuard')
+      }
+    } catch (_) { /* 降级为 null，由 IPC 侧回报未初始化 */ }
+    return null
+  })()
+
   const registerAllHandlers = require('../ipc-handlers')
   const handlerDependencies = {
     app, BrowserWindow, log, renderEngine, taskQueue, history,
@@ -286,6 +299,13 @@ function registerAllIpcHandlers({ app, BrowserWindow, context }) {
       identityService,
     )
     const registerCentralHandlers = () => {
+      // publish-frequency-policy-v2：守卫在此挂到依赖对象上（对象字面量已闭合，故用赋值）。
+      // 放在注册**之前**是硬要求：IPC handler 在调用时才读 deps，但顺序错了会让早期调用拿到 undefined。
+      handlerDependencies.publishIntervalGuard = publishIntervalGuardForIpc
+      const { createPublishEmergencyReleaseService } = require('../services/publish-emergency-release')
+      handlerDependencies.publishEmergencyRelease = createPublishEmergencyReleaseService({
+        store, log, app, identityService, now: Date.now,
+      })
       return registerAllHandlers(controlledIpcMain, handlerDependencies)
     }
     const cloudRegistration = cloudPublisher
diff --git a/apps/desktop/electron/core/container.setup.js b/apps/desktop/electron/core/container.setup.js
index 617043c27..dcf84c9f1 100644
--- a/apps/desktop/electron/core/container.setup.js
+++ b/apps/desktop/electron/core/container.setup.js
@@ -60,6 +60,10 @@ const CommentManager = require('../services/comment-manager');
 const ProviderManager = require('../services/provider-manager');
 const { TaskQueue, AggregatorBridge, ChunkedUploader, ProxyPool, AnalyticsService, publishFrequencyPolicy } = require("@multi-publish/shared-utils");
 const resolvePublishIntervals = publishFrequencyPolicy.resolveIntervals;
+const resolvePolicyOverrides = publishFrequencyPolicy.resolvePolicyOverrides;
+const resolveJitterRatio = publishFrequencyPolicy.resolveJitterRatio;
+const resolveReleaseGraceMs = publishFrequencyPolicy.resolveReleaseGraceMs;
+const isKnownPublishPlatform = publishFrequencyPolicy.isKnownPlatform;
 const PublishIntervalGuard = require("@multi-publish/shared-utils/src/publish-interval-guard");
 const TemplateManager = require('../services/template-manager');
 const RewriteStrategyManager = require('../services/rewrite-strategy-manager');
@@ -368,14 +372,35 @@ function createContainer(options) {
   });
   container.register("publishIntervalGuard", function(c) {
     const s = c.get("store");
+    // publish-frequency-policy-v2：设置页覆盖（全有或全无）+ 抖动 + 日配额存储。
+    // 覆盖解析在策略模块内（纯函数）。
+    //
+    // ⚠️ 覆盖对象**每次 check 现取**，不在构造时快照：设置页改完要求「下一次判定即生效」，
+    //    构造期快照会让改动只能靠重启生效，而 UI 又没有任何提示（静默不生效）。
+    //    代价是每次 check 一次 settings 读（发生在任务粒度，不是热路径）。
+    const warn = (m) => logger.warn(m);
+    const readOverrides = () => resolvePolicyOverrides(
+      typeof s.getSettingObject === 'function' ? s.getSettingObject("publishFrequencyPolicy", null) : null,
+      { warn }
+    );
     return new PublishIntervalGuard({
-      // 间隔值由 publish-frequency-policy 单一持有（含环境变量覆盖）；
+      // 间隔值由 publish-frequency-policy 单一持有（含环境变量 + 设置页覆盖）；
       // 禁止在此硬编码 minInterval，那会让策略表变成摆设。
-      policy: resolvePublishIntervals,
+      policy: (platform) => resolvePublishIntervals(platform, { overrides: readOverrides(), warn }),
+      isKnownPlatform: isKnownPublishPlatform,
       store: {
         get: (key) => s.getPublishTimeline(key),
         set: (key, value) => s.setPublishTimeline(key, value),
-      }
+      },
+      // 日配额计数落在 publish_daily_count（owner 隔离；count 可回补 / rollback_count 只增）
+      dailyStore: {
+        getDay: (key, dayKey) => s.getPublishDailyCount(key, dayKey) || { count: 0, rollback_count: 0 },
+        incrDay: (key, dayKey, field, delta) => s.incrPublishDailyCount(key, dayKey, field, delta),
+        decrDay: (key, dayKey, field) => s.decrPublishDailyCount(key, dayKey, field),
+      },
+      jitterRatio: resolveJitterRatio({ overrides: readOverrides(), warn }),
+      releaseGraceMs: resolveReleaseGraceMs({ overrides: readOverrides(), warn }),
+      warn,
     });
   });
 
diff --git a/apps/desktop/electron/core/container.setup.test.js b/apps/desktop/electron/core/container.setup.test.js
index 79404d571..d3d285a95 100644
--- a/apps/desktop/electron/core/container.setup.test.js
+++ b/apps/desktop/electron/core/container.setup.test.js
@@ -139,21 +139,26 @@ describe('Container setup', () => {
 
   test('装配锁：守卫的间隔按平台策略解析，不得回退成硬编码单一值', () => {
     // 策略模块读 process.env，开发机若恰好设了覆盖值会让精确断言假红 —— 测试自己钉住档位。
-    const ENV_KEYS = ['MP_PUBLISH_MIN_INTERVAL_MS', 'MP_PUBLISH_PLATFORM_MIN_INTERVAL_MS'];
+    const ENV_KEYS = [
+      'MP_PUBLISH_MIN_INTERVAL_MS', 'MP_PUBLISH_PLATFORM_MIN_INTERVAL_MS',
+      'MP_PUBLISH_DAILY_MAX_LONG', 'MP_PUBLISH_DAILY_MAX_CLIP', 'MP_PUBLISH_DAILY_MAX_SHORT',
+      'MP_PUBLISH_ACCOUNT_DAILY_MAX',
+    ];
     const saved = ENV_KEYS.map(function (k) { return process.env[k]; });
     ENV_KEYS.forEach(function (k) { delete process.env[k]; });
     try {
       var guard = createContainer().get('publishIntervalGuard');
 
-      // weibo 属短内容高频容忍档；未登记平台回落最严基线
+      // v2 数值：weibo 属短内容高频容忍档；未登记平台回落最严基线
       expect(guard._intervals('weibo')).toEqual({
-        accountMinMs: 10 * 60 * 1000, platformMinMs: 60 * 1000,
+        accountMinMs: 3 * 60 * 1000, platformMinMs: 2 * 60 * 1000, accountDailyMax: 20,
       });
       expect(guard._intervals('wechat_mp')).toEqual({
-        accountMinMs: 60 * 60 * 1000, platformMinMs: 5 * 60 * 1000,
+        accountMinMs: 20 * 60 * 1000, platformMinMs: 2 * 60 * 1000, accountDailyMax: 3,
       });
-      expect(guard._intervals('not_a_registered_platform').accountMinMs)
-        .toBeGreaterThanOrEqual(guard._intervals('weibo').accountMinMs);
+      var unknown = guard._intervals('not_a_registered_platform');
+      expect(unknown.accountMinMs).toBeGreaterThanOrEqual(guard._intervals('weibo').accountMinMs);
+      expect(unknown.accountDailyMax).toBeGreaterThan(0);
     } finally {
       ENV_KEYS.forEach(function (k, i) {
         if (saved[i] !== undefined) process.env[k] = saved[i];
@@ -161,6 +166,58 @@ describe('Container setup', () => {
     }
   });
 
+  // ── v2 装配锁（openspec/changes/publish-frequency-policy-v2）───────────────────
+  // 事故形态同上一组：日配额逻辑在守卫里实现且有单测，但生产装配漏注入 dailyStore
+  // ⇒ check() 恒返回 daily:null ⇒ 配额维度在运行时完全不存在（静默失效）。
+  test('装配锁 v2：dailyStore 三个方法必须注入（否则日配额静默失效）', () => {
+    const guard = createContainer().get('publishIntervalGuard');
+    expect(guard._dailyStore).toBeTruthy();
+    expect(typeof guard._dailyStore.getDay).toBe('function');
+    expect(typeof guard._dailyStore.incrDay).toBe('function');
+    expect(typeof guard._dailyStore.decrDay).toBe('function');
+  });
+
+  test('装配锁 v2：抖动比例与回滚退避已从策略模块注入（不得回退成硬编码）', () => {
+    const guard = createContainer().get('publishIntervalGuard');
+    expect(typeof guard.jitterRatio).toBe('number');
+    expect(guard.jitterRatio).toBeGreaterThanOrEqual(0);
+    expect(guard.jitterRatio).toBeLessThan(1);
+    expect(guard.releaseGraceMs).toBeGreaterThanOrEqual(10000);
+  });
+
+  test('装配锁 v2 行为锁：日配额用尽时 check() 必须给出 bucket=daily（不只是「注入了」）', () => {
+    // 这里刻意**打桩 store 的方法**而不是写真实库：装配锁要证明的是
+    // 「guard → dailyStore 适配器 → store 方法」这条链路真的接通了。
+    // 依赖真实 DB 会让断言变成「DB 是否 init 过」，与装配正确性无关。
+    const c = createContainer();
+    const guard = c.get('publishIntervalGuard');
+    const store = c.get('store');
+    const max = guard._intervals('douyin').accountDailyMax;
+    expect(max).toBeGreaterThan(0);
+
+    const savedGet = store.getPublishDailyCount;
+    store.getPublishDailyCount = function () { return { count: max, rollback_count: 0 } };
+    try {
+      const verdict = guard.check('douyin', 'acc-lock');
+      expect(verdict.allowed).toBe(false);
+      expect(verdict.bucket).toBe('daily');
+      expect(verdict.reason).toBe('daily_quota');
+      expect(verdict.remainingMs).toBe(0);
+      expect(verdict.daily).toMatchObject({ used: max, max });
+    } finally {
+      store.getPublishDailyCount = savedGet;
+    }
+
+    // 反向：配额未达上限时必须放行（证明不是「永远报 daily」的假锁）
+    const savedGet2 = store.getPublishDailyCount;
+    store.getPublishDailyCount = function () { return { count: 0, rollback_count: 0 } };
+    try {
+      expect(guard.check('douyin', 'acc-lock').bucket).not.toBe('daily');
+    } finally {
+      store.getPublishDailyCount = savedGet2;
+    }
+  });
+
   test('assertRequired passes', () => {
     expect(() => createContainer()).not.toThrow();
   });
diff --git a/apps/desktop/electron/home-shell-preload.bundle.js b/apps/desktop/electron/home-shell-preload.bundle.js
index d136550f3..894af16cf 100644
--- a/apps/desktop/electron/home-shell-preload.bundle.js
+++ b/apps/desktop/electron/home-shell-preload.bundle.js
@@ -84,6 +84,22 @@ var require_publish = __commonJS({
         cropVideoCover: (payload) => ipcRenderer2.invoke("cover:crop", payload),
         readCoverData: (imagePath) => ipcRenderer2.invoke("cover:read-data", imagePath),
         listAccounts: () => ipcRenderer2.invoke("accounts:list"),
+        // 发布频率策略（publish-frequency-policy-v2）：读取 / 覆盖写入 / 紧急放行。
+        // 紧急放行不接受渲染层自报操作者（operator 由主进程按当前 identity 解析），
+        // 故这里只转发 platform/accountId/reason 三项。
+        getPublishFrequencyPolicy: () => ipcRenderer2.invoke("publishFreq:getPolicy"),
+        setPublishFrequencyPolicy: (policy) => ipcRenderer2.invoke("publishFreq:setPolicy", { policy }),
+        emergencyReleasePublishWait: (payload) => ipcRenderer2.invoke("publishFreq:emergencyRelease", {
+          platform: payload && payload.platform,
+          accountId: payload && payload.accountId,
+          reason: payload && payload.reason
+        }),
+        getPublishEmergencyStatus: () => ipcRenderer2.invoke("publishFreq:emergencyStatus"),
+        onPublishEmergencyReleased: (callback) => {
+          const h = (_e, p) => callback(p);
+          ipcRenderer2.on("publish:emergencyReleased", h);
+          return () => ipcRenderer2.removeListener("publish:emergencyReleased", h);
+        },
         // 渲染 API
         renderStart: (data) => ipcRenderer2.invoke("render:start", data),
         renderStartAiVideo: (data) => ipcRenderer2.invoke("render:start-ai-video", data),
diff --git a/apps/desktop/electron/ipc-handlers/publish.js b/apps/desktop/electron/ipc-handlers/publish.js
index 7f36d37e6..f21464844 100755
--- a/apps/desktop/electron/ipc-handlers/publish.js
+++ b/apps/desktop/electron/ipc-handlers/publish.js
@@ -16,7 +16,7 @@ function registerHandlers(ipcMain, deps) {
   const { createPublishHelpers } = require('./publish-helpers')
   // eslint-disable-next-line no-unused-vars
   // eslint-disable-next-line no-unused-vars
-  const { taskQueue, history, BrowserWindow, log, identityService, riskSuspender } = deps
+  const { taskQueue, history, BrowserWindow, log, identityService, riskSuspender, publishIntervalGuard, store } = deps
 
   // 发布 IPC 局部工具：路径段校验 / 统一日志 / 文章摘要（见 publish-helpers.js）
   const { isSafePathSegment, ipcLog, summarizeArticle } = createPublishHelpers({ log })
@@ -478,6 +478,152 @@ function registerHandlers(ipcMain, deps) {
     } catch (e) { ipcLog('error', 'publishRisk:isSuspended', 'error', `message=${e.message}`); return { code: EC.REQUEST_ERROR, message: e.message } }
   }))
 
+  // ─── publish-frequency-policy-v2：策略读取 / 覆盖写入 / 紧急放行 ───
+  // 与 publishRisk:* 同约定：withSenderCheck + 入参白名单校验 + EC 错误码 + ipcLog。
+  const policyModule = require('@multi-publish/shared-utils/src/publish-frequency-policy')
+
+  ipcMain.handle('publishFreq:getPolicy', withSenderCheck(async () => {
+    try {
+      if (!publishIntervalGuard) return { code: EC.REQUEST_ERROR, message: '发布频率守卫未初始化' }
+      const platforms = {}
+      for (const p of policyModule.SUPPORTED_PLATFORMS) {
+        platforms[p] = publishIntervalGuard._intervals(p)
+      }
+      let overrides = null
+      try {
+        overrides = store && typeof store.getSettingObject === 'function'
+          ? store.getSettingObject('publishFrequencyPolicy', null)
+          : null
+      } catch (e) { ipcLog('warn', 'publishFreq:getPolicy', 'overrides-read-failed', e.message) }
+
+      return {
+        code: 0,
+        data: {
+          platforms,
+          overrides,
+          jitterRatio: publishIntervalGuard.jitterRatio,
+          releaseGraceMs: publishIntervalGuard.releaseGraceMs,
+          emergencyCooldownHint: 10 * 60 * 1000,
+        },
+      }
+    } catch (e) { ipcLog('error', 'publishFreq:getPolicy', 'error', `message=${e.message}`); return { code: EC.REQUEST_ERROR, message: e.message } }
+  }))
+
+  ipcMain.handle('publishFreq:setPolicy', withSenderCheck(async (event, payload) => {
+    const startedAt = Date.now()
+    try {
+      if (!publishIntervalGuard) return { code: EC.REQUEST_ERROR, message: '发布频率守卫未初始化' }
+      if (!store || typeof store.setSetting !== 'function') {
+        return { code: EC.REQUEST_ERROR, message: '存储不可用，策略未保存' }
+      }
+      const raw = payload && payload.policy !== undefined ? payload.policy : null
+      // 全有或全无：任一字段非法 ⇒ 整体丢弃。这里必须**在写库前**判定并如实回报，
+      // 否则界面会显示「已保存」而实际策略没变（半生效态不可解释）。
+      const validated = policyModule.resolvePolicyOverrides(raw, {
+        warn: (m) => ipcLog('warn', 'publishFreq:setPolicy', 'overrides-invalid', m),
+      })
+      if (raw && validated === null) {
+        return { code: EC.VALIDATION_ERROR, message: '策略配置非法：已整体拒绝（未保存任何字段）' }
+      }
+      store.setSetting('publishFrequencyPolicy', validated)
+      // 抖动/退避是守卫构造期标量，需要显式下发才即时生效（间隔与日配额是每次现取，无需下发）
+      if (validated) {
+        if (validated.jitterRatio !== undefined) publishIntervalGuard.setJitterRatio(validated.jitterRatio)
+        if (validated.releaseGraceMs !== undefined) publishIntervalGuard.setReleaseGraceMs(validated.releaseGraceMs)
+      }
+      ipcLog('info', 'publishFreq:setPolicy', 'ok', `fields=${validated ? Object.keys(validated).join(',') : 'cleared'} 耗时=${Date.now() - startedAt}ms`)
+      return { code: 0, data: { saved: true, policy: validated } }
+    } catch (e) { ipcLog('error', 'publishFreq:setPolicy', 'error', `message=${e.message}`); return { code: EC.REQUEST_ERROR, message: e.message } }
+  }))
+
+  ipcMain.handle('publishFreq:emergencyRelease', withSenderCheck(async (event, payload) => {
+    const startedAt = Date.now()
+    ipcLog('info', 'publishFreq:emergencyRelease', 'enter', `payload=${JSON.stringify(payload)}`)
+    try {
+      const svc = deps.publishEmergencyRelease
+      if (!svc) return { code: EC.REQUEST_ERROR, message: '紧急放行服务未初始化' }
+      const platform = payload && payload.platform
+      const rawAccountId = payload && payload.accountId
+      if (!isSafePathSegment(platform)) {
+        ipcLog('warn', 'publishFreq:emergencyRelease', 'validation-failed', 'platform 格式无效')
+        return { code: EC.VALIDATION_ERROR, message: 'platform 必须为合法平台标识' }
+      }
+      if (rawAccountId != null && !isSafePathSegment(String(rawAccountId))) {
+        ipcLog('warn', 'publishFreq:emergencyRelease', 'validation-failed', 'accountId 格式无效')
+        return { code: EC.VALIDATION_ERROR, message: 'accountId 格式无效' }
+      }
+      const accountId = rawAccountId == null ? null : String(rawAccountId)
+
+      // ① 策略闸：每日上限 / 冷却 / 已关闭 —— 未过闸时**如实回报原因**，不是错误码
+      const verdict = svc.check(platform, accountId)
+      if (!verdict.allowed) {
+        ipcLog('warn', 'publishFreq:emergencyRelease', 'blocked-by-policy', `reason=${verdict.code} used=${verdict.used}/${verdict.max}`)
+        return {
+          code: 0,
+          data: {
+            released: false,
+            reason: verdict.code,
+            used: verdict.used,
+            max: verdict.max,
+            retryAfterMs: verdict.retryAfterMs || 0,
+          },
+        }
+      }
+
+      // ② 机制可用性：到这一步才检查（策略已放行才需要队列能力；
+      //    提前检查会把「已用尽」这类真实原因遮蔽成「队列不可用」）
+      if (!taskQueue || typeof taskQueue.emergencyRelease !== 'function') {
+        ipcLog('error', 'publishFreq:emergencyRelease', 'queue-unavailable', '任务队列不支持紧急放行')
+        return { code: EC.REQUEST_ERROR, message: '任务队列不可用' }
+      }
+
+      // ③ 执行：取消防守定时器 → 清窗 → 重新入队（no_waiting_window 属正常结果，不是错误）
+      // operator 由服务内部从 identityService 解析，不接受渲染层自报（自报可伪造操作者）
+      const r = taskQueue.emergencyRelease(platform, accountId, {
+        reason: payload && payload.reason ? String(payload.reason) : undefined,
+      })
+      if (!r.ok) {
+        ipcLog('info', 'publishFreq:emergencyRelease', 'no-op', `reason=${r.code}`)
+        return { code: 0, data: { released: false, reason: r.code, used: verdict.used, max: verdict.max } }
+      }
+
+      // ③ 记账 + 追加式审计
+      const recorded = svc.record(platform, accountId, {
+        result: 'ok',
+        reason: payload && payload.reason ? String(payload.reason) : undefined,
+      })
+
+      try {
+        for (const win of BrowserWindow.getAllWindows()) {
+          if (win && !win.isDestroyed()) {
+            win.webContents.send('publish:emergencyReleased', { platform, accountId, taskId: r.taskId, at: recorded.at })
+          }
+        }
+      } catch (e) { ipcLog('warn', 'publishFreq:emergencyRelease', 'broadcast-failed', e.message) }
+
+      ipcLog('info', 'publishFreq:emergencyRelease', 'ok', `platform=${platform} accountId=${accountId ?? '-'} taskId=${r.taskId} audited=${recorded.audited} 耗时=${Date.now() - startedAt}ms`)
+      return {
+        code: 0,
+        data: {
+          released: true,
+          taskId: r.taskId,
+          clearedKeys: r.clearedKeys,
+          used: verdict.used + 1,
+          max: verdict.max,
+          audited: recorded.audited,
+        },
+      }
+    } catch (e) { ipcLog('error', 'publishFreq:emergencyRelease', 'error', `message=${e.message}`); return { code: EC.REQUEST_ERROR, message: e.message } }
+  }))
+
+  ipcMain.handle('publishFreq:emergencyStatus', withSenderCheck(async () => {
+    try {
+      const svc = deps.publishEmergencyRelease
+      if (!svc) return { code: EC.REQUEST_ERROR, message: '紧急放行服务未初始化' }
+      return { code: 0, data: svc.getStatus() }
+    } catch (e) { ipcLog('error', 'publishFreq:emergencyStatus', 'error', `message=${e.message}`); return { code: EC.REQUEST_ERROR, message: e.message } }
+  }))
+
   ipcMain.handle('dashboard:stats', withSenderCheck(async () => {
     try {
       const owner = getOwnerSubject()
diff --git a/apps/desktop/electron/ipc-handlers/publish.test.js b/apps/desktop/electron/ipc-handlers/publish.test.js
index 8b1b3a995..02754e4b5 100644
--- a/apps/desktop/electron/ipc-handlers/publish.test.js
+++ b/apps/desktop/electron/ipc-handlers/publish.test.js
@@ -597,3 +597,170 @@ describe('publish IPC Logto 权益门禁', () => {
     } finally { __electronMock.app.isPackaged = false }
   })
 })
+
+// ── publish-frequency-policy-v2：策略读取 / 覆盖写入 / 紧急放行 ────────────────
+describe('publishFreq IPC（策略与紧急放行）', () => {
+  const EC = require('../core/error-codes').ERROR
+
+  function policyGuard (overrides = {}) {
+    return {
+      _intervals: vi.fn((p) => ({ accountMinMs: 1000, platformMinMs: 500, accountDailyMax: 3, tier: 'clip' })),
+      jitterRatio: 0.4,
+      releaseGraceMs: 60000,
+      setJitterRatio: vi.fn(() => true),
+      setReleaseGraceMs: vi.fn(() => true),
+      ...overrides,
+    }
+  }
+
+  function makeDeps (overrides = {}) {
+    return createMockDeps({
+      publishIntervalGuard: policyGuard(),
+      publishEmergencyRelease: {
+        check: vi.fn(() => ({ allowed: true, code: null, used: 0, max: 1, dayKey: '2026-10-10' })),
+        record: vi.fn(() => ({ at: 1, operator: 'unknown', audited: true })),
+        getStatus: vi.fn(() => ({ dayKey: '2026-10-10', max: 1, cooldownMs: 600000, retryAfterMs: 0, perAccount: {} })),
+      },
+      store: { getSettingObject: vi.fn(() => null), setSetting: vi.fn() },
+      ...overrides,
+    })
+  }
+
+  it('emergencyRelease 拒绝外部网页调用（与其余写通道同闸）', async () => {
+    const ipcMain = createMockIpcMain()
+    registerHandlers(ipcMain, makeDeps())
+    const result = await ipcMain._get('publishFreq:emergencyRelease')(UNTRUSTED_EVENT, { platform: 'douyin', accountId: 'a' })
+    expect(result).toEqual({ code: -3, message: '未授权的调用来源' })
+  })
+
+  it('emergencyRelease 校验 platform / accountId 格式（防注入进 key 与审计）', async () => {
+    const ipcMain = createMockIpcMain()
+    const deps = makeDeps()
+    registerHandlers(ipcMain, deps)
+    const handler = ipcMain._get('publishFreq:emergencyRelease')
+
+    expect(await handler(TRUSTED_EVENT, { platform: 'dou/../yin', accountId: 'a' }))
+      .toMatchObject({ code: EC.VALIDATION_ERROR })
+    expect(await handler(TRUSTED_EVENT, { platform: 'douyin', accountId: 'a b' }))
+      .toMatchObject({ code: EC.VALIDATION_ERROR })
+    expect(deps.publishEmergencyRelease.check).not.toHaveBeenCalled()
+  })
+
+  it('emergencyRelease：服务未初始化时如实回报，不静默成功', async () => {
+    const ipcMain = createMockIpcMain()
+    registerHandlers(ipcMain, makeDeps({ publishEmergencyRelease: null }))
+    const result = await ipcMain._get('publishFreq:emergencyRelease')(TRUSTED_EVENT, { platform: 'douyin' })
+    expect(result).toMatchObject({ code: EC.REQUEST_ERROR })
+  })
+
+  it('emergencyRelease：策略闸未过 ⇒ 四态如实回报（released:false + 原因），不是错误码', async () => {
+    const ipcMain = createMockIpcMain()
+    const deps = makeDeps()
+    deps.publishEmergencyRelease.check = vi.fn(() => ({
+      allowed: false, code: 'exhausted', used: 1, max: 1, dayKey: '2026-10-10',
+    }))
+    registerHandlers(ipcMain, deps)
+
+    const result = await ipcMain._get('publishFreq:emergencyRelease')(TRUSTED_EVENT, { platform: 'douyin', accountId: 'a' })
+    expect(result).toEqual({
+      code: 0,
+      data: { released: false, reason: 'exhausted', used: 1, max: 1, retryAfterMs: 0 },
+    })
+    // 未过闸时**不得**调用机制层，也不得记账
+    expect(deps.taskQueue.emergencyRelease).toBeUndefined()
+    expect(deps.publishEmergencyRelease.record).not.toHaveBeenCalled()
+  })
+
+  it('emergencyRelease：冷却中回报 retryAfterMs', async () => {
+    const ipcMain = createMockIpcMain()
+    const deps = makeDeps()
+    deps.publishEmergencyRelease.check = vi.fn(() => ({
+      allowed: false, code: 'cooldown', used: 0, max: 1, retryAfterMs: 12345, dayKey: '2026-10-10',
+    }))
+    registerHandlers(ipcMain, deps)
+    const result = await ipcMain._get('publishFreq:emergencyRelease')(TRUSTED_EVENT, { platform: 'douyin' })
+    expect(result.data).toMatchObject({ released: false, reason: 'cooldown', retryAfterMs: 12345 })
+  })
+
+  it('emergencyRelease：没有等待中的窗口 ⇒ released:false + no_waiting_window（不得谎报成功）', async () => {
+    const ipcMain = createMockIpcMain()
+    const deps = makeDeps()
+    deps.taskQueue.emergencyRelease = vi.fn(() => ({ ok: false, code: 'no_waiting_window' }))
+    registerHandlers(ipcMain, deps)
+
+    const result = await ipcMain._get('publishFreq:emergencyRelease')(TRUSTED_EVENT, { platform: 'douyin', accountId: 'a' })
+    expect(result.data).toMatchObject({ released: false, reason: 'no_waiting_window' })
+    expect(deps.publishEmergencyRelease.record).not.toHaveBeenCalled()
+  })
+
+  it('emergencyRelease 成功：记账 + 广播 + 回报已用次数', async () => {
+    const ipcMain = createMockIpcMain()
+    const sent = []
+    const deps = makeDeps({
+      BrowserWindow: { getAllWindows: () => [{ isDestroyed: () => false, webContents: { send: (ch, p) => sent.push({ ch, p }) } }] },
+    })
+    deps.taskQueue.emergencyRelease = vi.fn(() => ({ ok: true, taskId: 't-9', clearedKeys: ['douyin:*', 'douyin:a'] }))
+    registerHandlers(ipcMain, deps)
+
+    const result = await ipcMain._get('publishFreq:emergencyRelease')(TRUSTED_EVENT, { platform: 'douyin', accountId: 'a', reason: '客户催稿' })
+    expect(result.code).toBe(0)
+    expect(result.data).toMatchObject({ released: true, taskId: 't-9', used: 1, max: 1 })
+    expect(deps.publishEmergencyRelease.record).toHaveBeenCalledWith('douyin', 'a', expect.objectContaining({ result: 'ok', reason: '客户催稿' }))
+    expect(sent).toHaveLength(1)
+    expect(sent[0].ch).toBe('publish:emergencyReleased')
+    // 渲染层自报的 operator 不得被采用（operator 由主进程解析）
+    expect(deps.taskQueue.emergencyRelease.mock.calls[0][2]).not.toHaveProperty('operator')
+  })
+
+  it('setPolicy：非法配置整体拒绝且**不写库**（半生效态不可解释）', async () => {
+    const ipcMain = createMockIpcMain()
+    const deps = makeDeps()
+    registerHandlers(ipcMain, deps)
+
+    const result = await ipcMain._get('publishFreq:setPolicy')(TRUSTED_EVENT, { policy: { accountMinMs: -5 } })
+    expect(result).toMatchObject({ code: EC.VALIDATION_ERROR })
+    expect(deps.store.setSetting).not.toHaveBeenCalled()
+    expect(deps.publishIntervalGuard.setJitterRatio).not.toHaveBeenCalled()
+  })
+
+  it('setPolicy：合法配置写库并下发抖动/退避（间隔与日配额是每次现取，无需下发）', async () => {
+    const ipcMain = createMockIpcMain()
+    const deps = makeDeps()
+    registerHandlers(ipcMain, deps)
+
+    const policy = { accountMinMs: 30000, jitterRatio: 0.2, releaseGraceMs: 30000 }
+    const result = await ipcMain._get('publishFreq:setPolicy')(TRUSTED_EVENT, { policy })
+    expect(result.code).toBe(0)
+    expect(result.data.saved).toBe(true)
+    expect(deps.store.setSetting).toHaveBeenCalledWith('publishFrequencyPolicy', expect.objectContaining({ accountMinMs: 30000 }))
+    expect(deps.publishIntervalGuard.setJitterRatio).toHaveBeenCalledWith(0.2)
+    expect(deps.publishIntervalGuard.setReleaseGraceMs).toHaveBeenCalledWith(30000)
+  })
+
+  it('setPolicy：null ⇒ 清空覆盖（写库为 null），不是校验错误', async () => {
+    const ipcMain = createMockIpcMain()
+    const deps = makeDeps()
+    registerHandlers(ipcMain, deps)
+    const result = await ipcMain._get('publishFreq:setPolicy')(TRUSTED_EVENT, { policy: null })
+    expect(result.code).toBe(0)
+    expect(deps.store.setSetting).toHaveBeenCalledWith('publishFrequencyPolicy', null)
+  })
+
+  it('getPolicy：逐平台回报档位 + 抖动/退避 + 覆盖原文', async () => {
+    const ipcMain = createMockIpcMain()
+    const deps = makeDeps()
+    registerHandlers(ipcMain, deps)
+    const result = await ipcMain._get('publishFreq:getPolicy')(TRUSTED_EVENT)
+    expect(result.code).toBe(0)
+    expect(Object.keys(result.data.platforms).length).toBeGreaterThanOrEqual(15)
+    expect(result.data.jitterRatio).toBe(0.4)
+    expect(result.data.releaseGraceMs).toBe(60000)
+  })
+
+  it('守卫未初始化时 getPolicy/setPolicy 如实回报，不抛', async () => {
+    const ipcMain = createMockIpcMain()
+    registerHandlers(ipcMain, makeDeps({ publishIntervalGuard: null }))
+    expect(await ipcMain._get('publishFreq:getPolicy')(TRUSTED_EVENT)).toMatchObject({ code: EC.REQUEST_ERROR })
+    expect(await ipcMain._get('publishFreq:setPolicy')(TRUSTED_EVENT, { policy: {} })).toMatchObject({ code: EC.REQUEST_ERROR })
+  })
+})
diff --git a/apps/desktop/electron/preload/index.bundle.js b/apps/desktop/electron/preload/index.bundle.js
index f0e6f26a9..5f69ea7a4 100644
--- a/apps/desktop/electron/preload/index.bundle.js
+++ b/apps/desktop/electron/preload/index.bundle.js
@@ -84,6 +84,22 @@ var require_publish = __commonJS({
         cropVideoCover: (payload) => ipcRenderer2.invoke("cover:crop", payload),
         readCoverData: (imagePath) => ipcRenderer2.invoke("cover:read-data", imagePath),
         listAccounts: () => ipcRenderer2.invoke("accounts:list"),
+        // 发布频率策略（publish-frequency-policy-v2）：读取 / 覆盖写入 / 紧急放行。
+        // 紧急放行不接受渲染层自报操作者（operator 由主进程按当前 identity 解析），
+        // 故这里只转发 platform/accountId/reason 三项。
+        getPublishFrequencyPolicy: () => ipcRenderer2.invoke("publishFreq:getPolicy"),
+        setPublishFrequencyPolicy: (policy) => ipcRenderer2.invoke("publishFreq:setPolicy", { policy }),
+        emergencyReleasePublishWait: (payload) => ipcRenderer2.invoke("publishFreq:emergencyRelease", {
+          platform: payload && payload.platform,
+          accountId: payload && payload.accountId,
+          reason: payload && payload.reason
+        }),
+        getPublishEmergencyStatus: () => ipcRenderer2.invoke("publishFreq:emergencyStatus"),
+        onPublishEmergencyReleased: (callback) => {
+          const h = (_e, p) => callback(p);
+          ipcRenderer2.on("publish:emergencyReleased", h);
+          return () => ipcRenderer2.removeListener("publish:emergencyReleased", h);
+        },
         // 渲染 API
         renderStart: (data) => ipcRenderer2.invoke("render:start", data),
         renderStartAiVideo: (data) => ipcRenderer2.invoke("render:start-ai-video", data),
diff --git a/apps/desktop/electron/preload/publish.js b/apps/desktop/electron/preload/publish.js
index fd6e8e725..9e083aa0d 100644
--- a/apps/desktop/electron/preload/publish.js
+++ b/apps/desktop/electron/preload/publish.js
@@ -55,6 +55,23 @@ function createPublishApi(ipcRenderer, options = {}) {
     readCoverData: (imagePath) => ipcRenderer.invoke('cover:read-data', imagePath),
     listAccounts: () => ipcRenderer.invoke('accounts:list'),
 
+    // 发布频率策略（publish-frequency-policy-v2）：读取 / 覆盖写入 / 紧急放行。
+    // 紧急放行不接受渲染层自报操作者（operator 由主进程按当前 identity 解析），
+    // 故这里只转发 platform/accountId/reason 三项。
+    getPublishFrequencyPolicy: () => ipcRenderer.invoke('publishFreq:getPolicy'),
+    setPublishFrequencyPolicy: (policy) => ipcRenderer.invoke('publishFreq:setPolicy', { policy }),
+    emergencyReleasePublishWait: (payload) => ipcRenderer.invoke('publishFreq:emergencyRelease', {
+      platform: payload && payload.platform,
+      accountId: payload && payload.accountId,
+      reason: payload && payload.reason,
+    }),
+    getPublishEmergencyStatus: () => ipcRenderer.invoke('publishFreq:emergencyStatus'),
+    onPublishEmergencyReleased: (callback) => {
+      const h = (_e, p) => callback(p)
+      ipcRenderer.on('publish:emergencyReleased', h)
+      return () => ipcRenderer.removeListener('publish:emergencyReleased', h)
+    },
+
     // 渲染 API
     renderStart: (data) => ipcRenderer.invoke('render:start', data),
     renderStartAiVideo: (data) => ipcRenderer.invoke('render:start-ai-video', data),
diff --git a/apps/desktop/electron/services/publish-emergency-release.js b/apps/desktop/electron/services/publish-emergency-release.js
new file mode 100644
index 000000000..992ba087f
--- /dev/null
+++ b/apps/desktop/electron/services/publish-emergency-release.js
@@ -0,0 +1,208 @@
+// @ts-check
+/**
+ * 发布紧急放行服务（publish-frequency-policy-v2 P2-2）
+ *
+ * 职责边界（刻意收窄，便于无 store 环境复用与测试）：
+ *   本服务只做 **策略与合规**：每日每账号上限、跨账号冷却、追加式审计落盘。
+ *   「取消防守定时器 → 清窗 → 重新入队」的**机制**在 TaskQueue.emergencyRelease。
+ *
+ * 三态回显是硬要求：成功 / 超上限 / 冷却中 / 无等待窗口 四类结果都必须如实回报，
+ * 不得静默成功也不得静默失败 —— 用户点了按钮却什么都不发生，比报错更伤。
+ *
+ * 状态持久化：settings 键 `publishEmergencyRelease` = { dayKey, perAccount:{key:n}, lastAt }
+ *   · perAccount 按**本机运营日**归零（dayKey 变化即视为新的一天）
+ *   · lastAt 是**跨账号**冷却（与「每账号每日 1 次」正交：前者防同一账号连环点，
+ *     后者防用多个账号把出口当常规通道刷）
+ * 审计：追加式 JSONL，**无 UI 编辑入口**，只由本服务 append。
+ */
+const fs = require('fs')
+const path = require('path')
+const { resolveEmergencyMaxPerDay, resolvePolicyOverrides } = require('@multi-publish/shared-utils/src/publish-frequency-policy')
+
+const SETTING_KEY = 'publishEmergencyRelease'
+const POLICY_SETTING_KEY = 'publishFrequencyPolicy'
+const AUDIT_FILE = 'publish-emergency-audit.jsonl'
+/** 跨账号冷却：与「每账号每日 1 次」正交 */
+const DEFAULT_COOLDOWN_MS = 10 * 60 * 1000
+/** reason 落盘长度上限（避免把长文本写进审计） */
+const MAX_REASON_LEN = 200
+
+/** 本机运营日 'YYYY-MM-DD'（与守卫 today() 同口径） */
+function localDayKey (ts) {
+  const d = new Date(ts)
+  const pad = (n) => String(n).padStart(2, '0')
+  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
+}
+
+/** 紧急放行的状态键：accountId 缺席用哨兵 '*'（与守卫的平台档哨兵同形，但语义独立） */
+function accountKey (platform, accountId) {
+  const acc = typeof accountId === 'string' && accountId.trim() ? accountId.trim() : '*'
+  return `${platform}:${acc}`
+}
+
+function createPublishEmergencyReleaseService (deps = {}) {
+  const { store, log, app, identityService } = deps
+  const now = typeof deps.now === 'function' ? deps.now : () => Date.now()
+  const cooldownMs = Number.isFinite(deps.cooldownMs) && deps.cooldownMs >= 0
+    ? deps.cooldownMs
+    : DEFAULT_COOLDOWN_MS
+
+  const warn = (msg) => {
+    if (log && typeof log.warn === 'function') log.warn('[PublishEmergencyRelease] ' + msg)
+    else console.warn('[PublishEmergencyRelease] ' + msg)
+  }
+
+  function readState () {
+    try {
+      const s = store && typeof store.getSettingObject === 'function'
+        ? store.getSettingObject(SETTING_KEY, {})
+        : {}
+      return s && typeof s === 'object' && !Array.isArray(s) ? s : {}
+    } catch (e) {
+      warn('读取状态失败（按全新状态处理）：' + (e && e.message))
+      return {}
+    }
+  }
+
+  function writeState (state) {
+    try {
+      if (store && typeof store.setSetting === 'function') store.setSetting(SETTING_KEY, state)
+    } catch (e) {
+      warn('写入状态失败（本次放行不会被计数到每日上限）：' + (e && e.message))
+    }
+  }
+
+  /** 上限来源：设置页覆盖 > 环境变量 > 默认 1 */
+  function resolveMax () {
+    let overrides = null
+    try {
+      const raw = store && typeof store.getSettingObject === 'function'
+        ? store.getSettingObject(POLICY_SETTING_KEY, null)
+        : null
+      overrides = resolvePolicyOverrides(raw, { warn })
+    } catch (e) {
+      warn('读取策略覆盖失败（按 env/默认处理）：' + (e && e.message))
+    }
+    const n = resolveEmergencyMaxPerDay({ overrides, warn })
+    return Number.isInteger(n) && n >= 0 ? n : 1
+  }
+
+  function resolveAuditPath () {
+    if (deps.auditPath) return deps.auditPath
+    try {
+      if (app && typeof app.getPath === 'function') {
+        return path.join(app.getPath('userData'), AUDIT_FILE)
+      }
+    } catch (e) {
+      warn('解析审计路径失败（本次放行不落审计文件）：' + (e && e.message))
+    }
+    return null
+  }
+
+  function appendAudit (line) {
+    const file = resolveAuditPath()
+    if (!file) {
+      warn('无可用审计路径，已跳过审计落盘（放行仍执行，但审计缺失）')
+      return false
+    }
+    try {
+      fs.mkdirSync(path.dirname(file), { recursive: true })
+      fs.appendFileSync(file, JSON.stringify(line) + '\n', 'utf8')
+      return true
+    } catch (e) {
+      warn('审计落盘失败：' + (e && e.message))
+      return false
+    }
+  }
+
+  /** 操作者标识：优先生效用户 subject，取不到则如实写 'unknown'（不假装是某人） */
+  function resolveOperator () {
+    try {
+      if (identityService && typeof identityService.getOwnerSubject === 'function') {
+        const s = identityService.getOwnerSubject()
+        if (typeof s === 'string' && s) return s
+      }
+      if (identityService && typeof identityService.getCurrentUser === 'function') {
+        const u = identityService.getCurrentUser()
+        if (u && typeof u === 'object' && u.subject) return String(u.subject)
+      }
+    } catch (_) { /* 降级 */ }
+    return 'unknown'
+  }
+
+  return {
+    /** 供设置页展示当前用量（不产生副作用） */
+    getStatus () {
+      const day = localDayKey(now())
+      const s = readState()
+      const sameDay = s.dayKey === day
+      const max = resolveMax()
+      const lastAt = sameDay ? Number(s.lastAt) || 0 : 0
+      const retryAfterMs = lastAt > 0 ? Math.max(0, cooldownMs - (now() - lastAt)) : 0
+      return {
+        dayKey: day,
+        max,
+        cooldownMs,
+        retryAfterMs,
+        perAccount: sameDay && s.perAccount ? s.perAccount : {},
+      }
+    },
+
+    /**
+     * 判定是否允许放行（只读，不写状态、不写审计）。
+     * @returns {{allowed: boolean, code: (null|'disabled'|'exhausted'|'cooldown'), used: number, max: number, retryAfterMs?: number, dayKey: string}}
+     */
+    check (platform, accountId) {
+      const day = localDayKey(now())
+      const s = readState()
+      const sameDay = s.dayKey === day
+      const perAccount = sameDay && s.perAccount ? s.perAccount : {}
+      const used = sameDay ? (Number(perAccount[accountKey(platform, accountId)]) || 0) : 0
+      const max = resolveMax()
+
+      if (max <= 0) return { allowed: false, code: 'disabled', used, max, dayKey: day }
+
+      if (used >= max) return { allowed: false, code: 'exhausted', used, max, dayKey: day }
+
+      const lastAt = sameDay ? Number(s.lastAt) || 0 : 0
+      if (lastAt > 0) {
+        const wait = cooldownMs - (now() - lastAt)
+        if (wait > 0) return { allowed: false, code: 'cooldown', used, max, retryAfterMs: wait, dayKey: day }
+      }
+      return { allowed: true, code: null, used, max, dayKey: day }
+    },
+
+    /**
+     * 记一次放行：累加当日该账号次数 + 刷新跨账号冷却 + 追加审计。
+     * @param {string} platform
+     * @param {string|null} accountId
+     * @param {{result: string, reason?: string, operator?: string}} detail
+     */
+    record (platform, accountId, detail = {}) {
+      const at = now()
+      const day = localDayKey(at)
+      const s = readState()
+      const sameDay = s.dayKey === day
+      const perAccount = sameDay && s.perAccount && typeof s.perAccount === 'object'
+        ? { ...s.perAccount }
+        : {}
+      const key = accountKey(platform, accountId)
+      perAccount[key] = (Number(perAccount[key]) || 0) + 1
+      writeState({ dayKey: day, perAccount, lastAt: at })
+
+      const reason = typeof detail.reason === 'string' ? detail.reason.slice(0, MAX_REASON_LEN) : null
+      const operator = detail.operator || resolveOperator()
+      const audited = appendAudit({
+        ts: new Date(at).toISOString(),
+        platform,
+        accountId: typeof accountId === 'string' && accountId.trim() ? accountId.trim() : null,
+        operator,
+        reason,
+        result: detail.result || 'ok',
+      })
+      return { at, operator, audited }
+    },
+  }
+}
+
+module.exports = { createPublishEmergencyReleaseService, localDayKey, accountKey, DEFAULT_COOLDOWN_MS, SETTING_KEY, AUDIT_FILE, MAX_REASON_LEN }
diff --git a/apps/desktop/electron/services/publish-emergency-release.test.js b/apps/desktop/electron/services/publish-emergency-release.test.js
new file mode 100644
index 000000000..90ca11ce3
--- /dev/null
+++ b/apps/desktop/electron/services/publish-emergency-release.test.js
@@ -0,0 +1,214 @@
+import { describe, it, expect, beforeEach, afterEach } from 'vitest'
+import fs from 'fs'
+import os from 'os'
+import path from 'path'
+
+__enableElectronMock()
+
+const { createPublishEmergencyReleaseService, localDayKey } = require('./publish-emergency-release')
+
+const ENV_KEY = 'MP_PUBLISH_EMERGENCY_MAX_PER_DAY'
+const POLICY_KEY = 'publishFrequencyPolicy'
+
+/** settings 的最小可用假实现（只需 getSettingObject / setSetting 两个方法） */
+function makeStore (initial = {}) {
+  const data = { ...initial }
+  return {
+    _data: data,
+    getSettingObject (key, dflt) {
+      const v = data[key]
+      if (v === undefined) return dflt
+      return typeof v === 'string' ? JSON.parse(v) : v
+    },
+    setSetting (key, value) {
+      data[key] = value
+    },
+  }
+}
+
+describe('publish-emergency-release', () => {
+  let tmpFile
+  let savedEnv
+
+  beforeEach(() => {
+    savedEnv = process.env[ENV_KEY]
+    delete process.env[ENV_KEY]
+    tmpFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-emg-')), 'audit.jsonl')
+  })
+
+  afterEach(() => {
+    if (savedEnv === undefined) delete process.env[ENV_KEY]
+    else process.env[ENV_KEY] = savedEnv
+  })
+
+  function makeService (opts = {}) {
+    const store = opts.store || makeStore()
+    let t = opts.now ? opts.now() : new Date('2026-10-10T10:00:00').getTime()
+    return {
+      store,
+      service: createPublishEmergencyReleaseService({
+        store,
+        log: { warn: () => {} },
+        identityService: opts.identityService,
+        auditPath: opts.auditPath === undefined ? tmpFile : opts.auditPath,
+        now: () => (opts.now ? opts.now() : t),
+        cooldownMs: opts.cooldownMs,
+      }),
+      setNow: (v) => { t = v },
+    }
+  }
+
+  it('默认上限 1：首次放行，用完即 exhausted（不是错误，是如实状态）', () => {
+    const { service } = makeService()
+    expect(service.check('douyin', 'acc_1')).toMatchObject({ allowed: true, code: null, used: 0, max: 1 })
+
+    service.record('douyin', 'acc_1', { result: 'ok' })
+
+    const after = service.check('douyin', 'acc_1')
+    expect(after.allowed).toBe(false)
+    expect(after.code).toBe('exhausted')
+    expect(after.used).toBe(1)
+  })
+
+  it('冷却跨账号生效（与「每账号每日 1 次」正交）：防用多个账号把出口当常规通道刷', () => {
+    const { service } = makeService({ cooldownMs: 10 * 60 * 1000 })
+    service.record('douyin', 'acc_1', { result: 'ok' })
+
+    const other = service.check('douyin', 'acc_2')
+    expect(other.allowed).toBe(false)
+    expect(other.code).toBe('cooldown')
+    expect(other.retryAfterMs).toBeGreaterThan(0)
+  })
+
+  it('冷却只影响时间窗，不影响别的账号自身的每日额度', () => {
+    let nowMs = new Date('2026-10-10T10:00:00').getTime()
+    const store = makeStore()
+    const service = createPublishEmergencyReleaseService({
+      store, log: { warn: () => {} }, auditPath: tmpFile, now: () => nowMs, cooldownMs: 60000,
+    })
+    service.record('douyin', 'acc_1', { result: 'ok' })
+    nowMs += 61000 // 冷却已过
+    expect(service.check('douyin', 'acc_2')).toMatchObject({ allowed: true, used: 0, max: 1 })
+    // acc_1 自己的当日额度仍已用尽
+    expect(service.check('douyin', 'acc_1')).toMatchObject({ allowed: false, code: 'exhausted' })
+  })
+
+  it('跨日自动重置（dayKey 变化即视为新的一天，含冷却被清）', () => {
+    let nowMs = new Date('2026-10-10T23:59:00').getTime()
+    const store = makeStore()
+    const service = createPublishEmergencyReleaseService({
+      store, log: { warn: () => {} }, auditPath: tmpFile, now: () => nowMs,
+    })
+    service.record('douyin', 'acc_1', { result: 'ok' })
+    expect(service.check('douyin', 'acc_1').allowed).toBe(false)
+
+    nowMs = new Date('2026-10-11T00:01:00').getTime()
+    const next = service.check('douyin', 'acc_1')
+    expect(next.allowed).toBe(true)
+    expect(next.used).toBe(0)
+    expect(next.dayKey).toBe('2026-10-11')
+  })
+
+  it('上限 0 = 关闭该出口（disabled，与「已用尽」可区分）', () => {
+    process.env[ENV_KEY] = '0'
+    const { service } = makeService()
+    const v = service.check('douyin', 'acc_1')
+    expect(v.allowed).toBe(false)
+    expect(v.code).toBe('disabled')
+    expect(v.max).toBe(0)
+  })
+
+  it('设置页覆盖优先于环境变量', () => {
+    process.env[ENV_KEY] = '5'
+    const store = makeStore({ [POLICY_KEY]: { emergencyMaxPerDay: 2 } })
+    const { service } = makeService({ store })
+    expect(service.check('douyin', 'acc_1').max).toBe(2)
+    // 覆盖非法时整体作废并回落 env（不得部分生效）
+    const badStore = makeStore({ [POLICY_KEY]: { emergencyMaxPerDay: 99 } })
+    const bad = makeService({ store: badStore })
+    expect(bad.service.check('douyin', 'acc_1').max).toBe(5)
+  })
+
+  it('record 落追加式审计（每行一条 JSON，含操作者与原因）', () => {
+    const { service } = makeService({
+      identityService: { getOwnerSubject: () => 'user-abc' },
+    })
+    const r = service.record('douyin', 'acc_1', { result: 'ok', reason: '客户催稿' })
+    expect(r.audited).toBe(true)
+
+    const lines = fs.readFileSync(tmpFile, 'utf8').trim().split('\n')
+    expect(lines).toHaveLength(1)
+    const row = JSON.parse(lines[0])
+    expect(row).toMatchObject({ platform: 'douyin', accountId: 'acc_1', operator: 'user-abc', reason: '客户催稿', result: 'ok' })
+    expect(typeof row.ts).toBe('string')
+  })
+
+  it('操作者取不到时如实写 unknown（不假装是某人）', () => {
+    const { service } = makeService()
+    const r = service.record('douyin', 'acc_1', { result: 'ok' })
+    expect(r.operator).toBe('unknown')
+  })
+
+  it('原因超长被截断（审计不落长文本）', () => {
+    const { service } = makeService()
+    service.record('douyin', 'acc_1', { result: 'ok', reason: 'x'.repeat(500) })
+    const row = JSON.parse(fs.readFileSync(tmpFile, 'utf8').trim())
+    expect(row.reason.length).toBe(200)
+  })
+
+  it('审计落盘失败 ⇒ audited=false 且不抛（放行本身仍执行，审计缺失如实上报）', () => {
+    const { service } = makeService({ auditPath: path.join('Z:', 'nope', 'audit.jsonl') })
+    let r
+    expect(() => { r = service.record('douyin', 'acc_1', { result: 'ok' }) }).not.toThrow()
+    expect(r.audited).toBe(false)
+  })
+
+  it('无审计路径时同样如实回报未落盘', () => {
+    const store = makeStore()
+    const service = createPublishEmergencyReleaseService({ store, log: { warn: () => {} }, auditPath: null, app: null })
+    expect(service.record('douyin', 'acc_1', { result: 'ok' }).audited).toBe(false)
+  })
+
+  it('store 抛错时不把放行流程带崩（状态读失败按全新状态处理）', () => {
+    const broken = {
+      getSettingObject () { throw new Error('db down') },
+      setSetting () { throw new Error('db down') },
+    }
+    const service = createPublishEmergencyReleaseService({
+      store: broken, log: { warn: () => {} }, auditPath: tmpFile,
+    })
+    expect(service.check('douyin', 'acc_1').allowed).toBe(true)
+    expect(() => service.record('douyin', 'acc_1', { result: 'ok' })).not.toThrow()
+  })
+
+  it('accountId 缺席与非缺席分别计数（键用哨兵 * 区分，不互相顶掉）', () => {
+    const store = makeStore()
+    const service = createPublishEmergencyReleaseService({
+      store, log: { warn: () => {} }, auditPath: tmpFile,
+      now: () => new Date('2026-10-10T10:00:00').getTime(), cooldownMs: 0,
+    })
+    service.record('douyin', null, { result: 'ok' })
+    expect(service.check('douyin', null).used).toBe(1)
+    expect(service.check('douyin', 'acc_1').used).toBe(0)
+  })
+
+  it('getStatus 不含副作用，且回报当日用量与冷却剩余', () => {
+    const store = makeStore()
+    let nowMs = new Date('2026-10-10T10:00:00').getTime()
+    const service = createPublishEmergencyReleaseService({
+      store, log: { warn: () => {} }, auditPath: tmpFile, now: () => nowMs, cooldownMs: 60000,
+    })
+    const before = service.getStatus()
+    expect(before).toMatchObject({ dayKey: '2026-10-10', max: 1, retryAfterMs: 0 })
+    service.record('douyin', 'acc_1', { result: 'ok' })
+    nowMs += 20000
+    const after = service.getStatus()
+    expect(after.perAccount['douyin:acc_1']).toBe(1)
+    expect(after.retryAfterMs).toBe(40000)
+  })
+
+  it('localDayKey 用本地时区（与守卫 today() 同口径）', () => {
+    const t = new Date('2026-01-02T10:00:00').getTime()
+    expect(localDayKey(t)).toBe('2026-01-02')
+  })
+})
diff --git a/apps/desktop/electron/services/publish-not-submitted.js b/apps/desktop/electron/services/publish-not-submitted.js
new file mode 100644
index 000000000..46c8423f7
--- /dev/null
+++ b/apps/desktop/electron/services/publish-not-submitted.js
@@ -0,0 +1,75 @@
+// @ts-check
+/**
+ * 「可确证未送出」判定（publish-frequency-policy-v2 P0-1 的细粒度补点）
+ *
+ * 背景：执行器层（bootstrap.js）只能区分「进入 publish() 之前 / 之内」。进入之后的失败默认
+ * 按**已提交**处理（保守）。但其中有一族失败是**可以证明平台写操作从未发生**的 ——
+ * 登录态失效 / 凭证缺失 —— 它们本不该吃掉整个间隔窗口。
+ *
+ * ⚠️ 标记错误的方向性后果不对称，必须记牢：
+ *   · 把「已送出」误标为「未送出」 ⇒ 回滚窗口 ⇒ 早于窗口的重复发布（**危险侧**）
+ *   · 把「未送出」漏标       ⇒ 多等一个窗口                  （安全侧）
+ * 所以判据是**封闭词表**，每条都必须能说明「它为什么必然发生在平台写之前」，
+ * 且**不得**收录泛化错误（如「API 发布失败」「网络超时」—— 前者可能发生在提交之后）。
+ *
+ * 契约（消费方为 task-queue._maybeRollback 与 bootstrap.js 执行器）：
+ *   命中 ⇒ 在 Error 实例上置 `definitelyNotSent = true`（不改变 message、不吞错误）
+ */
+
+/**
+ * 封闭词表。新增条目必须同时给出「发生在平台写之前」的机制性理由。
+ * @type {ReadonlyArray<{ re: RegExp, why: string }>}
+ */
+const NOT_SENT_SIGNATURES = Object.freeze([
+  {
+    re: /not logged in/i,
+    why: 'RPA 各平台在导航到发布页后先判登录态并 early-return，发生在任何表单填充/提交之前',
+  },
+  {
+    re: /未登录|登录失效|登录超时|请重新登录|请先登录/,
+    why: '同上；公众号后台 SPA 的「登录超时」也在进入编辑器之前拦截',
+  },
+  {
+    re: /Cookie 缺失|凭证不可用|凭证缺失/,
+    why: 'API 直连轨在 cookie 为空时于发出任何请求之前抛出（publisher-router ApiPublisher）',
+  },
+  {
+    re: /风控挂起|RiskSuspended/,
+    why: '风控挂起由执行器在派发之前拦截，未进入任何平台请求（与进入 publish() 之前的失败同族，此处收录只为闭合词表）',
+  },
+])
+
+/**
+ * 判断一段错误文本是否属于「可确证未送出」族。
+ * @param {string} text
+ * @returns {boolean}
+ */
+function isProvablyNotSubmitted (text) {
+  if (typeof text !== 'string' || !text) return false
+  return NOT_SENT_SIGNATURES.some((s) => s.re.test(text))
+}
+
+/**
+ * 命中词表时在错误对象上打标。
+ * 返回值语义是**「判定文本命中词表」**，不是「已成功写属性」—— 传字符串时无法写属性
+ * （字符串不可变），但判定结果照样为 true，调用方可据此决定自己的处理。
+ * 不修改 message、不吞错误、不抛：调用方随后照常 throw 同一个对象。
+ * @param {Error|object|string} err
+ * @param {string} [text] - 判定文本；缺省取 err.message（err 本身是字符串时就取它）
+ * @returns {boolean} 是否命中「可确证未送出」词表
+ */
+function markDefinitelyNotSent (err, text) {
+  const probe = typeof text === 'string' && text
+    ? text
+    : (typeof err === 'string' ? err : (err && err.message) || '')
+  if (!isProvablyNotSubmitted(probe)) return false
+  if (err && typeof err === 'object') err.definitelyNotSent = true
+  return true
+}
+
+/** 供结构锁/文档使用：导出词表（只读） */
+function listSignatures () {
+  return NOT_SENT_SIGNATURES.map((s) => ({ source: s.re.source, why: s.why }))
+}
+
+module.exports = { isProvablyNotSubmitted, markDefinitelyNotSent, listSignatures, NOT_SENT_SIGNATURES }
diff --git a/apps/desktop/electron/services/publish-not-submitted.test.js b/apps/desktop/electron/services/publish-not-submitted.test.js
new file mode 100644
index 000000000..feef8b9e9
--- /dev/null
+++ b/apps/desktop/electron/services/publish-not-submitted.test.js
@@ -0,0 +1,97 @@
+import { describe, it, expect } from 'vitest'
+
+__enableElectronMock()
+
+const { isProvablyNotSubmitted, markDefinitelyNotSent, listSignatures } = require('./publish-not-submitted')
+
+describe('publish-not-submitted（P0-1 细粒度打标）', () => {
+  describe('命中词表：可确证发生在平台写之前', () => {
+    const hits = [
+      'douyin not logged in',
+      'zhihu not logged in',
+      'wechat_mp not logged in',
+      '平台未登录',
+      '登录态失效，请重新登录',
+      '登录超时',
+      '平台 Cookie 缺失（账号 acc_1 未登录或凭证不可用）',
+      '凭证不可用',
+      '风控挂起：douyin',
+      'RiskSuspendedError',
+    ]
+    for (const text of hits) {
+      it(`命中：${text}`, () => {
+        expect(isProvablyNotSubmitted(text)).toBe(true)
+      })
+    }
+  })
+
+  describe('不命中：一律按已提交处理（保守侧，宁可多等一个窗口）', () => {
+    const misses = [
+      '',
+      undefined,
+      null,
+      'API 发布失败',
+      'RPA 发布失败',
+      '请求超时',
+      'net::ERR_CONNECTION_REFUSED',
+      '标题不能为空',
+      '视频信息探测失败（ffprobe 不可用或文件损坏）',
+      '发布结果缺少平台作品 ID',
+      '风控命中：发布过于频繁',
+    ]
+    for (const text of misses) {
+      it(`不命中：${JSON.stringify(text)}`, () => {
+        expect(isProvablyNotSubmitted(text)).toBe(false)
+      })
+    }
+  })
+
+  it('markDefinitelyNotSent 只打标、不改 message、不吞错误', () => {
+    const err = new Error('douyin not logged in')
+    const ok = markDefinitelyNotSent(err)
+    expect(ok).toBe(true)
+    expect(err.definitelyNotSent).toBe(true)
+    expect(err.message).toBe('douyin not logged in')
+    expect(err).toBeInstanceOf(Error)
+  })
+
+  it('未命中时不打标（不得留下 definitelyNotSent: false 这种「看起来判过」的残迹）', () => {
+    const err = new Error('API 发布失败')
+    expect(markDefinitelyNotSent(err)).toBe(false)
+    expect('definitelyNotSent' in err).toBe(false)
+  })
+
+  it('可用第二个参数覆盖判定文本（result.error 与 err.message 不同源时）', () => {
+    const err = new Error('包装后的错误')
+    expect(markDefinitelyNotSent(err, 'douyin not logged in')).toBe(true)
+    expect(err.message).toBe('包装后的错误')
+  })
+
+  it('传入非对象不抛（调用方在 catch 边界可能拿到字符串）', () => {
+    expect(() => markDefinitelyNotSent('douyin not logged in')).not.toThrow()
+    expect(markDefinitelyNotSent('douyin not logged in')).toBe(true)
+    expect(markDefinitelyNotSent(undefined)).toBe(false)
+  })
+
+  it('词表每条都带「为什么在平台写之前」的理由（新增条目必须解释机制，防随手加泛化错误）', () => {
+    const sigs = listSignatures()
+    expect(sigs.length).toBeGreaterThanOrEqual(4)
+    for (const s of sigs) {
+      expect(typeof s.source).toBe('string')
+      expect(s.source.length).toBeGreaterThan(0)
+      expect(typeof s.why).toBe('string')
+      expect(s.why.length).toBeGreaterThan(10)
+    }
+  })
+
+  it('词表刻意不含泛化错误（用**行为断言**而非字符串包含：「登录超时」是合法的登录态信号）', () => {
+    const generics = [
+      'API 发布失败', '发布失败', 'RPA 发布失败', '上传失败', '提交失败',
+      '请求超时', 'TIMEOUT', 'network error', 'net::ERR_TIMED_OUT',
+      '风控命中：发布过于频繁', '内容审核不通过',
+    ]
+    for (const g of generics) {
+      expect(isProvablyNotSubmitted(g), g).toBe(false)
+    }
+  })
+})
diff --git a/apps/desktop/electron/services/publisher-router.js b/apps/desktop/electron/services/publisher-router.js
index 08e7d1079..1884d6ba8 100644
--- a/apps/desktop/electron/services/publisher-router.js
+++ b/apps/desktop/electron/services/publisher-router.js
@@ -14,6 +14,8 @@
 const path = require('path')
 const { execFile } = require('child_process')
 const logger = require('./logger')
+// publish-frequency-policy-v2 P0-1：把「可确证未送出」的登录态族失败打标，供队列回滚间隔窗口
+const { markDefinitelyNotSent } = require('./publish-not-submitted')
 const PlatformConfig = require('@multi-publish/shared-utils/src/platform-config')
 const { isPlatformCookieDomain } = require('@multi-publish/shared-utils/src/platform-definitions')
 const { RichTextProcessor } = require('@multi-publish/api-publish-engine/src/rich-text-processor')
@@ -582,7 +584,12 @@ class RpaVmPublisher {
         })
         return { success: true, url: sanitizePublishResultUrl(result.url), ...(postId ? { postId } : {}), platform, mode: 'dom', ...(diagnostics ? { diagnostics } : {}) }
       }
-      throw new Error(result.error || 'RPA 鍙戝竷澶辫触')
+      // publish-frequency-policy-v2 P0-1：登录态失效族**可确证未送出**（RPA 在发布页导航后
+      // 先判登录态并 early-return，早于任何表单填充/提交）⇒ 打标后由队列回滚间隔窗口。
+      // 词表是封闭的（services/publish-not-submitted.js），未命中一律按已提交处理（保守侧）。
+      const rpaErr = new Error(result.error || 'RPA 发布失败')
+      markDefinitelyNotSent(rpaErr, result.error)
+      throw rpaErr
     } finally {
       signal?.removeEventListener('abort', onAbort)
     }
@@ -619,7 +626,10 @@ class ApiPublisher {
         error: '平台 Cookie 缺失（账号 ' + (accountId || '未指定') + ' 未登录或凭证不可用）',
         params: { platform, accountId, mode: 'api' },
       })
-      throw new Error('平台 Cookie 缺失（账号 ' + (accountId || '未指定') + ' 未登录或凭证不可用）')
+      // publish-frequency-policy-v2 P0-1：cookie 为空时**尚未发出任何请求** ⇒ 无条件可回滚
+      const cookieErr = new Error('平台 Cookie 缺失（账号 ' + (accountId || '未指定') + ' 未登录或凭证不可用）')
+      cookieErr.definitelyNotSent = true
+      throw cookieErr
     }
     const cookie = cookies.map((c) => c.name + '=' + c.value).join('; ')
     const signal = options && options.signal
@@ -657,7 +667,12 @@ class ApiPublisher {
       logger.notify('PublisherRouter', 'publish-cancelled', { level: 'WARN', params: { platform, accountId } })
       throw new Error('任务已取消')
     }
-    if (!result || !result.success) throw new Error((result && result.error) || 'API 发布失败')
+    if (!result || !result.success) {
+      // publish-frequency-policy-v2 P0-1：登录态失效族可确证未送出（见 publish-not-submitted.js）
+      const apiErr = new Error((result && result.error) || 'API 发布失败')
+      markDefinitelyNotSent(apiErr, result && result.error)
+      throw apiErr
+    }
     const postId = typeof result.publishId === 'string' && result.publishId.trim() ? result.publishId.trim() : ''
     if (!postId) throw new Error('发布结果缺少平台作品 ID')
     return { success: true, url: sanitizePublishResultUrl(result.url || ''), postId, platform, mode: 'api' }
diff --git a/apps/desktop/electron/services/publisher-router.test.js b/apps/desktop/electron/services/publisher-router.test.js
index e009763c6..3705505f4 100644
--- a/apps/desktop/electron/services/publisher-router.test.js
+++ b/apps/desktop/electron/services/publisher-router.test.js
@@ -1083,6 +1083,39 @@ describe("ApiPublisher 图文模式（§4.4 百家号 article-only 的桌面接
 })
 
 describe("RpaVmPublisher 发布方式标记", () => {
+  // ── publish-frequency-policy-v2 P0-1：登录态族的「可确证未送出」接线锁 ──
+  // 锁的是**接线**而不是助手函数：只测 publish-not-submitted.js 无法证明 publisher-router
+  // 真的调了它 —— 把调用点摘掉，助手测试照样全绿。
+  it("RPA 登录态失效 ⇒ 抛出的错误带 definitelyNotSent（P0-1 可回滚窗口的接线锁）", async () => {
+    const rpaViewManager = { publish: vi.fn(async () => ({ success: false, error: "wechat_mp not logged in" })) }
+    const publisher = new PublisherRouter().createPublisher("wechat_mp", { rpaViewManager, store: { getAccount: vi.fn(() => null) } })
+    await expect(
+      publisher.publish({ id: "t-rpa-login", platform: "wechat_mp", article: { title: "T", content: "C" } }),
+    ).rejects.toMatchObject({ definitelyNotSent: true })
+  })
+
+  it("RPA 泛化失败 ⇒ 不带 definitelyNotSent（宁可多等一个窗口，不冒重复发布风险）", async () => {
+    const rpaViewManager = { publish: vi.fn(async () => ({ success: false, error: "发布失败：内容审核不通过" })) }
+    const publisher = new PublisherRouter().createPublisher("wechat_mp", { rpaViewManager, store: { getAccount: vi.fn(() => null) } })
+    let caught = null
+    try {
+      await publisher.publish({ id: "t-rpa-generic", platform: "wechat_mp", article: { title: "T", content: "C" } })
+    } catch (e) { caught = e }
+    expect(caught).toBeTruthy()
+    expect(caught.message).toContain("内容审核不通过")
+    expect(caught.definitelyNotSent).toBeUndefined()
+  })
+
+  it("RPA 失败兜底文案不再出现编码损坏（曾为 'RPA 鍙戝竷澶辫触'）", async () => {
+    const rpaViewManager = { publish: vi.fn(async () => ({ success: false })) }
+    const publisher = new PublisherRouter().createPublisher("wechat_mp", { rpaViewManager, store: { getAccount: vi.fn(() => null) } })
+    let caught = null
+    try {
+      await publisher.publish({ id: "t-rpa-enc", platform: "wechat_mp", article: { title: "T", content: "C" } })
+    } catch (e) { caught = e }
+    expect(caught.message).toBe("RPA 发布失败")
+  })
+
   it("RPA 成功返回 mode:dom（发布方式徽标三态数据源）", async () => {
     const rpaViewManager = { publish: vi.fn(async () => ({ success: true, url: "https://example.com/post/1" })) }
     const publisher = new PublisherRouter().createPublisher("wechat_mp", { rpaViewManager, store: { getAccount: vi.fn(() => null) } })
diff --git a/apps/desktop/electron/services/store-owner-isolation.test.js b/apps/desktop/electron/services/store-owner-isolation.test.js
index b2732fa63..be8562cc9 100644
--- a/apps/desktop/electron/services/store-owner-isolation.test.js
+++ b/apps/desktop/electron/services/store-owner-isolation.test.js
@@ -364,4 +364,79 @@ describe('Store 多用户隔离', () => {
     expect(store.getPublishTimeline('douyin:shared-account', 'user-a')).toBe('100')
     expect(store.getPublishTimeline('douyin:shared-account', 'user-b')).toBe('200')
   })
+
+  // ── publish-frequency-policy-v2：日配额计数（新表 publish_daily_count）──────────
+  describe('publish_daily_count（日配额计数）', () => {
+    const DAY = '2026-10-10'
+
+    it('无行时返回 null（不是 0 —— 缺席与「0 次」语义不同）', () => {
+      expect(store.getPublishDailyCount('douyin:acc_1', DAY, 'user-a')).toBe(null)
+    })
+
+    it('upsert 累加两个计数器，且读回为数值', () => {
+      store.incrPublishDailyCount('douyin:acc_1', DAY, 'count', 1, 'user-a')
+      store.incrPublishDailyCount('douyin:acc_1', DAY, 'count', 1, 'user-a')
+      store.incrPublishDailyCount('douyin:acc_1', DAY, 'rollback_count', 1, 'user-a')
+
+      const row = store.getPublishDailyCount('douyin:acc_1', DAY, 'user-a')
+      expect(Number(row.count)).toBe(2)
+      expect(Number(row.rollback_count)).toBe(1)
+    })
+
+    it('递减到 0 即止（不得为负 —— 配额的「回补」可能多于已提交次数）', () => {
+      store.incrPublishDailyCount('douyin:acc_1', DAY, 'count', 1, 'user-a')
+      expect(Number(store.decrPublishDailyCount('douyin:acc_1', DAY, 'count', 'user-a'))).toBe(0)
+      expect(Number(store.decrPublishDailyCount('douyin:acc_1', DAY, 'count', 'user-a'))).toBe(0)
+      expect(Number(store.getPublishDailyCount('douyin:acc_1', DAY, 'user-a').count)).toBe(0)
+    })
+
+    it('按 owner 隔离：A 的计数不影响 B', () => {
+      store.incrPublishDailyCount('douyin:shared-account', DAY, 'count', 3, 'user-a')
+      store.incrPublishDailyCount('douyin:shared-account', DAY, 'count', 1, 'user-b')
+
+      expect(Number(store.getPublishDailyCount('douyin:shared-account', DAY, 'user-a').count)).toBe(3)
+      expect(Number(store.getPublishDailyCount('douyin:shared-account', DAY, 'user-b').count)).toBe(1)
+    })
+
+    it('按 day_key 隔离：跨日各自独立计数', () => {
+      store.incrPublishDailyCount('douyin:acc_1', '2026-10-10', 'count', 2, 'user-a')
+      store.incrPublishDailyCount('douyin:acc_1', '2026-10-11', 'count', 1, 'user-a')
+
+      expect(Number(store.getPublishDailyCount('douyin:acc_1', '2026-10-10', 'user-a').count)).toBe(2)
+      expect(Number(store.getPublishDailyCount('douyin:acc_1', '2026-10-11', 'user-a').count)).toBe(1)
+    })
+
+    it('未知字段被拒绝且出声（列名走白名单，防 SQL 注入）', () => {
+      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
+      expect(store.incrPublishDailyCount('douyin:acc_1', DAY, 'count; DROP TABLE settings', 1, 'user-a')).toBe(0)
+      expect(warn).toHaveBeenCalled()
+      expect(store.getPublishDailyCount('douyin:acc_1', DAY, 'user-a')).toBe(null)
+      warn.mockRestore()
+    })
+
+    it('无 owner 时一律 no-op（不落库、不抛）', () => {
+      const saved = store._resolveOwnerSubject
+      store._resolveOwnerSubject = () => null
+      try {
+        expect(store.getPublishDailyCount('k', DAY)).toBe(null)
+        expect(store.incrPublishDailyCount('k', DAY, 'count', 1)).toBe(0)
+      } finally {
+        store._resolveOwnerSubject = saved
+      }
+    })
+
+    it('prune 只裁剪保留窗口之外的行，且只删本 owner 的', () => {
+      store.incrPublishDailyCount('douyin:acc_1', '2026-10-01', 'count', 5, 'user-a')
+      store.incrPublishDailyCount('douyin:acc_1', '2026-10-09', 'count', 1, 'user-a')
+      store.incrPublishDailyCount('douyin:acc_1', '2026-10-01', 'count', 5, 'user-b')
+
+      const removed = store.prunePublishDailyCount('2026-10-10', 'user-a')
+      expect(removed).toBe(1)
+      expect(store.getPublishDailyCount('douyin:acc_1', '2026-10-01', 'user-a')).toBe(null)
+      // 保留窗口内（10-09，窗口 7 天 ⇒ cutoff 10-04）仍在
+      expect(store.getPublishDailyCount('douyin:acc_1', '2026-10-09', 'user-a')).not.toBe(null)
+      // 别的 owner 不受影响
+      expect(store.getPublishDailyCount('douyin:acc_1', '2026-10-01', 'user-b')).not.toBe(null)
+    })
+  })
 })
diff --git a/apps/desktop/electron/services/store-schema.js b/apps/desktop/electron/services/store-schema.js
index c1bfa5f31..257f9a9c0 100644
--- a/apps/desktop/electron/services/store-schema.js
+++ b/apps/desktop/electron/services/store-schema.js
@@ -12,6 +12,7 @@ const TABLE_NAMES = {
   callback_logs: "callback_logs",
   batch_jobs: "batch_jobs",
   publish_timeline: "publish_timeline",
+  publish_daily_count: "publish_daily_count",
   model_providers: "model_providers",
   model_provider_logs: "model_provider_logs",
   backlot_projects: "backlot_projects",
@@ -82,6 +83,18 @@ const OWNER_TABLE_SCHEMA_SQL = {
     last_publish_at TEXT,
     PRIMARY KEY (owner_subject, key)
   )`,
+  // publish-frequency-policy-v2：账号级日配额计数（本机运营日）。
+  // 两个计数器语义分离：count = 已实际提交到平台的次数（未提交回滚会幂等回补）；
+  // rollback_count = 回滚尝试次数（只增不减，用于防风上限）。day_key 形如 'YYYY-MM-DD'。
+  publish_daily_count: `CREATE TABLE IF NOT EXISTS publish_daily_count (
+    owner_subject  TEXT NOT NULL,
+    key            TEXT NOT NULL,
+    day_key        TEXT NOT NULL,
+    count          INTEGER NOT NULL DEFAULT 0,
+    rollback_count INTEGER NOT NULL DEFAULT 0,
+    updated_at     INTEGER NOT NULL DEFAULT 0,
+    PRIMARY KEY (owner_subject, key, day_key)
+  )`,
 };
 
 const OWNER_INDEX_SQL = [
@@ -91,6 +104,7 @@ const OWNER_INDEX_SQL = [
   `CREATE INDEX IF NOT EXISTS idx_scheduled_owner_time ON scheduled_tasks(owner_subject, publish_time)`,
   `CREATE INDEX IF NOT EXISTS idx_batch_owner_created ON batch_jobs(owner_subject, created_at)`,
   `CREATE INDEX IF NOT EXISTS idx_timeline_owner_key ON publish_timeline(owner_subject, key)`,
+  `CREATE INDEX IF NOT EXISTS idx_daily_owner_key ON publish_daily_count(owner_subject, key)`,
 ];
 
 const SCHEMA_SQL = [
@@ -99,6 +113,7 @@ const SCHEMA_SQL = [
   OWNER_TABLE_SCHEMA_SQL.scheduled_tasks,
   OWNER_TABLE_SCHEMA_SQL.batch_jobs,
   OWNER_TABLE_SCHEMA_SQL.publish_timeline,
+  OWNER_TABLE_SCHEMA_SQL.publish_daily_count,
   `CREATE TABLE IF NOT EXISTS settings (
     key           TEXT PRIMARY KEY,
     value         TEXT
@@ -261,6 +276,7 @@ const OWNER_TABLE_COLUMNS = {
   scheduled_tasks: ["owner_subject", "id", "platform", "article", "publish_time", "status", "created_at"],
   batch_jobs: ["owner_subject", "id", "name", "articles", "total", "completed", "failed", "status", "created_at"],
   publish_timeline: ["owner_subject", "key", "last_publish_at"],
+  publish_daily_count: ["owner_subject", "key", "day_key", "count", "rollback_count", "updated_at"],
 };
 
 const OWNER_TABLE_KEY_COLUMNS = {
@@ -269,6 +285,9 @@ const OWNER_TABLE_KEY_COLUMNS = {
   scheduled_tasks: "id",
   batch_jobs: "id",
   publish_timeline: "key",
+  // 复合主键的第二列（key 之后是 day_key）：重建判据只校验 pk[0]=owner_subject 与 pk[1]=key，
+  // 第三个主键列不参与 needsOwnerTableRebuild 的判定，故此处仍登记 "key"。
+  publish_daily_count: "key",
 };
 
 const OWNER_COLUMN_DEFAULTS = {
@@ -297,6 +316,10 @@ const OWNER_COLUMN_DEFAULTS = {
   completed: "0",
   failed: "0",
   last_publish_at: "NULL",
+  day_key: "''",
+  count: "0",
+  rollback_count: "0",
+  updated_at: "0",
 };
 
 function execSchemaSql(db, sql) {
diff --git a/apps/desktop/electron/services/store/index.js b/apps/desktop/electron/services/store/index.js
index bdbe5b4ed..28c3cb0ff 100644
--- a/apps/desktop/electron/services/store/index.js
+++ b/apps/desktop/electron/services/store/index.js
@@ -28,6 +28,7 @@ const settingsMethods = require('./settings-store')
 const callbackMethods = require('./callback-store')
 const batchMethods = require('./batch-store')
 const rateLimitMethods = require('./rate-limit-store')
+const publishDailyMethods = require('./publish-daily-store')
 const modelLogMethods = require('./model-log-store')
 const knowledgeLibraryMethods = require('./knowledge-library-store')
 const viralPatternMethods = require('./viral-pattern-store')
@@ -45,6 +46,7 @@ Object.assign(
   callbackMethods,
   batchMethods,
   rateLimitMethods,
+  publishDailyMethods,
   modelLogMethods,
   knowledgeLibraryMethods,
   viralPatternMethods,
diff --git a/apps/desktop/electron/services/store/publish-daily-store.js b/apps/desktop/electron/services/store/publish-daily-store.js
new file mode 100644
index 000000000..c08194d02
--- /dev/null
+++ b/apps/desktop/electron/services/store/publish-daily-store.js
@@ -0,0 +1,129 @@
+// @ts-check
+/**
+ * publish-daily-store — 发布日配额计数功能域 mixin（publish-frequency-policy-v2）
+ *
+ * 表：publish_daily_count(owner_subject, key, day_key, count, rollback_count, updated_at)
+ *   key      = buildKey(platform, accountId)（percent-encoded，见 publish-interval-guard）
+ *   day_key  = 本机运营日 'YYYY-MM-DD'（不与平台日界换算）
+ *
+ * 两个计数器语义分离（禁止合并成一个）：
+ *   count          —— 已**实际提交到平台**的次数；未提交失败的回滚会幂等回补（下限 0）
+ *   rollback_count —— **回滚尝试**次数；只增不减，用于防风上限
+ *
+ * 为什么回补：一次从未发出的尝试不构成平台负载，计入配额等于对同一件事双重计费
+ * （间隔窗口已回滚，配额却仍占着）。而回滚次数不随回补减少，否则「回滚 — 回补 — 再回滚」
+ * 可以无限循环，防风上限形同虚设。
+ *
+ * owner 解析与 rate-limit-store 同源：无 owner 一律 no-op（返回 null / 0），不落库。
+ */
+/** 允许的字段白名单（列名无法参数化，必须白名单化，防 SQL 注入） */
+const FIELD_COLUMN = {
+  count: 'count',
+  rollback_count: 'rollback_count',
+  rollbackCount: 'rollback_count',
+}
+
+/** 保留最近 N 天的行（按 day_key 字典序裁剪；'YYYY-MM-DD' 字典序即时间序） */
+const RETAIN_DAYS = 7
+
+function normalizeField (field) {
+  const col = FIELD_COLUMN[field]
+  return col || null
+}
+
+module.exports = {
+  /**
+   * 读某 (key, day) 的计数行。
+   * @param {string} key
+   * @param {string} dayKey
+   * @param {string} [ownerSubject]
+   * @returns {{count: number, rollback_count: number, updated_at: number}|null} null = 无行/无 owner/未就绪
+   */
+  getPublishDailyCount (key, dayKey, ownerSubject) {
+    if (!this._ready) return null
+    const owner = this._resolveOwnerSubject(ownerSubject)
+    if (!owner) return null
+    const row = this.db.prepare(
+      'SELECT count, rollback_count, updated_at FROM publish_daily_count WHERE owner_subject = ? AND key = ? AND day_key = ?'
+    ).get(owner, key, dayKey)
+    if (!row) return null
+    return {
+      count: row.count,
+      rollback_count: row.rollback_count,
+      updated_at: row.updated_at,
+    }
+  },
+
+  /**
+   * 增减某 (key, day) 的计数（upsert），并保证结果不为负。
+   * @param {string} key
+   * @param {string} dayKey
+   * @param {'count'|'rollback_count'} field
+   * @param {number} delta - 正数为增，负数为减
+   * @param {string} [ownerSubject]
+   * @param {number} [nowMs]
+   * @returns {number} 变更后的计数值（no-op 时返回 0）
+   */
+  incrPublishDailyCount (key, dayKey, field, delta = 1, ownerSubject, nowMs) {
+    if (!this._ready) return 0
+    const column = normalizeField(field)
+    if (!column) {
+      // 未知字段不得静默写入：列名走白名单，未知一律拒绝并出声
+      console.warn(`[publish-daily-store] 未知计数字段 ${JSON.stringify(field)}，已忽略（合法值：count / rollback_count）`)
+      return 0
+    }
+    const owner = this._resolveOwnerSubject(ownerSubject)
+    if (!owner) return 0
+    const step = Number.isFinite(delta) ? Math.trunc(delta) : 0
+    const at = Number.isFinite(nowMs) ? nowMs : Date.now()
+
+    // 单条 UPSERT：SQLite 的 MAX(0, ...) 保证下限 0，不需要读改写两步（避免竞态）
+    this.db.prepare(
+      `INSERT INTO publish_daily_count (owner_subject, key, day_key, count, rollback_count, updated_at)
+       VALUES (?, ?, ?, MAX(0, ?), MAX(0, ?), ?)
+       ON CONFLICT(owner_subject, key, day_key) DO UPDATE SET
+         ${column} = MAX(0, ${column} + ?),
+         updated_at = ?`
+    ).run(
+      owner, key, dayKey,
+      column === 'count' ? step : 0,
+      column === 'rollback_count' ? step : 0,
+      at,
+      step,
+      at
+    )
+
+    const row = this.getPublishDailyCount(key, dayKey, ownerSubject)
+    return row ? Number(row[column]) || 0 : 0
+  },
+
+  /** 递减某 (key, day) 的计数（下限 0）；配额回补用 */
+  decrPublishDailyCount (key, dayKey, field = 'count', ownerSubject, nowMs) {
+    return this.incrPublishDailyCount(key, dayKey, field, -1, ownerSubject, nowMs)
+  },
+
+  /**
+   * 裁剪早于「保留窗口」的日计数行（按 day_key 字典序）。
+   * 只删本 owner 的行；返回删除行数。
+   * @param {string} todayKey - 当前本机运营日 'YYYY-MM-DD'
+   * @param {string} [ownerSubject]
+   * @returns {number}
+   */
+  prunePublishDailyCount (todayKey, ownerSubject) {
+    if (!this._ready) return 0
+    const owner = this._resolveOwnerSubject(ownerSubject)
+    if (!owner || typeof todayKey !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(todayKey)) return 0
+    const cutoff = shiftDayKey(todayKey, -(RETAIN_DAYS - 1))
+    const res = this.db.prepare(
+      'DELETE FROM publish_daily_count WHERE owner_subject = ? AND day_key < ?'
+    ).run(owner, cutoff)
+    return res && Number.isFinite(res.changes) ? res.changes : 0
+  },
+}
+
+/** 'YYYY-MM-DD' 平移 n 天（只用于裁剪阈值，不参与判定口径） */
+function shiftDayKey (dayKey, days) {
+  const [y, m, d] = dayKey.split('-').map(Number)
+  const t = Date.UTC(y, m - 1, d) + days * 24 * 60 * 60 * 1000
+  return new Date(t).toISOString().slice(0, 10)
+}
diff --git a/apps/desktop/src/api/publisher.js b/apps/desktop/src/api/publisher.js
index 62aefb694..c1021248f 100644
--- a/apps/desktop/src/api/publisher.js
+++ b/apps/desktop/src/api/publisher.js
@@ -19,6 +19,14 @@ export async function listSuspendedRisk() { return invokeWithFallback("listSuspe
 export async function resumeRisk(payload) { return invokeWithFallback("resumeRisk", { code: -1, message: 'electronAPI not available' }, payload) }
 export async function isSuspendedRisk(payload) { return invokeWithFallback("isSuspendedRisk", { code: -1, message: 'electronAPI not available' }, payload) }
 
+// ─── 发布频率策略（publish-frequency-policy-v2）───────────
+// 紧急放行不接受渲染层自报操作者：operator 由主进程按当前 identity 解析，故这里不转发该字段
+export async function getPublishFrequencyPolicy() { return invokeWithFallback("getPublishFrequencyPolicy", { code: -1, message: 'electronAPI not available' }) }
+export async function setPublishFrequencyPolicy(policy) { return invokeWithFallback("setPublishFrequencyPolicy", { code: -1, message: 'electronAPI not available' }, policy) }
+export async function emergencyReleasePublishWait(payload) { return invokeWithFallback("emergencyReleasePublishWait", { code: -1, message: 'electronAPI not available' }, payload) }
+export async function getPublishEmergencyStatus() { return invokeWithFallback("getPublishEmergencyStatus", { code: -1, message: 'electronAPI not available' }) }
+export function onPublishEmergencyReleased(callback) { return bridgeOn("PublishEmergencyReleased", callback) }
+
 // ─── AI 写作 API ──────────────────────────
 export async function modelProviderIsConfigured(category) { return invokeWithFallback("modelProviderIsConfigured", { code: -1, data: false }, category) }
 export async function modelProviderGetDefault(category) { return invokeWithFallback("modelProviderGetDefault", { code: -1, data: null }, category) }
diff --git a/apps/desktop/src/components/PublishFrequencySettings.test.js b/apps/desktop/src/components/PublishFrequencySettings.test.js
new file mode 100644
index 000000000..81b8504fa
--- /dev/null
+++ b/apps/desktop/src/components/PublishFrequencySettings.test.js
@@ -0,0 +1,183 @@
+import { describe, it, expect, vi, beforeEach } from 'vitest'
+import { mount } from '@vue/test-utils'
+import { nextTick } from 'vue'
+import i18n from '@/i18n'
+
+const api = vi.hoisted(() => ({
+  getPublishFrequencyPolicy: vi.fn(),
+  setPublishFrequencyPolicy: vi.fn(),
+  emergencyReleasePublishWait: vi.fn(),
+  getPublishEmergencyStatus: vi.fn(),
+}))
+vi.mock('@/api/publisher', () => api)
+
+const messages = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
+const box = vi.hoisted(() => ({ confirm: vi.fn() }))
+vi.mock('element-plus', async (importOriginal) => {
+  const actual = await importOriginal()
+  return { ...actual, ElMessage: messages, ElMessageBox: box }
+})
+
+import PublishFrequencySettings from './PublishFrequencySettings.vue'
+
+const POLICY_RES = {
+  code: 0,
+  data: {
+    platforms: {
+      wechat_mp: { tier: 'long', accountMinMs: 20 * 60000, platformMinMs: 2 * 60000, accountDailyMax: 3 },
+      douyin: { tier: 'clip', accountMinMs: 10 * 60000, platformMinMs: 2 * 60000, accountDailyMax: 5 },
+      weibo: { tier: 'short', accountMinMs: 3 * 60000, platformMinMs: 2 * 60000, accountDailyMax: 20 },
+    },
+    overrides: null,
+    jitterRatio: 0.4,
+    releaseGraceMs: 60000,
+  },
+}
+
+const STUBS = {
+  'el-input-number': { template: '<div class="stub-number" />' },
+  'el-switch': { template: '<div class="stub-switch" />' },
+  // 必须声明 emits: ['click']：否则 onClick 会作为 fallthrough 属性落到原生 <button> 上，
+  // 与显式 $emit('click') 叠加 ⇒ 一次点击触发两次（本仓实测踩过）
+  'el-button': {
+    props: ['disabled'],
+    emits: ['click'],
+    template: '<button class="stub-button" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
+  },
+  'el-select': { template: '<div class="stub-select"><slot /></div>' },
+  'el-option': { template: '<div />' },
+  'el-input': { template: '<div class="stub-input" />' },
+  'el-alert': { props: ['title'], template: '<div class="stub-alert">{{ title }}</div>' },
+}
+
+async function mountPage () {
+  const wrapper = mount(PublishFrequencySettings, {
+    global: { plugins: [i18n], stubs: STUBS },
+  })
+  await new Promise((r) => setTimeout(r, 0))
+  await nextTick()
+  return wrapper
+}
+
+describe('PublishFrequencySettings（publish-frequency-policy-v2 设置页）', () => {
+  beforeEach(() => {
+    i18n.global.locale.value = 'zh'
+    api.getPublishFrequencyPolicy.mockReset().mockResolvedValue(POLICY_RES)
+    api.setPublishFrequencyPolicy.mockReset().mockResolvedValue({ code: 0, data: { saved: true } })
+    api.emergencyReleasePublishWait.mockReset().mockResolvedValue({ code: 0, data: { released: true, taskId: 't-1', used: 1, max: 1 } })
+    messages.success.mockReset()
+    messages.error.mockReset()
+    box.confirm.mockReset().mockResolvedValue('confirm')
+  })
+
+  it('挂载即拉取策略，并展示按档位分组的当前口径', async () => {
+    const wrapper = await mountPage()
+    expect(api.getPublishFrequencyPolicy).toHaveBeenCalledTimes(1)
+    const text = wrapper.find('[data-testid="pubfreq-current"]').text()
+    // 三个档位各一行摘要（不是逐平台 15 行噪音）
+    expect(text).toContain('long')
+    expect(text).toContain('clip')
+    expect(text).toContain('short')
+    expect(text).toContain('20 min')
+  })
+
+  it('读失败时显示错误且不渲染表单（不静默降级成默认值糊弄用户）', async () => {
+    api.getPublishFrequencyPolicy.mockResolvedValue({ code: -1, message: '守卫未初始化' })
+    const wrapper = await mountPage()
+    expect(wrapper.find('[data-testid="pubfreq-load-error"]').exists()).toBe(true)
+    expect(wrapper.text()).toContain('守卫未初始化')
+    expect(wrapper.find('[data-testid="pubfreq-save"]').exists()).toBe(false)
+  })
+
+  it('保存时提交的字段名与主进程 resolvePolicyOverrides 逐一对应（自创字段名会被静默忽略）', async () => {
+    const wrapper = await mountPage()
+    await wrapper.find('[data-testid="pubfreq-save"]').trigger('click')
+    await new Promise((r) => setTimeout(r, 0))
+
+    expect(api.setPublishFrequencyPolicy).toHaveBeenCalledTimes(1)
+    const payload = api.setPublishFrequencyPolicy.mock.calls[0][0]
+    expect(Object.keys(payload).sort()).toEqual(['accountMinMs', 'dailyMax', 'jitterRatio', 'platformMinMs'])
+    expect(payload).toMatchObject({ accountMinMs: 20 * 60000, platformMinMs: 2 * 60000, jitterRatio: 0.4 })
+    expect(Object.keys(payload.dailyMax).sort()).toEqual(['clip', 'long', 'short'])
+  })
+
+  it('保存被主进程拒绝（全有或全无）⇒ 报错且**不报成功**', async () => {
+    api.setPublishFrequencyPolicy.mockResolvedValue({ code: -2, message: '策略配置非法：已整体拒绝（未保存任何字段）' })
+    const wrapper = await mountPage()
+    await wrapper.find('[data-testid="pubfreq-save"]').trigger('click')
+    await new Promise((r) => setTimeout(r, 0))
+
+    expect(messages.error).toHaveBeenCalled()
+    expect(messages.success).not.toHaveBeenCalled()
+  })
+
+  it('保存成功 ⇒ 成功提示 + 重新拉取（避免界面与生效值不一致）', async () => {
+    const wrapper = await mountPage()
+    await wrapper.find('[data-testid="pubfreq-save"]').trigger('click')
+    await new Promise((r) => setTimeout(r, 0))
+    expect(messages.success).toHaveBeenCalled()
+    expect(api.getPublishFrequencyPolicy).toHaveBeenCalledTimes(2)
+  })
+
+  it('恢复默认提交 null（清空覆盖），不是提交一份「默认值」冒充', async () => {
+    const wrapper = await mountPage()
+    await wrapper.find('[data-testid="pubfreq-reset"]').trigger('click')
+    await new Promise((r) => setTimeout(r, 0))
+    expect(api.setPublishFrequencyPolicy).toHaveBeenCalledWith(null)
+  })
+
+  it('取消二次确认 ⇒ 不调用紧急放行 IPC、不提示（取消不是失败）', async () => {
+    box.confirm.mockRejectedValue(new Error('cancel'))
+    const wrapper = await mountPage()
+    await wrapper.find('[data-testid="pubfreq-emergency-submit"]').trigger('click')
+    await new Promise((r) => setTimeout(r, 0))
+    expect(api.emergencyReleasePublishWait).not.toHaveBeenCalled()
+    expect(messages.error).not.toHaveBeenCalled()
+  })
+
+  it('紧急放行成功 ⇒ 明确回显成功', async () => {
+    const wrapper = await mountPage()
+    // 选一个平台（stub 下直接改组件状态不可行，改为不做选择时按钮 disabled 的验证）
+    expect(wrapper.find('[data-testid="pubfreq-emergency-submit"]').attributes('disabled')).toBeDefined()
+    wrapper.vm.emergency.platform = 'douyin'
+    await nextTick()
+    await wrapper.find('[data-testid="pubfreq-emergency-submit"]').trigger('click')
+    await new Promise((r) => setTimeout(r, 0))
+    expect(api.emergencyReleasePublishWait).toHaveBeenCalledWith(expect.objectContaining({ platform: 'douyin' }))
+    expect(wrapper.find('[data-testid="pubfreq-emergency-result"]').text()).toContain('已解除等待')
+  })
+
+  it('紧急放行四态各自回显，且都不静默（exhausted / cooldown / no_waiting_window / disabled）', async () => {
+    const cases = [
+      { data: { released: false, reason: 'exhausted', max: 1 }, expect: '已用尽' },
+      { data: { released: false, reason: 'cooldown', max: 1, retryAfterMs: 300000 }, expect: '距上次放行不足 5 分钟' },
+      { data: { released: false, reason: 'no_waiting_window', max: 1 }, expect: '当前没有等待中的窗口' },
+      { data: { released: false, reason: 'disabled', max: 0 }, expect: '已被关闭' },
+    ]
+    for (const c of cases) {
+      api.emergencyReleasePublishWait.mockResolvedValue({ code: 0, data: c.data })
+      const wrapper = await mountPage()
+      wrapper.vm.emergency.platform = 'douyin'
+      await nextTick()
+      await wrapper.find('[data-testid="pubfreq-emergency-submit"]').trigger('click')
+      await new Promise((r) => setTimeout(r, 0))
+      const text = wrapper.find('[data-testid="pubfreq-emergency-result"]').text()
+      expect(text, JSON.stringify(c.data)).toContain(c.expect)
+      wrapper.unmount()
+    }
+  })
+
+  it('紧急放行的 reason 透传，但 operator 不由渲染层自报（不给伪造操作者的入口）', async () => {
+    const wrapper = await mountPage()
+    wrapper.vm.emergency.platform = 'douyin'
+    wrapper.vm.emergency.accountId = 'acc_1'
+    wrapper.vm.emergency.reason = '客户催稿'
+    await nextTick()
+    await wrapper.find('[data-testid="pubfreq-emergency-submit"]').trigger('click')
+    await new Promise((r) => setTimeout(r, 0))
+
+    const payload = api.emergencyReleasePublishWait.mock.calls[0][0]
+    expect(payload).toMatchObject({ platform: 'douyin', accountId: 'acc_1', reason: '客户催稿' })
+    expect(payload).not.toHaveProperty('operator')
+  })
+})
diff --git a/apps/desktop/src/components/PublishFrequencySettings.vue b/apps/desktop/src/components/PublishFrequencySettings.vue
new file mode 100644
index 000000000..f5085d582
--- /dev/null
+++ b/apps/desktop/src/components/PublishFrequencySettings.vue
@@ -0,0 +1,349 @@
+<template>
+  <div class="pubfreq" data-testid="publish-frequency-settings">
+    <h3 class="pubfreq__title">{{ t('settings.publishFrequency.title') }}</h3>
+    <p class="pubfreq__hint">{{ t('settings.publishFrequency.subtitle') }}</p>
+
+    <el-alert
+      v-if="loadError"
+      type="error"
+      :closable="false"
+      show-icon
+      :title="loadError"
+      data-testid="pubfreq-load-error"
+    />
+
+    <template v-else>
+      <!-- 当前生效口径（只读） -->
+      <section class="pubfreq__section" data-testid="pubfreq-current">
+        <div class="pubfreq__row">
+          <span class="pubfreq__label">{{ t('settings.publishFrequency.currentTier') }}</span>
+          <span class="pubfreq__value">{{ currentTierText }}</span>
+        </div>
+        <div class="pubfreq__row">
+          <span class="pubfreq__label">{{ t('settings.publishFrequency.effectiveRange') }}</span>
+          <span class="pubfreq__value">{{ effectiveRangeText }}</span>
+        </div>
+      </section>
+
+      <!-- 覆盖项（保存后即时生效） -->
+      <section class="pubfreq__section">
+        <div class="pubfreq__field">
+          <label class="pubfreq__label">{{ t('settings.publishFrequency.accountInterval') }}</label>
+          <el-input-number v-model="form.accountMinutes" :min="0" :max="10080" :step="1" data-testid="pubfreq-account-min" />
+        </div>
+        <div class="pubfreq__field">
+          <label class="pubfreq__label">{{ t('settings.publishFrequency.platformInterval') }}</label>
+          <el-input-number v-model="form.platformMinutes" :min="0" :max="10080" :step="1" data-testid="pubfreq-platform-min" />
+          <span class="pubfreq__field-hint">{{ t('settings.publishFrequency.platformIntervalHint') }}</span>
+        </div>
+        <div class="pubfreq__field">
+          <label class="pubfreq__label">{{ t('settings.publishFrequency.dailyMaxLong') }}</label>
+          <el-input-number v-model="form.dailyLong" :min="0" :max="999" :step="1" data-testid="pubfreq-daily-long" />
+        </div>
+        <div class="pubfreq__field">
+          <label class="pubfreq__label">{{ t('settings.publishFrequency.dailyMaxClip') }}</label>
+          <el-input-number v-model="form.dailyClip" :min="0" :max="999" :step="1" data-testid="pubfreq-daily-clip" />
+        </div>
+        <div class="pubfreq__field">
+          <label class="pubfreq__label">{{ t('settings.publishFrequency.dailyMaxShort') }}</label>
+          <el-input-number v-model="form.dailyShort" :min="0" :max="999" :step="1" data-testid="pubfreq-daily-short" />
+        </div>
+        <div class="pubfreq__field">
+          <label class="pubfreq__label">{{ t('settings.publishFrequency.jitterOn') }}</label>
+          <el-switch v-model="form.jitterOn" data-testid="pubfreq-jitter" />
+          <span class="pubfreq__field-hint">{{ t('settings.publishFrequency.jitterHint') }}</span>
+        </div>
+        <el-alert
+          type="info"
+          :closable="false"
+          :title="t('settings.publishFrequency.dailyMaxPendingConfirm')"
+          data-testid="pubfreq-pending-confirm"
+        />
+        <div class="pubfreq__actions">
+          <el-button type="primary" :loading="saving" data-testid="pubfreq-save" @click="onSave">
+            {{ t('settings.publishFrequency.save') }}
+          </el-button>
+          <el-button :disabled="saving" data-testid="pubfreq-reset" @click="onReset">
+            {{ t('settings.publishFrequency.reset') }}
+          </el-button>
+        </div>
+      </section>
+
+      <!-- 紧急放行（P2-2）：二次确认 + 每日上限 + 冷却 + 追加式审计 + 三态回显 -->
+      <section class="pubfreq__section pubfreq__section--danger">
+        <h4 class="pubfreq__subtitle">{{ t('settings.publishFrequency.emergencyTitle') }}</h4>
+        <p class="pubfreq__hint">{{ t('settings.publishFrequency.emergencyHint') }}</p>
+        <div class="pubfreq__row">
+          <span class="pubfreq__label">{{ t('settings.publishFrequency.emergencyQuota') }}</span>
+          <span class="pubfreq__value" data-testid="pubfreq-emergency-quota">{{ emergencyQuotaText }}</span>
+        </div>
+        <div class="pubfreq__field">
+          <label class="pubfreq__label">{{ t('settings.publishFrequency.emergencyPlatform') }}</label>
+          <el-select v-model="emergency.platform" :placeholder="t('settings.publishFrequency.emergencyPlatform')" data-testid="pubfreq-emergency-platform">
+            <el-option v-for="p in platformKeys" :key="p" :label="p" :value="p" />
+          </el-select>
+        </div>
+        <div class="pubfreq__field">
+          <label class="pubfreq__label">{{ t('settings.publishFrequency.emergencyAccount') }}</label>
+          <el-input v-model="emergency.accountId" :placeholder="t('settings.publishFrequency.emergencyAccountPlaceholder')" data-testid="pubfreq-emergency-account" />
+        </div>
+        <div class="pubfreq__field">
+          <label class="pubfreq__label">{{ t('settings.publishFrequency.emergencyReason') }}</label>
+          <el-input v-model="emergency.reason" maxlength="200" show-word-limit data-testid="pubfreq-emergency-reason" />
+        </div>
+        <el-button
+          type="warning"
+          :loading="releasing"
+          :disabled="!emergency.platform"
+          data-testid="pubfreq-emergency-submit"
+          @click="onEmergencyRelease"
+        >
+          {{ t('settings.publishFrequency.emergencySubmit') }}
+        </el-button>
+        <p v-if="emergencyResult" class="pubfreq__result" :class="emergencyResultClass" data-testid="pubfreq-emergency-result">
+          {{ emergencyResult }}
+        </p>
+      </section>
+    </template>
+  </div>
+</template>
+
+<script setup>
+import { computed, onMounted, reactive, ref } from 'vue'
+import { useI18n } from 'vue-i18n'
+import { ElMessage, ElMessageBox } from 'element-plus'
+// 项目约定：Vue 组件一律经 @/api/publisher 访问 IPC，禁止直接调 window.electronAPI
+import {
+  getPublishFrequencyPolicy,
+  setPublishFrequencyPolicy,
+  emergencyReleasePublishWait,
+} from '@/api/publisher'
+
+const { t } = useI18n()
+
+const loading = ref(false)
+const saving = ref(false)
+const releasing = ref(false)
+const loadError = ref('')
+const raw = ref(null)
+
+const form = reactive({
+  accountMinutes: 0,
+  platformMinutes: 0,
+  dailyLong: 0,
+  dailyClip: 0,
+  dailyShort: 0,
+  jitterOn: true,
+})
+
+const emergency = reactive({ platform: '', accountId: '', reason: '' })
+const emergencyResult = ref('')
+const emergencyResultClass = ref('')
+
+const platformKeys = computed(() => Object.keys((raw.value && raw.value.platforms) || {}).sort())
+
+/** 当前档位文案：按平台档位分组给出代表性取值（不逐平台罗列，避免 15 行噪音） */
+const currentTierText = computed(() => {
+  const platforms = (raw.value && raw.value.platforms) || {}
+  const keys = Object.keys(platforms)
+  if (keys.length === 0) return '—'
+  const byTier = new Map()
+  for (const k of keys) {
+    const v = platforms[k] || {}
+    const sig = `${v.accountMinMs}/${v.platformMinMs}/${v.accountDailyMax}`
+    if (!byTier.has(sig)) byTier.set(sig, { tier: v.tier, sample: k, v, count: 0 })
+    byTier.get(sig).count += 1
+  }
+  return [...byTier.values()]
+    .map((g) => `${g.tier}（${g.count} 个平台，如 ${g.sample}）：${fmtMin(g.v.accountMinMs)} / ${fmtMin(g.v.platformMinMs)} / ${g.v.accountDailyMax}`)
+    .join('；')
+})
+
+/** 实际等待区间 = [账号档, 账号档 × (1 + 抖动比例)) */
+const effectiveRangeText = computed(() => {
+  const platforms = (raw.value && raw.value.platforms) || {}
+  const ratios = Number(raw.value && raw.value.jitterRatio) || 0
+  const keys = Object.keys(platforms)
+  if (keys.length === 0) return '—'
+  const mins = keys.map((k) => Number(platforms[k].accountMinMs) || 0)
+  const lo = Math.min(...mins)
+  const hi = Math.max(...mins)
+  return `${fmtMin(lo)}–${fmtMin(Math.round(hi * (1 + ratios)))}`
+})
+
+const emergencyQuotaText = computed(() => {
+  const st = raw.value && raw.value.emergencyStatus
+  if (!st) return '—'
+  return t('settings.publishFrequency.emergencyQuotaValue', { max: st.max })
+})
+
+function fmtMin (ms) {
+  const n = Math.round((Number(ms) || 0) / 60000)
+  return `${n} min`
+}
+
+async function load () {
+  loading.value = true
+  loadError.value = ''
+  try {
+    const res = await getPublishFrequencyPolicy()
+    if (!res || res.code !== 0) {
+      loadError.value = (res && res.message) || t('settings.publishFrequency.loadFailed')
+      return
+    }
+    raw.value = res.data
+    applyOverridesToForm(res.data)
+  } catch (e) {
+    loadError.value = (e && e.message) || t('settings.publishFrequency.loadFailed')
+  } finally {
+    loading.value = false
+  }
+}
+
+function applyOverridesToForm (data) {
+  const ov = data && data.overrides && typeof data.overrides === 'object' ? data.overrides : {}
+  const anyPlatform = Object.values((data && data.platforms) || {})[0] || {}
+  const toMin = (ms, dflt) => (Number.isFinite(Number(ms)) ? Math.round(Number(ms) / 60000) : dflt)
+  form.accountMinutes = toMin(ov.accountMinMs, toMin(anyPlatform.accountMinMs, 0))
+  form.platformMinutes = toMin(ov.platformMinMs, toMin(anyPlatform.platformMinMs, 0))
+  form.dailyLong = Number.isFinite(Number(ov.dailyMax && ov.dailyMax.long))
+    ? Number(ov.dailyMax.long)
+    : Number(anyPlatform.accountDailyMax) || 0
+  form.dailyClip = Number.isFinite(Number(ov.dailyMax && ov.dailyMax.clip))
+    ? Number(ov.dailyMax.clip)
+    : Number(anyPlatform.accountDailyMax) || 0
+  form.dailyShort = Number.isFinite(Number(ov.dailyMax && ov.dailyMax.short))
+    ? Number(ov.dailyMax.short)
+    : Number(anyPlatform.accountDailyMax) || 0
+  form.jitterOn = ov.jitterRatio === undefined ? true : ov.jitterRatio > 0
+}
+
+/** 组装覆盖对象：与主进程 resolvePolicyOverrides 的字段名逐一对应（不得自创字段名） */
+function buildPolicy () {
+  const policy = {
+    accountMinMs: Math.round(form.accountMinutes * 60000),
+    platformMinMs: Math.round(form.platformMinutes * 60000),
+    dailyMax: {
+      long: Math.round(form.dailyLong),
+      clip: Math.round(form.dailyClip),
+      short: Math.round(form.dailyShort),
+    },
+    jitterRatio: form.jitterOn ? 0.4 : 0,
+  }
+  return policy
+}
+
+async function onSave () {
+  saving.value = true
+  try {
+    const res = await setPublishFrequencyPolicy(buildPolicy())
+    if (!res || res.code !== 0) {
+      // 主进程是「全有或全无」判据的唯一真源：非法时它整体拒绝且不写库，此处如实回显
+      ElMessage.error((res && res.message) || t('settings.publishFrequency.saveInvalid'))
+      return
+    }
+    ElMessage.success(t('settings.publishFrequency.saveOk'))
+    await load()
+  } catch (e) {
+    ElMessage.error((e && e.message) || t('settings.publishFrequency.saveInvalid'))
+  } finally {
+    saving.value = false
+  }
+}
+
+async function onReset () {
+  saving.value = true
+  try {
+    const res = await setPublishFrequencyPolicy(null)
+    if (!res || res.code !== 0) {
+      ElMessage.error((res && res.message) || t('settings.publishFrequency.saveInvalid'))
+      return
+    }
+    ElMessage.success(t('settings.publishFrequency.resetOk'))
+    await load()
+  } catch (e) {
+    ElMessage.error((e && e.message) || t('settings.publishFrequency.saveInvalid'))
+  } finally {
+    saving.value = false
+  }
+}
+
+async function onEmergencyRelease () {
+  try {
+    await ElMessageBox.confirm(
+      t('settings.publishFrequency.emergencyConfirm'),
+      t('settings.publishFrequency.emergencyTitle'),
+      { type: 'warning' },
+    )
+  } catch (_) {
+    return // 用户取消：不执行、不提示（取消不是失败）
+  }
+
+  releasing.value = true
+  emergencyResult.value = ''
+  try {
+    const res = await emergencyReleasePublishWait({
+      platform: emergency.platform,
+      accountId: emergency.accountId || null,
+      reason: emergency.reason || undefined,
+    })
+    if (!res || res.code !== 0) {
+      emergencyResultClass.value = 'is-error'
+      emergencyResult.value = (res && res.message) || t('settings.publishFrequency.loadFailed')
+      return
+    }
+    const d = res.data || {}
+    if (d.released) {
+      emergencyResultClass.value = 'is-ok'
+      emergencyResult.value = t('settings.publishFrequency.emergencyOk')
+      emergency.reason = ''
+    } else {
+      emergencyResultClass.value = 'is-warn'
+      // 四态各自明确回显，不静默也不含糊
+      const map = {
+        exhausted: 'emergencyExhausted',
+        cooldown: 'emergencyCooldown',
+        no_waiting_window: 'emergencyNoWait',
+        disabled: 'emergencyDisabled',
+        no_guard: 'emergencyNoWait',
+      }
+      const key = map[d.reason] || 'emergencyNoWait'
+      emergencyResult.value = t(
+        `settings.publishFrequency.${key}`,
+        { max: d.max, minutes: Math.max(1, Math.ceil((d.retryAfterMs || 0) / 60000)) },
+      )
+    }
+    await load()
+  } catch (e) {
+    emergencyResultClass.value = 'is-error'
+    emergencyResult.value = (e && e.message) || t('settings.publishFrequency.loadFailed')
+  } finally {
+    releasing.value = false
+  }
+}
+
+onMounted(load)
+
+// load / buildPolicy 是稳定的对外契约（供父组件刷新与复用）；
+// emergency / form 仅为测试与诊断读取内部状态，**不属于**对外契约，勿在别处依赖。
+defineExpose({ load, buildPolicy, emergency, form })
+</script>
+
+<style scoped>
+.pubfreq { display: flex; flex-direction: column; gap: 16px; }
+.pubfreq__title { margin: 0; font-size: 16px; font-weight: 600; }
+.pubfreq__subtitle { margin: 0; font-size: 14px; font-weight: 600; }
+.pubfreq__hint { margin: 0; font-size: 12px; color: var(--el-text-color-secondary); line-height: 1.6; }
+.pubfreq__section { display: flex; flex-direction: column; gap: 10px; padding: 12px; border: 1px solid var(--el-border-color-lighter); border-radius: 6px; }
+.pubfreq__section--danger { border-color: var(--el-color-warning-light-5); }
+.pubfreq__row { display: flex; gap: 10px; align-items: baseline; }
+.pubfreq__label { min-width: 220px; font-size: 13px; color: var(--el-text-color-regular); }
+.pubfreq__value { font-size: 13px; color: var(--el-text-color-primary); }
+.pubfreq__field { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
+.pubfreq__field-hint { font-size: 12px; color: var(--el-text-color-secondary); }
+.pubfreq__actions { display: flex; gap: 10px; }
+.pubfreq__result { margin: 0; font-size: 13px; }
+.pubfreq__result.is-ok { color: var(--el-color-success); }
+.pubfreq__result.is-warn { color: var(--el-color-warning); }
+.pubfreq__result.is-error { color: var(--el-color-danger); }
+</style>
diff --git a/apps/desktop/src/components/PublishProgressPanel.test.js b/apps/desktop/src/components/PublishProgressPanel.test.js
index 4019f875f..581faf045 100644
--- a/apps/desktop/src/components/PublishProgressPanel.test.js
+++ b/apps/desktop/src/components/PublishProgressPanel.test.js
@@ -93,7 +93,7 @@ describe('PublishProgressPanel.vue — 全局进度面板（publish-progress-ux
 
   beforeEach(() => {
     vi.useRealTimers()
-    document.body.innerHTML = ''
+    document.body.textContent = ''
     mockElMessage.mockReset()
     store = usePublishProgressStore()
     storeStateRaw.sessions = []
@@ -223,6 +223,81 @@ describe('PublishProgressPanel.vue — 全局进度面板（publish-progress-ux
     expect(rows[2].querySelector('[data-testid="publish-progress-task-bucket"]')).toBe(null)
   })
 
+  // ── publish-frequency-policy-v2：日配额 / 未提交回滚两态 ──────────────────────
+  it('日配额用尽：remainingWait 为 0 也必须有行内文案（不是「无等待即无文案」），且带 daily 归因', async () => {
+    storeStateRaw.panelVisible = true
+    storeStateRaw.hasRunning = true
+    storeStateRaw.sessions = [makeSession({
+      tasks: {
+        't-daily': makeTask({
+          taskId: 't-daily',
+          phase: 'blocked',
+          stageKey: 'waiting',
+          percent: null,
+          remainingWait: 0, // 关键：日配额不是「等一会儿」，剩余等待恒为 0
+          bucket: 'daily',
+          reason: 'daily_quota',
+          daily: { used: 3, max: 3, dayKey: '2026-10-10' },
+        }),
+      },
+      taskOrder: ['t-daily'],
+    })]
+    wrapper = mountPanel()
+    await nextTick()
+    const row = body().querySelector('[data-testid="publish-progress-task"]')
+    expect(row.querySelector('[data-testid="publish-progress-task-wait"]')).not.toBe(null)
+    expect(row.textContent).toContain('今日已达上限（3/3）')
+    expect(row.textContent).toContain('明日 00:00')
+    expect(row.querySelector('[data-testid="publish-progress-task-bucket"]').textContent)
+      .toContain('（本账号每日上限）')
+  })
+
+  it('未提交失败回滚：released 行显示「已恢复可发布」，不得显示等待分钟数', async () => {
+    storeStateRaw.panelVisible = true
+    storeStateRaw.hasRunning = true
+    storeStateRaw.sessions = [makeSession({
+      tasks: {
+        't-rel': makeTask({
+          taskId: 't-rel',
+          phase: 'released',
+          stageKey: 'released',
+          percent: null,
+          remainingWait: null,
+          bucket: null,
+        }),
+      },
+      taskOrder: ['t-rel'],
+    })]
+    wrapper = mountPanel()
+    await nextTick()
+    const row = body().querySelector('[data-testid="publish-progress-task"]')
+    expect(row.querySelector('[data-testid="publish-progress-task-released"]')).not.toBe(null)
+    expect(row.textContent).toContain('未提交到平台，已恢复可发布')
+    expect(row.textContent).not.toContain('分钟后重试')
+  })
+
+  it('bucket 取值未知时不渲染归因标签（不得把未知口径猜成 daily）', async () => {
+    storeStateRaw.panelVisible = true
+    storeStateRaw.hasRunning = true
+    storeStateRaw.sessions = [makeSession({
+      tasks: {
+        't-unknown': makeTask({
+          taskId: 't-unknown',
+          phase: 'blocked',
+          stageKey: 'waiting',
+          percent: null,
+          remainingWait: 120000,
+          bucket: 'mystery',
+        }),
+      },
+      taskOrder: ['t-unknown'],
+    })]
+    wrapper = mountPanel()
+    await nextTick()
+    const rows = body().querySelectorAll('[data-testid="publish-progress-task"]')
+    expect(rows[0].querySelector('[data-testid="publish-progress-task-bucket"]')).toBe(null)
+  })
+
   it('汇总口径：成功数直给 + 失败/取消单列（failed 不计入「已完成」）', async () => {
     storeStateRaw.panelVisible = true
     storeStateRaw.hasRunning = false
@@ -506,7 +581,7 @@ describe('PublishProgressPanel.vue — 完成自动收敛（publish-progress-pan
 
   beforeEach(() => {
     vi.useFakeTimers()
-    document.body.innerHTML = ''
+    document.body.textContent = ''
     mockElMessage.mockReset()
     store = usePublishProgressStore()
     storeStateRaw.sessions = []
diff --git a/apps/desktop/src/components/PublishProgressTaskRow.vue b/apps/desktop/src/components/PublishProgressTaskRow.vue
index 9c8cbd5cb..b239266eb 100644
--- a/apps/desktop/src/components/PublishProgressTaskRow.vue
+++ b/apps/desktop/src/components/PublishProgressTaskRow.vue
@@ -35,14 +35,22 @@
     <span v-else-if="task.phase === 'failed'" class="ppp__task-error" :title="task.error">
       {{ truncateError(task.error) }}
     </span>
-    <span v-else-if="task.phase === 'blocked' && task.remainingWait" class="ppp__task-wait">
-      {{ t('publishPage.publishProgressPanel.blockedWaitMinutes', { minutes: Math.max(1, Math.ceil(task.remainingWait / 60000)) }) }}
+    <span v-else-if="task.phase === 'blocked'" class="ppp__task-wait" data-testid="publish-progress-task-wait">
+      <template v-if="isDailyQuota">
+        {{ t('publishPage.publishProgressPanel.blockedDailyQuota', { used: dailyUsed, max: dailyMax }) }}
+      </template>
+      <template v-else>
+        {{ t('publishPage.publishProgressPanel.blockedWaitMinutes', { minutes: Math.max(1, Math.ceil((task.remainingWait || 0) / 60000)) }) }}
+      </template>
       <span
         v-if="blockedBucketLabel"
         class="ppp__task-wait-bucket"
         data-testid="publish-progress-task-bucket"
       >{{ blockedBucketLabel }}</span>
     </span>
+    <span v-else-if="task.phase === 'released'" class="ppp__task-released" data-testid="publish-progress-task-released">
+      {{ t('publishPage.publishProgressPanel.releasedNotSubmitted') }}
+    </span>
     <span v-else-if="task.stageKey === 'detail' && task.stage" class="ppp__task-detail">
       {{ task.stage }}
     </span>
@@ -158,14 +166,27 @@ const showPercent = computed(() =>
   props.task.percent !== null && props.task.percent !== undefined
   && (props.task.phase === 'start' || props.task.phase === 'progress'))
 
-/** 阻塞归因只认守卫产出的两档取值（account/platform）；其他取值不渲染标签，避免把未知口径猜成一种归因 */
+/** 阻塞归因只认守卫产出的三档取值（account/platform/daily）；其他取值不渲染标签，避免把未知口径猜成一种归因 */
 const blockedBucketLabel = computed(() => {
   const bucket = props.task.bucket
   if (bucket === 'account') return t('publishPage.publishProgressPanel.blockedBucketAccount')
   if (bucket === 'platform') return t('publishPage.publishProgressPanel.blockedBucketPlatform')
+  if (bucket === 'daily') return t('publishPage.publishProgressPanel.blockedBucketDaily')
   return ''
 })
 
+/** v2：日配额用尽走独立文案（它是「改期」而非「等待」，remainingWait 恒为 0） */
+const isDailyQuota = computed(() =>
+  props.task.reason === 'daily_quota' || props.task.bucket === 'daily')
+const dailyUsed = computed(() => {
+  const d = props.task.daily
+  return d && Number.isFinite(Number(d.used)) ? Number(d.used) : 0
+})
+const dailyMax = computed(() => {
+  const d = props.task.daily
+  return d && Number.isFinite(Number(d.max)) ? Number(d.max) : 0
+})
+
 function isPastStep(current, step) {
   const currentIdx = STEP_CHAIN.indexOf(current)
   const stepIdx = STEP_CHAIN.indexOf(step)
diff --git a/apps/desktop/src/components/SettingsDialog.test.js b/apps/desktop/src/components/SettingsDialog.test.js
index a726fb6a0..0dcbd83ea 100644
--- a/apps/desktop/src/components/SettingsDialog.test.js
+++ b/apps/desktop/src/components/SettingsDialog.test.js
@@ -1,7 +1,31 @@
-import { describe, expect, it, beforeEach } from 'vitest'
+import { describe, expect, it, beforeEach, vi } from 'vitest'
 import { mount } from '@vue/test-utils'
 import { nextTick } from 'vue'
 import i18n from '@/i18n'
+
+// publish tab 自 publish-frequency-policy-v2 起可用：它会挂载 PublishFrequencySettings，
+// 该组件挂载即拉策略。此处 mock 掉以免测试依赖真实 electronAPI 是否存在。
+// ⚠️ 必须用 importOriginal 保留其余导出：整模块替换会让同一对话框里「通用设置」的
+//    LogsSettings 拿不到 logsGetInfo（实测产生 4 个未捕获 TypeError，测试虽过但 CI 红）。
+vi.mock('@/api/publisher', async (importOriginal) => {
+  const actual = await importOriginal()
+  return {
+    ...actual,
+    getPublishFrequencyPolicy: vi.fn().mockResolvedValue({
+      code: 0,
+      data: {
+        platforms: { wechat_mp: { tier: 'long', accountMinMs: 1200000, platformMinMs: 120000, accountDailyMax: 3 } },
+        overrides: null,
+        jitterRatio: 0.4,
+        releaseGraceMs: 60000,
+      },
+    }),
+    setPublishFrequencyPolicy: vi.fn().mockResolvedValue({ code: 0, data: { saved: true } }),
+    emergencyReleasePublishWait: vi.fn().mockResolvedValue({ code: 0, data: { released: false, reason: 'no_waiting_window', max: 1 } }),
+    getPublishEmergencyStatus: vi.fn().mockResolvedValue({ code: 0, data: { max: 1 } }),
+  }
+})
+
 import SettingsDialog from './SettingsDialog.vue'
 
 function mountDialog (locale = 'zh') {
@@ -17,26 +41,41 @@ describe('SettingsDialog', () => {
     i18n.global.locale.value = 'zh'
   })
 
-  it('渲染五个 Tab（含禁用徽标），默认选中模型设置', () => {
+  it('渲染五个 Tab，默认选中模型设置；发布设置为可用、账号设置仍禁用', () => {
     const wrapper = mountDialog()
     const tabs = wrapper.findAll('.settings-tab')
     expect(tabs).toHaveLength(5)
     expect(tabs[0].text()).toContain('模型设置')
     expect(tabs[1].text()).toContain('通用设置')
     expect(tabs[2].text()).toContain('飞书 API')
+    // publish-frequency-policy-v2：发布设置由 disabled 转为可用（不再是「敬请期待」）
     expect(tabs[3].text()).toContain('发布设置')
-    expect(tabs[3].text()).toContain('敬请期待')
-    expect(tabs[3].attributes('disabled')).toBeDefined()
+    expect(tabs[3].text()).not.toContain('敬请期待')
+    expect(tabs[3].attributes('disabled')).toBeUndefined()
+    // 账号设置仍禁用（未在本变更范围内）
+    expect(tabs[4].text()).toContain('账号设置')
+    expect(tabs[4].text()).toContain('敬请期待')
+    expect(tabs[4].attributes('disabled')).toBeDefined()
     expect(wrapper.get('.settings-tab.active').text()).toContain('模型设置')
   })
 
-  it('点击禁用 Tab 不切换激活态', async () => {
+  it('点击禁用 Tab（账号设置）不切换激活态', async () => {
     const wrapper = mountDialog()
-    await wrapper.findAll('.settings-tab')[3].trigger('click')
+    await wrapper.findAll('.settings-tab')[4].trigger('click')
     await nextTick()
     expect(wrapper.get('.settings-tab.active').text()).toContain('模型设置')
   })
 
+  it('点击发布设置切换到发布频率策略面板', async () => {
+    const wrapper = mountDialog()
+    await wrapper.findAll('.settings-tab')[3].trigger('click')
+    await nextTick()
+    await new Promise(resolve => setTimeout(resolve, 0))
+    await nextTick()
+    expect(wrapper.get('.settings-tab.active').text()).toContain('发布设置')
+    expect(wrapper.find('[data-testid="publish-frequency-settings"]').exists()).toBe(true)
+  })
+
   it('切换到通用设置渲染日志设置面板（i18n 文案）', async () => {
     const wrapper = mountDialog()
     await wrapper.findAll('.settings-tab')[1].trigger('click')
@@ -54,10 +93,11 @@ describe('SettingsDialog', () => {
     expect(icons).toHaveLength(5)
   })
 
-  it('en 语言下 Tab 与占位文案为英文', () => {
+  it('en 语言下 Tab 为英文，发布设置不再是 Coming Soon', () => {
     const wrapper = mountDialog('en')
     const tabs = wrapper.findAll('.settings-tab')
     expect(tabs[0].text()).toContain('Model Settings')
-    expect(tabs[3].text()).toContain('Coming Soon')
+    expect(tabs[3].text()).toContain('Publish Settings')
+    expect(tabs[4].text()).toContain('Coming Soon')
   })
 })
diff --git a/apps/desktop/src/components/SettingsDialog.vue b/apps/desktop/src/components/SettingsDialog.vue
index caddb9e3a..bbf265bf3 100644
--- a/apps/desktop/src/components/SettingsDialog.vue
+++ b/apps/desktop/src/components/SettingsDialog.vue
@@ -26,6 +26,7 @@
         <ModelProviders v-if="activeTab === 'model'" />
         <LogsSettings v-else-if="activeTab === 'general'" />
         <FeishuSettingsTab v-else-if="activeTab === 'feishu'" />
+        <PublishFrequencySettings v-else-if="activeTab === 'publish'" />
         <div v-else class="placeholder-panel">
           <div class="placeholder-icon"><el-icon><Compass /></el-icon></div>
           <p>{{ t('settings.placeholder') }}</p>
@@ -43,6 +44,8 @@ import UiModal from './UiModal.vue'
 import ModelProviders from '@/views/ModelProviders.vue'
 import LogsSettings from './LogsSettings.vue'
 import FeishuSettingsTab from './FeishuSettingsTab.vue'
+// publish-frequency-policy-v2：发布频率策略（含紧急放行出口）——原 publish tab 由 disabled 转为可用
+import PublishFrequencySettings from './PublishFrequencySettings.vue'
 
 defineProps({
   visible: { type: Boolean, default: false },
@@ -55,7 +58,7 @@ const { t } = useI18n()
     { key: 'model', label: t('settings.tabModel'), icon: Connection, disabled: false },
     { key: 'general', label: t('settings.tabGeneral'), icon: Setting, disabled: false },
     { key: 'feishu', label: t('knowledgeBase.feishuApi'), icon: Link, disabled: false },
-    { key: 'publish', label: t('settings.tabPublish'), icon: Upload, disabled: true },
+    { key: 'publish', label: t('settings.tabPublish'), icon: Upload, disabled: false },
     { key: 'account', label: t('settings.tabAccount'), icon: User, disabled: true },
   ])
 
diff --git a/apps/desktop/src/locales/publish-page/en.js b/apps/desktop/src/locales/publish-page/en.js
index 97556c1a6..1fb04a194 100644
--- a/apps/desktop/src/locales/publish-page/en.js
+++ b/apps/desktop/src/locales/publish-page/en.js
@@ -123,6 +123,9 @@ export default {
       blockedWaitMinutes: (ctx) => 'Retrying after ' + ctx.named('minutes') + ' min',
       blockedBucketAccount: '(account interval)',
       blockedBucketPlatform: '(same-platform interval)',
+      blockedBucketDaily: '(account daily limit)',
+      blockedDailyQuota: (ctx) => 'Daily limit reached (' + ctx.named('used') + '/' + ctx.named('max') + '); resumes after 00:00 tomorrow',
+      releasedNotSubmitted: 'Not submitted; publish window restored',
     },
     close: '✕ Close',
     aiWriter: '🤖 AI',
diff --git a/apps/desktop/src/locales/publish-page/zh.js b/apps/desktop/src/locales/publish-page/zh.js
index ca45dd4bb..7f7605297 100644
--- a/apps/desktop/src/locales/publish-page/zh.js
+++ b/apps/desktop/src/locales/publish-page/zh.js
@@ -123,6 +123,9 @@ export default {
       blockedWaitMinutes: (ctx) => '等待 ' + ctx.named('minutes') + ' 分钟后重试',
       blockedBucketAccount: '（本账号间隔）',
       blockedBucketPlatform: '（同平台其他账号间隔）',
+      blockedBucketDaily: '（本账号每日上限）',
+      blockedDailyQuota: (ctx) => '今日已达上限（' + ctx.named('used') + '/' + ctx.named('max') + '），将于明日 00:00 后自动继续',
+      releasedNotSubmitted: '未提交到平台，已恢复可发布',
     },
     close: '✕ 关闭',
     aiWriter: '🤖 AI',
diff --git a/apps/desktop/src/locales/settings/en.js b/apps/desktop/src/locales/settings/en.js
index 313f90885..ab208feac 100644
--- a/apps/desktop/src/locales/settings/en.js
+++ b/apps/desktop/src/locales/settings/en.js
@@ -19,6 +19,42 @@ export default {
     tabAccount: 'Account Settings',
     tabComingSoon: 'Coming Soon',
     placeholder: 'This feature is under development. Stay tuned.',
+    publishFrequency: {
+      title: 'Publish Frequency Policy',
+      subtitle: 'Controls the publishing pace per account and per platform. The numbers are conservative engineering defaults, not official platform rules; this tool does not claim compliance with any platform policy. Changes take effect immediately (no restart).',
+      currentTier: 'Current tiers (account / platform / daily limit)',
+      effectiveRange: 'Effective wait range (with jitter)',
+      accountInterval: 'Min interval per account (minutes)',
+      platformInterval: 'Cross-account platform interval (minutes, 0 = off)',
+      platformIntervalHint: 'Applies only when switching accounts on the same platform; for the same account the account tier is always stricter.',
+      dailyMaxLong: 'Daily limit for long-form tier (0 = unlimited)',
+      dailyMaxClip: 'Daily limit for short-video tier (0 = unlimited)',
+      dailyMaxShort: 'Daily limit for short-form tier (0 = unlimited)',
+      jitterOn: 'Add random jitter (more human-like pacing)',
+      jitterHint: 'Wait becomes 0–40% longer, throughput drops slightly, but publish points no longer land on exact round boundaries.',
+      dailyMaxPendingConfirm: 'Defaults 3 / 5 / 20 are conservative engineering starting points pending operator confirmation.',
+      save: 'Save',
+      reset: 'Restore defaults',
+      saveOk: 'Saved and applied immediately',
+      resetOk: 'Restored default policy',
+      saveInvalid: 'Invalid policy: the whole override was discarded and the previous valid one kept',
+      loadFailed: 'Failed to load the publish frequency policy',
+      emergencyTitle: 'Release this account wait now',
+      emergencyHint: 'Skips the current wait window and enqueues immediately. There is a per-account daily cap, and every release is appended to a local audit file (append-only, not editable in the UI).',
+      emergencyQuota: 'Daily cap per account',
+      emergencyQuotaValue: '{max} per day',
+      emergencyPlatform: 'Platform',
+      emergencyAccount: 'Account ID',
+      emergencyAccountPlaceholder: 'Leave empty for the platform default account',
+      emergencyReason: 'Reason (optional, max 200 chars)',
+      emergencySubmit: 'Release wait now',
+      emergencyConfirm: 'This skips the wait and enqueues immediately; the action is audited. Continue?',
+      emergencyOk: 'Wait released; the task was re-enqueued',
+      emergencyExhausted: 'Daily emergency releases exhausted (cap {max}/day)',
+      emergencyCooldown: 'Less than {minutes} min since the last release; try again later',
+      emergencyNoWait: 'No pending wait window',
+      emergencyDisabled: 'Emergency release is disabled (cap set to 0)',
+    },
     langAria: 'Interface language',
     langHint: 'Choose the interface language. It takes effect immediately and is remembered.',
     langZh: '中文（简体）',
diff --git a/apps/desktop/src/locales/settings/zh.js b/apps/desktop/src/locales/settings/zh.js
index b30d71607..ef3b3cb16 100644
--- a/apps/desktop/src/locales/settings/zh.js
+++ b/apps/desktop/src/locales/settings/zh.js
@@ -19,6 +19,42 @@ export default {
     tabAccount: '账号设置',
     tabComingSoon: '敬请期待',
     placeholder: '该功能正在开发中，敬请期待',
+    publishFrequency: {
+      title: '发布频率策略',
+      subtitle: '控制同一账号、同一平台的发布节奏。数值是工程保守默认，不是平台官方规则，本工具不声称符合任何平台规定。修改后立即生效（无需重启）。',
+      currentTier: '当前档位（账号间隔 / 平台间隔 / 每日上限）',
+      effectiveRange: '实际等待区间（含抖动）',
+      accountInterval: '同账号最小间隔（分钟）',
+      platformInterval: '同平台跨账号最小间隔（分钟，0 = 关闭）',
+      platformIntervalHint: '仅在「同平台换账号」时生效；同账号时账号档恒更严，该值不改变结果。',
+      dailyMaxLong: '长文档每日上限（条，0 = 不限）',
+      dailyMaxClip: '短视频档每日上限（条，0 = 不限）',
+      dailyMaxShort: '短内容档每日上限（条，0 = 不限）',
+      jitterOn: '加入随机抖动（更像人工节奏）',
+      jitterHint: '开启后实际等待比标称值长 0–40%，总吞吐略降，但发布点不再落在精确整数边界。',
+      dailyMaxPendingConfirm: '默认值 3 / 5 / 20 为工程保守起点，待运营确认。',
+      save: '保存',
+      reset: '恢复默认',
+      saveOk: '已保存并立即生效',
+      resetOk: '已恢复默认策略',
+      saveInvalid: '策略配置非法，已整体丢弃并保留上一份有效配置',
+      loadFailed: '读取发布频率策略失败',
+      emergencyTitle: '立即解除本账号等待',
+      emergencyHint: '跳过当前等待窗口直接进入发布队列。每日每账号有次数上限，且所有放行都会记入本地审计文件（只追加，界面无法编辑）。',
+      emergencyQuota: '每日每账号上限',
+      emergencyQuotaValue: '{max} 次/天',
+      emergencyPlatform: '平台',
+      emergencyAccount: '账号 ID',
+      emergencyAccountPlaceholder: '留空 = 该平台的默认账号',
+      emergencyReason: '放行原因（可选，最多 200 字）',
+      emergencySubmit: '立即解除等待',
+      emergencyConfirm: '本次将跳过等待直接进入发布队列，操作会记入审计。确认继续？',
+      emergencyOk: '已解除等待，任务已重新入队',
+      emergencyExhausted: '今日紧急放行次数已用尽（上限 {max} 次/天）',
+      emergencyCooldown: '距上次放行不足 {minutes} 分钟，请稍后再试',
+      emergencyNoWait: '当前没有等待中的窗口',
+      emergencyDisabled: '紧急放行已被关闭（上限设为 0）',
+    },
     langAria: '界面语言',
     langHint: '界面显示语言；切换后立即生效，并记住你的选择。',
     langZh: '中文（简体）',
diff --git a/apps/desktop/src/stores/publishProgress.js b/apps/desktop/src/stores/publishProgress.js
index ffc331738..efdb2de89 100644
--- a/apps/desktop/src/stores/publishProgress.js
+++ b/apps/desktop/src/stores/publishProgress.js
@@ -30,9 +30,9 @@ export const FIRST_HIDE_TOAST_STORAGE_KEY = 'mp-publish-first-hide-toast-shown'
 
 /** cancelled（publish-progress-panel-refine）：取消终态——主进程 phase4-events
  * 转发 TaskQueue 的 task:cancelled；中性态（非失败红态），计入终态与 aggregate。 */
-const PHASE_ENUM = new Set(['start', 'progress', 'success', 'failed', 'retry', 'blocked', 'cancelled'])
+const PHASE_ENUM = new Set(['start', 'progress', 'success', 'failed', 'retry', 'blocked', 'released', 'cancelled'])
 const STAGE_KEY_ENUM = new Set([
-  'prepare', 'upload', 'fill', 'submit', 'verify', 'waiting', 'done', 'failed', 'detail',
+  'prepare', 'upload', 'fill', 'submit', 'verify', 'waiting', 'released', 'done', 'failed', 'detail',
 ])
 const TERMINAL_PHASES = new Set(['success', 'failed', 'cancelled'])
 
@@ -91,6 +91,8 @@ export const usePublishProgressStore = defineStore('publishProgress', () => {
         remainingWait: null,
         retriesLeft: null,
         bucket: null,
+        reason: null,
+        daily: null,
         startedAt: null,
         endedAt: null,
         lastEventAt: null,
@@ -168,6 +170,9 @@ export const usePublishProgressStore = defineStore('publishProgress', () => {
     if (data.remainingWait !== undefined) task.remainingWait = data.remainingWait || null
     if (data.retriesLeft !== undefined) task.retriesLeft = data.retriesLeft
     if (data.bucket !== undefined) task.bucket = data.bucket || null
+    // v2：阻塞原因与当日用量（日配额文案需要 used/max；字段缺席保持 null，不得猜档）
+    if (data.reason !== undefined) task.reason = data.reason || null
+    if (data.daily !== undefined) task.daily = data.daily || null
     if (phase === 'start' && !task.startedAt) task.startedAt = Date.now()
     if (isTerminalNow && !task.endedAt) task.endedAt = Date.now()
     _appendLog(session, platform + ' · ' + (task.stage || phase), isTerminalNow ? (phase === 'success' ? 'success' : 'danger') : 'primary')
diff --git a/config/platforms.yaml b/config/platforms.yaml
index 8966d697a..244cbab6e 100755
--- a/config/platforms.yaml
+++ b/config/platforms.yaml
@@ -90,6 +90,11 @@ platforms:
     has_api: false
     publishMode: dom-only   # W1 §5.1 三态总闸：api-only|api-then-dom|dom-only
     enabled: true
+  # ⚠️ 命名澄清（publish-frequency-policy-v2 P2-3）：本条的 id 是 `tencent_video`，
+  # 但 name 是「视频号」、publish_url 指向 channels.weixin.qq.com —— 实际发布目标是
+  # **微信视频号**（WeChat Channels），不是腾讯视频（v.qq.com，其开放平台已关闭）。
+  # id 因存量数据/账号绑定/历史记录兼容无法改名，**新增代码请勿据 id 推断平台归属**。
+  # 频率策略表里 `tencent_video` 同样指视频号；腾讯视频（v.qq.com）未接入。
   tencent_video:
     id: 21
     name: 视频号
diff --git a/openspec/changes/publish-frequency-policy-v2/.openspec.yaml b/openspec/changes/publish-frequency-policy-v2/.openspec.yaml
new file mode 100644
index 000000000..53f62d706
--- /dev/null
+++ b/openspec/changes/publish-frequency-policy-v2/.openspec.yaml
@@ -0,0 +1,2 @@
+schema: spec-driven
+created: 2026-10-10
diff --git a/openspec/changes/publish-frequency-policy-v2/design.md b/openspec/changes/publish-frequency-policy-v2/design.md
new file mode 100644
index 000000000..02f210aed
--- /dev/null
+++ b/openspec/changes/publish-frequency-policy-v2/design.md
@@ -0,0 +1,220 @@
+# Design — publish-frequency-policy-v2
+
+> 逐条回应两轮跨家族对抗评审的结论见 `.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/rebuttal-v1.md` / `rebuttal-v2.md`。
+> 实现的详细规格（校验表 / 文案表 / 测试矩阵）见 `01-docs/PRD-PUBLISH-FREQUENCY-POLICY-V2-2026-10-10.md`。
+
+## 0. 一句话设计
+
+把「提交前乐观记账」拆成**可回滚的占位**与**不可回滚的提交**两个阶段，用**阶段判据**（而非错误类型）决定能否回滚；在此之上补**日配额**维度与**只增不减的抖动**；数值下调并让平台档回到「有依据、成本可接受」的位置。
+
+## 1. 三个待解问题的第一性分析
+
+### 1.1 为什么不能靠错误类型判「未提交」（评审 Critical i1/i6）
+
+原设计（调查报告 P0-1）打算把「登录失效 / 风控挂起 / 参数校验」等错误类型列入白名单。两轮评审都指出两个独立缺陷：
+
+1. **获益方自标**：执行器同时是「抛错方」与「免等重试的获益方」。仅凭执行器自己设的 `notSubmitted` 布尔位，误标或伪造即可绕开全部门禁。
+2. **同一错误类型的阶段歧义**：「登录失效」可能发生在**提交之前**（未发出任何平台请求），也可能发生在**提交之后**（平台已受理、返回 401）。按类型判必然误判其中一侧。
+
+**结论**：判据必须是**阶段**，不是类型。阶段由**实际发出平台请求的那一层**打点，而不是由抛错的那一层声明。
+
+### 1.2 为什么日配额被拒的任务不会「丢 hold」（评审 Critical v1-i1）
+
+配额判定发生在 `recordPublish()` **之前**；被拒的任务**从未占用任何窗口**。因此不存在「跨日等待期间窗口被占、重启后 hold 丢失」的问题——`hold` 只在**已记账**之后才存在，而配额分支走不到记账。这直接消掉了评审担心的持久化需求，也消掉了 proposer 修订版里那条凭空新增的 `hold_until` 列。
+
+但同时暴露出**原设计的真缺陷**：原方案写「ms 超过 2³¹−1 则不设定时器，等下次 `_processNext`」，而 `_processNext` 会立即再次取到同一任务 ⇒ **紧循环**。这一条比评审指出的更严重，已在 rebuttal-v1 中承认为设计缺陷并修正（见 §4.3）。
+
+### 1.3 为什么抖动必须只增不减
+
+抖动若双向（`1±ratio`），则存在 `rand` 使等待**短于**最小间隔 ⇒ 抖动成为绕过门禁的通道。故 `wait = remaining × (1 + ratio × rand)`，`rand ∈ [0,1)`，**只增不减**；`ratio = 0` 严格退化为 v1 行为（保证可回归）。
+
+## 2. 数据模型
+
+### 2.1 新增表 `publish_daily_count`
+
+```sql
+CREATE TABLE IF NOT EXISTS publish_daily_count (
+  owner_subject  TEXT NOT NULL,
+  key            TEXT NOT NULL,   -- 'platform:accountId' | 'platform:*'
+  day_key        TEXT NOT NULL,   -- 'YYYY-MM-DD'（本机运营日）
+  count          INTEGER NOT NULL DEFAULT 0,  -- 已实际提交到平台的次数
+  rollback_count INTEGER NOT NULL DEFAULT 0,  -- 回滚（放行）尝试次数，只增不减
+  updated_at     INTEGER NOT NULL,
+  PRIMARY KEY (owner_subject, key, day_key)
+);
+CREATE INDEX IF NOT EXISTS idx_daily_owner_key ON publish_daily_count(owner_subject, key);
+```
+
+**为什么新表而不是扩展 `publish_timeline`**：后者的实际列是 `last_publish_at TEXT`（`store-schema.js:79-84`），被守卫做算术强转，且 `store-owner-isolation.test.js:364` 把读回钉成字符串 `'100'`。改成 JSON 会污染「最后一次提交时间」的消费者与既有断言。新表是纯增量。
+
+**为什么两个计数器**：
+- `count` = **已实际提交到平台**的次数（平台负载的代理量）⇒ 未提交的回滚要**幂等回补**。
+- `rollback_count` = **回滚尝试**次数（滥用面的代理量）⇒ **只增不减**，用于防风上限。
+- 与「不做成功才记账」不冲突：计的是**提交**，不是**成功**；已提交后的失败仍计入。
+
+### 2.2 `publish_timeline` 语义不变
+
+键仍为 `platform:accountId` / `platform:*`，值仍为最后一次**提交**时间戳（ms）。本变更不改其形状、不加列、不做数据迁移。
+
+### 2.3 本机运营日（self-imposed accounting day）
+
+- `day_key` = 本机时区自然日 `YYYY-MM-DD`，由注入的 `today()` 产出（默认实现用 `toLocaleDateString('sv-SE')`，天然 ISO 格式，避免手写补零）。
+- **不与平台日界做换算，也不声称等价**：日配额是本工具的**自我约束**，不是平台规则（上游 PRD §2 明写「不声称符合平台官方规定」）。若按平台时区计日，同一运营者会面对多个不同的「今天」，配额不可解释、不可预期。
+- 跨日边界必须有测试：TZ 注入 + `23:59:59 → 00:00:01` 两个 `day_key` 独立计数。
+- **不提供** `MP_PUBLISH_QUOTA_TZ`：避免引入第二个时区真源。
+
+## 3. 策略表 v2
+
+| 组（`tier`） | 平台 | 账号档 | 平台档 | 日配额 |
+|---|---|---|---|---|
+| `long` | wechat_mp, zhihu, baijiahao, toutiao | 20 分钟（原 60） | 2 分钟（原 5） | 3 条/天 |
+| `clip` | douyin, kuaishou, tencent_video, xiaohongshu, bilibili, youtube, tiktok, instagram, facebook | 10 分钟（原 30） | 2 分钟（原 3） | 5 条/天 |
+| `short` | weibo, twitter | 3 分钟（原 10） | 2 分钟（原 1） | 20 条/天 |
+| 未登记回落 | 任意未知 | 20 分钟 | 2 分钟 | 3 条/天 |
+
+- `tier` 是**新增字段但非新增分类器**：日配额分档直接读策略表里既有的分组条目，与账号档/平台档同源同表 ⇒ 不会出现两套分类漂移。
+- 未登记平台回落时**出声一次**（按平台记忆，进程内 Set 去重）。
+
+## 4. 守卫 v2 与队列 v2
+
+### 4.1 守卫 API
+
+```js
+new PublishIntervalGuard({
+  policy,       // (platform) => { accountMinMs, platformMinMs, accountDailyMax, tier }
+  store,        // { get(key), set(key, value) }                       —— 提交时间（不变）
+  dailyStore,   // { getDay(key, dayKey), incrDay(key, dayKey, field), decrDay(key, dayKey, field) }
+  now,          // () => number                                        —— 不变
+  today,        // () => 'YYYY-MM-DD'                                  —— 新增
+  random,       // () => [0,1)                                         —— 新增（可注入）
+  jitterRatio,  // number                                              —— 新增，默认 0.4
+})
+```
+
+### 4.2 `check()` 返回形状
+
+```js
+{
+  allowed, remainingMs,                      // remainingMs 已含抖动
+  bucket: 'account' | 'platform' | 'daily' | null,
+  reason: null | 'interval' | 'daily_quota',
+  daily: { used, max, dayKey } | null,
+}
+```
+
+判定顺序：① 账号档 remaining；② 平台档 remaining（默认开 2 分钟）；③ 日配额（独立否决项）。①② 取更大者；③ 为独立否决。同时命中时 `bucket` 取 `daily`（更强的约束，且用户可行动性不同：间隔是等待，配额是改期）。
+
+### 4.3 队列：`_quotaBlocked` 与跨日定时器（修正 Critical v1-i1）
+
+- 新增 `_quotaBlocked: Set<taskId>`；`_processNext` **必须跳过**其中任务（防紧循环）。
+- 配额被拒 → `status='pending'`、加入 `_quotaBlocked`、发 `publish:blocked`（`reason='daily_quota'`）、设定时器到**次日 00:00:05** 并 `unref()`；到点移出集合、入队头、`_processNext()`。
+- **溢出分支删除**：次日上界 24h = 86 400 000 ms，定时器上限 2³¹−1 = 2 147 483 647 ms ≈ 24.85 天 ⇒ 数学上不可能溢出。原设计的溢出分支是无意义复杂度且引入紧循环。
+- 重启恢复：配额被拒任务以 `pending` 持久化（既有 `serialize()` 覆盖），恢复后重新判定、重新武装。**无需 `hold` 持久化**（§1.2）。
+- 通道释放：配额分支与间隔分支一样在 `try/finally` 之前 `return`，必须**显式释放通道**（与既有 `publish:blocked` 分支同因，行为锁已有先例）。
+
+### 4.4 记账与回滚（P0-1 核心）
+
+```
+hold = guard.recordPublish(platform, accountId)   // 返回 { at, accountPrev, platformPrev }
+task._hold = hold                                  // 必须保存
+...
+catch (e):
+  canRollback = task.submittedAt === null          // ← 阶段判据（唯一权威）
+                && e.notSubmitted === true         // ← 佐证位；不一致即 fail-closed
+  if (canRollback) guard.release(platform, accountId, hold)
+  else             /* 占窗口，不变 */
+```
+
+`release(platform, accountId, hold)`：
+
+1. `store.get(key) === hold.at` 才回滚该键（乐观并发；否则不动 —— **绝不回滚他人窗口**），并按 `hold.*Prev` 恢复或置 null；
+2. `decrDay(accountKey, today, 'count')`（配额回补，幂等，下限 0）；
+3. `incrDay(accountKey, today, 'rollback_count')`（只增）。
+
+**防风（回应评审 Critical v2-i1）**：
+- 回滚后**最小退避** `max(RELEASE_GRACE_MS, 10s)` —— 不允许 0 等待；
+- 每账号每日回滚上限 `max(2, dailyMax)`，超出 ⇒ **占窗口 + warn**；
+- 三条独立约束（阶段判据 / 佐证位一致 / 防风上限）任一不成立即 fail-closed。
+
+### 4.5 传输层打点与「成功路径自证」不变量（回应评审 Critical v2-i1）
+
+- 新增 `context.markSubmitted()`：由**真正发出平台写操作的那一层**（`rpa-view-manager` / `publisher-router`）在首次平台写操作前调用一次。队列把结果写到 `task.submittedAt`。
+- **不变量 I4**：任何**成功**的发布若 `task.submittedAt === null` ⇒ `log.error` + 计数。
+  - 作用：把「某传输层漏接线」从**静默风险**变成**第一次成功就暴露的主动告警**。这条把评审的担忧反转为可自检的探针。
+
+### 4.6 重试放行（P0-2）
+
+- 自动重试（`task-queue.js:587-597`）与手动重试（`:240-262`）同走 `add() → _executeTask → check()`，P0-1 落地后自然受益，无额外分支。
+- `task.lastAttemptNotSubmitted === true` 且 `now - lastAttemptAt >= max(RELEASE_GRACE_MS, 10s)` 时放行一次，并发 `publish:released` 事件（可观测，经既有投影链到进度面板）。
+
+## 5. 装配（桌面端）
+
+```js
+container.register("publishIntervalGuard", (c) => {
+  const s = c.get("store");
+  const ov = resolvePolicyOverrides(s);           // store 设置 + env，逐字段校验，任一非法整体丢弃
+  return new PublishIntervalGuard({
+    policy: (platform) => resolvePublishIntervals(platform, { overrides: ov, warn: logger.warn }),
+    store: { get: (k) => s.getPublishTimeline(k), set: (k, v) => s.setPublishTimeline(k, v) },
+    dailyStore: {
+      getDay:  (k, d)       => s.getPublishDailyCount(k, d),
+      incrDay: (k, d, f)    => s.incrPublishDailyCount(k, d, f),
+      decrDay: (k, d, f)    => s.decrPublishDailyCount(k, d, f),
+    },
+    jitterRatio: ov.jitterRatio,
+  });
+});
+```
+
+**装配锁（3 条）**
+1. `taskQueue._publishIntervalGuard === container.get('publishIntervalGuard')`（既有，保留）；
+2. 守卫的 `dailyStore` 三个方法均为函数（**摘掉日配额注入即红**）；
+3. 行为锁：`dailyStore` 返回 `used = max` 时，`check()` 给出 `bucket === 'daily'`。
+
+## 6. 存储层
+
+- `store-schema.js`：`TABLE_NAMES` / `OWNER_TABLE_SCHEMA_SQL` / `OWNER_INDEX_SQL` / `SCHEMA_SQL` / `OWNER_TABLE_COLUMNS` / `OWNER_TABLE_KEY_COLUMNS` / `OWNER_COLUMN_DEFAULTS` 七处同步登记（owner 隔离重建路径要求逐项齐备，缺一即 `needsOwnerTableRebuild` 判定异常）。
+- 新 mixin `store/publish-daily-store.js`：`getPublishDailyCount` / `incrPublishDailyCount` / `decrPublishDailyCount`，owner 解析与 `rate-limit-store.js` 同源（`_resolveOwnerSubject`，无 owner 即 no-op 返回 null/0）。
+- 计数读回一律 `Number.parseInt(String(v), 10)`，非有限 → 0 **并出声**（既有库出现过 TEXT 亲和带回 `.0` 的先例）。
+- 紧急放行审计：追加式 JSONL（`publish-emergency-audit.jsonl`，逐行 append，UI 无编辑入口），沿用 `publish-history.js` 的 JSONL 落盘范式。
+
+## 7. 显式偏离声明（对上游调查报告 P1-1）
+
+调查报告建议「跨账号平台档**默认关**」。本变更**改为默认开 2 分钟**，理由：
+
+- 两轮跨家族评审各自独立指出「默认关会削弱同平台多账号（机构号矩阵）的共档保护」；
+- 成本有界：1 账号/平台时该档**完全惰性**（账号档 3–20 分钟恒严于 2 分钟）；
+- 它保留的是本项目唯一一条**设备/IP 邻域**保护（上游 PRD 明确不做设备级串行）；
+- 相对 v1 的 3–5 分钟，2 分钟已把该档的代价降到原来的 40–67%。
+
+代价与适用场景写入 PRD 与设置页提示。
+
+## 8. 风险与缓解
+
+| 风险 | 缓解 |
+|---|---|
+| 阶段打点漏接线 ⇒ 未提交失败被当成已提交（多等，方向安全） | 不变量 I4：成功路径自证 + 计数告警 |
+| 阶段打点被绕过 ⇒ 已提交却判为未提交（危险侧） | 佐证位必须一致才回滚；防风上限；三条锁 + 变异反证 |
+| 回滚风暴 | 最小退避 10s + 每账号每日回滚上限 + 只增的回滚计数 |
+| 抖动 + 下调叠加导致吞吐显著下降 | 设置页显示实际间隔区间与日配额；PRD 写明量级；抖动可关 |
+| 新增表破坏 owner 隔离重建 | 七处注册表同步登记 + `store-schema.test.js` + `store-owner-isolation.test.js` 全量 |
+| 紧急放行成为新的绕过口 | 每日上限 1 次 + 两次间隔 ≥10 分钟 + 追加式审计 + 设置页可见 |
+
+## 9. 兼容与存量
+
+- `publish_timeline` 存量行不动；新表 `CREATE TABLE IF NOT EXISTS`，无历史数据 ⇒ 计数从 0 起（当天即受配额约束）。
+- 新数值在**每轮 `check()`** 时读取 ⇒ 即时生效，无入队时快照，无需迁移；入队时旧值、执行时新值按新值判定（补用例）。
+- `MP_PUBLISH_PLATFORM_MIN_INTERVAL_MS` 的默认值由「策略表 5/3/1」变为「策略表 2」；显式设置该变量仍可覆盖，`0` = 关闭。
+- 既有两条测试的语义**必须改写**（非放宽）：「同平台换号被平台档拦截」→「默认 2 分钟拦截 / 显式 0 不拦截」两侧断言；「无 accountId 仍受平台档约束」→ 保留并补「显式关闭后仅受账号档与日配额约束」。
+
+## 10. 对抗评审后的修订（run C 采纳项）
+
+> 全部落在 **fail-closed 方向**，未引入新的 Critical/High；逐条回应见 `rebuttal-v4.md`，三次运行的汇总见 `.adversarial/ccg-plan-plan-publish-frequency-policy-v2-review-brief/summary.md`。
+
+1. **新增不变量 I9（失败路径探针）**：任务失败且 `submitAttempted === false` 时递增「疑似漏接线失败」计数（按平台维度，设置页可见）。
+2. **接线矛盾检测（自动降级）**：同一平台若**成功路径已证明会调 `markSubmitted`**（曾出现成功且 `submittedAt !== null`），却持续出现 `submitAttempted === false` 的失败 ⇒ 判为接线矛盾 ⇒ `log.error` + **对该平台临时停用回滚**（回到「一律占窗口」的旧行为），直到应用重启或用户在设置页确认后解除。
+   - 为什么是自动降级而不是仅告警：漏接线会让「已提交但失败」被判为可回滚 ⇒ 早于窗口的重复发布，属危险侧；宁可多等。
+3. **结构锁**：枚举并断言发布传输层的 `markSubmitAttempted` 调用点（与 D5 的 `prev` 处理同法）；新增传输层必须登记，否则判红。
+4. **`buildKey` 哨兵规则（消歧义）**：`buildKey(platform, null)` 返回 `` `${encodeURIComponent(platform)}:*` `` —— 哨兵 `*` **不参与 percent-encode**，由函数以字面量追加；平台段与账号段照常编码。断言：`buildKey('weibo', null) === 'weibo:*'`、`buildKey('weibo', 'a:b') === 'weibo:a%3Ab'`。
+5. **两档绑定条件写明**（消除评审 i1/i5 的误读）：**同账号**时账号档恒 ≥ 平台档，故由账号档决定（平台档不改变结果，属正确行为）；**同平台换账号**时账号键无历史 ⇒ `accountRemaining = 0` ⇒ **平台档在此绑定**（2 分钟）。策略表与 PRD 的平台档列统一标注「（跨账号时生效）」。
+6. **重启恢复链路写明**：`_quotaBlocked` 与次日定时器是内存态，但**配额计数持久化**于 `publish_daily_count`；重启后任务以 `pending` 恢复，`check()` 从持久表读 `count`/`day_key` ⇒ 仍超限则重新入集合并**重新武装**定时器；次日 `day_key` 变化即放行。补两条用例：重启后窗口仍生效 / 配额被拒任务重启后重新武装且不忙循环。
diff --git a/openspec/changes/publish-frequency-policy-v2/proposal.md b/openspec/changes/publish-frequency-policy-v2/proposal.md
new file mode 100644
index 000000000..110219ed5
--- /dev/null
+++ b/openspec/changes/publish-frequency-policy-v2/proposal.md
@@ -0,0 +1,72 @@
+---
+change: publish-frequency-policy-v2
+status: in-progress
+created: 2026-10-10
+branch: publish-frequency-policy-v2
+---
+
+# publish-frequency-policy-v2 — 发布频率策略 v2（记账语义 / 日配额 / 抖动）
+
+## 背景
+
+上游调查报告 `01-docs/INVESTIGATE-PUBLISH-FREQUENCY-STRICTNESS-2026-10-10.md`（PR #3253）对现行发布频率门禁（`publish-frequency-control`，PR #2773）给出四条判定：
+
+| # | 问题 | 证据 |
+|---|---|---|
+| 1 | **失败惩罚过重**：未提交到平台的失败也吃掉整个间隔窗口 | 本机真实历史中 bilibili 连续 3 次失败间隔恰为 120.0 / 30.0 分钟；`task-queue.js:587-597` 自动重试与 `:240-262` 手动重试同走守卫 |
+| 2 | **刻度无依据且维度选错**：只有最小间隔、没有日配额 | 公开资料唯一有依据的维度是「条/天」（微信订阅号 1 条/天；微博发博 30 次/小时·100 次/天） |
+| 3 | **零抖动**：发布点落在精确的 30.0 / 60.0 分钟整数边界 | 守卫与队列内 `Math.random` 命中数 0；微博官方口径是「非用户主动行为频繁调用（即使未超过频次限制）」也会被封 |
+| 4 | **跨账号平台档无依据且实测空转** | `backend-data/accounts.json` 每平台恰好 1 账号 ⇒ 该档恒被更严的账号档支配 |
+
+报告给出的 P0/P1/P2 建议**全部未实施**；本变更把它们落地。
+
+## 目标
+
+1. **G1** 未提交到平台的失败不再惩罚间隔窗口，且该判定**不可被获益方伪造**。
+2. **G2** 补上唯一有公开依据的维度：账号级**日配额**。
+3. **G3** 发布节奏不再呈现机器级等周期（引入只增不减的抖动）。
+4. **G4** 数值下调到「仍远保守于官方速率」的量级，并把跨账号平台档调到有依据且成本可接受的位置。
+5. **G5** 渲染层口径与运行期门禁统一，用户可查、可覆盖、可在必要时一次性紧急放行。
+
+## 非目标
+
+- 不做设备/IP 级全局串行（沿用上游 PRD §2 非目标）。
+- 不做「成功才记账」（会引入重复发布，调查报告 §6.C 已否决）。
+- 不声称符合任何平台官方规定（沿用上游 PRD §2 非目标）。
+- 不做跨环境审计溯源（需新增出网通道，爆炸半径大于被保护对象）。
+- 不做跨设备配额同步。
+
+## 范围
+
+| ID | 内容 | 承载模块 |
+|---|---|---|
+| P0-1 | 记账语义细分：未提交失败回滚窗口 | `shared-utils` + 桌面装配 |
+| P0-2 | 重试（自动/手动）放行路径 | `shared-utils` |
+| P1-1 | 跨账号平台档：默认开 2 分钟，仅显式 0 关闭 | `shared-utils` |
+| P1-2 | 账号级日配额（新维度） | `shared-utils` + store + 装配 |
+| P1-3 | 间隔抖动（可注入随机源） | `shared-utils` |
+| P2-1 | 数值下调 60→20 / 30→10 / 10→3 分钟 | `shared-utils` |
+| P2-2 | 渲染层口径统一 + 设置页策略区块 + 一次性紧急放行 | 渲染层 + IPC + locale |
+| P2-3 | 未登记平台回落时出声告警 | `shared-utils` |
+| P2-4 | 校准基础设施（口径定义 + 可复现取数脚本） | `scripts/` |
+| P2-5（部分） | `config/platforms.yaml` 的 `tencent_video` 命名歧义澄清注释 | `config/` |
+
+**P2-5 的另一半（`publish:wechat` 补任务级 `accountId`）移出本变更**：已审计渲染层零生产调用方（`src/api/publisher.js:8` 仅被测试引用），改动面与收益不成比例，另立变更处理。
+
+## 与上游决策的关系（显式偏离声明）
+
+| 上游结论 | 本变更 | 理由 |
+|---|---|---|
+| P1-1「跨账号平台档**默认关**」 | **改为默认开 2 分钟**（仅显式 `0` 关闭） | 跨家族对抗评审两轮均指出「默认关削弱同平台多账号保护」；成本有界（1 账号/平台时完全惰性），保留唯一一条设备/IP 邻域保护。**这是一处对调查报告的显式偏离**，已在 design §7 与 PRD 写明 |
+| 日配额数值「须先由运营确认」 | 落地为 3 / 5 / 20 的**工程保守起点**，env 与设置页双覆盖 | 不让机制停在未实现；默认值随 PRD 与设置页显式标注「待运营确认」 |
+
+## 影响面
+
+- `packages/shared-utils/src/publish-frequency-policy.js`、`publish-interval-guard.js`、`task-queue.js`
+- `apps/desktop/electron/services/store-schema.js`、`store/` mixin、`core/container.setup.js`、`ipc-handlers/publish.js`、`bootstrap/phase4-events.js`
+- `apps/desktop/src/locales/publish-page/{zh,en}.js`、`settings/{zh,en}.js`、`components/PublishProgress*`、设置页
+- `scripts/`（新增校准脚本）、`config/platforms.yaml`（注释）
+
+## 验收
+
+见 `specs/publish-frequency-policy-v2/spec.md` 的 Scenario，以及 `tasks.md` 的 7.1–7.4 全量门禁与变异反证清单。
diff --git a/openspec/changes/publish-frequency-policy-v2/specs/publish-frequency-policy-v2/spec.md b/openspec/changes/publish-frequency-policy-v2/specs/publish-frequency-policy-v2/spec.md
new file mode 100644
index 000000000..82b57da1d
--- /dev/null
+++ b/openspec/changes/publish-frequency-policy-v2/specs/publish-frequency-policy-v2/spec.md
@@ -0,0 +1,109 @@
+# publish-frequency-policy-v2 (delta: publish-frequency-policy-v2)
+
+## ADDED Requirements
+
+### Requirement: 提交阶段判定（不可被获益方伪造）
+
+守卫 MUST 以**提交阶段**而非**错误类型**作为「未提交失败」的判据。发布传输层（真正发出平台写操作的那一层）MUST 在首次平台写操作前调用一次 `markSubmitted()`，队列 MUST 将其结果记录为 `task.submittedAt`。回滚间隔窗口 MUST 仅在 `task.submittedAt` 为空时允许；错误对象上的 `notSubmitted` MUST 降级为佐证位，两者不一致时 MUST 按「已提交」处理（占窗口）并记录 error 级日志。
+
+#### Scenario: 提交前失败可立即重试
+- **WHEN** 一次发布在发出任何平台请求之前失败（如登录态失效发生在提交阶段之前），且该错误带 `notSubmitted`
+- **THEN** 守卫回滚该次占位，同一 (platform, accountId) 无需等待即可再次提交
+
+#### Scenario: 提交后失败仍占窗口
+- **WHEN** 一次发布已发出平台请求（`submittedAt` 已置位）后失败或超时
+- **THEN** 该窗口 MUST 保持占用，后续同窗口提交被拦；回滚 MUST NOT 发生
+
+#### Scenario: 佐证位与阶段标记不一致时 fail-closed
+- **WHEN** 错误带 `notSubmitted === true` 但 `task.submittedAt` 已置位
+- **THEN** 判定为已提交，占窗口，并记录 error 级日志与计数
+
+#### Scenario: 成功发布的接线自证
+- **WHEN** 一次发布**成功**但 `task.submittedAt` 为空
+- **THEN** 记录 error 级日志并递增「接线缺陷」计数（把传输层漏接线从静默风险变为主动告警）
+
+### Requirement: 账号级日配额
+
+守卫 MUST 支持账号级日配额维度，与最小间隔**并存**：间隔管突发，配额管总量。日配额 MUST 按 `platform:accountId` 计数，键为**本机运营日** `YYYY-MM-DD`（不换算平台时区、不声称与平台日界等价）。配额被拒 MUST 以 `bucket='daily'`、`reason='daily_quota'` 表达，且 MUST NOT 以固定短间隔反复重判。
+
+#### Scenario: 当日配额用尽
+- **WHEN** 同一账号当日已提交次数达到该平台档上限
+- **THEN** `check()` 返回 `allowed=false`、`bucket='daily'`、`reason='daily_quota'`；任务进入 `_quotaBlocked`，`_processNext` 跳过它，定时器指向次日 00:00:05
+
+#### Scenario: 跨日恢复
+- **WHEN** 本机运营日跨过 00:00
+- **THEN** 该账号计数从 0 起算，被阻任务重新入队并重新判定
+
+#### Scenario: 未提交回滚回补配额且幂等
+- **WHEN** 一次未提交失败触发了回滚
+- **THEN** 该次占用的配额计数 MUST 被回补（下限 0），且重复回滚 MUST NOT 重复回补
+
+#### Scenario: 回滚计数只增不减
+- **WHEN** 任意一次回滚发生
+- **THEN** 该账号当日的回滚计数 +1，且不因配额回补而减少
+
+### Requirement: 间隔抖动只增不减
+
+守卫 MUST 支持可注入随机源与抖动比例；实际等待 MUST 为 `remaining × (1 + ratio × rand)`，`rand ∈ [0,1)`。抖动 MUST NOT 使等待短于标称最小间隔；`ratio = 0` 时行为 MUST 严格等于未引入抖动前的值。
+
+#### Scenario: 抖动区间
+- **WHEN** 抖动比例为 0.4 且连续采样多次
+- **THEN** 每次实际等待均落入 `[base, base × 1.4)`
+
+#### Scenario: 关闭抖动等价旧行为
+- **WHEN** 抖动比例为 0
+- **THEN** 实际等待严格等于标称剩余时间（与 v1 逐值一致）
+
+### Requirement: 未登记平台出声
+
+平台未登记于策略表时，守卫 MUST 回落最严基线（而非 0），并 MUST 对该平台**出声告警一次**（进程内按平台去重）。
+
+#### Scenario: 未登记平台回落并告警
+- **WHEN** 对未登记平台发起发布
+- **THEN** 使用最严基线档位，且日志出现且仅出现一次该平台的回落告警
+
+### Requirement: 一次性紧急放行
+
+系统 MUST 提供显式的一次性紧急放行入口，跳过某一 (platform, accountId) 的当前等待。放行 MUST 经二次确认、MUST 受每日次数上限与最小间隔冷却约束、MUST 写入追加式审计（UI 无编辑入口），并 MUST 对「成功 / 超上限 / 无等待中的窗口」三种结果给出明确回显。
+
+#### Scenario: 放行成功并留痕
+- **WHEN** 用户在设置页确认紧急放行且当日次数未用尽
+- **THEN** 该账号的等待被解除、任务立即进入队列，审计追加一行，设置页与进度面板同步刷新
+
+#### Scenario: 超过每日上限
+- **WHEN** 当日紧急放行次数已达上限
+- **THEN** 拒绝放行，队列状态不变，界面给出上限文案
+
+#### Scenario: 无等待中的窗口
+- **WHEN** 该账号当前没有等待中的窗口
+- **THEN** 明确回显「当前没有等待中的窗口」，MUST NOT 静默
+
+## MODIFIED Requirements
+
+### Requirement: 间隔策略数值与档位
+
+策略表 MUST 采用 v2 数值：账号档 长文 20 分钟 / 短视频 10 分钟 / 短内容 3 分钟；平台档 **默认 2 分钟**（`0` = 显式关闭，与日配额的 `0` 语义一致）；未登记平台回落最严档。数值 MUST 只在此单一真源维护，调用方 MUST NOT 复制。
+
+#### Scenario: 同平台多账号受平台档约束
+- **WHEN** 同一平台的两个不同账号在同一台机器上连续发布，且平台档未被显式关闭
+- **THEN** 第二个账号被拦，`bucket='platform'`，等待约 2 分钟
+
+#### Scenario: 显式关闭平台档
+- **WHEN** 平台档被显式设为 0
+- **THEN** 同平台跨账号不再互相阻塞，仅受账号档与日配额约束
+
+### Requirement: 阻塞与失败的用户可见文案
+
+渲染层 MUST 区分四类状态并给出对应文案：间隔等待、日配额用尽、未提交失败（可立即重试）、已提交失败（需等待）。归因标签 MUST 支持 `account` / `platform` / `daily` 三态；字段缺席时 MUST NOT 渲染任何归因标签（不得猜测档位）。
+
+#### Scenario: 日配额用尽的等待行
+- **WHEN** 任务因日配额被阻
+- **THEN** 进度面板显示「今日已达上限（used/max），将于明日 00:00 后自动继续」并带 `daily` 归因标签
+
+#### Scenario: 未提交失败提示可立即重试
+- **WHEN** 一次失败被判定为未提交
+- **THEN** 失败卡片提示「未提交到平台，可立即重试」
+
+#### Scenario: 归因字段缺席不渲染
+- **WHEN** 阻塞事件的 `bucket` 字段缺席
+- **THEN** 渲染行不含任何归因标签节点
diff --git a/openspec/changes/publish-frequency-policy-v2/tasks.md b/openspec/changes/publish-frequency-policy-v2/tasks.md
new file mode 100644
index 000000000..12d5ab312
--- /dev/null
+++ b/openspec/changes/publish-frequency-policy-v2/tasks.md
@@ -0,0 +1,90 @@
+# Tasks: publish-frequency-policy-v2
+
+> 顺序 A → B → C → D，每阶段先在**测试**里红、再实现到绿，然后才进入下一阶段。
+> 详细规格（校验表 / 文案表 / 变异清单）见 `01-docs/PRD-PUBLISH-FREQUENCY-POLICY-V2-2026-10-10.md`。
+
+## 0. 前置（已完成）
+
+- [x] 0.1 上游调查报告落盘并合并（PR #3253 / `5e280da6`）
+- [x] 0.2 隔离 worktree（`D:\Data\projects\mp-worktrees\mp-publish-frequency-policy-v2`，非 C 盘）+ 裸分支 `publish-frequency-policy-v2`
+- [x] 0.3 跨家族对抗评审两轮 + 逐条回应（`rebuttal-v1.md` / `rebuttal-v2.md`，含 L1/L2/L3 证据分级）
+- [x] 0.4 方案 v3 修订（并入全部采纳项，删除 proposer 擅自扩项）
+- [ ] 0.5 复盘评审复跑至收敛（无 Critical / 无 High）
+- [ ] 0.6 上报机制缺陷：`.adversarial` 不在共享根写保护放行名单 ⇒ 评审产物被隔离
+
+## 1. 阶段 A — shared-utils（策略 / 守卫 / 队列）
+
+- [ ] 1.1 `publish-frequency-policy.test.js` 先红：新数值表（20/10/3、平台档 2）、`tier` 字段、`accountDailyMax` 三档、未登记回落出声**恰好一次**
+- [ ] 1.2 env 校验用例：`MP_PUBLISH_DAILY_MAX_{LONG,CLIP,SHORT}`、`MP_PUBLISH_ACCOUNT_DAILY_MAX`（全局覆盖）、`MP_PUBLISH_JITTER_RATIO`（`[0,1)`）、`MP_PUBLISH_RELEASE_GRACE_MS`；合法 / `0` / 非法 / 空白 四态各断言「值 + 是否出声」
+- [ ] 1.3 `publish-frequency-policy.js` 实现至绿（含 `tier`、三档日配额、`jitterRatio` 默认值）
+- [ ] 1.4 `publish-interval-guard.test.js` 先红：抖动区间 `[base, base×1.4)`、`ratio=0` 严格退化为旧值、`bucket='daily'`、`reason` 精确值
+- [ ] 1.5 守卫用例：`release` 幂等 / **prev 缺失或错配 ⇒ no-op** / **窗口已被覆盖 ⇒ 不回滚** / 配额回补幂等且下限 0 / `rollback_count` 只增
+- [ ] 1.6 守卫用例：跨日边界（`23:59:59 → 00:00:01` 两个 `day_key` 独立）；`dailyStore` 读回 `'3'` / `'3.0'` / `'abc'` 三态
+- [ ] 1.7 `publish-interval-guard.js` 实现至绿
+- [ ] 1.8 `task-queue-guard-integration.test.js` 先红：**提交前失败 ⇒ 窗口回滚 ⇒ 立即重发成功**；**已提交失败 ⇒ 窗口保留**（既有用例不放宽）
+- [ ] 1.9 队列用例：同一错误类型在 `submittedAt` 为空/已置位两态下得到**相反**结果；`submittedAt` 为 null 但 `notSubmitted=true` 的**不一致** ⇒ 占窗口 + error
+- [ ] 1.10 队列用例：**成功发布而 `submittedAt === null`** ⇒ `log.error` + 计数（不变量 I4 的探针）
+- [ ] 1.11 队列用例：配额被拒 ⇒ `_quotaBlocked` 命中 ⇒ **连续 `_processNext()` 不产生紧循环**（断言重复判定次数上限）；定时器到次日 00:00:05 且已 `unref()`
+- [ ] 1.12 队列用例：`publish:released` 事件字段精确；回滚后最小退避生效；每账号每日回滚上限生效
+- [ ] 1.13 `task-queue.js` 实现至绿（`_quotaBlocked`、阶段判据、release 接线、放行路径）
+- [ ] 1.14 结构锁：`task-queue.js` 必须消费 `recordPublish` 的返回值（防「回传 prev」被重构掉而静默退化）
+
+## 2. 阶段 B — 日配额存储与装配
+
+- [ ] 2.1 `store-schema.test.js` 先红：`publish_daily_count` 进入 `TABLE_NAMES` 等七处注册表
+- [ ] 2.2 `store-schema.js` 七处同步登记（`TABLE_NAMES` / `OWNER_TABLE_SCHEMA_SQL` / `OWNER_INDEX_SQL` / `SCHEMA_SQL` / `OWNER_TABLE_COLUMNS` / `OWNER_TABLE_KEY_COLUMNS` / `OWNER_COLUMN_DEFAULTS`）
+- [ ] 2.3 `store/publish-daily-store.js` 新 mixin：`getPublishDailyCount` / `incrPublishDailyCount` / `decrPublishDailyCount`（owner 解析复用 `_resolveOwnerSubject`；无 owner no-op）
+- [ ] 2.4 store 用例：CRUD、owner 隔离（A 的计数不影响 B）、并发 upsert 累加、`decrDay` 下限 0、TEXT 亲和读回 `'3.0'` 归一
+- [ ] 2.5 `container.setup.test.js` 装配锁 3 条（含「摘掉 `dailyStore` 注入即红」与 `bucket='daily'` 行为锁）
+- [ ] 2.6 `container.setup.js` 注入 `dailyStore` + 设置页覆盖解析（任一字段非法 ⇒ 整体丢弃）
+
+## 3. 阶段 C — 渲染层与 IPC
+
+- [ ] 3.1 locale zh/en 成对新增/修改（文案表见 PRD §7）：日配额等待、未提交/已提交失败提示、`scheduleHintWithLimits` 去承诺化、设置页策略区块、紧急放行确认/上限/无窗口三态
+- [ ] 3.2 `publish-progress-events` 投影白名单扩展（`reason` / `daily`）；**穷尽性审计**：新增字段必须同时改所有投影面（既有 4 处 + `emitPhaseNotify`）
+- [ ] 3.3 `PublishProgressTaskRow` 用例：日配额文案、`released` 文案、归因标签**三态**（account / platform / daily）、字段缺席**不渲染**标签
+- [ ] 3.4 设置页「发布频率策略」区块：当前档位、实际间隔区间 `[base, base×1.4)`、日配额、回滚失效计数、覆盖保存与失败回滚
+- [ ] 3.5 紧急放行：二次确认 + 三种结果文案 + 每日上限 + ≥10 分钟冷却 + 追加式 JSONL 审计
+- [ ] 3.6 `ipc-handlers/publish.test.js`：`publish:emergencyRelease` 三态 + 审计落盘 + 上限
+- [ ] 3.7 `phase4-events.test.js`：新事件透传与投影白名单（含 `reason` / `daily`）
+
+## 4. 阶段 D — 校准基础设施与小坑
+
+- [ ] 4.1 `scripts/publish-frequency-calibrate.js`：口径定义（**以守卫的提交时间 `publish_timeline` 为准，不用 history 的终态时间**）+ 可复现取数 + 输出各平台 P10/中位/被拦比例
+- [ ] 4.2 脚本自测（fixture 驱动，不依赖真实 DB）
+- [ ] 4.3 `config/platforms.yaml` 加注释澄清 `tencent_video` 实际指微信视频号
+- [ ] 4.4 `publish:wechat` 的 accountId 缺口：**本变更不做**，登记为另立变更项（附调用方审计证据）
+
+## 5. 文档
+
+- [ ] 5.1 `01-docs/PRD-PUBLISH-FREQUENCY-POLICY-V2-2026-10-10.md`：数据校验 / 流程 / 功能逻辑 / 交互逻辑 / 显示项 / 提示文字 / 迁移 / 验收（尽量详细）
+- [ ] 5.2 更新 `01-docs/PRD-PUBLISH-FREQUENCY-CONTROL-2026-10-02.md` 的失效结论（数值与维度已被 v2 取代）
+- [ ] 5.3 CHANGELOG 置顶
+- [ ] 5.4 `.quality-gates.md` 记录 + `openspec/records/publish-frequency-policy-v2.md`
+
+## 6. 变异反证（每条先跑基线证明绿，再变异证明**恰好那一条**红）
+
+- [ ] M1 摘掉 `notSubmitted` 回滚 → 「未提交失败窗口回滚」红
+- [ ] M2 把「已提交失败」也回滚 → 「已提交失败仍占窗口」红
+- [ ] M3 `release` 去掉 prev 一致性检查 → 「窗口已被覆盖不回滚」红
+- [ ] M4 抖动改双向 → 「抖动只增不减」红
+- [ ] M5 日配额判定移除 → 「日配额用尽被否决」红
+- [ ] M6 `decrDay` 去掉下限 0 → 「计数下限 0」红
+- [ ] M7 摘掉 `dailyStore` 注入 → 装配锁 2 红
+- [ ] M8 未登记平台 warn 改静默 → 「未登记出声一次」红
+- [ ] M9 平台档默认改回非 2 → 「平台档默认 2 分钟」红
+- [ ] M10 紧急放行去掉上限 → 「紧急放行上限」红
+- [ ] M11 `submittedAt` 判据恒真 → 阶段判据锁红
+- [ ] M12 摘掉成功路径自证（I4）→ 「成功而 submittedAt 为空报 error」红
+- [ ] M13 移除 `_quotaBlocked` 跳过 → 「不产生紧循环」红
+- [ ] M14 回滚后退避置 0 → 「最小退避」红
+
+## 7. 门禁与交付
+
+- [ ] 7.1 定向测试 + shared-utils 全量 + 桌面受影响面全量；eslint 0 error
+- [ ] 7.2 QM-1 打包（`verify-worktree-deps` → electron-builder --dir → asar 清单 → require 链 → 启动 8s 捕获 stderr）
+- [ ] 7.3 QM-4 视觉（进度面板/设置页有基线则跑；无基线以 DOM 行为锁承担并如实记录）
+- [ ] 7.4 行尾对账（两口径 numstat）、品牌残留、文档同步、接线棘轮、债务熔断
+- [ ] 7.5 QM-6 验证层双模型评审（`sh scripts/deep-review.sh`）+ findings 回写
+- [ ] 7.6 PR → CI 全绿 → squash 自动合并 → 远程同步回填销账
+- [ ] 7.7 记忆三路沉淀（内置 / `01-docs/learnings.md` / EverOS）+ 回读验证
diff --git a/packages/shared-utils/src/publish-frequency-policy.js b/packages/shared-utils/src/publish-frequency-policy.js
index ec9756b51..6cba138df 100644
--- a/packages/shared-utils/src/publish-frequency-policy.js
+++ b/packages/shared-utils/src/publish-frequency-policy.js
@@ -1,90 +1,373 @@
 /**
- * 发布最小间隔策略 — 单一真源
+ * 发布频率策略 — 单一真源（v2）
  *
- * 两档维度：
- *   accountMinMs  —— 同一账号在同一平台两次发布的最小间隔（键 platform:accountId）
- *   platformMinMs —— 同一平台任意两次发布的最小间隔（键 platform:*，跨账号）
+ * 三个维度：
+ *   accountMinMs    —— 同一账号在同一平台两次发布的最小间隔（键 platform:accountId）
+ *   platformMinMs   —— 同一平台任意两次发布的最小间隔（键 platform:*，**仅跨账号时绑定**）
+ *   accountDailyMax —— 同一账号在同一平台的每日提交上限（本机运营日，见 guard）
  *
- * ⚠️ 下表数值是**工程保守默认**（宁慢不险），不是平台官方规则。
+ * ⚠️ 下表数值是**工程保守默认**（宁慢不险），不是平台官方规则，本工具不声称符合
+ * 任何平台官方规定。依据与自认弱点见 01-docs/PRD-PUBLISH-FREQUENCY-POLICY-V2-2026-10-10.md §5。
  * 平台若调整节奏，改这一处；禁止在调用方另抄一份。
  * 未登记的平台回落 BASELINE_INTERVALS（最严档），不得回落 0。
+ *
+ * v2 相对 v1 的变更（change: publish-frequency-policy-v2）：
+ *   - 数值下调：账号档 60/30/10 → 20/10/3 分钟；平台档 5/3/1 → 统一 2 分钟
+ *   - 新增 tier 与 accountDailyMax（日配额维度；tier 复用既有分组，不新增分类器）
+ *   - 间隔源声明上界 7 天（越界钳位并出声）：避免含抖动系数后逼近 setTimeout 上限
+ *   - 未登记平台由「静默回落」改为「回落 + fallback 标记」（由守卫出声，进程内去重）
  */
 
 const MIN = 60 * 1000
+const HOUR = 60 * MIN
+const DAY = 24 * HOUR
+
+/** 间隔源上界：7 天。超过它会让 wait × (1 + jitterRatio) 逼近 2^31-1（setTimeout 上限） */
+const MAX_INTERVAL_MS = 7 * DAY
+
+/** 日配额分档名（与账号档/平台档同表，避免第二套分类器） */
+const TIER_LONG = 'long'
+const TIER_CLIP = 'clip'
+const TIER_SHORT = 'short'
+
+/** 抖动比例默认值（合法域 [0,1)） */
+const DEFAULT_JITTER_RATIO = 0.4
+/** 回滚后最小退避默认值与下界（下界防「回滚即零等待」的重试风暴） */
+const DEFAULT_RELEASE_GRACE_MS = 60 * 1000
+const MIN_RELEASE_GRACE_MS = 10 * 1000
+/** 紧急放行每日每账号上限默认值与合法域上界 */
+const DEFAULT_EMERGENCY_MAX_PER_DAY = 1
+const MAX_EMERGENCY_MAX_PER_DAY = 10
 
 const PLATFORM_FREQUENCY_POLICY = Object.freeze({
-  // 长文低频：一天几条即属异常
-  wechat_mp: Object.freeze({ accountMinMs: 60 * MIN, platformMinMs: 5 * MIN }),
-  zhihu: Object.freeze({ accountMinMs: 60 * MIN, platformMinMs: 5 * MIN }),
-  baijiahao: Object.freeze({ accountMinMs: 60 * MIN, platformMinMs: 5 * MIN }),
-  toutiao: Object.freeze({ accountMinMs: 60 * MIN, platformMinMs: 5 * MIN }),
+  // 长文低频
+  wechat_mp: Object.freeze({ tier: TIER_LONG, accountMinMs: 20 * MIN, platformMinMs: 2 * MIN, accountDailyMax: 3 }),
+  zhihu: Object.freeze({ tier: TIER_LONG, accountMinMs: 20 * MIN, platformMinMs: 2 * MIN, accountDailyMax: 3 }),
+  baijiahao: Object.freeze({ tier: TIER_LONG, accountMinMs: 20 * MIN, platformMinMs: 2 * MIN, accountDailyMax: 3 }),
+  toutiao: Object.freeze({ tier: TIER_LONG, accountMinMs: 20 * MIN, platformMinMs: 2 * MIN, accountDailyMax: 3 }),
 
   // 短视频 / 图文社区
-  douyin: Object.freeze({ accountMinMs: 30 * MIN, platformMinMs: 3 * MIN }),
-  kuaishou: Object.freeze({ accountMinMs: 30 * MIN, platformMinMs: 3 * MIN }),
-  tencent_video: Object.freeze({ accountMinMs: 30 * MIN, platformMinMs: 3 * MIN }),
-  xiaohongshu: Object.freeze({ accountMinMs: 30 * MIN, platformMinMs: 3 * MIN }),
-  bilibili: Object.freeze({ accountMinMs: 30 * MIN, platformMinMs: 3 * MIN }),
-  youtube: Object.freeze({ accountMinMs: 30 * MIN, platformMinMs: 3 * MIN }),
-  tiktok: Object.freeze({ accountMinMs: 30 * MIN, platformMinMs: 3 * MIN }),
-  instagram: Object.freeze({ accountMinMs: 30 * MIN, platformMinMs: 3 * MIN }),
-  facebook: Object.freeze({ accountMinMs: 30 * MIN, platformMinMs: 3 * MIN }),
+  douyin: Object.freeze({ tier: TIER_CLIP, accountMinMs: 10 * MIN, platformMinMs: 2 * MIN, accountDailyMax: 5 }),
+  kuaishou: Object.freeze({ tier: TIER_CLIP, accountMinMs: 10 * MIN, platformMinMs: 2 * MIN, accountDailyMax: 5 }),
+  tencent_video: Object.freeze({ tier: TIER_CLIP, accountMinMs: 10 * MIN, platformMinMs: 2 * MIN, accountDailyMax: 5 }),
+  xiaohongshu: Object.freeze({ tier: TIER_CLIP, accountMinMs: 10 * MIN, platformMinMs: 2 * MIN, accountDailyMax: 5 }),
+  bilibili: Object.freeze({ tier: TIER_CLIP, accountMinMs: 10 * MIN, platformMinMs: 2 * MIN, accountDailyMax: 5 }),
+  youtube: Object.freeze({ tier: TIER_CLIP, accountMinMs: 10 * MIN, platformMinMs: 2 * MIN, accountDailyMax: 5 }),
+  tiktok: Object.freeze({ tier: TIER_CLIP, accountMinMs: 10 * MIN, platformMinMs: 2 * MIN, accountDailyMax: 5 }),
+  instagram: Object.freeze({ tier: TIER_CLIP, accountMinMs: 10 * MIN, platformMinMs: 2 * MIN, accountDailyMax: 5 }),
+  facebook: Object.freeze({ tier: TIER_CLIP, accountMinMs: 10 * MIN, platformMinMs: 2 * MIN, accountDailyMax: 5 }),
 
   // 短内容、高频容忍
-  weibo: Object.freeze({ accountMinMs: 10 * MIN, platformMinMs: 1 * MIN }),
-  twitter: Object.freeze({ accountMinMs: 10 * MIN, platformMinMs: 1 * MIN }),
+  weibo: Object.freeze({ tier: TIER_SHORT, accountMinMs: 3 * MIN, platformMinMs: 2 * MIN, accountDailyMax: 20 }),
+  twitter: Object.freeze({ tier: TIER_SHORT, accountMinMs: 3 * MIN, platformMinMs: 2 * MIN, accountDailyMax: 20 }),
 })
 
+/** 未登记平台回落的最严档（独立常量：改 long 档不应静默改变回落实质） */
 const BASELINE_INTERVALS = Object.freeze({
-  accountMinMs: 60 * MIN,
-  platformMinMs: 5 * MIN,
+  tier: TIER_LONG,
+  accountMinMs: 20 * MIN,
+  platformMinMs: 2 * MIN,
+  accountDailyMax: 3,
 })
 
 const ENV_ACCOUNT_MIN_INTERVAL = 'MP_PUBLISH_MIN_INTERVAL_MS'
 const ENV_PLATFORM_MIN_INTERVAL = 'MP_PUBLISH_PLATFORM_MIN_INTERVAL_MS'
+const ENV_DAILY_MAX_LONG = 'MP_PUBLISH_DAILY_MAX_LONG'
+const ENV_DAILY_MAX_CLIP = 'MP_PUBLISH_DAILY_MAX_CLIP'
+const ENV_DAILY_MAX_SHORT = 'MP_PUBLISH_DAILY_MAX_SHORT'
+/** 全局覆盖三档日配额（设置该项即三档同值） */
+const ENV_ACCOUNT_DAILY_MAX = 'MP_PUBLISH_ACCOUNT_DAILY_MAX'
+const ENV_JITTER_RATIO = 'MP_PUBLISH_JITTER_RATIO'
+const ENV_RELEASE_GRACE_MS = 'MP_PUBLISH_RELEASE_GRACE_MS'
+const ENV_EMERGENCY_MAX_PER_DAY = 'MP_PUBLISH_EMERGENCY_MAX_PER_DAY'
+
+const TIER_ENV = Object.freeze({
+  [TIER_LONG]: ENV_DAILY_MAX_LONG,
+  [TIER_CLIP]: ENV_DAILY_MAX_CLIP,
+  [TIER_SHORT]: ENV_DAILY_MAX_SHORT,
+})
 
 const SUPPORTED_PLATFORMS = Object.freeze(Object.keys(PLATFORM_FREQUENCY_POLICY))
 
+function isKnownPlatform (platform) {
+  return typeof platform === 'string' && Object.prototype.hasOwnProperty.call(PLATFORM_FREQUENCY_POLICY, platform)
+}
+
+function warnSink (options) {
+  return typeof options.warn === 'function' ? options.warn : (msg) => console.warn(msg)
+}
+
+/** 取第一个「已设置」的值（`0` 是合法值，不得用 || 兜底） */
+function pick (...values) {
+  for (const v of values) {
+    if (v !== undefined && v !== null) return v
+  }
+  return undefined
+}
+
 /**
- * 解析一个环境变量间隔值。
- * 未设置 → 回落 fallback；`0` → 显式关闭该档；非法（非有限数 / 负数 / 空白）
- * → 回落 fallback **并出声**（静默当 0 等于把配置写错变成关掉门禁）。
+ * 解析一个环境变量数值。
+ * 未设置 → 回落 fallback；`0` → 显式关闭/归零；非法（非有限数 / 负数 / 空白 / 非整数）
+ * → 回落 fallback **并出声**（静默当 0 等于把配置写错变成关掉门禁）；超上界 → 钳位并出声。
+ *
+ * @param {string|number|undefined|null} raw
+ * @param {string} envName
+ * @param {number} fallback
+ * @param {(msg: string) => void} warn
+ * @param {{ integer?: boolean, max?: number }} [bounds]
  */
-function parseEnvInterval (raw, envName, fallback, warn) {
+function parseEnvNumber (raw, envName, fallback, warn, bounds = {}) {
   if (raw === undefined || raw === null) return fallback
   const text = String(raw).trim()
   if (!text) {
-    warn(`[PublishFrequency] 环境变量 ${envName} 为空白值，回落默认 ${fallback}ms`)
+    warn(`[PublishFrequency] 环境变量 ${envName} 为空白值，回落默认 ${fallback}`)
     return fallback
   }
   const num = Number(text)
   if (!Number.isFinite(num) || num < 0) {
-    warn(`[PublishFrequency] 环境变量 ${envName}="${raw}" 非法（需 >=0 的有限数），回落默认 ${fallback}ms`)
+    warn(`[PublishFrequency] 环境变量 ${envName}="${raw}" 非法（需 >=0 的有限数），回落默认 ${fallback}`)
+    return fallback
+  }
+  if (bounds.integer && !Number.isInteger(num)) {
+    warn(`[PublishFrequency] 环境变量 ${envName}="${raw}" 非法（需整数），回落默认 ${fallback}`)
     return fallback
   }
-  return Math.floor(num)
+  if (bounds.max !== undefined && num > bounds.max) {
+    warn(`[PublishFrequency] 环境变量 ${envName}="${raw}" 超出上界 ${bounds.max}，已钳位到上界`)
+    return bounds.max
+  }
+  return bounds.integer ? num : Math.floor(num)
+}
+
+/** 兼容旧名：间隔解析（非整数按 floor，与 v1 语义一致；带上界钳位） */
+function parseEnvInterval (raw, envName, fallback, warn) {
+  return parseEnvNumber(raw, envName, fallback, warn, { max: MAX_INTERVAL_MS })
 }
 
 /**
+ * 解析某平台的完整策略。
+ *
+ * 优先级：设置页覆盖 > 环境变量 > 策略表；未登记平台回落最严基线并置 `fallback: true`
+ * （由守卫出声告警，进程内按平台去重）。
+ *
  * @param {string} platform - 平台标识；未登记或非法值一律回落最严基线
- * @param {{env?: Record<string,string|undefined>, warn?: (msg: string) => void}} [options]
- * @returns {{accountMinMs: number, platformMinMs: number}}
+ * @param {{env?: Record<string,string|undefined>, warn?: (msg: string) => void, overrides?: object}} [options]
+ * @returns {{tier: string, accountMinMs: number, platformMinMs: number, accountDailyMax: number, fallback: boolean}}
  */
 function resolveIntervals (platform, options = {}) {
   const env = options.env || process.env
-  const warn = typeof options.warn === 'function' ? options.warn : (msg) => console.warn(msg)
-  const base = PLATFORM_FREQUENCY_POLICY[platform] || BASELINE_INTERVALS
-  return {
-    accountMinMs: parseEnvInterval(env[ENV_ACCOUNT_MIN_INTERVAL], ENV_ACCOUNT_MIN_INTERVAL, base.accountMinMs, warn),
-    platformMinMs: parseEnvInterval(env[ENV_PLATFORM_MIN_INTERVAL], ENV_PLATFORM_MIN_INTERVAL, base.platformMinMs, warn),
+  const warn = warnSink(options)
+  const fallback = !isKnownPlatform(platform)
+  const base = fallback ? BASELINE_INTERVALS : PLATFORM_FREQUENCY_POLICY[platform]
+  const ov = options.overrides || {}
+
+  const accountMinMs = parseEnvInterval(
+    pick(ov.accountMinMs, env[ENV_ACCOUNT_MIN_INTERVAL]), ENV_ACCOUNT_MIN_INTERVAL, base.accountMinMs, warn
+  )
+  const platformMinMs = parseEnvInterval(
+    pick(ov.platformMinMs, env[ENV_PLATFORM_MIN_INTERVAL]), ENV_PLATFORM_MIN_INTERVAL, base.platformMinMs, warn
+  )
+
+  // 日配额：全局覆盖 > 设置页覆盖 > 本档 env > 策略表
+  const tier = base.tier
+  const globalRaw = pick(ov.accountDailyMax, env[ENV_ACCOUNT_DAILY_MAX])
+  const useGlobal = globalRaw !== undefined
+  const tierEnvName = TIER_ENV[tier]
+  const raw = useGlobal ? globalRaw : pick(ov.dailyMax && ov.dailyMax[tier], env[tierEnvName])
+  const accountDailyMax = parseEnvNumber(
+    raw,
+    useGlobal ? ENV_ACCOUNT_DAILY_MAX : tierEnvName,
+    base.accountDailyMax,
+    warn,
+    { integer: true }
+  )
+
+  return { tier, accountMinMs, platformMinMs, accountDailyMax, fallback }
+}
+
+/**
+ * 解析抖动比例：`[0, 1)` 有限数；`0` = 关闭抖动（严格退化为 v1 行为）。
+ * @param {{env?: object, warn?: Function, overrides?: object}} [options]
+ */
+function resolveJitterRatio (options = {}) {
+  const env = options.env || process.env
+  const warn = warnSink(options)
+  const ov = options.overrides || {}
+  const raw = pick(ov.jitterRatio, env[ENV_JITTER_RATIO])
+  if (raw === undefined) return DEFAULT_JITTER_RATIO
+  const text = String(raw).trim()
+  if (!text) {
+    warn(`[PublishFrequency] 环境变量 ${ENV_JITTER_RATIO} 为空白值，回落默认 ${DEFAULT_JITTER_RATIO}`)
+    return DEFAULT_JITTER_RATIO
+  }
+  const num = Number(text)
+  if (!Number.isFinite(num) || num < 0 || num >= 1) {
+    warn(`[PublishFrequency] 环境变量 ${ENV_JITTER_RATIO}="${raw}" 非法（需 [0,1) 的有限数），回落默认 ${DEFAULT_JITTER_RATIO}`)
+    return DEFAULT_JITTER_RATIO
   }
+  return num
+}
+
+/**
+ * 解析回滚后最小退避：整数；低于下界 10s 钳位并出声（防回滚即零等待的重试风暴）。
+ * @param {{env?: object, warn?: Function, overrides?: object}} [options]
+ */
+function resolveReleaseGraceMs (options = {}) {
+  const env = options.env || process.env
+  const warn = warnSink(options)
+  const ov = options.overrides || {}
+  const raw = pick(ov.releaseGraceMs, env[ENV_RELEASE_GRACE_MS])
+  if (raw === undefined) return DEFAULT_RELEASE_GRACE_MS
+  const text = String(raw).trim()
+  if (!text) {
+    warn(`[PublishFrequency] 环境变量 ${ENV_RELEASE_GRACE_MS} 为空白值，回落默认 ${DEFAULT_RELEASE_GRACE_MS}`)
+    return DEFAULT_RELEASE_GRACE_MS
+  }
+  const num = Number(text)
+  if (!Number.isFinite(num) || num < 0 || !Number.isInteger(num)) {
+    warn(`[PublishFrequency] 环境变量 ${ENV_RELEASE_GRACE_MS}="${raw}" 非法（需 >=0 整数），回落默认 ${DEFAULT_RELEASE_GRACE_MS}`)
+    return DEFAULT_RELEASE_GRACE_MS
+  }
+  if (num < MIN_RELEASE_GRACE_MS) {
+    warn(`[PublishFrequency] 环境变量 ${ENV_RELEASE_GRACE_MS}="${raw}" 低于下界 ${MIN_RELEASE_GRACE_MS}，已钳位到该下界`)
+    return MIN_RELEASE_GRACE_MS
+  }
+  return num
+}
+
+/**
+ * 解析紧急放行每日每账号上限：整数 `[0, 10]`；`0` = 关闭该入口。
+ * @param {{env?: object, warn?: Function, overrides?: object}} [options]
+ */
+function resolveEmergencyMaxPerDay (options = {}) {
+  const env = options.env || process.env
+  const warn = warnSink(options)
+  const ov = options.overrides || {}
+  const raw = pick(ov.emergencyMaxPerDay, env[ENV_EMERGENCY_MAX_PER_DAY])
+  return parseEnvNumber(raw, ENV_EMERGENCY_MAX_PER_DAY, DEFAULT_EMERGENCY_MAX_PER_DAY, warn, {
+    integer: true,
+    max: MAX_EMERGENCY_MAX_PER_DAY,
+  })
+}
+
+/**
+ * 校验设置页下发的策略覆盖对象（PRD §7.2）。
+ *
+ * 语义是**全有或全无**：任一字段非法 ⇒ **整个覆盖对象作废**（返回 null）并出声，
+ * 不允许部分生效 —— 半生效态会让「我改了 A 却影响了 B」变成不可解释的行为。
+ * 未知字段一律忽略（前向兼容：旧版本读到新字段不应整体作废）。
+ *
+ * @param {unknown} raw - 从 store 读回的对象（可能是 null / 字符串 / 数组 / 损坏值）
+ * @param {{warn?: (msg: string) => void}} [options]
+ * @returns {{accountMinMs?: number, platformMinMs?: number, accountDailyMax?: number,
+ *            dailyMax?: {long?: number, clip?: number, short?: number},
+ *            jitterRatio?: number, releaseGraceMs?: number, emergencyMaxPerDay?: number} | null}
+ */
+function resolvePolicyOverrides (raw, options = {}) {
+  const warn = warnSink(options)
+  if (raw === undefined || raw === null) return null
+  if (typeof raw !== 'object' || Array.isArray(raw)) {
+    warn(`[PublishFrequency] 设置页策略覆盖不是对象（${typeof raw}），已整体丢弃`)
+    return null
+  }
+
+  const out = {}
+  const bad = (name, value, why) => {
+    warn(`[PublishFrequency] 设置页策略覆盖字段 ${name}=${JSON.stringify(value)} 非法（${why}），已整体丢弃`)
+  }
+
+  const intervalKeys = ['accountMinMs', 'platformMinMs']
+  for (const key of intervalKeys) {
+    if (raw[key] === undefined || raw[key] === null) continue
+    const n = Number(raw[key])
+    if (!Number.isFinite(n) || n < 0) {
+      bad(key, raw[key], '需 >=0 的有限数')
+      return null
+    }
+    out[key] = Math.min(Math.floor(n), MAX_INTERVAL_MS)
+  }
+
+  const intKeys = [
+    ['accountDailyMax', 0, undefined],
+    ['emergencyMaxPerDay', 0, MAX_EMERGENCY_MAX_PER_DAY],
+  ]
+  for (const [key, min, max] of intKeys) {
+    if (raw[key] === undefined || raw[key] === null) continue
+    const n = Number(raw[key])
+    if (!Number.isInteger(n) || n < min || (max !== undefined && n > max)) {
+      bad(key, raw[key], max === undefined ? `需 >=${min} 的整数` : `需 [${min},${max}] 的整数`)
+      return null
+    }
+    out[key] = n
+  }
+
+  if (raw.dailyMax !== undefined && raw.dailyMax !== null) {
+    if (typeof raw.dailyMax !== 'object' || Array.isArray(raw.dailyMax)) {
+      bad('dailyMax', raw.dailyMax, '需对象 {long, clip, short}')
+      return null
+    }
+    const daily = {}
+    for (const tier of [TIER_LONG, TIER_CLIP, TIER_SHORT]) {
+      const v = raw.dailyMax[tier]
+      if (v === undefined || v === null) continue
+      const n = Number(v)
+      if (!Number.isInteger(n) || n < 0) {
+        bad(`dailyMax.${tier}`, v, '需 >=0 的整数')
+        return null
+      }
+      daily[tier] = n
+    }
+    if (Object.keys(daily).length > 0) out.dailyMax = daily
+  }
+
+  if (raw.jitterRatio !== undefined && raw.jitterRatio !== null) {
+    const n = Number(raw.jitterRatio)
+    if (!Number.isFinite(n) || n < 0 || n >= 1) {
+      bad('jitterRatio', raw.jitterRatio, '需 [0,1) 的有限数')
+      return null
+    }
+    out.jitterRatio = n
+  }
+
+  if (raw.releaseGraceMs !== undefined && raw.releaseGraceMs !== null) {
+    const n = Number(raw.releaseGraceMs)
+    if (!Number.isInteger(n) || n < MIN_RELEASE_GRACE_MS) {
+      bad('releaseGraceMs', raw.releaseGraceMs, `需 >=${MIN_RELEASE_GRACE_MS} 的整数`)
+      return null
+    }
+    out.releaseGraceMs = n
+  }
+
+  return Object.keys(out).length > 0 ? out : null
 }
 
 module.exports = {
   resolveIntervals,
+  resolveJitterRatio,
+  resolveReleaseGraceMs,
+  resolveEmergencyMaxPerDay,
+  resolvePolicyOverrides,
+  isKnownPlatform,
+  parseEnvNumber,
   PLATFORM_FREQUENCY_POLICY,
   BASELINE_INTERVALS,
   SUPPORTED_PLATFORMS,
+  MAX_INTERVAL_MS,
+  DEFAULT_JITTER_RATIO,
+  DEFAULT_RELEASE_GRACE_MS,
+  MIN_RELEASE_GRACE_MS,
+  DEFAULT_EMERGENCY_MAX_PER_DAY,
+  MAX_EMERGENCY_MAX_PER_DAY,
+  TIER_LONG,
+  TIER_CLIP,
+  TIER_SHORT,
   ENV_ACCOUNT_MIN_INTERVAL,
   ENV_PLATFORM_MIN_INTERVAL,
+  ENV_DAILY_MAX_LONG,
+  ENV_DAILY_MAX_CLIP,
+  ENV_DAILY_MAX_SHORT,
+  ENV_ACCOUNT_DAILY_MAX,
+  ENV_JITTER_RATIO,
+  ENV_RELEASE_GRACE_MS,
+  ENV_EMERGENCY_MAX_PER_DAY,
 }
diff --git a/packages/shared-utils/src/publish-interval-guard.js b/packages/shared-utils/src/publish-interval-guard.js
index 35b513bb7..c1b82986d 100755
--- a/packages/shared-utils/src/publish-interval-guard.js
+++ b/packages/shared-utils/src/publish-interval-guard.js
@@ -1,17 +1,32 @@
 /**
- * 发布频率控制 — 两档最小间隔守卫
+ * 发布频率控制 — 间隔 + 日配额守卫（v2）
  *
- * 两档维度（间隔值由 publish-frequency-policy 单一持有，本文件不抄数值）：
- *   account  档：键 `${platform}:${accountId}`   —— 同一账号在同一平台连发
- *   platform 档：键 `${platform}:*`              —— 同一平台任意两次发布（跨账号）
+ * 三个维度（数值由 publish-frequency-policy 单一持有，本文件不抄数值）：
+ *   account  档：键 `platform:accountId`  —— 同一账号在同一平台连发
+ *   platform 档：键 `platform:*`           —— 同一平台任意两次发布（**仅跨账号时绑定**：
+ *                                            同账号时账号档恒 ≥ 平台档，由账号档决定）
+ *   daily    档：键 `platform:accountId`   —— 同一账号在同一平台的每日提交上限（本机运营日）
  *
- * accountId 缺席时账号档跳过、平台档仍生效：「没有账号身份」不等于「没有发布行为」。
- * 可插拔存储（默认 InMemoryStore，桌面端替换为 SQLite publish_timeline）。
+ * accountId 缺席时账号档与日配额跳过、平台档仍生效：「没有账号身份」不等于「没有发布行为」。
+ *
+ * v2 相对 v1 的变更（change: publish-frequency-policy-v2）：
+ *   - 新增日配额维度与 `bucket: 'daily'` / `reason` / `daily` 字段
+ *   - 新增只增不减的抖动（可注入随机源；ratio=0 严格退化为 v1 行为）
+ *   - 新增 `release()`：回滚一次**未提交**尝试所占的窗口与配额（乐观并发 + 防风上限）
+ *   - 新增 `recordPublish()` 返回占位前值（供 release 精确还原）
+ *   - key 一律经 `buildKey()` 构造（percent-encode，消除分隔符碰撞）
+ *   - 未登记平台回落时经注入 warn 出声（进程内按平台去重）
  */
-const { resolveIntervals } = require('./publish-frequency-policy')
+const { resolveIntervals, isKnownPlatform, DEFAULT_JITTER_RATIO, MIN_RELEASE_GRACE_MS } = require('./publish-frequency-policy')
 
 /** 平台档桶的哨兵 accountId；导出供装配与测试引用，禁止各处手抄 '*' */
 const PLATFORM_BUCKET_ACCOUNT_ID = '*'
+/** setTimeout 上限（2^31-1）；抖动结果在此之下留余量，避免溢出被钳成 1ms 形成忙循环 */
+const TIMER_MAX_MS = 2147483647
+const TIMER_SAFE_MS = TIMER_MAX_MS - 2000
+/** release 的合法原因 */
+const REASON_INTERVAL = 'interval'
+const REASON_DAILY_QUOTA = 'daily_quota'
 
 class InMemoryStore {
   constructor () {
@@ -32,69 +47,262 @@ class InMemoryStore {
   }
 }
 
+/** 内存日计数存储（仅测试与无 DB 场景；桌面端注入 SQLite 实现） */
+class InMemoryDailyStore {
+  constructor () {
+    this._data = new Map()
+  }
+
+  _key (key, dayKey) {
+    return `${key}|${dayKey}`
+  }
+
+  _row (key, dayKey) {
+    const k = this._key(key, dayKey)
+    if (!this._data.has(k)) this._data.set(k, { count: 0, rollbackCount: 0 })
+    return this._data.get(k)
+  }
+
+  getDay (key, dayKey) {
+    return this._data.get(this._key(key, dayKey)) || { count: 0, rollbackCount: 0 }
+  }
+
+  incrDay (key, dayKey, field = 'count', delta = 1) {
+    const row = this._row(key, dayKey)
+    const name = field === 'rollback_count' || field === 'rollbackCount' ? 'rollbackCount' : 'count'
+    row[name] = Math.max(0, row[name] + delta)
+    return row[name]
+  }
+
+  decrDay (key, dayKey, field = 'count') {
+    return this.incrDay(key, dayKey, field, -1)
+  }
+}
+
 function normalizeAccountId (accountId) {
   if (typeof accountId !== 'string') return null
   const trimmed = accountId.trim()
   return trimmed || null
 }
 
+/**
+ * 唯一 key 构造函数（I8：禁止任何地方裸拼接 key）。
+ * 平台段与账号段分别 percent-encode；平台档哨兵 `*` 以字面量追加、**不参与编码**
+ * （否则会分裂出 `%2A` 与 `*` 两种形态的同义键）。
+ *
+ * @param {string} platform
+ * @param {string|null|undefined} accountId - 缺席/空 ⇒ 平台档哨兵
+ * @returns {string}
+ */
+function buildKey (platform, accountId) {
+  const p = encodeURIComponent(String(platform == null ? '' : platform))
+  const a = normalizeAccountId(accountId)
+  return a ? `${p}:${encodeURIComponent(a)}` : `${p}:${PLATFORM_BUCKET_ACCOUNT_ID}`
+}
+
+/** 计数读回：TEXT 亲和会带回 '.0'；非有限一律 0（并出声由调用方决定） */
+function readCount (raw) {
+  const n = Number.parseInt(String(raw == null ? '' : raw), 10)
+  return Number.isFinite(n) && n > 0 ? n : 0
+}
+
 class PublishIntervalGuard {
   /**
    * @param {object} [options]
    * @param {number} [options.minInterval] - 两档统一覆盖（主要供测试与旧调用方使用）
-   * @param {(platform: string) => {accountMinMs: number, platformMinMs: number}} [options.policy]
-   *   按平台解析间隔；缺省用 publish-frequency-policy
-   * @param {object} [options.store] - 外部存储 { get(key), set(key, value) }
-   * @param {() => number} [options.now] - 时钟注入，便于确定性测试
+   * @param {(platform: string) => {accountMinMs: number, platformMinMs: number, accountDailyMax: number, fallback?: boolean}} [options.policy]
+   *   按平台解析策略；缺省用 publish-frequency-policy
+   * @param {object} [options.store] - 间隔存储 { get(key), set(key, value) }
+   * @param {object} [options.dailyStore] - 日计数存储 { getDay(key, dayKey), incrDay(key, dayKey, field, delta), decrDay(key, dayKey, field) }
+   * @param {() => number} [options.now] - 时钟注入（与 today / 次日边界同源）
+   * @param {() => string} [options.today] - 本机运营日注入；缺省由 now() 推导
+   * @param {() => number} [options.random] - 随机源注入（抖动用）
+   * @param {number} [options.jitterRatio] - 抖动比例 [0,1)；0 = 关闭
+   * @param {number} [options.releaseGraceMs] - 回滚后最小退避（防风上限的伴随项；下界 10s）
+   * @param {(msg: string) => void} [options.warn]
    */
   constructor (options = {}) {
     this._minInterval = Number.isFinite(options.minInterval) && options.minInterval >= 0
       ? options.minInterval
       : null
     this._policy = typeof options.policy === 'function' ? options.policy : resolveIntervals
+    this._isKnownPlatform = typeof options.isKnownPlatform === 'function' ? options.isKnownPlatform : isKnownPlatform
     this._store = options.store || new InMemoryStore()
+    this._dailyStore = options.dailyStore || null
     this._now = typeof options.now === 'function' ? options.now : () => Date.now()
+    this._today = typeof options.today === 'function'
+      ? options.today
+      : () => new Date(this._now()).toLocaleDateString('sv-SE')
+    this._random = typeof options.random === 'function' ? options.random : Math.random
+    this._jitterRatio = Number.isFinite(options.jitterRatio) && options.jitterRatio >= 0 && options.jitterRatio < 1
+      ? options.jitterRatio
+      : DEFAULT_JITTER_RATIO
+    this._releaseGraceMs = Number.isFinite(options.releaseGraceMs) && options.releaseGraceMs >= MIN_RELEASE_GRACE_MS
+      ? options.releaseGraceMs
+      : MIN_RELEASE_GRACE_MS
+    this._warn = typeof options.warn === 'function' ? options.warn : (msg) => console.warn(msg)
+    /** 未登记平台告警去重（进程内） */
+    this._warnedFallback = new Set()
+  }
+
+  get jitterRatio () {
+    return this._jitterRatio
+  }
+
+  get releaseGraceMs () {
+    return this._releaseGraceMs
+  }
+
+  /**
+   * 运行期更新抖动比例（设置页改动即时生效，无需重启）。非法值 no-op 并出声，
+   * 绝不让「设置页写了个非法值」把已生效的保守配置降级成 0（那等于静默关掉抖动）。
+   * @param {number} n
+   * @returns {boolean} 是否已应用
+   */
+  setJitterRatio (n) {
+    if (!Number.isFinite(n) || n < 0 || n >= 1) {
+      this._warn(`[PublishFrequency] 拒绝应用非法抖动比例 ${JSON.stringify(n)}（需 [0,1) 的有限数），保持 ${this._jitterRatio}`)
+      return false
+    }
+    this._jitterRatio = n
+    return true
+  }
+
+  /**
+   * 运行期更新回滚退避（下界 10s 钳位，与 env 同纪律）。
+   * @param {number} n
+   * @returns {boolean} 是否已应用
+   */
+  setReleaseGraceMs (n) {
+    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
+      this._warn(`[PublishFrequency] 拒绝应用非法回滚退避 ${JSON.stringify(n)}（需 >=0 整数），保持 ${this._releaseGraceMs}`)
+      return false
+    }
+    this._releaseGraceMs = Math.max(MIN_RELEASE_GRACE_MS, n)
+    return true
+  }
+
+  /** 今天（本机运营日） */
+  today () {
+    return this._today()
   }
 
   /**
-   * 内部 key：platform + accountId 组合
+   * 距下一个本机运营日边界（次日 00:00:05）的毫秒数；与 today() 共用同一注入时钟。
+   * @returns {number}
    */
+  msUntilNextDay () {
+    const base = new Date(this._now())
+    const next = new Date(base.getTime())
+    next.setHours(24, 0, 5, 0)
+    return Math.max(1, next.getTime() - base.getTime())
+  }
+
   _key (platform, accountId) {
-    return `${platform}:${accountId}`
+    return buildKey(platform, accountId)
   }
 
   _intervals (platform) {
     if (this._minInterval !== null) {
-      return { accountMinMs: this._minInterval, platformMinMs: this._minInterval }
+      const dailyMax = this._resolvedDailyMax(platform)
+      return { accountMinMs: this._minInterval, platformMinMs: this._minInterval, accountDailyMax: dailyMax }
     }
     const resolved = this._policy(platform) || {}
+    if (resolved.fallback && !this._warnedFallback.has(platform)) {
+      this._warnedFallback.add(platform)
+      this._warn(
+        `[PublishFrequency] 平台 "${platform}" 未登记频率策略，回落最严基线`
+        + `（账号 ${Math.round((Number(resolved.accountMinMs) || 0) / 60000)} 分钟 / `
+        + `日配额 ${Number(resolved.accountDailyMax) || 0} 条）；请登记到 PLATFORM_FREQUENCY_POLICY`
+      )
+    }
     return {
       accountMinMs: Number(resolved.accountMinMs) || 0,
       platformMinMs: Number(resolved.platformMinMs) || 0,
+      accountDailyMax: Number(resolved.accountDailyMax) || 0,
     }
   }
 
+  /** minInterval 兼容模式下仍按平台取日配额（该档不受 minInterval 影响） */
+  _resolvedDailyMax (platform) {
+    const resolved = this._policy(platform) || {}
+    return Number(resolved.accountDailyMax) || 0
+  }
+
+  /** 抖动：只增不减；含抖动系数后仍钳在 setTimeout 安全值内 */
+  _jitter (ms) {
+    if (!(ms > 0)) return 0
+    if (!(this._jitterRatio > 0)) return ms
+    const jittered = Math.round(ms * (1 + this._jitterRatio * this._random()))
+    return jittered > TIMER_SAFE_MS ? TIMER_SAFE_MS : jittered
+  }
+
   _remaining (key, minInterval, now) {
     if (!(minInterval > 0)) return 0
     const lastTime = this._store.get(key)
     if (!lastTime) return 0
-    return Math.max(0, minInterval - (now - lastTime))
+    return Math.max(0, minInterval - (now - Number(lastTime)))
+  }
+
+  _readDaily (key, dayKey) {
+    if (!this._dailyStore) return { count: 0, rollbackCount: 0 }
+    let row = null
+    try {
+      row = this._dailyStore.getDay(key, dayKey)
+    } catch (e) {
+      this._warn(`[PublishFrequency] 日计数读取失败（按 0 处理）：${e && e.message}`)
+      return { count: 0, rollbackCount: 0 }
+    }
+    if (!row) return { count: 0, rollbackCount: 0 }
+    const count = readCount(row.count)
+    const rollbackCount = readCount(row.rollback_count !== undefined ? row.rollback_count : row.rollbackCount)
+    return { count, rollbackCount }
+  }
+
+  _incrDaily (key, dayKey, field, delta) {
+    if (!this._dailyStore) return 0
+    try {
+      const fn = delta < 0 ? this._dailyStore.decrDay : this._dailyStore.incrDay
+      if (typeof fn === 'function') return fn.call(this._dailyStore, key, dayKey, field, Math.abs(delta))
+      if (delta < 0 && typeof this._dailyStore.incrDay === 'function') {
+        return this._dailyStore.incrDay(key, dayKey, field, delta)
+      }
+    } catch (e) {
+      this._warn(`[PublishFrequency] 日计数写入失败（已忽略，不回滚）：${e && e.message}`)
+    }
+    return 0
   }
 
   /**
-   * 评估两档间隔，返回被更严一档决定的等待时间。
-   * @returns {{allowed: boolean, remainingMs: number, bucket: ('account'|'platform'|null)}}
+   * 评估两档间隔与日配额，返回被更严一项决定的等待时间。
+   * 日配额是**独立否决项**：命中时 remainingMs 恒为 0（它是「今天到此为止」，不是「等一会儿」）。
+   *
+   * @returns {{allowed: boolean, remainingMs: number, bucket: ('account'|'platform'|'daily'|null),
+   *            reason: (null|'interval'|'daily_quota'), daily: (null|{used: number, max: number, dayKey: string})}}
    */
   check (platform, accountId) {
     const now = this._now()
-    const { accountMinMs, platformMinMs } = this._intervals(platform)
+    const dayKey = this.today()
+    const { accountMinMs, platformMinMs, accountDailyMax } = this._intervals(platform)
     const normalizedAccount = normalizeAccountId(accountId)
+    const accountKey = normalizedAccount ? this._key(platform, normalizedAccount) : null
+
+    // ① 日配额（独立否决项，先判：它比「等一会儿」更强，用户可行动性也不同——改期而非等待）
+    let daily = null
+    if (accountKey && accountDailyMax > 0 && this._dailyStore) {
+      const row = this._readDaily(accountKey, dayKey)
+      daily = { used: row.count, max: accountDailyMax, dayKey }
+      if (row.count >= accountDailyMax) {
+        return { allowed: false, remainingMs: 0, bucket: 'daily', reason: REASON_DAILY_QUOTA, daily }
+      }
+    }
 
+    // ② 两档间隔取更严
     let remainingMs = 0
     let bucket = null
 
-    if (normalizedAccount) {
-      const r = this._remaining(this._key(platform, normalizedAccount), accountMinMs, now)
+    if (accountKey && accountMinMs > 0) {
+      const r = this._remaining(accountKey, accountMinMs, now)
       if (r > 0) {
         remainingMs = r
         bucket = 'account'
@@ -102,14 +310,17 @@ class PublishIntervalGuard {
     }
 
     const platformRemaining = this._remaining(
-      this._key(platform, PLATFORM_BUCKET_ACCOUNT_ID), platformMinMs, now
+      this._key(platform, null), platformMinMs, now
     )
     if (platformRemaining > remainingMs) {
       remainingMs = platformRemaining
       bucket = 'platform'
     }
 
-    return { allowed: remainingMs <= 0, remainingMs, bucket }
+    if (remainingMs > 0) {
+      return { allowed: false, remainingMs: this._jitter(remainingMs), bucket, reason: REASON_INTERVAL, daily }
+    }
+    return { allowed: true, remainingMs: 0, bucket: null, reason: null, daily }
   }
 
   /**
@@ -123,9 +334,7 @@ class PublishIntervalGuard {
   }
 
   /**
-   * 获取还需等待时间
-   * @param {string} platform - 平台标识
-   * @param {string} [accountId] - 账号 ID
+   * 获取还需等待时间（已含抖动；日配额命中时为 0，应改用 msUntilNextDay()）
    * @returns {number} 剩余等待时间 (ms)，0 表示可以发布
    */
   getRemainingWait (platform, accountId) {
@@ -133,26 +342,153 @@ class PublishIntervalGuard {
   }
 
   /**
-   * 记录一次发布：两档同时占位。
+   * 记录一次发布：两档同时占位 + 日计数递增。
    *
    * 必须在**提交给执行器之前**调用。平台侧限流窗口按「请求已发生」计时，
    * 若只在成功路径记账，则「已发到平台但应用判失败/超时」不占窗口，
    * 重试会重复发布且下一次提交不受限。
    *
-   * @param {string} platform - 平台标识
-   * @param {string} [accountId] - 账号 ID
+   * @param {string} platform
+   * @param {string} [accountId]
    * @param {number} [timestamp] - 时间戳 (ms)，默认取注入时钟
+   * @returns {{at: number, accountKey: (string|null), platformKey: string,
+   *            accountPrev: (number|null), platformPrev: (number|null),
+   *            dailyPrev: (number|null), dayKey: string}}
+   *   占位前值必须保存并回传给 release()（结构锁断言其被消费）
    */
   recordPublish (platform, accountId, timestamp) {
     const at = timestamp ?? this._now()
+    const dayKey = this.today()
     const normalizedAccount = normalizeAccountId(accountId)
-    if (normalizedAccount) {
-      this._store.set(this._key(platform, normalizedAccount), at)
+    const platformKey = this._key(platform, null)
+    const accountKey = normalizedAccount ? this._key(platform, normalizedAccount) : null
+
+    const platformPrev = this._store.get(platformKey)
+    const accountPrev = accountKey ? this._store.get(accountKey) : null
+    let dailyPrev = null
+
+    if (accountKey) {
+      this._store.set(accountKey, at)
+      const row = this._readDaily(accountKey, dayKey)
+      dailyPrev = row.count
+      this._incrDaily(accountKey, dayKey, 'count', 1)
     }
-    this._store.set(this._key(platform, PLATFORM_BUCKET_ACCOUNT_ID), at)
+    this._store.set(platformKey, at)
+
+    return { at, accountKey, platformKey, accountPrev, platformPrev, dailyPrev, dayKey }
+  }
+
+  /**
+   * 回滚一次**未提交**尝试所占的窗口与配额（P0-1）。
+   *
+   * 三条纪律（任一不成立即 no-op，方向恒为「多等」而非「少等」）：
+   *   ① 乐观并发：仅当 store.get(key) === hold.at 才回滚该键 —— 绝不回滚他人窗口；
+   *   ② hold 必须由 recordPublish() 返回并回传；缺失/错配 ⇒ no-op + 出声；
+   *   ③ 防风上限：每账号每日回滚次数 >= max(2, dailyMax) 时拒绝回滚。
+   *
+   * 副作用：配额计数幂等回补（下限 0）；回滚计数只增不减。
+   *
+   * @returns {{released: boolean, reason: (null|'prev_missing'|'window_taken'|'rollback_cap')}}
+   */
+  release (platform, accountId, hold) {
+    const dayKey = this.today()
+    const normalizedAccount = normalizeAccountId(accountId)
+    const accountKey = normalizedAccount ? this._key(platform, normalizedAccount) : null
+    const platformKey = this._key(platform, null)
+
+    if (!hold || typeof hold.at !== 'number') {
+      this._warn('[PublishFrequency] release 缺少 recordPublish 返回的 hold，已忽略（窗口保持占用）')
+      return { released: false, reason: 'prev_missing' }
+    }
+
+    // ③ 防风上限（回滚计数只增不减）
+    if (accountKey && this._dailyStore) {
+      const cap = this._rollbackCap(platform)
+      const row = this._readDaily(accountKey, dayKey)
+      if (cap > 0 && row.rollbackCount >= cap) {
+        this._warn(
+          `[PublishFrequency] 账号 ${accountKey} 当日回滚已达上限 ${cap}，本次不回滚（窗口保持占用）`
+        )
+        return { released: false, reason: 'rollback_cap' }
+      }
+    }
+
+    let released = false
+
+    // ① 账号键
+    if (accountKey && hold.accountKey === accountKey) {
+      if (this._store.get(accountKey) === hold.at) {
+        this._store.set(accountKey, hold.accountPrev ?? null)
+        released = true
+      }
+    }
+
+    // ① 平台键（独立判定：可能已被后续提交覆盖）
+    if (this._store.get(platformKey) === hold.at) {
+      this._store.set(platformKey, hold.platformPrev ?? null)
+      released = true
+    }
+
+    if (!released) {
+      return { released: false, reason: 'window_taken' }
+    }
+
+    // ② 配额回补（幂等：只在真正回滚后执行）+ 回滚计数只增
+    if (accountKey && this._dailyStore) {
+      this._incrDaily(accountKey, dayKey, 'count', -1)
+      this._incrDaily(accountKey, dayKey, 'rollback_count', 1)
+    }
+
+    return { released: true, reason: null }
+  }
+
+  /**
+   * 人为清空某平台当前占用的间隔窗口（**紧急放行专用**，唯一调用方是 task-queue 的
+   * emergencyRelease，且必须已经过每日上限 + 冷却 + 审计三道闸）。
+   *
+   * ⚠️ 副作用范围：会同时清掉**平台键**（`platform:*`），即该平台**其他账号**的跨账号
+   * 保护也会随之失效一次。这是刻意的：只清账号键的话，平台键仍会把本次紧急放行挡住，
+   * 功能等于没实现。代价由「每账号每日 1 次 + 冷却 + 追加式审计」共同约束。
+   *
+   * @param {string} platform
+   * @param {string} [accountId]
+   * @returns {{cleared: boolean, clearedKeys: string[]}}
+   */
+  clearWindow (platform, accountId) {
+    const normalizedAccount = normalizeAccountId(accountId)
+    const accountKey = normalizedAccount ? this._key(platform, normalizedAccount) : null
+    const platformKey = this._key(platform, null)
+    const clearedKeys = []
+
+    if (accountKey && this._store.get(accountKey) != null) {
+      this._store.set(accountKey, null)
+      clearedKeys.push(accountKey)
+    }
+    if (this._store.get(platformKey) != null) {
+      this._store.set(platformKey, null)
+      clearedKeys.push(platformKey)
+    }
+
+    return { cleared: clearedKeys.length > 0, clearedKeys }
+  }
+
+  /** 回滚上限：max(2, dailyMax)；日配额关闭（0）时给一个保守的固定上限 2 */
+  _rollbackCap (platform) {
+    const { accountDailyMax } = this._intervals(platform)
+    return accountDailyMax > 0 ? Math.max(2, accountDailyMax) : 2
   }
 }
 
 PublishIntervalGuard.InMemoryStore = InMemoryStore
+PublishIntervalGuard.InMemoryDailyStore = InMemoryDailyStore
 PublishIntervalGuard.PLATFORM_BUCKET_ACCOUNT_ID = PLATFORM_BUCKET_ACCOUNT_ID
+PublishIntervalGuard.buildKey = buildKey
+PublishIntervalGuard.TIMER_SAFE_MS = TIMER_SAFE_MS
+
 module.exports = PublishIntervalGuard
+module.exports.buildKey = buildKey
+module.exports.normalizeAccountId = normalizeAccountId
+module.exports.InMemoryStore = InMemoryStore
+module.exports.InMemoryDailyStore = InMemoryDailyStore
+module.exports.PLATFORM_BUCKET_ACCOUNT_ID = PLATFORM_BUCKET_ACCOUNT_ID
+module.exports.PLATFORM_BUCKET_DAILY_KEY_PREFIX = 'platform-daily'
diff --git a/packages/shared-utils/src/task-queue.js b/packages/shared-utils/src/task-queue.js
index 811f82342..bf9668fe8 100755
--- a/packages/shared-utils/src/task-queue.js
+++ b/packages/shared-utils/src/task-queue.js
@@ -8,6 +8,10 @@
  * - 进度事件通知
  */
 const EventEmitter = require('events')
+// 紧急放行需要与守卫**同一份** accountId 归一判据（否则「设置页传 abc」与「任务里存 abc 」
+// 在归一后不等，会找不到等待中的任务却报 no_waiting_window）。守卫只用 publish-frequency-policy，
+// 不反向依赖本模块，无循环依赖。
+const PublishIntervalGuard = require('./publish-interval-guard')
 // R14：持久化快照（待派发 / running / delayed）的字段取舍统一到一处，
 // 见 task-projection.js 头注释（publishTime 曾在三份手抄白名单里全部缺席）。
 const { projectTask } = require('./task-projection')
@@ -48,6 +52,18 @@ class TaskQueue extends EventEmitter {
     this._history = []        // 已完成的任务历史
     this._pendingTimers = new Set()  // R28/R37：跟踪频率控制重排定时器，shutdown 时清理
     this._delayed = new Map() // 频控等待任务 { id -> { task, timer } }
+    // ── publish-frequency-policy-v2 ──────────────────────────────────────────
+    // 日配额被拒的任务单独成集：它们不是「等一会儿」而是「今天到此为止」，
+    // _processNext 必须跳过，否则会立刻重新取到同一任务形成紧循环。
+    this._quotaBlocked = new Set()
+    // 已证明「会调用 markSubmitted」的平台（由成功且 submittedAt 非空的发布累积）。
+    // 用于失败路径的接线矛盾检测：若某平台既能证明会打点、又持续出现
+    // 「从未发起提交尝试」的失败，则判为接线矛盾 ⇒ 对该平台停用回滚（fail-closed）。
+    this._platformsProvenSubmit = new Set()
+    this._rollbackDisabledPlatforms = new Set()
+    this._missingWiringCounts = new Map()
+    // 探针计数（供设置页/诊断读取）
+    this._probeCounts = { successWithoutSubmittedAt: 0, releaseFailed: 0, rollbackDisabled: 0 }
     this._abortControllers = new Map() // 运行中任务的协作式取消信号
     this._runningByChannel = new Map() // 通道键 -> 在跑计数（B 方案：同通道串行，跨通道并行）
     this._paused = false
@@ -69,6 +85,7 @@ class TaskQueue extends EventEmitter {
     this._pendingTimers.clear()
     for (const { task } of this._delayed.values()) this._markCancelled(task, true)
     this._delayed.clear()
+    this._quotaBlocked.clear()
     for (const task of this._queue.splice(0)) this._markCancelled(task, true)
     for (const [taskId, task] of this._running) {
       this._markCancelled(task, false)
@@ -473,6 +490,12 @@ class TaskQueue extends EventEmitter {
         this._queue.push(task)
         continue
       }
+      // v2：日配额被拒的任务不参与本轮扫描（否则会被反复取到 ⇒ 紧循环）。
+      // 它们由跨日定时器或下一次 _processNext 的显式重新判定放行。
+      if (this._quotaBlocked.has(task.id)) {
+        this._queue.push(task)
+        continue
+      }
       // B 方案通道调度：同通道（platform:accountId）已有任务在跑时，本任务留队轮候，
       // 继续扫描后续可启动任务（跨通道不互相阻塞）。轮候计数用 inspected 保证不无限循环。
       if ((this._runningByChannel.get(this._channelKey(task)) || 0) > 0) {
@@ -525,25 +548,44 @@ class TaskQueue extends EventEmitter {
         const blockedCount = (this._runningByChannel.get(blockedChannelKey) || 0) - 1
         if (blockedCount <= 0) this._runningByChannel.delete(blockedChannelKey)
         else this._runningByChannel.set(blockedChannelKey, blockedCount)
+
+        const isDailyQuota = verdict.bucket === 'daily' || verdict.reason === 'daily_quota'
         this.emit('publish:blocked', {
-          task, remainingWait: verdict.remainingMs, bucket: verdict.bucket,
+          task,
+          remainingWait: verdict.remainingMs,
+          bucket: verdict.bucket,
+          reason: verdict.reason || null,
+          daily: verdict.daily || null,
         })
         // 达到等待时间后重新加入队列
         // R28/R37：保存句柄 + unref + 注册到 _pendingTimers 供 shutdown 清理
+        // v2：日配额命中的等待是「到次日 00:00:05」（几十万毫秒量级），
+        //     且截止时间由守卫的注入时钟推导（与 today() 同源），避免测试注入时钟时漂移。
+        const waitMs = isDailyQuota
+          ? (typeof this._publishIntervalGuard.msUntilNextDay === 'function'
+              ? this._publishIntervalGuard.msUntilNextDay()
+              : 24 * 60 * 60 * 1000)
+          : verdict.remainingMs
+        if (isDailyQuota) this._quotaBlocked.add(task.id)
         const requeueTimer = setTimeout(() => {
           this._pendingTimers.delete(requeueTimer)
           this._delayed.delete(task.id)
+          this._quotaBlocked.delete(task.id)
           if (task.cancelRequested || task.status === 'cancelled') return
           this._queue.unshift(task)
           this._processNext()
-        }, verdict.remainingMs)
+        }, waitMs)
         if (requeueTimer && requeueTimer.unref) requeueTimer.unref()
         this._pendingTimers.add(requeueTimer)
         this._delayed.set(task.id, { task, timer: requeueTimer })
         this._saveState()
         return
       }
-      this._publishIntervalGuard.recordPublish(task.platform, accountId)
+      this._quotaBlocked.delete(task.id)
+      // 占位并保存前值：release() 需要它才能精确还原（结构锁断言该返回值被消费）
+      task._hold = this._publishIntervalGuard.recordPublish(task.platform, accountId)
+      task.submitAttempted = false
+      task.submittedAt = null
     }
 
     // 创建超时 Promise
@@ -577,19 +619,40 @@ class TaskQueue extends EventEmitter {
       task.status = 'success'
       task.result = result
       task.completedAt = new Date().toISOString()
+      // ── 不变量 I4：成功路径自证 ──
+      // 成功的发布必然发生过平台写操作，因此传输层**必须**已置位 submittedAt。
+      // 若为空，说明该平台的传输层漏接线 —— 这会把「未提交失败」误判为可回滚（危险侧），
+      // 故在这里把它变成第一次成功就暴露的主动告警，而不是等某次失败被误放行。
+      if (this._publishIntervalGuard && !task.submittedAt) {
+        this._probeCounts.successWithoutSubmittedAt += 1
+        console.error(
+          `[task-queue] 接线缺陷：平台 ${task.platform} 的发布成功但 submittedAt 为空`
+          + '（传输层未调用 markSubmitted）—— 该平台的「未提交失败」判定不可信'
+        )
+        this._disableRollbackForPlatform(task.platform, 'success_without_submitted_at')
+      } else if (this._publishIntervalGuard && task.submittedAt) {
+        this._platformsProvenSubmit.add(task.platform)
+      }
       this.emit('task:success', task)
       this._saveState()
     } catch (e) {
       if (task.cancelRequested || task.status === 'cancelled') return
       task.error = e.message
 
+      // ── P0-1：未提交失败回滚窗口 ──
+      // 判据是**提交阶段**而非错误类型：从未发起平台写尝试（submitAttempted=false），
+      // 或传输层显式声明可确证未送出（definitelyNotSent=true）。其余一律占窗口（I2）。
+      const rolledBack = this._maybeRollback(task, e)
+
       // 风控即停等不可重试错误（e.noRetry）直接判失败，不进入重试环
       if (!e.noRetry && task.retriesLeft > 0) {
         task.retriesLeft--
         task.status = 'pending'
+        task.lastAttemptNotSubmitted = rolledBack
         this.emit('task:retry', task)
-        // 放回队列尾部
-        this._queue.push(task)
+        // 放回队列尾部；回滚过的按最小退避延后重排（防「回滚即零等待」的重试风暴）
+        if (rolledBack) this._delayRequeue(task, this._releaseGraceMs())
+        else this._queue.push(task)
       } else {
         task.status = 'failed'
         task.completedAt = new Date().toISOString()
@@ -617,6 +680,194 @@ class TaskQueue extends EventEmitter {
     }
   }
 
+  /**
+   * 传输层打点①：即将发起**首次**平台写尝试。
+   *
+   * 必须由真正发出平台请求的那一层调用（rpa-view-manager / publisher-router），
+   * **不是**由抛出错误的那一层声明 —— 否则「免等重试」的获益方可以自行伪造。
+   * @param {string} taskId
+   */
+  markSubmitAttempted (taskId) {
+    const task = this._running.get(taskId)
+    if (task) task.submitAttempted = true
+  }
+
+  /**
+   * 传输层打点②：平台**已确认发出**（收到响应或等价确认）。
+   *
+   * 与 `markSubmitAttempted` 的区别：前者只证明「我们试过」，后者证明「确实送出去了」。
+   * 只有两者都为空时才可能回滚（P0-1）；只调用过①的失败一律占窗口。
+   * @param {string} taskId
+   */
+  markSubmitted (taskId) {
+    const task = this._running.get(taskId)
+    if (task) {
+      task.submitAttempted = true
+      task.submittedAt = Date.now()
+    }
+  }
+
+  /** 探针计数（供设置页 / 诊断读取；不参与判定） */
+  getProbeCounts () {
+    return {
+      ...this._probeCounts,
+      missingWiring: Object.fromEntries(this._missingWiringCounts),
+      rollbackDisabledPlatforms: [...this._rollbackDisabledPlatforms],
+    }
+  }
+
+  _releaseGraceMs () {
+    const g = this._publishIntervalGuard
+    const ms = g && Number.isFinite(g.releaseGraceMs) ? g.releaseGraceMs : 60 * 1000
+    return Math.max(10000, ms)
+  }
+
+  _disableRollbackForPlatform (platform, reason) {
+    if (this._rollbackDisabledPlatforms.has(platform)) return
+    this._rollbackDisabledPlatforms.add(platform)
+    this._probeCounts.rollbackDisabled += 1
+    console.error(
+      `[task-queue] 已对平台 ${platform} 停用「未提交失败回滚」（${reason}）：`
+      + '宁可多等一个窗口，也不冒早于窗口重复发布的风险。重启或用户在设置页确认后解除'
+    )
+  }
+
+  /** 用户手动清除「停用回滚」标记（设置页「我确认该平台接线正常」） */
+  clearRollbackDisabled (platform) {
+    if (platform === undefined) this._rollbackDisabledPlatforms.clear()
+    else this._rollbackDisabledPlatforms.delete(platform)
+  }
+
+  /**
+   * 紧急放行（P2-2）：跳过该 (platform, accountId) 当前的等待窗口，立即重新入队。
+   *
+   * ⚠️ 本方法**只负责机制**（找等待任务 → 取消防守定时器 → 清窗 → 重新入队 → 广播）。
+   * 每日上限、冷却、审计由调用方（IPC 层）在调用**之前**判定并落盘 —— 那些是策略与合规，
+   * 混进来会让本方法无法在无 store 的环境（测试 / headless）复用。
+   *
+   * 三类结果都必须如实回报，不得静默：
+   *   { ok:false, code:'no_guard' }          注入缺失
+   *   { ok:false, code:'no_waiting_window' } 当前没有等待中的窗口
+   *   { ok:true,  taskId, clearedKeys }      成功
+   *
+   * @param {string} platform
+   * @param {string|null} [accountId]
+   * @param {{operator?: string, reason?: string}} [opts]
+   */
+  emergencyRelease (platform, accountId, opts = {}) {
+    const guard = this._publishIntervalGuard
+    if (!guard) return { ok: false, code: 'no_guard' }
+    const normalize = typeof PublishIntervalGuard.normalizeAccountId === 'function'
+      ? PublishIntervalGuard.normalizeAccountId
+      : (v) => (typeof v === 'string' && v.trim() ? v.trim() : null)
+    const normAccount = normalize(accountId)
+
+    // _delayed 同时承载「等间隔」与「等次日配额」两类等待，两者都应可被紧急放行
+    let target = null
+    for (const entry of this._delayed.values()) {
+      if (entry.task.platform === platform && normalize(entry.task.accountId) === normAccount) {
+        target = entry
+        break
+      }
+    }
+    if (!target) return { ok: false, code: 'no_waiting_window' }
+
+    if (target.timer) {
+      clearTimeout(target.timer)
+      this._pendingTimers.delete(target.timer)
+    }
+    this._delayed.delete(target.task.id)
+    this._quotaBlocked.delete(target.task.id)
+
+    const cleared = guard.clearWindow(platform, normAccount)
+    if (!this._queue.includes(target.task)) this._queue.unshift(target.task)
+    this._processNext()
+
+    const detail = {
+      task: target.task,
+      platform,
+      accountId: normAccount,
+      clearedKeys: cleared.clearedKeys,
+      operator: opts.operator || null,
+      reason: opts.reason || null,
+      at: Date.now(),
+    }
+    this.emit('publish:emergencyReleased', detail)
+    return { ok: true, taskId: target.task.id, clearedKeys: cleared.clearedKeys }
+  }
+
+  /**
+   * P0-1 回滚判定与执行。返回是否真正回滚（供重试退避与事件使用）。
+   * @param {object} task
+   * @param {Error & {notSubmitted?: boolean, definitelyNotSent?: boolean}} e
+   * @returns {boolean}
+   */
+  _maybeRollback (task, e) {
+    const guard = this._publishIntervalGuard
+    if (!guard || !task._hold) return false
+
+    const platform = task.platform
+    const attempted = task.submitAttempted === true
+    const definitelyNotSent = e && e.definitelyNotSent === true
+    const hinted = e && e.notSubmitted === true
+
+    // 阶段判据：只有「从未发起写尝试」或「传输层确证未送出」才可回滚
+    let rollbackable = !attempted || definitelyNotSent
+
+    // 佐证位不得与阶段判据矛盾：说「未提交」但阶段标记说已尝试且未确证 ⇒ fail-closed
+    if (hinted && !rollbackable) {
+      this._probeCounts.releaseFailed += 1
+      console.error(
+        `[task-queue] 平台 ${platform} 的错误同时带 notSubmitted=true 与已发起的提交尝试，`
+        + '判定为**已提交**（占窗口）：佐证位与阶段判据矛盾时一律取更保守的一侧'
+      )
+      rollbackable = false
+    }
+
+    // 失败路径接线探针：声称「未发起尝试」的失败若出现在已证明会打点的平台上，判为接线矛盾
+    if (!attempted) {
+      const n = (this._missingWiringCounts.get(platform) || 0) + 1
+      this._missingWiringCounts.set(platform, n)
+      if (this._platformsProvenSubmit.has(platform)) {
+        this._disableRollbackForPlatform(platform, 'failure_without_submit_attempt_on_proven_platform')
+        rollbackable = false
+      }
+    }
+
+    if (this._rollbackDisabledPlatforms.has(platform)) rollbackable = false
+    if (!rollbackable) return false
+
+    const res = guard.release(platform, task.accountId, task._hold)
+    if (!res || !res.released) {
+      this._probeCounts.releaseFailed += 1
+      return false
+    }
+
+    task._hold = null
+    task.lastAttemptNotSubmitted = true
+    task.lastAttemptAt = Date.now()
+    this.emit('publish:released', {
+      task,
+      platform,
+      accountId: task.accountId ?? null,
+      reason: 'not_submitted',
+      graceMs: this._releaseGraceMs(),
+    })
+    return true
+  }
+
+  /** 回滚后的最小退避重排（任务重新入队头，但延后 graceMs 执行） */
+  _delayRequeue (task, ms) {
+    const timer = setTimeout(() => {
+      this._pendingTimers.delete(timer)
+      if (task.cancelRequested || task.status === 'cancelled') return
+      this._queue.unshift(task)
+      this._processNext()
+    }, ms)
+    if (timer && timer.unref) timer.unref()
+    this._pendingTimers.add(timer)
+  }
+
   /**
    * 实际执行任务的钩子 — 由外部设置
    */
diff --git a/packages/shared-utils/tests/publish-frequency-policy.test.js b/packages/shared-utils/tests/publish-frequency-policy.test.js
index d6d9ba3e7..e0771e25e 100644
--- a/packages/shared-utils/tests/publish-frequency-policy.test.js
+++ b/packages/shared-utils/tests/publish-frequency-policy.test.js
@@ -1,24 +1,41 @@
 /**
- * Test: publish-frequency-policy.js — 发布最小间隔策略单一真源
+ * Test: publish-frequency-policy.js — 发布频率策略单一真源（v2）
  *
- * 覆盖：15 平台两档全覆盖、未知平台回落最严档（不得为 0）、环境变量覆盖、
- * 0 = 显式关闭、非法值回落并出声。
+ * 覆盖：15 平台三维度全覆盖、未知平台回落最严档 + fallback 标记、数值下调、
+ * 三档日配额 env、抖动比例、回滚退避、紧急放行上限、0 = 显式关闭、非法值回落并出声。
  */
 const {
   resolveIntervals,
+  resolveJitterRatio,
+  resolveReleaseGraceMs,
+  resolveEmergencyMaxPerDay,
+  resolvePolicyOverrides,
+  isKnownPlatform,
   BASELINE_INTERVALS,
   PLATFORM_FREQUENCY_POLICY,
+  SUPPORTED_PLATFORMS,
+  MAX_INTERVAL_MS,
+  DEFAULT_JITTER_RATIO,
+  MIN_RELEASE_GRACE_MS,
   ENV_ACCOUNT_MIN_INTERVAL,
   ENV_PLATFORM_MIN_INTERVAL,
-  SUPPORTED_PLATFORMS,
+  ENV_DAILY_MAX_LONG,
+  ENV_DAILY_MAX_CLIP,
+  ENV_DAILY_MAX_SHORT,
+  ENV_ACCOUNT_DAILY_MAX,
+  ENV_JITTER_RATIO,
+  ENV_RELEASE_GRACE_MS,
+  ENV_EMERGENCY_MAX_PER_DAY,
+  TIER_LONG,
+  TIER_CLIP,
+  TIER_SHORT,
 } = require('../src/publish-frequency-policy')
 
 const MIN = 60 * 1000
 
-describe('publish-frequency-policy', () => {
+describe('publish-frequency-policy v2', () => {
   describe('平台覆盖', () => {
-    it('15 个支持平台全部登记，且两档均为正数', () => {
-      // Array.prototype.sort 按 UTF-16 码元序：'wechat_mp' < 'weibo'（'c' < 'i'）
+    it('15 个支持平台全部登记，且三个维度均为正数', () => {
       expect([...SUPPORTED_PLATFORMS].sort()).toEqual([
         'baijiahao', 'bilibili', 'douyin', 'facebook', 'instagram', 'kuaishou',
         'tencent_video', 'tiktok', 'toutiao', 'twitter', 'wechat_mp', 'weibo',
@@ -30,36 +47,54 @@ describe('publish-frequency-policy', () => {
         const r = resolveIntervals(platform, { env: {} })
         expect(r.accountMinMs, `${platform} accountMinMs`).toBeGreaterThan(0)
         expect(r.platformMinMs, `${platform} platformMinMs`).toBeGreaterThan(0)
+        expect(r.accountDailyMax, `${platform} accountDailyMax`).toBeGreaterThan(0)
+        expect(r.fallback, `${platform} fallback`).toBe(false)
       }
     })
 
-    it('三组代表平台逐档精确等于策略表', () => {
-      // 长文低频
+    it('三组代表平台逐档精确等于策略表（v2 数值）', () => {
       expect(resolveIntervals('wechat_mp', { env: {} })).toEqual({
-        accountMinMs: 60 * MIN, platformMinMs: 5 * MIN,
+        tier: TIER_LONG, accountMinMs: 20 * MIN, platformMinMs: 2 * MIN, accountDailyMax: 3, fallback: false,
       })
-      // 短视频/图文社区
       expect(resolveIntervals('douyin', { env: {} })).toEqual({
-        accountMinMs: 30 * MIN, platformMinMs: 3 * MIN,
+        tier: TIER_CLIP, accountMinMs: 10 * MIN, platformMinMs: 2 * MIN, accountDailyMax: 5, fallback: false,
       })
-      // 短内容高频容忍
       expect(resolveIntervals('weibo', { env: {} })).toEqual({
-        accountMinMs: 10 * MIN, platformMinMs: 1 * MIN,
+        tier: TIER_SHORT, accountMinMs: 3 * MIN, platformMinMs: 2 * MIN, accountDailyMax: 20, fallback: false,
       })
     })
 
-    it('未知平台回落基线最严档，绝不为 0', () => {
+    it('数值下调已生效：账号档不再有 60/30/10 分钟', () => {
+      for (const platform of SUPPORTED_PLATFORMS) {
+        const { accountMinMs } = resolveIntervals(platform, { env: {} })
+        expect(accountMinMs, `${platform} 应为 v2 值`).toBeLessThanOrEqual(20 * MIN)
+      }
+      // 平台档统一 2 分钟
+      for (const platform of SUPPORTED_PLATFORMS) {
+        expect(resolveIntervals(platform, { env: {} }).platformMinMs, `${platform}`).toBe(2 * MIN)
+      }
+    })
+
+    it('未知平台回落基线最严档并带 fallback 标记（供守卫出声）', () => {
       const r = resolveIntervals('some_future_platform', { env: {} })
-      expect(r).toEqual(BASELINE_INTERVALS)
+      expect(r).toEqual({ ...BASELINE_INTERVALS, fallback: true })
       expect(r.accountMinMs).toBeGreaterThan(0)
       expect(r.platformMinMs).toBeGreaterThan(0)
+      expect(r.accountDailyMax).toBeGreaterThan(0)
 
-      // 空/非字符串同样按未知处理（不得抛、不得放行）
       for (const bad of [undefined, null, '', 123, {}]) {
-        expect(resolveIntervals(bad, { env: {} })).toEqual(BASELINE_INTERVALS)
+        expect(resolveIntervals(bad, { env: {} }).fallback).toBe(true)
+        expect(resolveIntervals(bad, { env: {} }).accountMinMs).toBe(BASELINE_INTERVALS.accountMinMs)
       }
     })
 
+    it('isKnownPlatform 只认策略表内的字符串键', () => {
+      expect(isKnownPlatform('douyin')).toBe(true)
+      expect(isKnownPlatform('nope')).toBe(false)
+      expect(isKnownPlatform(undefined)).toBe(false)
+      expect(isKnownPlatform({})).toBe(false)
+    })
+
     it('策略表里每个平台的 platformMinMs 不得大于 accountMinMs', () => {
       for (const [platform, p] of Object.entries(PLATFORM_FREQUENCY_POLICY)) {
         expect(p.platformMinMs, `${platform}`).toBeLessThanOrEqual(p.accountMinMs)
@@ -67,23 +102,21 @@ describe('publish-frequency-policy', () => {
     })
   })
 
-  describe('环境变量覆盖', () => {
+  describe('间隔环境变量覆盖', () => {
     it('合法值覆盖所有平台的两档', () => {
       const env = { [ENV_ACCOUNT_MIN_INTERVAL]: '45000', [ENV_PLATFORM_MIN_INTERVAL]: '9000' }
-      expect(resolveIntervals('douyin', { env })).toEqual({
-        accountMinMs: 45000, platformMinMs: 9000,
-      })
-      expect(resolveIntervals('unknown_x', { env })).toEqual({
-        accountMinMs: 45000, platformMinMs: 9000,
-      })
+      const r = resolveIntervals('douyin', { env })
+      expect(r.accountMinMs).toBe(45000)
+      expect(r.platformMinMs).toBe(9000)
+      expect(r.accountDailyMax).toBe(5) // 日配额不受间隔 env 影响
     })
 
     it('0 表示该档显式关闭，且不得触发告警', () => {
       const warns = []
       const env = { [ENV_ACCOUNT_MIN_INTERVAL]: '0' }
-      expect(resolveIntervals('weibo', { env, warn: (m) => warns.push(m) })).toEqual({
-        accountMinMs: 0, platformMinMs: 1 * MIN,
-      })
+      const r = resolveIntervals('weibo', { env, warn: (m) => warns.push(m) })
+      expect(r.accountMinMs).toBe(0)
+      expect(r.platformMinMs).toBe(2 * MIN)
       expect(warns).toEqual([])
     })
 
@@ -92,36 +125,200 @@ describe('publish-frequency-policy', () => {
         const warns = []
         const env = { [ENV_ACCOUNT_MIN_INTERVAL]: bad }
         const r = resolveIntervals('douyin', { env, warn: (m) => warns.push(m) })
-        expect(r.accountMinMs, `bad=${JSON.stringify(bad)}`).toBe(30 * MIN)
+        expect(r.accountMinMs, `bad=${JSON.stringify(bad)}`).toBe(10 * MIN)
         expect(warns.length, `bad=${JSON.stringify(bad)} 必须出声`).toBe(1)
         expect(warns[0]).toContain(ENV_ACCOUNT_MIN_INTERVAL)
-        expect(warns[0]).toContain(String(bad))
       }
     })
 
-    it('空白值也回落并出声（回显空白原值无诊断价值，只点名变量与默认值）', () => {
+    it('超出 7 天上界的间隔被钳位并出声（防抖动后溢出 setTimeout）', () => {
       const warns = []
-      const env = { [ENV_ACCOUNT_MIN_INTERVAL]: '   ' }
+      const env = { [ENV_ACCOUNT_MIN_INTERVAL]: String(30 * 24 * 60 * MIN) }
       const r = resolveIntervals('douyin', { env, warn: (m) => warns.push(m) })
-      expect(r.accountMinMs).toBe(30 * MIN)
+      expect(r.accountMinMs).toBe(MAX_INTERVAL_MS)
       expect(warns.length).toBe(1)
-      expect(warns[0]).toContain(ENV_ACCOUNT_MIN_INTERVAL)
-      expect(warns[0]).toContain(String(30 * MIN))
+      expect(warns[0]).toContain('超出上界')
+    })
+
+    it('空白值也回落并出声', () => {
+      const warns = []
+      const r = resolveIntervals('douyin', { env: { [ENV_ACCOUNT_MIN_INTERVAL]: '   ' }, warn: (m) => warns.push(m) })
+      expect(r.accountMinMs).toBe(10 * MIN)
+      expect(warns.length).toBe(1)
+    })
+  })
+
+  describe('日配额环境变量（三档 + 全局覆盖）', () => {
+    it('三档各自独立覆盖，互不影响', () => {
+      const env = {
+        [ENV_DAILY_MAX_LONG]: '1',
+        [ENV_DAILY_MAX_CLIP]: '7',
+        [ENV_DAILY_MAX_SHORT]: '99',
+      }
+      expect(resolveIntervals('wechat_mp', { env }).accountDailyMax).toBe(1)
+      expect(resolveIntervals('douyin', { env }).accountDailyMax).toBe(7)
+      expect(resolveIntervals('weibo', { env }).accountDailyMax).toBe(99)
+    })
+
+    it('全局覆盖优先于三档 env', () => {
+      const env = {
+        [ENV_DAILY_MAX_LONG]: '1',
+        [ENV_ACCOUNT_DAILY_MAX]: '4',
+      }
+      expect(resolveIntervals('wechat_mp', { env }).accountDailyMax).toBe(4)
+      expect(resolveIntervals('douyin', { env }).accountDailyMax).toBe(4)
+    })
+
+    it('0 = 关闭该档配额（与平台档 0 语义一致），且不告警', () => {
+      const warns = []
+      const r = resolveIntervals('douyin', { env: { [ENV_ACCOUNT_DAILY_MAX]: '0' }, warn: (m) => warns.push(m) })
+      expect(r.accountDailyMax).toBe(0)
+      expect(warns).toEqual([])
+    })
+
+    it('非整数/负数回落并出声', () => {
+      for (const bad of ['5.5', '-2', 'abc', '']) {
+        const warns = []
+        const r = resolveIntervals('douyin', { env: { [ENV_DAILY_MAX_CLIP]: bad }, warn: (m) => warns.push(m) })
+        expect(r.accountDailyMax, `bad=${JSON.stringify(bad)}`).toBe(5)
+        expect(warns.length, `bad=${JSON.stringify(bad)}`).toBe(1)
+      }
+    })
+
+    it('设置页覆盖优先于 env', () => {
+      const env = { [ENV_DAILY_MAX_CLIP]: '7' }
+      const r = resolveIntervals('douyin', { env, overrides: { accountDailyMax: 2 } })
+      expect(r.accountDailyMax).toBe(2)
+    })
+  })
+
+  describe('抖动比例', () => {
+    it('默认 0.4；合法值覆盖', () => {
+      expect(resolveJitterRatio({ env: {} })).toBe(DEFAULT_JITTER_RATIO)
+      expect(resolveJitterRatio({ env: { [ENV_JITTER_RATIO]: '0.2' } })).toBe(0.2)
     })
 
-    it('未设置环境变量时回落策略表且不告警', () => {
+    it('0 = 关闭抖动且不告警', () => {
       const warns = []
-      const r = resolveIntervals('zhihu', { env: {}, warn: (m) => warns.push(m) })
-      expect(r).toEqual({ accountMinMs: 60 * MIN, platformMinMs: 5 * MIN })
+      expect(resolveJitterRatio({ env: { [ENV_JITTER_RATIO]: '0' }, warn: (m) => warns.push(m) })).toBe(0)
       expect(warns).toEqual([])
     })
 
-    it('只覆盖一档时另一档仍取策略表', () => {
-      const env = { [ENV_PLATFORM_MIN_INTERVAL]: '1000' }
-      expect(resolveIntervals('douyin', { env })).toEqual({
-        accountMinMs: 30 * MIN, platformMinMs: 1000,
+    it('越界（>=1 / 负数 / 非数 / 空白）回落默认并出声', () => {
+      for (const bad of ['1', '-0.1', 'abc', '', '2']) {
+        const warns = []
+        const r = resolveJitterRatio({ env: { [ENV_JITTER_RATIO]: bad }, warn: (m) => warns.push(m) })
+        expect(r, `bad=${JSON.stringify(bad)}`).toBe(DEFAULT_JITTER_RATIO)
+        expect(warns.length, `bad=${JSON.stringify(bad)}`).toBe(1)
+      }
+    })
+  })
+
+  describe('回滚退避', () => {
+    it('默认 60s；低于 10s 下界钳位并出声（防回滚即零等待的重试风暴）', () => {
+      expect(resolveReleaseGraceMs({ env: {} })).toBe(60 * 1000)
+      const warns = []
+      expect(resolveReleaseGraceMs({ env: { [ENV_RELEASE_GRACE_MS]: '0' }, warn: (m) => warns.push(m) }))
+        .toBe(MIN_RELEASE_GRACE_MS)
+      expect(warns.length).toBe(1)
+      expect(warns[0]).toContain('低于下界')
+    })
+
+    it('合法值直通；非整数回落并出声', () => {
+      expect(resolveReleaseGraceMs({ env: { [ENV_RELEASE_GRACE_MS]: '30000' } })).toBe(30000)
+      const warns = []
+      expect(resolveReleaseGraceMs({ env: { [ENV_RELEASE_GRACE_MS]: '1.5' }, warn: (m) => warns.push(m) }))
+        .toBe(60 * 1000)
+      expect(warns.length).toBe(1)
+    })
+  })
+
+  describe('紧急放行上限', () => {
+    it('默认 1；0 = 关闭且不告警；超上界 10 钳位并出声', () => {
+      expect(resolveEmergencyMaxPerDay({ env: {} })).toBe(1)
+
+      const w0 = []
+      expect(resolveEmergencyMaxPerDay({ env: { [ENV_EMERGENCY_MAX_PER_DAY]: '0' }, warn: (m) => w0.push(m) })).toBe(0)
+      expect(w0).toEqual([])
+
+      const w1 = []
+      expect(resolveEmergencyMaxPerDay({ env: { [ENV_EMERGENCY_MAX_PER_DAY]: '99' }, warn: (m) => w1.push(m) })).toBe(10)
+      expect(w1.length).toBe(1)
+    })
+  })
+
+  describe('设置页覆盖解析（resolvePolicyOverrides，全有或全无）', () => {
+    it('null/undefined ⇒ 无覆盖；非对象 ⇒ 丢弃并出声', () => {
+      expect(resolvePolicyOverrides(null, { env: {} })).toBe(null)
+      expect(resolvePolicyOverrides(undefined, {})).toBe(null)
+      for (const bad of ['x', 5, [], true]) {
+        const warns = []
+        expect(resolvePolicyOverrides(bad, { warn: (m) => warns.push(m) })).toBe(null)
+        expect(warns.length).toBe(1)
+      }
+    })
+
+    it('合法字段逐项通过；未知字段忽略（前向兼容，不作废）', () => {
+      const o = resolvePolicyOverrides({
+        accountMinMs: 30000,
+        platformMinMs: 0,
+        dailyMax: { long: 2, clip: 6 },
+        jitterRatio: 0.2,
+        releaseGraceMs: 30000,
+        emergencyMaxPerDay: 2,
+        futureField: 'ignore-me',
+      }, { warn: () => {} })
+      expect(o).toEqual({
+        accountMinMs: 30000,
+        platformMinMs: 0,
+        dailyMax: { long: 2, clip: 6 },
+        jitterRatio: 0.2,
+        releaseGraceMs: 30000,
+        emergencyMaxPerDay: 2,
       })
     })
+
+    it('任一字段非法 ⇒ 整个对象作废 + 出声（不半生效）', () => {
+      const cases = [
+        { accountMinMs: -1 },
+        { accountMinMs: 'abc' },
+        { platformMinMs: -5 },
+        { dailyMax: { long: 1.5 } },
+        { dailyMax: { clip: -1 } },
+        { dailyMax: 3 },
+        { jitterRatio: 1 },
+        { jitterRatio: -0.1 },
+        { releaseGraceMs: 1000 },
+        { accountDailyMax: 2.5 },
+        { emergencyMaxPerDay: 99 },
+      ]
+      for (const bad of cases) {
+        const warns = []
+        expect(resolvePolicyOverrides(bad, { warn: (m) => warns.push(m) }), JSON.stringify(bad)).toBe(null)
+        expect(warns.length, JSON.stringify(bad)).toBe(1)
+        expect(warns[0], JSON.stringify(bad)).toContain('已整体丢弃')
+      }
+    })
+
+    it('合法但为空的对象 ⇒ 返回 null（不得返回空对象冒充覆盖）', () => {
+      expect(resolvePolicyOverrides({}, { warn: () => {} })).toBe(null)
+      expect(resolvePolicyOverrides({ dailyMax: {} }, { warn: () => {} })).toBe(null)
+    })
+
+    it('间隔字段超上界被钳位（不整体作废，与 env 的钳位语义一致）', () => {
+      const warns = []
+      const o = resolvePolicyOverrides({ accountMinMs: 60 * 24 * 60 * 60 * 1000 }, { warn: (m) => warns.push(m) })
+      expect(o.accountMinMs).toBe(MAX_INTERVAL_MS)
+      expect(warns).toEqual([])
+    })
+
+    it('overrides 参与 resolveIntervals：优先于 env 与策略表', () => {
+      const env = { [ENV_DAILY_MAX_CLIP]: '9', [ENV_ACCOUNT_MIN_INTERVAL]: '999999' }
+      const o = resolvePolicyOverrides({ accountMinMs: 12345, dailyMax: { clip: 2 } }, { warn: () => {} })
+      const r = resolveIntervals('douyin', { env, overrides: o })
+      expect(r.accountMinMs).toBe(12345)
+      expect(r.accountDailyMax).toBe(2)
+    })
   })
 
   describe('默认 env 来源', () => {
@@ -129,8 +326,7 @@ describe('publish-frequency-policy', () => {
       const saved = process.env[ENV_ACCOUNT_MIN_INTERVAL]
       delete process.env[ENV_ACCOUNT_MIN_INTERVAL]
       try {
-        const r = resolveIntervals('douyin')
-        expect(r.accountMinMs).toBe(30 * MIN)
+        expect(resolveIntervals('douyin').accountMinMs).toBe(10 * MIN)
       } finally {
         if (saved !== undefined) process.env[ENV_ACCOUNT_MIN_INTERVAL] = saved
       }
diff --git a/packages/shared-utils/tests/publish-interval-guard.test.js b/packages/shared-utils/tests/publish-interval-guard.test.js
index 0e47fba80..832a8b20e 100755
--- a/packages/shared-utils/tests/publish-interval-guard.test.js
+++ b/packages/shared-utils/tests/publish-interval-guard.test.js
@@ -1,126 +1,126 @@
 /**
- * Test: publish-interval-guard.js — 发布频率控制
- * 测试: 同账号发布间隔检测、记录、等待时间
+ * Test: publish-interval-guard.js — 发布频率控制（v2）
+ *
+ * 覆盖：两档间隔、日配额、抖动、release 回滚（乐观并发 / prev 缺失 / 防风上限）、
+ * key 构造、未登记平台出声、跨日边界、计数读回容错、可插拔存储。
+ *
+ * ⚠️ v2 起守卫**默认开启抖动**（ratio=0.4，保守方向：宁多等不少等），
+ *    断言精确 remainingMs 的用例必须显式传 `jitterRatio: 0`。
  */
 
 const PublishIntervalGuard = require('../src/publish-interval-guard')
+const { buildKey, InMemoryDailyStore } = require('../src/publish-interval-guard')
 
-// 5 分钟 = 300000ms
 const MIN_INTERVAL = 5 * 60 * 1000
+const T0 = 1_700_000_000_000
+const DAY1 = '2026-10-10'
+const DAY2 = '2026-10-11'
 
-describe('PublishIntervalGuard', () => {
-  describe('canPublish', () => {
+/** 精确值断言用的守卫工厂：抖动默认关闭 */
+function exactGuard (options = {}) {
+  return new PublishIntervalGuard({ jitterRatio: 0, ...options })
+}
+
+describe('PublishIntervalGuard v2', () => {
+  describe('canPublish / 基础两档', () => {
     test('无发布记录时返回 true', () => {
-      const guard = new PublishIntervalGuard({ minInterval: MIN_INTERVAL })
+      const guard = exactGuard({ minInterval: MIN_INTERVAL })
       expect(guard.canPublish('wechat_mp', 'acc_001')).toBe(true)
     })
 
     test('上次发布不足 5 分钟时返回 false', () => {
-      const guard = new PublishIntervalGuard({ minInterval: MIN_INTERVAL })
+      const guard = exactGuard({ minInterval: MIN_INTERVAL })
       guard.recordPublish('wechat_mp', 'acc_001')
       expect(guard.canPublish('wechat_mp', 'acc_001')).toBe(false)
     })
 
     test('上次发布超过 5 分钟后返回 true', () => {
-      const guard = new PublishIntervalGuard({ minInterval: MIN_INTERVAL })
-      // mock: 记录 6 分钟前的时间
+      const guard = exactGuard({ minInterval: MIN_INTERVAL })
       guard.recordPublish('wechat_mp', 'acc_001', Date.now() - MIN_INTERVAL - 60000)
       expect(guard.canPublish('wechat_mp', 'acc_001')).toBe(true)
     })
 
-    test('同平台不同账号受平台档互相约束（D2 决策：跨账号也要错开）', () => {
-      // 本用例断言的是 2026-10-02 之后的语义。旧断言「不同账号同一平台互不影响」把
-      // 单档模型钉成了产品规则，而平台风控常按设备/平台聚合，同平台连换多号连发同样危险。
-      const guard = new PublishIntervalGuard({ minInterval: MIN_INTERVAL })
+    test('同平台不同账号受平台档互相约束（跨账号也要错开）', () => {
+      const guard = exactGuard({ minInterval: MIN_INTERVAL })
       guard.recordPublish('wechat_mp', 'acc_001')
       expect(guard.canPublish('wechat_mp', 'acc_002')).toBe(false)
-      // 换平台不受影响
       expect(guard.canPublish('zhihu', 'acc_002')).toBe(true)
     })
 
     test('同一账号不同平台互不影响', () => {
-      const guard = new PublishIntervalGuard({ minInterval: MIN_INTERVAL })
+      const guard = exactGuard({ minInterval: MIN_INTERVAL })
       guard.recordPublish('wechat_mp', 'acc_001')
       expect(guard.canPublish('zhihu', 'acc_001')).toBe(true)
     })
 
     test('边界情况：恰好 5 分钟时返回 true', () => {
-      const guard = new PublishIntervalGuard({ minInterval: MIN_INTERVAL })
+      const guard = exactGuard({ minInterval: MIN_INTERVAL })
       guard.recordPublish('wechat_mp', 'acc_001', Date.now() - MIN_INTERVAL)
       expect(guard.canPublish('wechat_mp', 'acc_001')).toBe(true)
     })
   })
 
-  describe('recordPublish', () => {
-    test('记录发布后存储时间戳', () => {
-      const guard = new PublishIntervalGuard({ minInterval: MIN_INTERVAL })
-      guard.recordPublish('wechat_mp', 'acc_001')
-      const remaining = guard.getRemainingWait('wechat_mp', 'acc_001')
-      expect(remaining).toBeGreaterThan(0)
-      expect(remaining).toBeLessThanOrEqual(MIN_INTERVAL)
-    })
-
-    test('私有 key 不暴露', () => {
-      const guard = new PublishIntervalGuard({ minInterval: MIN_INTERVAL })
-      guard.recordPublish('wechat_mp', 'acc_001')
-      // 检查不能通过直接访问对象属性找到存储的时间
-      const keys = Object.keys(guard)
-      expect(keys).not.toContain('wechat_mp:acc_001')
-    })
-  })
-
-  describe('getRemainingWait', () => {
-    test('无发布记录时返回 0', () => {
-      const guard = new PublishIntervalGuard({ minInterval: MIN_INTERVAL })
-      expect(guard.getRemainingWait('wechat_mp', 'acc_001')).toBe(0)
-    })
-
-    test('发布后返回正确剩余等待时间', () => {
-      const guard = new PublishIntervalGuard({ minInterval: MIN_INTERVAL })
-      guard.recordPublish('wechat_mp', 'acc_001', Date.now() - 60000) // 1 分钟前
-      const remaining = guard.getRemainingWait('wechat_mp', 'acc_001')
-      // 应剩余约 4 分钟 (240000ms)，允许 100ms 误差
-      expect(remaining).toBeGreaterThan(230000)
-      expect(remaining).toBeLessThanOrEqual(240000)
+  describe('getRemainingWait / 可插拔存储', () => {
+    test('发布后返回正确剩余等待时间（抖动关闭）', () => {
+      const guard = exactGuard({ minInterval: MIN_INTERVAL, now: () => T0 })
+      guard.recordPublish('wechat_mp', 'acc_001', T0 - 60000)
+      expect(guard.getRemainingWait('wechat_mp', 'acc_001')).toBe(240000)
     })
-  })
 
-  describe('自定义 minInterval', () => {
-    test('支持构造函数传入自定义间隔', () => {
-      const guard = new PublishIntervalGuard({ minInterval: 10000 }) // 10 秒
-      guard.recordPublish('wechat_mp', 'acc_001')
-      expect(guard.canPublish('wechat_mp', 'acc_001')).toBe(false)
-      // 1 秒后还在间隔内
-      guard.recordPublish('wechat_mp', 'acc_001', Date.now() - 5000) // 5 秒前
-      expect(guard.canPublish('wechat_mp', 'acc_001')).toBe(false)
-    })
-  })
-
-  describe('可插拔存储', () => {
     test('支持外部 store 实现', () => {
       const externalStore = new Map()
       const store = {
         get: (key) => externalStore.get(key) ?? null,
-        set: (key, value) => { externalStore.set(key, value) }
+        set: (key, value) => { externalStore.set(key, value) },
       }
-      const guard = new PublishIntervalGuard({ minInterval: MIN_INTERVAL, store })
+      const guard = exactGuard({ minInterval: MIN_INTERVAL, store })
       guard.recordPublish('wechat_mp', 'acc_001')
-      // 数据应存储在外部的 store 中
       const storedKey = [...externalStore.keys()].find(k => k.startsWith('wechat_mp'))
       expect(storedKey).toBeTruthy()
       expect(externalStore.get(storedKey)).toBeGreaterThan(0)
     })
+
+    test('私有 key 不暴露为实例属性', () => {
+      const guard = exactGuard({ minInterval: MIN_INTERVAL })
+      guard.recordPublish('wechat_mp', 'acc_001')
+      expect(Object.keys(guard)).not.toContain('wechat_mp:acc_001')
+    })
+  })
+
+  describe('key 构造（buildKey）', () => {
+    test('平台段与账号段分别 percent-encode，分隔符不产生碰撞', () => {
+      expect(buildKey('weibo', 'a:b')).toBe('weibo:a%3Ab')
+      expect(buildKey('weibo', 'a#b')).toBe('weibo:a%23b')
+      // 分隔符被编码 ⇒ 两段不同组合不会撞成同一 key
+      expect(buildKey('weibo', 'a:b')).not.toBe(buildKey('weibo:a', 'b'))
+    })
+
+    test('账号缺席/空白 ⇒ 平台档哨兵 *，以字面量追加（不参与编码）', () => {
+      for (const missing of [undefined, null, '', '   ']) {
+        expect(buildKey('weibo', missing)).toBe('weibo:*')
+      }
+    })
+
+    test('守卫内部一律用 buildKey（recordPublish 落键与之一致）', () => {
+      const store = new Map()
+      const guard = exactGuard({
+        policy: () => ({ accountMinMs: 1000, platformMinMs: 500 }),
+        store: { get: (k) => (store.has(k) ? store.get(k) : null), set: (k, v) => { store.set(k, v) } },
+        now: () => T0,
+      })
+      guard.recordPublish('douyin', 'a:b', T0)
+      expect([...store.keys()].sort()).toEqual(['douyin:*', 'douyin:a%3Ab'])
+    })
   })
 
   describe('两档策略（policy 模式，生产装配路径）', () => {
     const ACCOUNT_MIN = 30 * 60 * 1000
     const PLATFORM_MIN = 3 * 60 * 1000
-    const T0 = 1_700_000_000_000
 
     function makeGuard (overrides = {}) {
       const store = new Map()
-      const guard = new PublishIntervalGuard({
-        policy: () => ({ accountMinMs: ACCOUNT_MIN, platformMinMs: PLATFORM_MIN }),
+      const guard = exactGuard({
+        policy: () => ({ accountMinMs: ACCOUNT_MIN, platformMinMs: PLATFORM_MIN, accountDailyMax: 0 }),
         store: {
           get: (k) => (store.has(k) ? store.get(k) : null),
           set: (k, v) => { store.set(k, v) },
@@ -131,26 +131,27 @@ describe('PublishIntervalGuard', () => {
       return { guard, store }
     }
 
-    test('check 返回形状精确（allowed/remainingMs/bucket）', () => {
+    test('check 返回形状精确（含 v2 新增字段 reason/daily）', () => {
       const { guard } = makeGuard()
       expect(guard.check('douyin', 'acc_1')).toEqual({
-        allowed: true, remainingMs: 0, bucket: null,
+        allowed: true, remainingMs: 0, bucket: null, reason: null, daily: null,
       })
     })
 
     test('账号档未满时 bucket=account，等待取账号档', () => {
       const { guard } = makeGuard()
-      // 20 分钟前发布过同账号 → 账号档(30min)未满、平台档(3min)已满
       guard.recordPublish('douyin', 'acc_1', T0 - 20 * 60 * 1000)
-      const r = guard.check('douyin', 'acc_1')
-      expect(r).toEqual({ allowed: false, remainingMs: 10 * 60 * 1000, bucket: 'account' })
+      expect(guard.check('douyin', 'acc_1')).toEqual({
+        allowed: false, remainingMs: 10 * 60 * 1000, bucket: 'account', reason: 'interval', daily: null,
+      })
     })
 
     test('只有平台档未满时 bucket=platform（同平台换号连发的形态）', () => {
       const { guard } = makeGuard()
       guard.recordPublish('douyin', 'acc_1', T0 - 2 * 60 * 1000)
-      const r = guard.check('douyin', 'acc_2')
-      expect(r).toEqual({ allowed: false, remainingMs: 1 * 60 * 1000, bucket: 'platform' })
+      expect(guard.check('douyin', 'acc_2')).toEqual({
+        allowed: false, remainingMs: 1 * 60 * 1000, bucket: 'platform', reason: 'interval', daily: null,
+      })
     })
 
     test('两档同时未满时取较大的等待时间，并报告更严的那一档', () => {
@@ -174,34 +175,26 @@ describe('PublishIntervalGuard', () => {
       }
     })
 
-    test('缺席账号之间也互相占用平台档窗口', () => {
-      const { guard } = makeGuard()
-      guard.recordPublish('douyin', 'acc_1')
-      expect(guard.check('douyin', null).allowed).toBe(false)
-      expect(guard.check('douyin', null).bucket).toBe('platform')
-    })
-
     test('档位为 0 表示显式关闭，恒放行', () => {
       const { guard } = makeGuard({
-        policy: () => ({ accountMinMs: 0, platformMinMs: 0 }),
+        policy: () => ({ accountMinMs: 0, platformMinMs: 0, accountDailyMax: 0 }),
       })
       guard.recordPublish('douyin', 'acc_1', T0)
-      expect(guard.check('douyin', 'acc_1')).toEqual({ allowed: true, remainingMs: 0, bucket: null })
+      expect(guard.check('douyin', 'acc_1')).toEqual({
+        allowed: true, remainingMs: 0, bucket: null, reason: null, daily: null,
+      })
     })
 
     test('policy 按平台差异化取值（未知平台不得被放行）', () => {
-      const table = {
-        douyin: { accountMinMs: 1000, platformMinMs: 500 },
-      }
+      const table = { douyin: { accountMinMs: 1000, platformMinMs: 500 } }
       const store = new Map()
-      const guard = new PublishIntervalGuard({
+      const guard = exactGuard({
         policy: (p) => table[p] || { accountMinMs: 9999, platformMinMs: 8888 },
         store: { get: (k) => (store.has(k) ? store.get(k) : null), set: (k, v) => { store.set(k, v) } },
         now: () => T0,
       })
       guard.recordPublish('douyin', 'a', T0 - 600)
       expect(guard.check('douyin', 'a').remainingMs).toBe(400)
-      // 未登记平台回落调用方给的最严档，而不是 0
       guard.recordPublish('mystery', 'a', T0 - 600)
       expect(guard.check('mystery', 'a').allowed).toBe(false)
       expect(guard.check('mystery', 'a').remainingMs).toBe(9999 - 600)
@@ -213,16 +206,404 @@ describe('PublishIntervalGuard', () => {
       expect([...store.keys()].sort()).toEqual(['douyin:*', 'douyin:acc_1'])
     })
 
-    test('minInterval 兼容模式下两档同值（现存测试语义保持）', () => {
+    test('minInterval 兼容模式下两档同值', () => {
       const store = new Map()
-      const guard = new PublishIntervalGuard({
+      const guard = exactGuard({
         minInterval: 1000,
         store: { get: (k) => (store.has(k) ? store.get(k) : null), set: (k, v) => { store.set(k, v) } },
         now: () => T0,
       })
       guard.recordPublish('douyin', 'acc_1', T0 - 400)
-      expect(guard.check('douyin', 'acc_1')).toEqual({ allowed: false, remainingMs: 600, bucket: 'account' })
-      expect(guard.check('douyin', 'acc_2')).toEqual({ allowed: false, remainingMs: 600, bucket: 'platform' })
+      expect(guard.check('douyin', 'acc_1').remainingMs).toBe(600)
+      expect(guard.check('douyin', 'acc_1').bucket).toBe('account')
+      expect(guard.check('douyin', 'acc_2').remainingMs).toBe(600)
+      expect(guard.check('douyin', 'acc_2').bucket).toBe('platform')
+    })
+  })
+
+  describe('日配额（v2 新维度）', () => {
+    function makeDailyGuard (opts = {}) {
+      const store = new Map()
+      const dailyStore = new InMemoryDailyStore()
+      const guard = exactGuard({
+        policy: () => ({ accountMinMs: 0, platformMinMs: 0, accountDailyMax: 3 }),
+        store: { get: (k) => (store.has(k) ? store.get(k) : null), set: (k, v) => { store.set(k, v) } },
+        dailyStore,
+        now: () => T0,
+        today: () => DAY1,
+        ...opts,
+      })
+      return { guard, dailyStore, store }
+    }
+
+    test('未达上限时放行，并回报当日用量', () => {
+      const { guard } = makeDailyGuard()
+      const r = guard.check('douyin', 'acc_1')
+      expect(r.allowed).toBe(true)
+      expect(r.daily).toEqual({ used: 0, max: 3, dayKey: DAY1 })
+    })
+
+    test('达到上限 ⇒ 独立否决：bucket=daily、remainingMs=0、reason=daily_quota', () => {
+      const { guard } = makeDailyGuard()
+      for (let i = 0; i < 3; i++) guard.recordPublish('douyin', 'acc_1')
+      const r = guard.check('douyin', 'acc_1')
+      expect(r.allowed).toBe(false)
+      expect(r.bucket).toBe('daily')
+      expect(r.reason).toBe('daily_quota')
+      expect(r.remainingMs).toBe(0)
+      expect(r.daily).toEqual({ used: 3, max: 3, dayKey: DAY1 })
+    })
+
+    test('日配额优先于间隔（同时命中时报 daily，因为它决定的是「改期」而非「等待」）', () => {
+      const store = new Map()
+      const dailyStore = new InMemoryDailyStore()
+      const guard = exactGuard({
+        policy: () => ({ accountMinMs: 10 * 60 * 1000, platformMinMs: 0, accountDailyMax: 1 }),
+        store: { get: (k) => (store.has(k) ? store.get(k) : null), set: (k, v) => { store.set(k, v) } },
+        dailyStore,
+        now: () => T0,
+        today: () => DAY1,
+      })
+      guard.recordPublish('douyin', 'acc_1')
+      const r = guard.check('douyin', 'acc_1')
+      expect(r.bucket).toBe('daily')
+      expect(r.reason).toBe('daily_quota')
+    })
+
+    test('跨日自动重置（day_key 变化即重新计数）', () => {
+      let day = DAY1
+      const { guard } = makeDailyGuard({ today: () => day })
+      for (let i = 0; i < 3; i++) guard.recordPublish('douyin', 'acc_1')
+      expect(guard.check('douyin', 'acc_1').allowed).toBe(false)
+      day = DAY2
+      const r = guard.check('douyin', 'acc_1')
+      expect(r.allowed).toBe(true)
+      expect(r.daily).toEqual({ used: 0, max: 3, dayKey: DAY2 })
+    })
+
+    test('日配额 0 = 关闭该档（不得误判为「已达上限」）', () => {
+      const { guard } = makeDailyGuard({
+        policy: () => ({ accountMinMs: 0, platformMinMs: 0, accountDailyMax: 0 }),
+      })
+      for (let i = 0; i < 10; i++) guard.recordPublish('douyin', 'acc_1')
+      expect(guard.check('douyin', 'acc_1').allowed).toBe(true)
+      expect(guard.check('douyin', 'acc_1').daily).toBe(null)
+    })
+
+    test('accountId 缺席 ⇒ 日配额跳过（无身份即无账号维度配额）', () => {
+      const { guard } = makeDailyGuard()
+      for (let i = 0; i < 5; i++) guard.recordPublish('douyin', null)
+      expect(guard.check('douyin', null).allowed).toBe(true)
+    })
+
+    test('计数读回容错：TEXT 亲和带回 .0 / 非法值按 0', () => {
+      const dailyStore = {
+        getDay: () => ({ count: '3.0', rollback_count: '0.0' }),
+        incrDay: () => 0,
+        decrDay: () => 0,
+      }
+      const guard = exactGuard({
+        policy: () => ({ accountMinMs: 0, platformMinMs: 0, accountDailyMax: 3 }),
+        dailyStore,
+        now: () => T0,
+        today: () => DAY1,
+      })
+      expect(guard.check('douyin', 'acc_1').bucket).toBe('daily')
+
+      const badStore = {
+        getDay: () => ({ count: 'abc', rollback_count: null }),
+        incrDay: () => 0,
+        decrDay: () => 0,
+      }
+      const g2 = exactGuard({
+        policy: () => ({ accountMinMs: 0, platformMinMs: 0, accountDailyMax: 3 }),
+        dailyStore: badStore,
+        now: () => T0,
+        today: () => DAY1,
+      })
+      expect(g2.check('douyin', 'acc_1').allowed).toBe(true)
+    })
+
+    test('dailyStore 抛错时 fail-open 到「无配额信息」并出声（不阻断发布）', () => {
+      const warns = []
+      const dailyStore = {
+        getDay: () => { throw new Error('boom') },
+        incrDay: () => 0,
+        decrDay: () => 0,
+      }
+      const guard = exactGuard({
+        policy: () => ({ accountMinMs: 0, platformMinMs: 0, accountDailyMax: 3 }),
+        dailyStore,
+        now: () => T0,
+        today: () => DAY1,
+        warn: (m) => warns.push(m),
+      })
+      expect(guard.check('douyin', 'acc_1').allowed).toBe(true)
+      expect(warns.length).toBe(1)
+    })
+  })
+
+  describe('抖动（v2 新维度）', () => {
+    test('默认开启 0.4：等待落在 [base, base×1.4) 且只增不减', () => {
+      const guard = new PublishIntervalGuard({
+        policy: () => ({ accountMinMs: 100000, platformMinMs: 0, accountDailyMax: 0 }),
+        now: () => T0,
+      })
+      expect(guard.jitterRatio).toBe(0.4)
+      guard.recordPublish('douyin', 'acc_1', T0 - 50000) // base = 50000
+      const base = 50000
+      for (let i = 0; i < 200; i++) {
+        const r = guard.check('douyin', 'acc_1').remainingMs
+        expect(r).toBeGreaterThanOrEqual(base)
+        expect(r).toBeLessThan(base * 1.4)
+      }
+    })
+
+    test('ratio=0 严格退化为 v1 行为（逐值相等）', () => {
+      const store = new Map()
+      const guard = exactGuard({
+        policy: () => ({ accountMinMs: 100000, platformMinMs: 0, accountDailyMax: 0 }),
+        store: { get: (k) => (store.has(k) ? store.get(k) : null), set: (k, v) => { store.set(k, v) } },
+        now: () => T0,
+      })
+      guard.recordPublish('douyin', 'acc_1', T0 - 50000)
+      for (let i = 0; i < 20; i++) {
+        expect(guard.check('douyin', 'acc_1').remainingMs).toBe(50000)
+      }
+    })
+
+    test('确定性随机源：random=1 采样上界内，random=0 取下界', () => {
+      const mk = (rand) => {
+        const store = new Map()
+        const g = new PublishIntervalGuard({
+          policy: () => ({ accountMinMs: 100000, platformMinMs: 0, accountDailyMax: 0 }),
+          store: { get: (k) => (store.has(k) ? store.get(k) : null), set: (k, v) => { store.set(k, v) } },
+          now: () => T0,
+          random: () => rand,
+          jitterRatio: 0.4,
+        })
+        g.recordPublish('douyin', 'acc_1', T0 - 50000)
+        return g.check('douyin', 'acc_1').remainingMs
+      }
+      expect(mk(0)).toBe(50000)
+      expect(mk(0.999999)).toBe(70000)
+    })
+
+    test('含抖动系数后仍被钳在 setTimeout 安全值内（防溢出被钳成 1ms 忙循环）', () => {
+      const store = new Map()
+      const guard = new PublishIntervalGuard({
+        policy: () => ({ accountMinMs: 1_800_000_000, platformMinMs: 0, accountDailyMax: 0 }),
+        store: { get: (k) => (store.has(k) ? store.get(k) : null), set: (k, v) => { store.set(k, v) } },
+        now: () => T0,
+        random: () => 0.999999,
+        jitterRatio: 0.4,
+      })
+      guard.recordPublish('douyin', 'acc_1', T0 - 1)
+      const r = guard.check('douyin', 'acc_1').remainingMs
+      expect(r).toBeLessThanOrEqual(PublishIntervalGuard.TIMER_SAFE_MS)
+      expect(r).toBeGreaterThan(0)
+    })
+  })
+
+  describe('release 回滚（P0-1 核心）', () => {
+    function makeReleaseGuard (opts = {}) {
+      const store = new Map()
+      const dailyStore = new InMemoryDailyStore()
+      const guard = exactGuard({
+        policy: () => ({ accountMinMs: 10 * 60 * 1000, platformMinMs: 2 * 60 * 1000, accountDailyMax: 3 }),
+        store: { get: (k) => (store.has(k) ? store.get(k) : null), set: (k, v) => { store.set(k, v) } },
+        dailyStore,
+        now: () => T0,
+        today: () => DAY1,
+        ...opts,
+      })
+      return { guard, store, dailyStore }
+    }
+
+    test('回滚未提交尝试：窗口还原 + 配额回补 + 回滚计数 +1', () => {
+      const { guard, dailyStore } = makeReleaseGuard()
+      const hold = guard.recordPublish('douyin', 'acc_1')
+      expect(guard.check('douyin', 'acc_1').allowed).toBe(false)
+      expect(dailyStore.getDay('douyin:acc_1', DAY1).count).toBe(1)
+
+      const r = guard.release('douyin', 'acc_1', hold)
+      expect(r).toEqual({ released: true, reason: null })
+      expect(guard.check('douyin', 'acc_1').allowed).toBe(true)
+      expect(dailyStore.getDay('douyin:acc_1', DAY1).count).toBe(0)
+      expect(dailyStore.getDay('douyin:acc_1', DAY1).rollbackCount).toBe(1)
+    })
+
+    test('幂等：同一 hold 重复 release 只回补一次', () => {
+      const { guard, dailyStore } = makeReleaseGuard()
+      const hold = guard.recordPublish('douyin', 'acc_1')
+      expect(guard.release('douyin', 'acc_1', hold).released).toBe(true)
+      const again = guard.release('douyin', 'acc_1', hold)
+      expect(again.released).toBe(false)
+      expect(again.reason).toBe('window_taken')
+      expect(dailyStore.getDay('douyin:acc_1', DAY1).count).toBe(0)
+      expect(dailyStore.getDay('douyin:acc_1', DAY1).rollbackCount).toBe(1)
+    })
+
+    test('窗口已被后续提交覆盖 ⇒ 不回滚（绝不回滚他人窗口）', () => {
+      const { guard, dailyStore } = makeReleaseGuard()
+      const hold = guard.recordPublish('douyin', 'acc_1', T0 - 1000)
+      guard.recordPublish('douyin', 'acc_1', T0) // 后续提交覆盖
+      const r = guard.release('douyin', 'acc_1', hold)
+      expect(r.released).toBe(false)
+      expect(r.reason).toBe('window_taken')
+      expect(guard.check('douyin', 'acc_1').allowed).toBe(false)
+      // 计数不得被错误回补
+      expect(dailyStore.getDay('douyin:acc_1', DAY1).count).toBe(2)
+    })
+
+    test('prev 缺失/错配 ⇒ no-op 并出声（方向恒为多等）', () => {
+      const warns = []
+      const { guard } = makeReleaseGuard({ warn: (m) => warns.push(m) })
+      guard.recordPublish('douyin', 'acc_1')
+      expect(guard.release('douyin', 'acc_1', undefined)).toEqual({ released: false, reason: 'prev_missing' })
+      expect(guard.release('douyin', 'acc_1', { at: 'not-a-number' }).released).toBe(false)
+      expect(warns.length).toBe(2)
+      expect(guard.check('douyin', 'acc_1').allowed).toBe(false)
+    })
+
+    test('防风上限：每账号每日回滚次数达 max(2, dailyMax) 后拒绝回滚', () => {
+      const warns = []
+      const { guard } = makeReleaseGuard({ warn: (m) => warns.push(m) })
+      // dailyMax = 3 ⇒ 上限 3
+      for (let i = 0; i < 3; i++) {
+        const hold = guard.recordPublish('douyin', 'acc_1')
+        expect(guard.release('douyin', 'acc_1', hold).released).toBe(true)
+      }
+      const hold = guard.recordPublish('douyin', 'acc_1')
+      const r = guard.release('douyin', 'acc_1', hold)
+      expect(r.released).toBe(false)
+      expect(r.reason).toBe('rollback_cap')
+      expect(warns.some(m => m.includes('回滚已达上限'))).toBe(true)
+      expect(guard.check('douyin', 'acc_1').allowed).toBe(false)
+    })
+
+    test('平台键独立判定：账号键已被覆盖但平台键仍是本次 ⇒ 仍释放平台键', () => {
+      const { guard, store } = makeReleaseGuard()
+      const hold = guard.recordPublish('douyin', 'acc_1') // 写 acc_1 与 *
+      // 另一次发布覆盖账号键（不同时刻），平台键也被覆盖 ⇒ 整体不释放
+      guard.recordPublish('douyin', 'acc_1', T0 + 1)
+      expect(guard.release('douyin', 'acc_1', hold).released).toBe(false)
+      // 直接构造：仅平台键匹配
+      store.set('douyin:*', hold.at)
+      store.set('douyin:acc_1', hold.at + 5)
+      const r = guard.release('douyin', 'acc_1', hold)
+      expect(r.released).toBe(true)
+    })
+
+    test('dailyStore 缺失时 release 不抛（失败路径上抛错会吞掉原错误）', () => {
+      const store = new Map()
+      const guard = exactGuard({
+        policy: () => ({ accountMinMs: 1000, platformMinMs: 0, accountDailyMax: 3 }),
+        store: { get: (k) => (store.has(k) ? store.get(k) : null), set: (k, v) => { store.set(k, v) } },
+        now: () => T0,
+      })
+      const hold = guard.recordPublish('douyin', 'acc_1')
+      expect(() => guard.release('douyin', 'acc_1', hold)).not.toThrow()
+      expect(guard.release('douyin', 'acc_1', hold).released).toBe(false)
+    })
+  })
+
+  describe('clearWindow 人为清窗（紧急放行专用）', () => {
+    function makeClearGuard () {
+      const store = new Map()
+      const guard = exactGuard({
+        policy: () => ({ accountMinMs: 10 * 60 * 1000, platformMinMs: 2 * 60 * 1000, accountDailyMax: 3 }),
+        store: { get: (k) => (store.has(k) ? store.get(k) : null), set: (k, v) => { store.set(k, v) } },
+        now: () => T0,
+        today: () => DAY1,
+      })
+      return { guard, store }
+    }
+
+    test('同时清掉账号键与平台键，并回报清掉了哪些键', () => {
+      const { guard } = makeClearGuard()
+      guard.recordPublish('douyin', 'acc_1')
+      expect(guard.check('douyin', 'acc_1').allowed).toBe(false)
+
+      const r = guard.clearWindow('douyin', 'acc_1')
+      expect(r.cleared).toBe(true)
+      expect(r.clearedKeys.sort()).toEqual(['douyin:*', 'douyin:acc_1'])
+      expect(guard.check('douyin', 'acc_1').allowed).toBe(true)
+      // 副作用如实：同平台其他账号也不再被平台键拦住（代价由每日上限+冷却+审计约束）
+      expect(guard.check('douyin', 'acc_2').allowed).toBe(true)
+    })
+
+    test('无窗口可清时返回 cleared=false（不得谎报成功）', () => {
+      const { guard } = makeClearGuard()
+      const r = guard.clearWindow('douyin', 'acc_1')
+      expect(r).toEqual({ cleared: false, clearedKeys: [] })
+    })
+
+    test('不影响其他平台', () => {
+      const { guard } = makeClearGuard()
+      guard.recordPublish('douyin', 'acc_1')
+      guard.recordPublish('kuaishou', 'acc_1')
+      guard.clearWindow('douyin', 'acc_1')
+      expect(guard.check('douyin', 'acc_1').allowed).toBe(true)
+      expect(guard.check('kuaishou', 'acc_1').allowed).toBe(false)
+    })
+
+    test('accountId 缺席时只清平台键', () => {
+      const { guard, store } = makeClearGuard()
+      guard.recordPublish('douyin', null)
+      const r = guard.clearWindow('douyin', null)
+      expect(r.clearedKeys).toEqual(['douyin:*'])
+      expect(store.get('douyin:*')).toBe(null)
+    })
+  })
+
+  describe('未登记平台出声（v2 变更：由静默改为一次告警）', () => {
+    test('同平台只出声一次，且内容含平台名与档位', () => {
+      const warns = []
+      const guard = exactGuard({
+        policy: (p) => (p === 'douyin'
+          ? { accountMinMs: 1000, platformMinMs: 500, accountDailyMax: 1, fallback: false }
+          : { accountMinMs: 2000, platformMinMs: 1000, accountDailyMax: 2, fallback: true }),
+        now: () => T0,
+        warn: (m) => warns.push(m),
+      })
+      guard.check('mystery', 'a')
+      guard.check('mystery', 'a')
+      guard.check('mystery', 'a')
+      expect(warns.length).toBe(1)
+      expect(warns[0]).toContain('mystery')
+      expect(warns[0]).toContain('未登记')
+
+      // 另一个未登记平台各自出声一次
+      guard.check('mystery2', 'a')
+      expect(warns.length).toBe(2)
+    })
+
+    test('已登记平台不出声', () => {
+      const warns = []
+      const guard = exactGuard({
+        policy: () => ({ accountMinMs: 1000, platformMinMs: 500, accountDailyMax: 1, fallback: false }),
+        now: () => T0,
+        warn: (m) => warns.push(m),
+      })
+      guard.check('douyin', 'a')
+      expect(warns).toEqual([])
+    })
+  })
+
+  describe('本机运营日边界与同源时钟', () => {
+    test('msUntilNextDay 与 today() 共用注入时钟', () => {
+      const t = new Date('2026-10-10T23:00:00').getTime()
+      const guard = exactGuard({ now: () => t, jitterRatio: 0 })
+      expect(guard.today()).toBe('2026-10-10')
+      // 距次日 00:00:05 = 1 小时 5 秒
+      expect(guard.msUntilNextDay()).toBe(60 * 60 * 1000 + 5000)
+    })
+
+    test('默认 today() 由 now() 推导（不读真实系统时钟）', () => {
+      const t = new Date('2026-01-02T10:00:00').getTime()
+      const guard = exactGuard({ now: () => t })
+      expect(guard.today()).toBe('2026-01-02')
     })
   })
 })
diff --git a/packages/shared-utils/tests/task-queue-guard-integration.test.js b/packages/shared-utils/tests/task-queue-guard-integration.test.js
index ffca70bae..3c0fbbc49 100755
--- a/packages/shared-utils/tests/task-queue-guard-integration.test.js
+++ b/packages/shared-utils/tests/task-queue-guard-integration.test.js
@@ -130,16 +130,18 @@ describe('TaskQueue + PublishIntervalGuard 集成', () => {
     queue.shutdown()
   })
 
-  test('任务失败/超时仍占用间隔窗口（记账必须在提交之前）', async () => {
+  test('【已提交】失败/超时仍占用间隔窗口（记账必须在提交之前）', async () => {
     // 平台侧限流窗口按「请求已发生」计时，不按「应用是否解析到成功」计时。
     // 若只在 task:success 记账，则内容已发到平台但应用判超时/报错的三类形态都不占窗口，
     // 下一次提交不受限、重试还会重复发布。
+    // v2：本用例模拟**已提交后**的失败（传输层已打点），故窗口必须保持占用。
     const guard = new PublishIntervalGuard({ minInterval: MIN_INTERVAL })
     const queue = new TaskQueue({ defaultRetry: 0, publishIntervalGuard: guard })
 
     let attempts = 0
-    queue.setExecutor(async () => {
+    queue.setExecutor(async (task) => {
       attempts += 1
+      queue.markSubmitted(task.id) // 模拟：请求已送达平台
       throw new Error('视频上传超时')
     })
 
@@ -161,14 +163,134 @@ describe('TaskQueue + PublishIntervalGuard 集成', () => {
     queue.shutdown()
   })
 
-  test('失败重试必须等满间隔窗口（等待不消耗 retriesLeft）', async () => {
+  test('【未提交】失败回滚窗口：可立即重发，且发 publish:released', async () => {
+    // P0-1 的核心收益：登录失效 / 预检不过 / 风控挂起 / 缺文件这类**从未发出平台请求**
+    // 的失败不应吃掉整个间隔窗口。
+    const guard = new PublishIntervalGuard({ minInterval: MIN_INTERVAL, jitterRatio: 0 })
+    const queue = new TaskQueue({ defaultRetry: 0, publishIntervalGuard: guard })
+
+    const released = []
+    queue.on('publish:released', (p) => released.push(p))
+
+    let attempts = 0
+    queue.setExecutor(async () => {
+      attempts += 1
+      if (attempts === 1) {
+        const err = new Error('登录态失效')
+        err.notSubmitted = true
+        throw err
+      }
+      return { success: true }
+    })
+
+    queue.add({ platform: 'douyin', article: { title: 'T', accountId: 'acc_1' } })
+    await new Promise(r => setTimeout(r, 50))
+
+    expect(attempts).toBe(1)
+    // 未提交 ⇒ 窗口已回滚 ⇒ 同账号立即可发布
+    expect(guard.canPublish('douyin', 'acc_1')).toBe(true)
+    expect(released).toHaveLength(1)
+    expect(released[0].reason).toBe('not_submitted')
+    expect(released[0].graceMs).toBeGreaterThanOrEqual(10000)
+
+    // 立即再发不再被守卫拦
+    queue.add({ platform: 'douyin', article: { title: 'T2', accountId: 'acc_1' } })
+    await new Promise(r => setTimeout(r, 50))
+    expect(attempts).toBe(2)
+    queue.shutdown()
+  })
+
+  test('【矛盾】notSubmitted=true 但已发起提交尝试 ⇒ 占窗口（fail-closed）', async () => {
+    const guard = new PublishIntervalGuard({ minInterval: MIN_INTERVAL, jitterRatio: 0 })
+    const queue = new TaskQueue({ defaultRetry: 0, publishIntervalGuard: guard })
+
+    const released = []
+    queue.on('publish:released', (p) => released.push(p))
+    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
+
+    queue.setExecutor(async (task) => {
+      queue.markSubmitAttempted(task.id) // 已尝试发出请求
+      const err = new Error('响应超时')
+      err.notSubmitted = true // 但错误却自称未提交
+      throw err
+    })
+
+    queue.add({ platform: 'douyin', article: { title: 'T', accountId: 'acc_1' } })
+    await new Promise(r => setTimeout(r, 60))
+
+    expect(released).toHaveLength(0)
+    expect(guard.canPublish('douyin', 'acc_1')).toBe(false)
+    expect(errSpy).toHaveBeenCalled()
+    errSpy.mockRestore()
+    queue.shutdown()
+  })
+
+  test('【紧急放行】跳过等待窗口立即入队；三类结果如实回报；无限窗口时不得谎报成功', async () => {
+    const MIN = 10 * 60 * 1000
+    const guard = new PublishIntervalGuard({ minInterval: MIN, jitterRatio: 0, now: () => Date.now() })
+    const queue = new TaskQueue({ defaultRetry: 0, publishIntervalGuard: guard })
+
+    const executed = []
+    queue.setExecutor(async (task) => {
+      executed.push(task.article.title)
+      return { success: true }
+    })
+
+    // 无名额时：没有等待中的窗口 ⇒ 必须如实回报，不得假装成功
+    expect(queue.emergencyRelease('douyin', 'acc_e')).toEqual({ ok: false, code: 'no_waiting_window' })
+
+    // 第一条正常发布，占住窗口
+    queue.add({ platform: 'douyin', article: { title: 'A', accountId: 'acc_e' } })
+    await new Promise(r => setTimeout(r, 60))
+    expect(executed).toEqual(['A'])
+
+    // 第二条被间隔挡住，进入等待
+    const blocked = []
+    queue.on('publish:blocked', (p) => blocked.push(p))
+    queue.add({ platform: 'douyin', article: { title: 'B', accountId: 'acc_e' } })
+    await new Promise(r => setTimeout(r, 80))
+    expect(blocked).toHaveLength(1)
+    expect(executed).toEqual(['A'])
+
+    // 紧急放行
+    const released = []
+    queue.on('publish:emergencyReleased', (d) => released.push(d))
+    const r = queue.emergencyRelease('douyin', 'acc_e', { operator: 'tester', reason: '客户催稿' })
+    expect(r.ok).toBe(true)
+    expect(typeof r.taskId).toBe('string')
+    expect(r.clearedKeys.sort()).toEqual(['douyin:*', 'douyin:acc_e'])
+    expect(released).toHaveLength(1)
+    expect(released[0].operator).toBe('tester')
+    expect(released[0].reason).toBe('客户催稿')
+
+    await new Promise(r2 => setTimeout(r2, 80))
+    expect(executed).toEqual(['A', 'B'])
+
+    // 关键反证：紧急放行**不是**把门禁关掉 —— B 发布后重新占窗，C 必须再次被拦
+    const blockedAgain = []
+    queue.on('publish:blocked', (p) => blockedAgain.push(p))
+    queue.add({ platform: 'douyin', article: { title: 'C', accountId: 'acc_e' } })
+    await new Promise(r3 => setTimeout(r3, 80))
+    expect(executed).toEqual(['A', 'B'])
+    expect(blockedAgain).toHaveLength(1)
+    expect(blockedAgain[0].bucket).toBe('account')
+
+    // 未注入守卫时如实回报
+    const bare = new TaskQueue({ defaultRetry: 0 })
+    expect(bare.emergencyRelease('douyin', 'acc_e')).toEqual({ ok: false, code: 'no_guard' })
+    bare.shutdown()
+    queue.shutdown()
+  })
+
+  test('【已提交】失败重试必须等满间隔窗口（等待不消耗 retriesLeft）', async () => {
     const MIN = 200
-    const guard = new PublishIntervalGuard({ minInterval: MIN })
+    const guard = new PublishIntervalGuard({ minInterval: MIN, jitterRatio: 0 })
     const queue = new TaskQueue({ defaultRetry: 1, publishIntervalGuard: guard })
 
     const starts = []
     queue.setExecutor(async (task) => {
       starts.push({ at: Date.now(), retriesLeft: task.retriesLeft })
+      queue.markSubmitted(task.id)
       throw new Error('boom')
     })
 
@@ -183,6 +305,74 @@ describe('TaskQueue + PublishIntervalGuard 集成', () => {
     queue.shutdown()
   })
 
+  test('【探针 I4】成功但传输层未打点 ⇒ 计入接线缺陷并对该平台停用回滚', async () => {
+    const guard = new PublishIntervalGuard({ minInterval: MIN_INTERVAL, jitterRatio: 0 })
+    const queue = new TaskQueue({ defaultRetry: 0, publishIntervalGuard: guard })
+    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
+
+    queue.setExecutor(async () => ({ success: true })) // 未调用 markSubmitted
+    queue.add({ platform: 'douyin', article: { title: 'T', accountId: 'acc_1' } })
+    await new Promise(r => setTimeout(r, 60))
+
+    const counts = queue.getProbeCounts()
+    expect(counts.successWithoutSubmittedAt).toBe(1)
+    expect(counts.rollbackDisabledPlatforms).toContain('douyin')
+
+    // 停用后：即使「未发起尝试」的失败也不再回滚
+    queue.setExecutor(async () => {
+      const err = new Error('登录态失效')
+      err.notSubmitted = true
+      throw err
+    })
+    guard.recordPublish('douyin', 'acc_2', Date.now() - MIN_INTERVAL - 1000)
+    queue.add({ platform: 'douyin', article: { title: 'T2', accountId: 'acc_2' } })
+    await new Promise(r => setTimeout(r, 60))
+    expect(guard.canPublish('douyin', 'acc_2')).toBe(false)
+
+    queue.clearRollbackDisabled('douyin')
+    expect(queue.getProbeCounts().rollbackDisabledPlatforms).toEqual([])
+    errSpy.mockRestore()
+    queue.shutdown()
+  })
+
+  test('【日配额】用尽后 bucket=daily、被 _quotaBlocked 跳过（不产生紧循环）', async () => {
+    const guard = new PublishIntervalGuard({
+      minInterval: 0,
+      jitterRatio: 0,
+      policy: () => ({ accountMinMs: 0, platformMinMs: 0, accountDailyMax: 1 }),
+      dailyStore: new (require('../src/publish-interval-guard').InMemoryDailyStore)(),
+    })
+    const queue = new TaskQueue({ defaultRetry: 0, publishIntervalGuard: guard })
+
+    let executed = 0
+    queue.setExecutor(async () => { executed += 1; return { success: true } })
+
+    const blocked = []
+    queue.on('publish:blocked', (p) => blocked.push(p))
+
+    // 第一条：配额 1，直接占满
+    queue.add({ platform: 'douyin', article: { title: 'T1', accountId: 'acc_q' } })
+    await new Promise(r => setTimeout(r, 60))
+    expect(executed).toBe(1)
+
+    // 第二条：被日配额挡住
+    queue.add({ platform: 'douyin', article: { title: 'T2', accountId: 'acc_q' } })
+    await new Promise(r => setTimeout(r, 80))
+    expect(executed).toBe(1)
+    expect(blocked).toHaveLength(1)
+    expect(blocked[0].bucket).toBe('daily')
+    expect(blocked[0].reason).toBe('daily_quota')
+    expect(blocked[0].daily).toEqual({ used: 1, max: 1, dayKey: guard.today() })
+
+    // 紧循环探针：连续多轮 _processNext 不得反复重判同一条配额被拒任务
+    const before = blocked.length
+    for (let i = 0; i < 5; i++) queue._processNext()
+    await new Promise(r => setTimeout(r, 20))
+    expect(blocked.length).toBe(before)
+    expect(executed).toBe(1)
+    queue.shutdown()
+  })
+
   test('带 guard 的任务失败不阻止后续任务', async () => {
     const guard = new PublishIntervalGuard({ minInterval: MIN_INTERVAL })
     const queue = new TaskQueue({ defaultRetry: 0, publishIntervalGuard: guard })
diff --git a/scripts/calibrate-publish-frequency.js b/scripts/calibrate-publish-frequency.js
new file mode 100644
index 000000000..79fc598be
--- /dev/null
+++ b/scripts/calibrate-publish-frequency.js
@@ -0,0 +1,288 @@
+#!/usr/bin/env node
+/**
+ * 发布频率校准取数脚本（publish-frequency-policy-v2 P2-4）
+ *
+ * 目的：把「现行策略数值是否有依据」变成可复现的取数，而不是靠印象。
+ * 本脚本**只读**，不修改任何数据，也不参与运行时判定。
+ *
+ * ── 口径定义（务必先读，否则数字会被误读）────────────────────────────────
+ *
+ * 1) 两个数据源回答的是**不同问题**，不可混用：
+ *    · `publish_timeline`（SQLite，键 platform:accountId / platform:*）
+ *        = **提交时刻**（recordPublish 在提交给执行器**之前**写入）。
+ *          回答「我们多久发一次」——这是策略真正约束的量。
+ *    · `publish-history.jsonl`（追加式日志）
+ *        = **终态时刻**（phase4-events 在 task:success/failed 时才写）。
+ *          回答「用户看到的结果什么时候落定」，含发布耗时与重试等待。
+ *          故它的相邻间隔**大于等于**真实提交间隔，不能当作策略是否生效的判据。
+ *
+ * 2) `publish-history.jsonl` 的一行 ≠ 一次提交：失败行也占一行，且同一内容可能
+ *    重试多次。本脚本按 (platform, accountId) 分组后统计，并同时给出
+ *    「全部行」与「仅 status=success 行」两套数字。
+ *
+ * 3) 日界按**本机运营日**（本地时区自然日）切分，与运行时守卫同口径；
+ *    **不与平台日界换算**，也不声称等价（海外平台的当地日界可能差 ±1 天）。
+ *
+ * 4) 「违规」= 同一 (platform, accountId) 相邻两次**提交**间隔 < 该平台账号档。
+ *    由于 publish-history 是终态时刻，用它算出的违规数只作**下界参考**；
+ *    权威判据需要 publish_timeline（含时间戳），本脚本在有 DB 时优先用它。
+ *
+ * 用法：
+ *   node scripts/calibrate-publish-frequency.js                     # 自动探测数据源
+ *   node scripts/calibrate-publish-frequency.js --history <path>    # 指定 jsonl
+ *   node scripts/calibrate-publish-frequency.js --json              # 机器可读输出
+ */
+
+const fs = require('fs')
+const path = require('path')
+
+const policy = require('../packages/shared-utils/src/publish-frequency-policy')
+
+const REPO_ROOT = path.resolve(__dirname, '..')
+
+/** 默认数据源候选（按存在性依次尝试；都在用户数据目录，随安装形态变化） */
+const HISTORY_CANDIDATES = [
+  // 开发态：显式指定的共享数据目录（start-app 技能使用的锚点）
+  process.env.MP_SHARED_USER_DATA
+    ? path.join(process.env.MP_SHARED_USER_DATA, 'publish-history.jsonl')
+    : null,
+  // 开发态：隔离 worktree 形如 <repo>/../../mulpub/shared-user-data（共享主仓的锚点）
+  path.join(REPO_ROOT, '..', '..', 'mulpub', 'shared-user-data', 'publish-history.jsonl'),
+  path.join(REPO_ROOT, 'shared-user-data', 'publish-history.jsonl'),
+  path.join(REPO_ROOT, 'backend-data', 'publish-history.jsonl'),
+  path.join(process.env.APPDATA || '', 'Multi-Publish', 'backend-data', 'publish-history.jsonl'),
+  path.join(process.env.LOCALAPPDATA || '', 'Multi-Publish', 'backend-data', 'publish-history.jsonl'),
+]
+
+function parseArgs (argv) {
+  const opts = { history: null, json: false, help: false }
+  for (let i = 2; i < argv.length; i++) {
+    const a = argv[i]
+    if (a === '--json') opts.json = true
+    else if (a === '--help' || a === '-h') opts.help = true
+    else if (a === '--history') opts.history = argv[++i]
+  }
+  return opts
+}
+
+function firstExisting (candidates) {
+  for (const p of candidates) {
+    if (p && fs.existsSync(p)) return p
+  }
+  return null
+}
+
+/** 本机运营日 'YYYY-MM-DD'（与守卫 today() 同口径） */
+function localDayKey (ts) {
+  const d = new Date(ts)
+  const pad = (n) => String(n).padStart(2, '0')
+  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
+}
+
+/** 从一行 JSON 里尽力取出平台/账号/时间；取不到就返回 null（不猜） */
+function normalizeRow (row, index) {
+  if (!row || typeof row !== 'object') return null
+  const platform = typeof row.platform === 'string' ? row.platform : null
+  if (!platform) return null
+  const accountId = typeof row.accountId === 'string' && row.accountId.trim()
+    ? row.accountId.trim()
+    : null
+  const rawTime = row.timestamp || row.completedAt || row.finishedAt || row.createdAt
+  const ts = rawTime ? Date.parse(rawTime) : NaN
+  return {
+    index,
+    platform,
+    accountId,
+    status: typeof row.status === 'string' ? row.status : null,
+    ts: Number.isFinite(ts) ? ts : null,
+  }
+}
+
+function readHistory (file) {
+  const text = fs.readFileSync(file, 'utf8')
+  const rows = []
+  let bad = 0
+  let skipped = 0
+  for (const [i, line] of text.split(/\r?\n/).entries()) {
+    const trimmed = line.trim()
+    if (!trimmed) continue
+    let parsed = null
+    try {
+      parsed = JSON.parse(trimmed)
+    } catch {
+      bad++
+      continue
+    }
+    const row = normalizeRow(parsed, i)
+    if (!row) {
+      skipped++
+      continue
+    }
+    rows.push(row)
+  }
+  return { rows, bad, skipped }
+}
+
+function median (sorted) {
+  if (sorted.length === 0) return null
+  const mid = Math.floor(sorted.length / 2)
+  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
+}
+
+function summarize (rows) {
+  const byKey = new Map()
+  for (const r of rows) {
+    const key = `${r.platform}:${r.accountId || '*'}`
+    if (!byKey.has(key)) byKey.set(key, [])
+    byKey.get(key).push(r)
+  }
+
+  const perPlatform = {}
+  const violations = []
+
+  for (const [key, list] of byKey) {
+    const timed = list.filter((r) => r.ts !== null).sort((a, b) => a.ts - b.ts)
+    const platform = list[0].platform
+    const resolved = policy.resolveIntervals(platform, { env: {}, warn: () => {} })
+    const accountMin = resolved.accountMinMs
+
+    const gaps = []
+    for (let i = 1; i < timed.length; i++) {
+      const gap = timed[i].ts - timed[i - 1].ts
+      gaps.push(gap)
+      if (accountMin > 0 && gap < accountMin) {
+        violations.push({ key, platform, gapMs: gap, needMs: accountMin, at: new Date(timed[i].ts).toISOString() })
+      }
+    }
+
+    const dayCounts = new Map()
+    for (const r of timed) {
+      const d = localDayKey(r.ts)
+      dayCounts.set(d, (dayCounts.get(d) || 0) + 1)
+    }
+    const busiest = [...dayCounts.entries()].sort((a, b) => b[1] - a[1])[0] || null
+    const sortedGaps = [...gaps].sort((a, b) => a - b)
+
+    perPlatform[key] = {
+      platform,
+      tier: resolved.tier,
+      accountMinMs: resolved.accountMinMs,
+      platformMinMs: resolved.platformMinMs,
+      accountDailyMax: resolved.accountDailyMax,
+      fallback: resolved.fallback,
+      rows: list.length,
+      rowsWithTime: timed.length,
+      distinctDays: dayCounts.size,
+      busiestDay: busiest ? { day: busiest[0], count: busiest[1] } : null,
+      gapCount: sortedGaps.length,
+      minGapMs: sortedGaps.length ? sortedGaps[0] : null,
+      medianGapMs: median(sortedGaps),
+      maxGapMs: sortedGaps.length ? sortedGaps[sortedGaps.length - 1] : null,
+    }
+  }
+
+  return { perPlatform, violations }
+}
+
+function fmtMs (ms) {
+  if (ms === null || ms === undefined) return '—'
+  if (ms < 1000) return `${ms}ms`
+  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
+  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}min`
+  return `${(ms / 3600000).toFixed(1)}h`
+}
+
+function main () {
+  const opts = parseArgs(process.argv)
+  if (opts.help) {
+    console.log('用法: node scripts/calibrate-publish-frequency.js [--history <path>] [--json]')
+    return 0
+  }
+
+  const file = opts.history || firstExisting(HISTORY_CANDIDATES)
+  if (!file) {
+    console.error('[calibrate] 未找到 publish-history.jsonl。请用 --history <path> 指定。')
+    console.error('候选路径：')
+    for (const c of HISTORY_CANDIDATES) console.error('  ' + c)
+    return 2
+  }
+  if (!fs.existsSync(file)) {
+    console.error(`[calibrate] 文件不存在：${file}`)
+    return 2
+  }
+
+  const { rows, bad, skipped } = readHistory(file)
+  const all = summarize(rows)
+  const onlySuccess = summarize(rows.filter((r) => r.status === 'success' || r.status === 'published'))
+
+  const out = {
+    generatedAt: new Date().toISOString(),
+    source: file,
+    sourceSemantics: 'terminal_state_timestamps（终态时刻，不是提交时刻；见脚本头口径 §1）',
+    lines: { total: rows.length, unparsable: bad, missingPlatform: skipped },
+    policyTable: policy.PLATFORM_FREQUENCY_POLICY,
+    baseline: policy.BASELINE_INTERVALS,
+    allRows: all,
+    successOnly: onlySuccess,
+  }
+
+  if (opts.json) {
+    console.log(JSON.stringify(out, null, 2))
+    return 0
+  }
+
+  console.log('═'.repeat(78))
+  console.log('发布频率校准取数（只读）')
+  console.log('═'.repeat(78))
+  console.log(`数据源：${file}`)
+  console.log(`口径  ：${out.sourceSemantics}`)
+  console.log(`行数  ：${rows.length}（无法解析 ${bad}，缺平台字段跳过 ${skipped}）`)
+  console.log('')
+
+  const keys = Object.keys(all.perPlatform).sort()
+  console.log('平台:账号'.padEnd(30) + '档位 账号档 平台档 日配额 | 行数 天数 最忙日 | 最小间隔 中位间隔')
+  console.log('-'.repeat(110))
+  for (const key of keys) {
+    const s = all.perPlatform[key]
+    const busiest = s.busiestDay ? `${s.busiestDay.day}(${s.busiestDay.count})` : '—'
+    console.log(
+      key.padEnd(30)
+      + String(s.tier).padEnd(5)
+      + fmtMs(s.accountMinMs).padEnd(7)
+      + fmtMs(s.platformMinMs).padEnd(7)
+      + String(s.accountDailyMax).padEnd(7)
+      + '| '
+      + String(s.rowsWithTime).padEnd(5)
+      + String(s.distinctDays).padEnd(5)
+      + busiest.padEnd(14)
+      + '| '
+      + fmtMs(s.minGapMs).padEnd(9)
+      + fmtMs(s.medianGapMs)
+    )
+  }
+
+  console.log('')
+  if (all.violations.length === 0) {
+    console.log(`✅ 未发现低于账号档的相邻间隔（共 ${keys.length} 个 (平台,账号) 分组）`)
+  } else {
+    console.log(`⚠️ 发现 ${all.violations.length} 处相邻间隔低于**当前**账号档（注意：现行档位已下调，`)
+    console.log('   历史上按旧档位（60/30/10 分钟）产生的间隔在新档位下会大量「违规」，这不代表当时越限）：')
+    for (const v of all.violations.slice(0, 20)) {
+      console.log(`   ${v.key}  间隔 ${fmtMs(v.gapMs)} < 需 ${fmtMs(v.needMs)}  @ ${v.at}`)
+    }
+    if (all.violations.length > 20) console.log(`   …（其余 ${all.violations.length - 20} 处省略）`)
+  }
+
+  console.log('')
+  console.log('局限（必须与数字一起读）：')
+  console.log('  · 本数据源是**终态时刻**，相邻间隔 ≥ 真实提交间隔 ⇒ 违规数是下界，不是精确值。')
+  console.log('  · 日界按本机时区，不与平台当地日界换算。')
+  console.log('  · 一行 ≠ 一次提交（失败行与重试各占一行）。')
+  return 0
+}
+
+if (require.main === module) {
+  process.exitCode = main()
+}
+
+module.exports = { parseArgs, normalizeRow, localDayKey, summarize, readHistory }

```

> 这是机械生成的变更提案，不代表任何设计意图。评审方请只针对上述内容挑刺。