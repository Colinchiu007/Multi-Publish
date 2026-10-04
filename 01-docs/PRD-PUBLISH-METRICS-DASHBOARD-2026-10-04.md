# PRD：P2-6c 作品互动回流看板（publish-metrics-dashboard）

> 立项文档：`01-docs/PRD-PUBLISH-PAGE-OPTIMIZATION-2026-10-08.md` §六「P2-6 数据回流」第 ① 项缺口
> 前序切片：P2-6a 发布统计按 status 定终态（#2807）、P2-6b 发布历史↔表现数据关联键（#2861）
> 基线 `origin/main` = `73ebbcfd9`；实现分支 `publish-metrics-dashboard`；日期 2026-10-04
> 类型：运行时代码（主进程 + IPC + 渲染层），隔离 worktree `D:\Data\projects\mp-worktrees\mp-publish-metrics-dashboard`

---

## 〇、一句话

把「数据看板」页从**只有发布数 + 三个硬编码假百分比**，升级为**真的读得到回流数据**：作品级互动总量、30 天日增趋势、平台分布、回采健康度；同时把无法由数据支撑的假变化量从界面上撤掉。

---

## 一、现状勘察（本机实测，逐条可重跑）

### 1.1 数据源确实存在，但本机两份真实 userData 均为空

| 位置 | 表/文件 | 实测 |
| --- | --- | --- |
| `D:\tmp\Multi-Publish-debug-profile\multi-publish.db` | `tracked_content` / `performance_snapshot` / `pattern_performance` / `rewrite_history` | **0 / 0 / 0 / 0 行**（18 张表仅 `settings=2`、`model_providers=55` 非空） |
| `C:\Users\to_co\AppData\Roaming\@multi-publish\desktop\multi-publish.db` | 同上 | **0 / 0 / 0 / 0 行**（仅 `settings=1`、`model_providers=55` 非空） |
| 全盘 `publish-history.jsonl` | 发布历史真源是 JSONL，不是 sqlite 表 | `find /c/Users/to_co /d/tmp /d/Temp -maxdepth 6 -name publish-history.jsonl -size +500c` = **0 命中**（存在的都是 2 行的测试临时夹具） |

取证方式：`node:sqlite` `readOnly:true`，`SELECT COUNT(*)`，未解密任何凭证表。复跑命令见 §八 8.3。

**由此得出两条对设计的硬约束**：

1. **首屏空态是常态，不是异常**。看板必须把「从未发布」「发布过但未进回采」「平台不支持回采」「回采失败」四种空态区分开，否则用户看到 0 会以为功能坏了。
2. **roadmap PRD §六 里「`performance_snapshot` 实测非零」这句在本机不可复现**。该结论是前任在某份 profile 上的一次性观测，本文不复制它作为依据；写链（`phase4-events` 建 `tracked_content` → `performance-recrawl-service` 写快照）本身经代码核实存在，但**是否真的跑通过，属 §七 的待取证项**（需要一次真实发布 + 等回采节奏，与 P0-1 取证清单同一条依赖）。

### 1.2 数据看板页当前的数字来源（`apps/desktop/src/views/Dashboard.vue`）

| 界面元素 | 行号 | 数据来源 | 判定 |
| --- | --- | --- | --- |
| 「总发布」大卡片 | `:25` | `totalArticles` ← `platformData`（`:242`）← `sync:cached` | 真数据，但**与下方「累计发布」（`:80`，来自 `dashboard:stats` 的发布历史）是两个不同口径的"发布数"**，同页并排 |
| 「总阅读 / 总评论 / 总粉丝」 | `:36 :47 :58` | `platformData` 的 `views/comments/followers`（账号级创作者中心同步，TTL 缓存） | 真数据（账号级，**不是作品级**） |
| `+8.5%`（阅读）/ `+23%`（评论）/ `-2.1%`（粉丝）/ `↑` + `weekChange`（总发布） | `:40 :51 :62 :27-30` | **无任何数据源，写死在模板里** | 🔴 **假数据展示给用户**。`getAllCachedData()`（`packages/shared-utils/src/data-sync.js:116`）只返回每平台**一份**最新 `SyncResult`（带 TTL），没有时间序列 ⇒ 周变化在现有数据下**根本算不出来**，只能撤掉或换成真能算的 |
| 「发布趋势（最近 14 天）」「平台分布」「最近发布」 | `:99 :124 :144` | `dashboard:stats` 的 `daily` / `perPlatform` + `history:list` | 真数据（**口径只有发布数/成功率，无任何互动指标**——正是 §六 缺口 ①） |
| 互动指标（views/likes/comments/favorites/shares，作品级） | — | `performance_snapshot` 表 | **全仓渲染层零消费**：`git grep -ln performance_snapshot origin/main -- apps/desktop/src` = 0 命中 ⇒ 采到的数据没有任何地方看得见 |

**真实缺口收敛为三件事**：① 作品级互动数据（已落库）无人展示；② 页面上「变化量」是假的；③ 回采链路的健康度（覆盖了多少作品、哪些平台不支持、哪些失败）用户完全无从知道，只能靠日志。

---

## 二、目标与非目标

**目标**
- G1 提供作品级互动回流总量的**唯一聚合实现**（主进程一处），渲染层不得自己拼 SQL 或自己求和。
- G2 看板上能看到：总播放/点赞/评论/收藏/转发、30 天日增趋势、按平台分布、回采健康度（覆盖率 + 状态计数 + 最近回采时间）。
- G3 撤掉页面上无法由数据支撑的假百分比，换成能支撑的「数据截至」。
- G4 四种空态可区分，文案给出下一步动作。

**非目标（明确不做，防范围蔓延）**
- 不做账号级粉丝趋势（`data-sync` 无时间序列，要做先得先加历史留存层，是另一个切片）。
- 不做抖音/小红书/公众号互动 parser 接入（依赖真机端点取证，与 P0-1 同一条外部依赖）。
- 不动 `pattern_performance` 归因链（`rewrite_history_id` 二跳是 §九 登记的独立欠账）。
- 不新增导出/图表下载、不做时间范围选择器（默认 30 天窗口先满足看板诉求）。

---

## 三、数据校验（口径与判据，全部可测）

聚合的唯一真源判据由纯函数 `buildPerformanceOverview()` 持有（`apps/desktop/electron/services/performance-overview.js`），不依赖数据库，便于逐条断言。

| # | 判据 | 理由 |
| --- | --- | --- |
| V1 | **总量一律「每个作品取其最新一份快照」后再求和，禁止跨快照求和** | `views/likes/...` 是**累计计数**（采一次比上一次只增不减），跨快照求和会把同一作品重复计入 N 倍，是"总量虚高"的最典型错法 |
| V2 | 「最新一份」的排序键是 `captured_at` 字符串（ISO，同格式下字典序＝时间序），并列时以入参顺序的后者为准 | 与 `getLatestSnapshot()`（`performance-loop-store.js:211`）的 `ORDER BY captured_at DESC, rowid DESC` 同口径；入参已由 store 按同一键排序 |
| V3 | `captured_at` 缺失/不可解析的快照：**不进趋势**（计入 `droppedUndated`），但**可作总量里的最新值**（总量不依赖时间） | 时间不可信时宁可丢趋势点，也不丢用户已经采到的数字 |
| V4 | 孤儿快照（`tracked_content_id` 关联不到入参里的作品）**不参与任何聚合**，单独计数 `orphanSnapshots` | 静默丢弃会让「看板比实际少」无从解释；计数是排障现场 |
| V5 | 指标值非有限数或为负 → 归零并计入 `invalidMetrics`；不抛错、不整条丢弃 | 采集侧解析失败会产出零值/异常值（`platform-metrics/index.js` 注释自述「解析失败返回零值由上层记 failed」），看板不该因一条脏数据整体失效 |
| V6 | 作品 `platform` 归一：`String(x).trim().toLowerCase()`，空值归到 `''`（渲染层显示为「未知平台」） | 与回采侧一致；大小写/空格漂移会造成同一平台两张卡 |
| V7 | **日增量 = 相邻两份快照之差，负差按 0 计并计入 `retreats`** | 平台侧删除/重置会让累计值回落；负的"当日新增"在图上不可解释，但必须留痕（回落是真实现象，不能当没发生） |
| V8 | **作品的首份快照整份计为其采集日的增量**，并在文档与界面提示里写明「首日含发布到首次回采之间的全部积累」 | 首采默认排期 T+1h（`listDueForRecrawl`），所以这部分基本落在发布当天；差分没有"上一份"可比，不记就等于丢掉首日的量 |
| V9 | 趋势按入参 `windowDays` 截断，**窗口内缺失的日期补 0**（不省略、不留空洞） | 省略日期会让柱状图的"相邻两天"其实是隔了五天，用户读出的趋势是错的 |
| V10 | `windowDays` 取 `clamp(7, 90)`，非法/缺省回落 30 | 防止渲染层传 `NaN`/负数把窗口算成空 |
| V11 | `nowMs` 由入参传入（缺省 `Date.now()`），纯函数内不读全局时钟 | 可测性：趋势分桶与「最近 7 天 / 前 7 天」的切分必须能用假时钟复现 |
| V12 | 周变化 `(近 7 天新增 − 前 7 天新增)` 只在**前 7 天基线 > 0** 时产出百分比；基线为 0 时返回 `null`，界面显示「数据积累中」 | `0 → 5` 写成 `+∞%` 或 `+100%` 都是假结论；这是 §1.2 那三个假数字的同族错误 |
| V13 | 入参非法（`trackedRows`/`snapshotRows` 非数组）→ 返回**结构完整的全零结果** + `hasData:false`，不抛错 | IPC 边界必须恒有信封；抛错会让看板整块空白且无任何提示 |
| V14 | **读侧查询失败必须出声**：store 两个查询返回 `error` 字段，handler 据此回 `REQUEST_ERROR`；表缺失用 `sqlite_master` 显式探测 | 本仓 sqlite 包装层对「表不存在」的查询**不抛错**（本机实测：`prepare()` 正常返回、`get()` 给 `undefined`），所以 `try/catch` 结构对这一类故障完全免疫；不探测就会把「没拿到数据」渲染成「从未发布」的空态（QM-6 后端轴 FB7，两个评审模型独立命中同一处） |
| V15 | 登录门禁判定必须覆盖**两种形态**：`{code:-3}` 信封（主进程 access-control 拒绝）与 `throw LicensePermissionError`（preload 在 invoke **之前**抛出） | `invokeWithFallback` 不捕获异常，未登录的真实链路走的是 reject 分支；只判信封会把「没登录」写成「加载失败」（QM-6 后端轴 FB6）。判据取 `error.name`/`error.code` 契约字段，不取错误文案 |

**空态与归因必须同时在场**：面板的健康度块（覆盖率 / `unsupported` / `failed` / 最近回采时间）**不放进「有数据」分支**——全平台不支持回采时用户看到的不能只有一句「尚未回采」，还得看到"为什么"（QM-6 后端轴 FB8）。

**时刻解析（V1/V2 的支撑）**：`captured_at` 一律经 `toEpochMs()` 解析（`Date.parse` 优先，10/13 位纯数字串按 epoch 秒/毫秒补，实测 V8 的 `Date.parse('1728000000000')` 返回 NaN 故必须显式补），**排序与分桶都用解析值**，不用字符串字典序；分桶键是解析后的 **UTC 日**。字典序的两个失败方向都实测过：把 epoch 判成不可解析会让它「永远不赢」，因此 T27 **两个方向都测**（epoch 更新时必须赢、epoch 更旧时必须输）。


**归属口径**（与 P2-6b 的 legacy 分桶同源）：查询按 `owner_subject` 过滤。当前身份可解析时只取该身份的作品；身份服务缺席（legacy 模式）时取「无归属 / 空串 / `__legacy__`」这一桶。`LEGACY_OWNER_SUBJECT` 一律 import 自 `store-schema.js`，禁止在 SQL 里手打字符串字面量。

**扫描上限**：作品 2000 条、快照 20000 条（常量 `OVERVIEW_TRACKED_LIMIT` / `OVERVIEW_SNAPSHOT_LIMIT`，可经环境变量覆盖以便排障）。超限**不静默截断**：结果里返回 `truncated:true` + 实际计数，界面在面板底部如实提示「统计基于最近 N 条」。

---

## 四、流程

```
发布成功 task:success
  → phase4-events 建 tracked_content（已有链路，P2-6b 已把 publish_history_id 打通）
  → performance-recrawl-service 按 T+1h / 采样节奏抓互动数 → addPerformanceSnapshot（已有）
──────────────────────────────────────────────────────────────  本次新增 ──────────────────────────────────────────────────────
用户打开「数据看板」
  → 渲染层 loadPerformanceOverview() → api.performanceOverview({ windowDays: 30 })
  → preload(publish.js) → ipc 'performance:overview'
      ├─ getOwnerSubject() === null → { code: AUTH_ERROR }（与 dashboard:stats 同一门禁，渲染层复用既有登录门禁态）
      ├─ store.listTrackedForOverview(owner)      → 作品行（含 recrawl_status）
      ├─ store.listSnapshotsForOverview(over Tracked ids, owner) → 快照行（按作品、时间升序）
      └─ buildPerformanceOverview({...})（纯函数，唯一口径）
  → { code: 0, data: { totals, trend[], byPlatform[], health, weekChange, diagnostics } }
```

**为什么触发点是"打开看板时算"而不是"回采后预聚合落一张表"**：回流数据量级是 2000 作品 × 若干快照，纯内存聚合一次是毫秒级；预聚合会引入第二份真源和失效时机问题（新增快照后何时重算），与 §三 V1 的「每作品取最新」判据叠起来更容易漂移。

**为什么快照查询要带上「窗口起点之前」的快照**：日增需要前一份做基线。实现上不做时间过滤（一次取该归属下的全部快照，受 `OVERVIEW_SNAPSHOT_LIMIT` 约束），截断只在聚合层按 `windowDays` 做——这样 V8 的首日归属和 V7 的回落检测都能拿到完整序列。

---

## 五、交互逻辑

| 场景 | 界面行为 |
| --- | --- |
| 未登录（`getOwnerSubject()` 返回 null） | 复用页面既有登录门禁条（`data-testid="dashboard-login-gate"`），互动回流面板整块不渲染，不额外造第二套门禁 |
| 有门禁通过后、无任何作品 | 面板显示空态：主文案 + 「去发布」引导（不显示柱状图骨架，避免"有图但全是 0"读成故障） |
| 有作品、快照全为空 | 显示「已登记 N 篇作品，尚未回采到互动数据」+ 最近一次回采时间（无则显示"从未回采"），趋势/分布区域不渲染 |
| 部分平台不支持回采 | 健康度行如实列出 `unsupported` 计数并点名平台；总量卡片**不因缺数据而补 0 假装完整**（缺就是缺，靠覆盖率表达） |
| 数据被扫描上限截断 | 面板底部一行小字说明「统计基于最近 N 条作品/快照」 |
| 刷新 | 跟随页面既有「⟳ 刷新数据」按钮（`refreshSync`），不新增独立按钮，避免两个刷新入口各自拿到不同时刻的数据 |
| IPC 失败/返回非 0 | 保持上一次成功数据不变 + `ElMessage.error` 走 locale 文案；不得把失败渲染成「0 次互动」 |

**不接入浮层挂起**（本面板非模态、无遮罩，AGENTS.md 浮层互斥合同只约束模态浮层）。

---

## 六、显示项与提示文字

显示项（新增面板 `PerformanceFlowPanel.vue`）：

| 区块 | 内容 | 口径 |
| --- | --- | --- |
| 总量 5 卡 | 播放 / 点赞 / 评论 / 收藏 / 转发 | §三 V1（每作品最新快照求和），≥1 万显示 `x.x万`（沿用页面既有 `totalViews > 10000` 的呈现习惯） |
| 变化量 | 近 7 天互动合计的周变化（点赞+评论+收藏+转发，播放单列不计入"互动"以免口径混淆） | V12，基线为 0 时显示「数据积累中」而不是百分比 |
| 趋势图 | 30 天**日增**柱状（互动 = 点赞+评论+收藏+转发；播放另给一条口径说明） | V7/V8/V9 |
| 平台分布 | 按互动合计降序，每行：平台名 + 占比条 + 播放/互动数字 | V6 |
| 回采健康度 | 覆盖率（有快照作品 / 全部作品）、`unsupported`/`failed`/`pending` 计数、最近回采时间 | 来自 `tracked.recrawl_status` |
| 诊断行 | `orphanSnapshots`、`retreats`、`invalidMetrics`、`droppedUndated`、`truncated` 仅在 >0 时出现 | §三 各计数，给用户可复制给支持同学的现场 |

提示文字（新增 locale 键，zh/en 成对；面板内不得出现中文字面量——Gate 7 与 CJK 基线扫描）：

`dashboard.metrics.title / subtitle / views / likes / comments / favorites / shares / trendTitle / trendHint / platformTitle / unknownPlatform / healthTitle / healthCoverage / healthUnsupported / healthFailed / healthLastAt / healthLastNever / weekUp / weekDown / weekFlat / weekInsufficient / emptyTitle / emptyNoContent / emptyNoSnapshot / truncatedNote / diagLine / loginRequired / loadFailed`（共 28 键，与 `locales/zh.js` 实测逐字对齐；`dashboard.totalViews / totalComments / totalFollowers` 另计）

显示项纠偏（对既有元素）：

- 删除 `+8.5%`（`:40`）、`+23%`（`:51`）、`-2.1%`（`:62`）三处硬编码假百分比，以及「总发布」卡片里无数据支撑的 `↑ + weekChange`（`:27-30`）。
- 替换为真实可支撑的「数据截至 `syncedAt`」（该字段本就来自 `sync:cached`），无同步记录时整行不渲染。
- 结构锁：新增测试断言 `Dashboard.vue` 模板不再出现「数字 + %」形态的变化量字面量（见 §八 T14），防止下一个会话顺手再写回去。

样式取值（面板 `<style scoped>`）：

- 一律用 `var(--token)`，**不得写 `var(--token, #hex)` 形式的兜底**。两条实测理由：① Gate 14 按字面量计数，`#f472b6` 这类历史品牌色即便只作兜底也计入基线（本 PR 首跑即 130 > 129 变红）；② Gate 15c「未定义 CSS 变量」只拦**无兜底**的引用（`check-css-var-defined.js` 明文「带 fallback 的 `var(--x, ...)` 不拦」），所以兜底会同时掩盖「token 根本不存在」——实测 `--color-bg-secondary` 全仓 0 处定义，靠兜底渲染时深色主题下该卡片会恒为浅色，已改用真实存在的 `--color-bg-inset`（浅色 `#faf6f8` / 深色 `#1e1e23`）。
- 本面板用到的 token 逐个核过定义位置：`--color-success / --color-danger / --color-text-secondary / --color-border / --color-bg-inset` 在 `src/styles/tokens.css`（深浅两套各一份）；`--lavender-primary / --lavender-accent` 由 `Dashboard.vue` 的 `:global(:root)` 声明并沿 DOM 继承到子组件，与页面既有图表同色，历史字面量仍只留在 `Dashboard.vue` 的声明处（属基线存量，本 PR 不新增）。
- 尺寸类（`--font-size-*` / `--space-*` / `--radius-*`）保留 px 兜底：它们不是色值、Gate 14 不计，且 px 兜底不会伪装成「另一种主题色」。

---

## 七、待取证（不属可离线范围，如实登记）

1. 真实发布 → `tracked_content` 是否真的建行（本机两份 profile 皆 0 行，无法证伪也无法证实）。
2. `performance-recrawl-service` 在真实排期下是否产出过快照（同上）。
3. 四个已注册 parser（zhihu/baijiahao/kuaishou/bilibili）在真实登录态下的取数成功率。
这三项需要一次真实发布 + 等待回采窗口，属 P0-1 取证清单同族依赖（`01-docs/AUDIT-REQUERY-EVIDENCE-CHECKLIST-2026-10-09.md`），需用户授权后执行。

---

## 八、验收标准

### 8.1 测试矩阵（先写测试后实现）

`services/performance-overview.test.js`（纯函数，逐判据）
- T1 总量 = 每作品最新快照之和（同作品两份快照不得重复计入；断言精确数字）
- T2 最新快照并列时按入参后者为准（V2）
- T3 无日期快照：进总量、不进趋势、`droppedUndated=1`（V3）
- T4 孤儿快照：不进任何聚合、`orphanSnapshots=1`（V4）
- T5 脏指标（负数 / NaN / 字符串）→ 归零 + `invalidMetrics` 计数，不抛错（V5）
- T6 平台名大小写与空格归一（V6）
- T7 回落：`10 → 4` 记 0 增量且 `retreats=1`（V7）
- T8 首份快照整份计入采集日（V8）
- T9 趋势补零：窗口内无数据的日期必须存在且为 0（V9，精确数组断言）
- T10 `windowDays` clamp（0 / 负 / NaN / 200 → 30 或 7/90 边界）（V10）
- T11 假时钟：`nowMs` 决定近 7 天/前 7 天分桶（V11）
- T12 周变化：基线 0 → `null`；基线 >0 → 精确百分比（V12）
- T13 入参非数组 → 全零结构 + `hasData:false`，且不抛（V13）
- T14 覆盖率与健康度计数与 `recrawl_status` 一致

`store/performance-loop-store-overview.test.js`（真 sqlite，`os.tmpdir()` 隔离目录）
- T15 查询返回列最小集、排序键 `tracked_content_id, captured_at, rowid`
- T16 归属过滤：真实身份只取本人；legacy 桶（NULL/空串/`__legacy__`）在无身份时可取
- T17 超限返回 `truncated:true` 且行数不超过上限（不静默）

`ipc-handlers/performance-loop.test.js`（追加）
- T18 `identityService` 给出 sub → 走聚合、信封 `code:0`、字段齐
- T19 `getOwnerSubject()` 返回 null → `AUTH_ERROR`，**不得**返回全零成功信封（否则未登录看到 0 会以为没数据）
- T20 store 抛错 → `REQUEST_ERROR` + 不冒泡
- T21 接线锁：`performance:overview` 必须在 `ipc-handlers/index.js` 的注册面上（防"写了 handler 没人挂"）

`preload/api` 接线锁
- T22 `preload/publish.js` 暴露 `performanceOverview`，且 `preload.test.js` 的 API 名单含该键；`src/api/publisher.js` 有对应 `invokeWithFallback` 封装与兜底信封（无 `electronAPI` 时不抛）

`views/Dashboard.test.js` + 新组件测试
- T23 面板拿到 `code:0` 数据 → 渲染总量/趋势/分布（真实数据路径，不得只测空数组）
- T24 四种空态文案互斥（无作品 / 有作品无快照 / 不支持 / 截断说明）
- T25 `Dashboard.vue` 模板不再含假百分比字面量（结构锁），且「数据截至」由 `syncedAt` 驱动
- T26 未登录门禁态下面板不渲染、复用既有门禁条

### 8.2 反证（已实跑，10/10 变红并逐条归因）

驱动：`D:/Data/projects/.tools/tmp/p026c-counterproof.js`（日志 `p026c-counterproof.log`）。
每条变异都先断言锚点唯一命中（`ANCHOR_MISS` / `ANCHOR_AMBIGUOUS` 与「锁没抓到」分开报），
再要求**变红的测试名里含有该条声称要守的那条判据**（`RED_WRONG_TEST` 单独成码），
收尾断言还原后与备份逐字节相同 + 基线复跑为绿。五条基线（聚合 / IPC / Dashboard / 存储 / 接线）跑前均绿。

| # | 变异 | 实测 |
| --- | --- | --- |
| M1 | 总量代表改成「最旧快照」 | 红 3（T1/T2/T12b 族） |
| M2 | 趋势不再补零，缺日直接省略 | 红 6（T9/T11/T13 等） |
| M3 | 零基线也出百分比 | 红 2（T12 系） |
| M4 | 认不出身份不再 fail closed | 红 1（T19） |
| M5 | 把 `+8.5%` 写回模板 | 红 1（假数字结构锁） |
| M6 | 摘掉 Dashboard 的面板挂载 | 红 3（含接线与数字转发） |
| M7 | 归属过滤退化成 `WHERE 1 = 1`（跨用户泄露） | 红 2（T16/T16b） |
| M8 | 截断不再出声 | 红 1（T17） |
| M9 | preload 不暴露通道 | 红 2（通道映射两条） |
| M10 | 兜底信封 `data: null` → `{}` | 红 1（无 electronAPI 用例） |

首轮驱动曾因未剥子进程 ANSI 而把所有计数正则判为 `PROBE_UNPARSED` 并以 rc=4 出声退出（而不是误报「没红」）——
观测器自身的故障必须与结论分开，这一版据此加了 `stripAnsi`。

### 8.4 第二轮反证（QM-6 修复段，7/7 变红并逐条归因）

驱动：`p026c-counterproof2.js`（日志 `p026c-counterproof2b.log`）。四条基线跑前均绿，收尾断言还原后逐字节相同。

| # | 变异 | 实测 |
| --- | --- | --- |
| M11 | epoch 毫秒数字串不再识别（FB1） | 红 1（T27） |
| M12 | `epoch → UTC 日` 的换算挪走一天（证明分桶键真由解析值推出） | 红 6 |
| M13 | 快照查询退回「最旧在前」的截断排序（FB4） | 红 2（T15/T17d） |
| M14 | 重复主键不再整行跳过（FB8） | 红 1（T31） |
| M15 | `publish.js` 退回私有 `getState()` 实现（FB5 接线锁） | 红 1 |
| M16 | 摘掉表在位探测（FB7——包装层不抛错，探测是唯一出口） | 红 1（T17e） |
| M17 | `isAuthGateError` 整体变 no-op（FB6） | 红 1（真实 preload 权限拒绝用例） |

**两条由反证本身逼出来的修正**（不是"锁没抓到"就完事）：
1. M11 第一次跑是 `GREEN_UNEXPECTED` —— 根因不在锁而在**测试**：T27 原先只测「ISO 赢过 epoch」，于是把 epoch 判成不可解析（永远不赢）也能通过。改成两个方向都测之后 M11 如期变红。
2. M17 第一次跑也是 `GREEN_UNEXPECTED` —— `isAuthGateError` 有 name 与 code 两条冗余判据，只摘一条仍会命中。变异改为把整个函数改成 no-op，随后变红。**结论**：对"多条款判定"做变异必须一次摘掉全部条款，否则测的是条款冗余度而不是锁是否存在。



### 8.3 复跑命令
```bash
# 数据量取证（只读，不解密）
node -e "const{DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(process.env.DB,{readOnly:true});
for(const t of ['tracked_content','performance_snapshot','pattern_performance','rewrite_history'])
console.log(t, db.prepare('SELECT COUNT(*) c FROM '+t).get().c)"
DB="C:/Users/to_co/AppData/Roaming/@multi-publish/desktop/multi-publish.db" # 另一份同法

# 渲染层零消费取证
git grep -ln performance_snapshot origin/main -- apps/desktop/src   # 期望 0 命中

cd apps/desktop && pnpm vitest run electron/services/performance-overview.test.js \
  electron/services/store/performance-loop-store-overview.test.js \
  electron/ipc-handlers/performance-loop.test.js electron/preload.test.js \
  src/views/Dashboard.test.js src/features/dashboard/PerformanceFlowPanel.test.js
```

---

## 九、质量门禁映射

- QM-1：改 `apps/desktop/electron/` → 本地打包 + asar 产物核对 + 8 秒启动无 stderr 崩溃。
- QM-4：改 `src/views/*.vue` → `test:visual:pixel`；本面板为条件渲染（无数据时不出现），像素基线不受影响，仍需实证。
- QM-6：M+ 跨模块（主进程 + IPC + preload + 渲染层）→ 双模型评审。
- Gate 7：locale zh/en 成对；面板模板零中文字面量。
- 行数：新代码落新文件；`Dashboard.vue`（登记超限）本次**净减**（删假数字）。

---

## 十、残余限制

1. 账号级（粉丝/主页阅读）无时间序列 ⇒ 周变化只能落在作品级互动上；账号级要做得先加历史留存，本切片不做。
2. 抖音/小红书/公众号无 parser ⇒ 这三家作品永远进不了总量，靠覆盖率与「不支持」计数如实表达，不补 0。
3. 周变化的"近 7 天/前 7 天"依赖回采节奏密度；采样稀疏时趋势会呈阶梯状，不是 Bug。
4. 本机无真实回流数据 ⇒ 数字级验收只能由 §七 取证补；界面级验收的实际走查方式是 **vite dev server（独占端口 5199）+ Playwright 注入 `window.electronAPI` 桩**，在真实 Chromium 里读 computed style 与文本（不是隔离 temp profile 跑真 IPC，那条路要 Logto 登录态，本切片未走）。
5. `performance:list-tracked` 是**无归属过滤**的旧入口（本切片不改它，避免连带影响表现数据页），新 `performance:overview` 带归属过滤 ⇒ 两个入口在多用户场景下口径不同，已在此显式记录。
6. **Gate 17 是全局比例棘轮，不是逐条白名单**：`check-ipc-sender-guard.js` 要求「显式守卫占比 ≥ 65.0%」，新增一个走咽喉点注入的注册点就会把比例拉下去。本 PR 的 `performance:overview` 首跑实测 287/442 = **64.9% 变红**，正解是给该通道补 `withSenderCheck`（→ 288/442 = 65.2%），**不是**调阈值。同文件另外三条 `performance:*` 通道本就带该守卫，漏掉它纯属不一致。
7. **改了 `/dashboard` 的渲染，就必须同 PR 重建 `dashboard.png` 基线**：Gate 7b（基线新鲜度）判的是「被跟踪基线逐像素 == 本次 CI 渲染」，本 PR 实测漂移 **88116 px / 4.249%**，而像素门禁的 `PIXEL_THRESHOLD=0.06` 是**全页**容差、把这 4.249% 整个吃掉 ⇒ QG Visual 的像素步骤照绿，只有 Gate 7b 看得见。判据域取 views 套件产出的 `screenshots/<name>.png`，**不是**像素套件的 `<name>-current.png`（同一视图的两张图确定但互不相同）。重建一律从**同一次 run** 的 `quality-gate-visual-reports` artifact 取，本机截图不算证据（QM-4 第 7 条）。
8. 暗色基线是上一条的已知缺口：PR 侧 Gate 7b 带 `--partial`，本次运行没有暗色渲染 ⇒ `dashboard-dark.png` 记为 skipped 不判；但 `visual-test.yml` 的同名门禁**不带** `--partial`，main push 时会判到。因此暗色基线须由该 workflow 在同一 head 上的一次 run 的 artifact 重建，不能留到合并后由别人的 run 变红。
