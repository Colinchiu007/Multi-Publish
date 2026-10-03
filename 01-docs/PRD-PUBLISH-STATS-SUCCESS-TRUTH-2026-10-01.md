# PRD：P2-6a 发布统计终态口径（publish-stats-success-truth，2026-10-01）

> **立项日期**: 2026-10-01
> **所属 roadmap**: [PRD-PUBLISH-PAGE-OPTIMIZATION-2026-10-08.md](./PRD-PUBLISH-PAGE-OPTIMIZATION-2026-10-08.md) 差距表第 6 项（数据看板）的**前置一刀**
> **基线**: `origin/main` = `ae5134f7`（实施中 main 为移动靶，PR 前须 re-sync）
> **worktree / 分支**: `D:/Data/projects/mp-worktrees/mp-publish-stats-success-truth` / `publish-stats-success-truth`
> **状态**: 先文档再代码；实现与本文档同 PR

---

## 一、问题定义

roadmap 把 P2-6 写成「做数据看板」。核实后实况是：**看板要展示的指标里，有一格现在是假的**，而且假得方向恰好掩盖了问题。

`apps/desktop/electron/services/publish-history.js` 的 `getStats` 按
`records.filter(r => r.success !== false)` 判成功。而 `getStats` 唯一的消费者链是
`Dashboard.vue:288` / `Home.vue:338` → IPC `dashboard:stats`（`ipc-handlers/publish.js:489`）→ `getStats`，
真源记录由 `bootstrap/phase4-events.js` 的两个终态处理器写入：

| 写入点 | 实参里的终态字段 |
|---|---|
| `phase4-events.js:102`（`task:success`） | `status: 'success'` |
| `phase4-events.js:163`（`task:failed`） | `status: 'failed'` |

**两处写入点都只写 `status`，从不写顶层 `success`**（全仓 `addRecord` 生产调用点仅此两处，已实测清点）。
于是 `r.success !== false` 对每一条记录都成立 —— 它不是「判断成功」，而是「恒为真」。

### 决定性判据（与记录内容无关，不会随数据漂移失效）

对真源 `shared-user-data/publish-history.jsonl` 直查「顶层 `success` 字段存在数」：

```
2026-10-01 11:2x UTC  记录 165 条  顶层 success 存在数 = 0
2026-10-03 01:45 UTC  记录  84 条  顶层 success 存在数 = 0
```

⇒ **无论记录怎么写、被删多少，顶层 `success` 一次都没出现过** —— 这才是本缺陷的根判据：
判据读的是一个**根本不存在的字段**。两次测量相隔约两天、条数从 165 掉到 84（该文件是**移动靶**，
别的会话在发布与清理），所以本 PRD 不把任何条数/比例当结论用。

同一批测量里当时出现的 `status` 分布（仅作样本，非不变量）：`success=69 / failed=1 / skipped=13 / timeout=1`。
`skipped` 与 `timeout` 由 `publish-monitor.js:43/73` 的回写路径产出，**既不是成功也不是失败**，
这是 §三 引入第三类的直接依据。

⇒ 用户侧后果三条（这三条与具体数字无关，恒成立）：
1. `Dashboard.vue:88`「失败」卡**永远显示 0**（`failed = total - success`，而 `success` 恒等于 `total`）；
2. `Dashboard.vue:92`「成功率」**永远显示 100%**（`success/total`，分子分母同源）；
3. `Home.vue:195` 的「失败待办」`if (stats.value.failed > 0)` **永远不成立** —— 一个已实现的功能因上游口径被整体废掉。

这不是「看板缺功能」，是**已上线的看板在报恒真的假数**，所以它必须先于任何新增聚合面做。

## 二、范围与非范围

| | 内容 |
|---|---|
| ✅ 本刀 | 终态分类的唯一实现；顶层 / `perPlatform` / `daily` 三档共用一次分类；新增第三类 `unclassified`；成功率分母改为「有定论」；`dashboard:stats` 现场日志字段纠正 |
| ❌ 非范围 | 新增任何图表/时间序列/导出；Dashboard 视觉改版；把 `performance_snapshot` 接进看板（§九 第 1 条）；改任何界面文案（§七：改文案会漂像素基线，须走 CI 同源基线流程，不与此数据修复混作一次） |

## 三、数据校验（分类表就是校验规则）

| # | 输入 | 归类 | 理由 |
|---|---|---|---|
| 1 | `status === 'success'` | success | 唯一正向定论 |
| 2 | `status === 'failed'` | failed | 唯一负向定论 |
| 3 | `status` 为 `'skipped'` / `'timeout'` | **unclassified** | `publish-monitor.js:43/73` 的回写路径确实产出这两个值。「本轮没查出结论」不是成功也不是失败 |
| 4 | `status` 缺失 / `undefined` / `null` | **unclassified** | 「没有证据」不得被推断成任何一侧；这是本缺陷的原始成因（把缺字段当成功） |
| 5 | `status` 为空串 / 非字符串（数字、对象） | **unclassified** | 严格 `===` 比较，不做类型宽容；宽容就是在为新造的坏值放行 |
| 6 | `'Success'` / `'SUCCESS'` 大小写变体 | **unclassified** | 生产写入点只产出小写两值；出现变体说明有新写入方未登记，应显式暴露而不是靠归一化掩盖 |
| 7 | 记录整体为 `null` / 非对象 | **unclassified** | `classifyPublishStatus` 先取 `record && record.status`，坏行不抛错（读盘侧 `JSON.parse` 已有容错，不能在这里崩整份统计） |
| 8 | `platform` 缺失 | 归入 `unknown` 桶 | 沿用原行为，不新增口径 |
| 9 | `timestamp` 缺失 | 计入顶层与 `perPlatform`，**不进 `daily`** | 沿用原行为；分日趋势不能凭猜测补日期 |
| 10 | `timestamp` 落在 30 天窗口外 | 不进 `daily`，仍进顶层 | 窗口只约束趋势图，不约束总量 |
| 11 | `success + failed + unclassified` | **必须 == total** | 不变量，由测试钉住（三处相加，缺一即统计在吞记录） |
| 12 | `success + failed == 0` 而 `total > 0` | `successRate = 0` | 无定论时报 0 而不是 100，也不报 `NaN`。**注意**：这条断言无法区分「分母用 concluded」与「分母用 total」两种实现（两者都得 0），它守的是「空分母不得当成全成功」；分母语义由 §八 L2 那条锁守 |

## 四、流程

```
JSONL 逐行 → readRecords(ownerSubject)
  → getStats:
       for each record:
         kind = classifyPublishStatus(record)      ← 唯一判据，只算一次
         bump(overall, kind)
         bump(perPlatform[platform || 'unknown'], kind)   （同时 total += 1）
         if record.timestamp 落在 30 天窗口: bump(daily[day], kind)（同时 total += 1）
       concluded = overall.success + overall.failed
       successRate = concluded > 0 ? round(success / concluded * 100) : 0
  → { code: 0, data: stats }                        （owner===null ⇒ AUTH_ERROR，既有行为不变）
  → IPC 现场日志：total/success/failed/unclassified/rate
  → Dashboard / Home 渲染
```

顺序上刻意**一次遍历出三档**：原实现是三段各自 `filter`/`if`，同一个表达式抄了三遍，
这正是「只修顶层就等于没修」的结构性原因。

## 五、功能逻辑

- **唯一实现**：`classifyPublishStatus(record)`，随 `module.exports` 导出，供跨模块复用与测试直接喂形状。
- **三档共用一次分类**：`kind` 只算一次、`bump` 三次。结构锁断言「剥注释后调用点恰好 1 处 + 定义 1 处」，出现第二处调用点即意味着有人绕开这个循环另算一份。
- **返回形状变更（向后兼容核对过）**：
  - 顶层新增 `unclassified`；`success` / `failed` / `total` / `successRate` 键名不变；
  - `perPlatform[p]` 由 `{total, success, failed}` 变为 `{total, success, failed, unclassified}`；
  - `daily[i]` 由 `{date, total, success}` 变为 `{date, total, success, failed, unclassified}`。
  - 消费面实测：`Dashboard.vue` 用 `Object.entries(...).map(([p, data]) => ({platform, ...data}))` 展开后只读 `total`，`Home.vue:340` 只取 `total/success/failed` ⇒ 加键不破坏任何现有读取，两者各自测试 4 文件 94 passed 已证。
- **`successRate` 语义变更是本次的实质修复**，必须在 PR 与 §七 里说明，不得读成「数字抖了一下」：分母从 `total` 变为 `success + failed`。

## 六、交互逻辑

- 无新增交互、无新增控件、无 DOM 结构改动。
- 行为面变化一条：`Home.vue:195` 的「失败待办」从**永不出现**变为**有失败即出现**。这是恢复既有设计意图，不是新增功能。
- `owner === null`（identity 存在但 sub 缺失）仍走 `AUTH_ERROR`，本刀不动该分支（与 P2-8a 同一口径：不可达不得被读成「零记录」）。

## 七、显示项与提示文字

| 界面格 | 数据源 | 本刀前后的语义 |
|---|---|---|
| Dashboard「共发布」 | `stats.total` | 不变（所有记录数） |
| Dashboard「成功」 | `stats.success` | 修复：只数 `status==='success'` |
| Dashboard「失败」 | `stats.failed` | 修复：只数 `status==='failed'`；本机从 0 变 83 |
| Dashboard「成功率」 | `stats.successRate` | 修复 + 语义变更：`success / (success+failed)`，本机从 100% 变 45% |
| Dashboard 趋势柱 | `daily[].total` | 不变（柱高用 total，未读 success） |
| Dashboard 平台表 | `perPlatform` 展开 | 读取键不变，多出的 `unclassified` 当前不展示 |
| Home 三张统计卡 | `total/success/failed` | 同 Dashboard 口径 |
| Home「失败待办」 | `failed > 0` | 从恒不触发变为可触发 |

**无新增 locale 键**：以上每一格都是既有文案承载既有语义，变化的只是数值本身。
未展示 `unclassified` 是本期刻意的范围克制（展示它需要新文案 + 新视觉基线），残余登记在 §九 第 4 条。

## 八、测试矩阵与反证

| 层 | 文件 | 锁 | 变异（须变红） |
|---|---|---|---|
| L1 | `publish-history.test.js` | `status:'failed'` 计入 failed、不得进 success | 已在实现前实跑：原判据下该条红（`total:2 → success:2`） |
| L2 | 同上 | skipped/timeout/缺 status ⇒ `unclassified`，且 `success+failed+unclassified==total`；`successRate` 分母为有定论（1/1=100 而非 1/4=25） | **实跑：把无定论并进成功 ⇒ 红 3**（L2/L3/L4 同抓）；**实跑：分母改用 `total` ⇒ 红 1**（`expected 25 to be 100`） |
| L3 | 同上 | 全无定论时 `successRate=0`，不得报 100/NaN | 见 §三 第 12 条附注：本条不区分分母，只守空分母 |
| L4 | 同上 | `perPlatform` / `daily` 与顶层同一判据，且三者 success 互等 | 并进成功 ⇒ 该条同时红（证明三档不是各修各的） |
| L5 | 同上（结构锁） | 先**剥注释行**再判：`r.success !== false` 不得出现；`classifyPublishStatus` 调用点+定义恰为 2 | 已在实现前实跑并**当场暴露锁自身的坑**：不剥注释时锁把我解释「为什么不能用」的注释原句当成命中而恒红 |
| L6 | `ipc-handlers/publish.test.js` + `Dashboard.test.js` + `Home.test.js` | 返回形状新增键不得破坏消费者 | 已跑：4 文件 94 passed |

## 九、残余限制（本刀明确不修，各附实测证据）

1. **`performance_snapshot` 有真数据但看板不接**。本会话用 `node:sqlite` **只读**直查活库 `shared-user-data/multi-publish.db` 实测（注意：该库是**移动靶**，别的会话在持续发布与回采，下列数字是本次快照，不是常数 —— 同一天更早一次独立实测给的是 60 条快照 / 56 条 `tracked_content`）：
   - `performance_snapshot` **103 条**，`source` **全部为 `auto`**（无人工回查样本）；合计 `views=33144 / likes=39 / comments=6 / favorites=0 / shares=0`；`captured_at` 跨 2026-09-28 → 2026-10-03。
   - **按平台看覆盖：103 条快照 100% 落在 `kuaishou`**（`LEFT JOIN tracked_content` 聚合实测）。而 `tracked_content` 有 69 条分布在 5 个平台（kuaishou 28 / douyin 14 / xiaohongshu 13 / zhihu 10 / wechat_mp 4），**只有 28 条被任意快照覆盖** ⇒ douyin/xiaohongshu/zhihu/wechat_mp 四家的表现数据是**零采集**，看板若按平台出图会出现「有账号有发布但曲线恒空」。
   - 表 DDL 在 `activate-viral-schema.js:79`，**无 `platform` / `owner_subject` 列** ⇒ 平台维度必须 JOIN `tracked_content` 才有；且当前**没有任何「总量 / 平台 / 趋势」聚合出口**（`ipc-handlers/performance-loop.js` 只给按条 `getLatestSnapshot`）。
   ⇒ P2-6 剩余部分是「**补采集面缺口的产品决策 + 补聚合 + 补展示**」，不是单纯补 UI。先要回答的是「四家平台为什么采不到」，否则接上去的图会大面积空白。
2. **Dashboard 四张卡的同比角标是硬编码字面量**：`Dashboard.vue` 模板里直接写死 `+8.5%`（`:40`）、`+23%`（`:51`）、`-2.1%`（`:62`），本会话已逐行读模板确认它们是文本而非绑定。这是第二处假数据。不并入本刀的理由不是「不重要」，而是**它是可见文案/像素面**：改动会漂视觉基线，须按 AGENTS.md 视觉第 7 条走「CI 产物取基线 + 自证新基线 vs 同一次 CI 渲染 = 0 px」，与数据口径混在一次 PR 里会让两条判据互相遮蔽。
3. **`PublishHistory.vue` 的表现列恒为空**：`attachPerformanceSnapshots`（`:588-605`）按 `t.publish_history_id` 建映射，而写入点 `phase4-events.js:143` 的 `addTrackedContent({platform, postId, url, rewriteHistoryId, recrawlStatus})` **不含历史 id**（实测 `grep -c publishHistoryId phase4-events.js` = **0**）⇒ 只读直查活库 `tracked_content`：**`publish_history_id` NULL = 69/69，`rewrite_history_id` NULL = 69/69**（两条关联键全断）。属跨模块合同缺失，需同时定「发布历史 id 从哪来、何时回填」。
4. **`unclassified` 未在界面展示**：本期只保证它不被并进任一侧且被测试钉住。展示需要新文案与新的像素基线。
5. **`packages/shared-utils/src/publish-history.js` 是孤儿重复实现**，内含同一个 `r.success !== false` 判据（`:115/124/142`）。实测全仓**零引用**（仅 `.adversarial/codebase-audit-20260922/*`  proposals 提到它）。留着它的风险是「下一个消费者拷走错判据」；删它属于跨包清理，须单独一个 PR 说明理由。
6. `pattern_performance` 0 行、`publish_history` 表无生产写入方（归因链断在 `rewrite_history_id` 56/56 NULL + `knowledge_refs` 缺 `viral_library`）——P2-6 若要做「爆款特征有效性」视图，这条链是硬前提。
