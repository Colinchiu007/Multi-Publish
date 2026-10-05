# PRD：改写 → 发布 → 回采 → 归因 关联链打通（发布页优化 P2-6d）

- 日期：2026-10-05
- 关联：`01-docs/PRD-PUBLISH-PAGE-OPTIMIZATION-2026-10-08.md` §11.1（本项原登记为「可离线但留给后续切片」）
- 上游切片：P2-6a #2807（成功率恒 100%）、P2-6b #2861（`publish_history_id` 写侧 + 存量回填）、P2-6c #2866（数据回流看板）
- worktree：`D:/Data/projects/mp-worktrees/mp-rewrite-lineage-second-hop`，分支 `rewrite-lineage-second-hop`
- 前置取证：`listPatternPerformance` 的两个消费面是 `src/views/PerformanceInsights.vue:142/243` 与 `src/views/ViralAnalysis.vue:365/551`（IPC `performance:list-pattern-performance` → `ipc-handlers/performance-loop.js:56` → `store.listPatternPerformance`，`services/store/performance-loop-store.js:441`）。本切片不新增任何用户可见文案，locale 成对门禁（Gate 7）不适用，理由见 §八。

---

## 一、一句话

效果闭环的第三跳（归因）此前有两处结构性断路，导致「效果洞察」与「爆款分析」两页的模式效果排行**自功能诞生起恒空**。本切片把这两处接通，让界面上早已存在的承诺文案变成可实现状态；并顺带把归因聚合按归属收口（这是**链路接通那一刻才会被激活**的风险）。

> 更正记录（重要，防止下一个会话重走一遍）：本节原写「三处断点」，第三处 B3 是「`PerformanceRecrawlService.start()` 全仓零调用点 ⇒ 自动回采从未运行」。**该前提是错的**。我当时 grep 的坐标是 `bootstrap/*.js` 与 `main.js`，漏了同层的 `electron/bootstrap.js` —— 它在 `:256` 一直调着 `start()`；打包产物实测日志有 `App performance-recrawl scheduler started`（2026-10-05T02:55:11Z）。教训按形态记：**"扫到 0 命中"首先证明的是我的扫描域不全，不是目标不存在**。B3 作为缺陷已撤销，本 PR 也据此**撤掉了在 phase3-services 里重复调 start() 的接线**（幂等会兜住重复，但两处接线本身就是漂移），改挂在真正的 start 站点。

界面文案早就写明了它期望的前提（`src/locales/zh.js:3291`）：

> 发布带改写关联的内容并回采表现数据后，这里会展示各表达模式的效果排行

**这句话在当前代码下不可能成立** —— 因为「带改写关联的内容」这一形态在渲染层就被丢弃了（断点 B1），而即便采到了表现数据，归因重算在生产里也只有手动 IPC 一个触发点（断点 B2）。注意：本节初稿在这里写的是「自动巡检从未被启动」，该前提属 B3 误判、已在 §2.1 撤销——自动回采本来就由 `electron/bootstrap.js:256` 启动。

---

## 二、症状与实况取证

### 2.1 两处断点 + 一处被撤销的误判（逐跳核实，非推测）

一条归因样本要落地，必须同时满足四件事（判据来自 `services/pattern-attribution-service.js:43-73`）：

| 条件 | 代码位置 | 现状 |
| --- | --- | --- |
| ① `tracked_content.rewrite_history_id` 非空 | `pattern-attribution-service.js:44` `if (!t.rewrite_history_id) continue` | **恒空**（断点 B1） |
| ② 该 `rewrite_history` 行的 `knowledge_refs` 含 `table='viral_library'` | `:47-50` | 由改写时是否勾选「爆款库」决定，可达 |
| ③ 该作品有 `performance_snapshot` | `:53` `getLatestSnapshot(t.id)` | 可达（回采服务由 `bootstrap.js:256` 正常启动，本机之所以为 0 是因为 `tracked_content` 本身 0 行 —— 见 §2.2） |
| ④ 对应 pattern card `status === 'done'` | `:57-58` | 由模式抽取决定，可达 |

而重算本身的触发缺一半（断点 B2）。

#### B1 渲染层四处丢弃 `rewriteHistoryId`（核心断链）

逐跳核实结果，✔ = 已实现、✘ = 断点：

| # | 跳 | 位置 | 结论 |
| --- | --- | --- | --- |
| 1 | 引擎产出 id | `electron/services/rewrite-engine.js:240-255`：成功改写时 `addRewriteHistory()` 并 `result.rewriteHistoryId = id` | ✔ |
| 2 | 装配注入 | `electron/core/container.setup.js:254` `svc.setPerformanceStore(c.get("store"))`；实现在 `store/performance-loop-store.js:61` | ✔（第一跳在生产是真跑的） |
| 3 | 渲染层收结果 | `src/views/RewriteView.vue:616-668` 读 `data.result/title/knowledgeRefs/quality/viral/metadata/warnings`，**从不读 `rewriteHistoryId`** | ✘ 断点 1 |
| 4 | 存草稿 | `RewriteView.vue:721-732` 快照只有 `{id,title,content,source,createdAt,updatedAt}` | ✘ 断点 2 |
| 5 | 草稿回填 article | `src/composables/usePublishDrafts.js:10-24` `ARTICLE_FIELDS` 共 13 键，无该键 | ✘ 断点 3 |
| 6 | article → 发布 payload | `src/composables/usePublishFlow.js:202-238` `buildArticleData()` 是**手写投影**，不是 `{...article}` | ✘ 断点 4 |
| 7 | payload → task | `electron/ipc-handlers/publish.js:273` `JSON.parse(JSON.stringify(article))` 整体保留 | ✔（非断点） |
| 8 | task → 登记 | `electron/bootstrap/phase4-events.js:154` `rewriteHistoryId: task.rewriteHistoryId \|\| task.article?.rewriteHistoryId \|\| null` | ✔（非断点，读侧早就写好） |
| 9 | 登记 → 列 | `store/performance-loop-store.js:137` 写入 `rewrite_history_id` | ✔（非断点） |

**证据形态**：`grep -rna "rewriteHistory\|rewrite_history" apps/desktop/src` 命中 **0**（实跑计数，非估计）。也就是说主进程那条早就写好的读侧 `task.article?.rewriteHistoryId`，**从被写下起就没有任何一个渲染层调用方给它供过值**。这是 AGENTS.md「装饰性链路」的第五次复发（前四次记录于 learnings）。

四个改写产出入口全部命中同一断链，逐个核对其产物形态：

| 入口 | 位置 | 产物 | 能否到达发布 |
| --- | --- | --- | --- |
| 改写页 | `views/RewriteView.vue:615` | 草稿 → `router.push('/publish?draft=…')`（`:799`） | ✔ 主路径 |
| 发布页 AI 面板 | `components/AiWriterPanel.vue:347` | `emit('apply-content', 文本)` → `views/Publish.vue:424` 直接 `article.content = $event + '\n'` | ✔ 页内路径（文本进 article，id 在 emit 边界丢） |
| 热门选题一键成片 | `composables/useHotTopicsGenVideo.js:148` | 草稿 `source:'hot-topics'`（草稿可被发布页加载） | ✔ 经草稿 |
| 采集页改写 | `views/Collection.vue:833`（`rewriteViaEngine`，适配为 `{result_content, knowledgeRefs}`） | 文案库 / 草稿（`genreDraftId`，`:2124/2141`） | ✔ 经草稿 |

**不在本切片范围**：`Collection.vue:1970` 走 `api.aggregationRewrite`（Python 链路）的改写。该链路不写桌面 `rewrite_history` 表（`:746` 注释已自陈「Python 链路对桌面 SQLite 爆款库不可见」），因此**没有可承载的 id**——不是遗漏，是没有源头。

#### B2 归因重算没有自动触发

`pattern-attribution-service.js:9` 的头注释写着「触发：每日回采巡检结束后 + IPC 手动触发」，但实测生产调用点只有 **1 个**：`ipc-handlers/performance-loop.js:52`（`performance:recompute-attribution`，即「效果洞察」页上的手动按钮）。「巡检结束后」这一半**从来没有实现过**——注释宣称的触发条件里，有一半是不存在的。

#### B3（已撤销的误判，原样保留以便复核）：「自动回采巡检从未启动」

我当时的判据是：`grep -rna "\.start()" bootstrap/*.js main.js` 只命中六个别的监视器，`performanceRecrawlService.start()` 零命中，于是结论「30s 首轮 + 24h 周期从未运行」。

**这个坐标是错的**：真正的调用点在 `electron/bootstrap.js:256`（`var performanceRecrawl = container.get('performanceRecrawlService')` → `performanceRecrawl.start()`），它在 `bootstrap/` 目录之外、与 `main.js` 同层，而我没把裸 `electron/bootstrap.js` 纳入扫描域。反证来自我自己要求的运行时取证：打包产物用隔离 profile 启动后，日志出现 `[INFO] App performance-recrawl scheduler started`（2026-10-05T02:55:11.333Z）。

因此：
- 自动回采**本来就跑**；「最近回采 = 从未」的真实原因是本机 `tracked_content` 为 0 行（没有任何已发布作品可采），不是链路断。
- 本 PR **不含**对 `start()` 的任何新增接线；一度加入的 phase3-services 重复接线已撤除（`start()` 自带幂等 `if (this._dailyTimer) return`，但"两处都调"本身就是新的漂移源，且会多打一条日志）。取而代之，接线锁改为断言**调用点唯一**且**回调挂在 start() 之前**（见 §十 第 7 条）。
- 这条误判保留在文档里而不是删掉，理由：它是 AGENTS.md「0 命中先证明扫描域不全」的又一现场，且如果不写明，下一个会话会看到 git 历史里那段被撤销的接线而无从解释。

#### 顺带纠正的一条 docs-vs-code 漂移（同一文件，实测）

`performance-recrawl-service.js:6` 的文件头写「status ∈ (pending, ok)」，而实现是 `recrawl_status IN ('pending', 'ok', 'failed')`（`performance-loop-store.js:174-176`）。`failed` 必须在集合内，否则一次网络抖动就把作品永久排除在回采之外。头注释已按实现改正。

### 2.2 本机数据面实测（结论：不可做数字级验收）

用 `node:sqlite` 以 **readOnly** 打开本机**全部**候选库并逐表计数。枚举口径（脚本 `D:/Data/projects/.tools/tmp/p26d-allcount.js`，实跑于 2026-10-05T03:36Z）：`D:\tmp` 下 maxdepth 3 内每一份 `multi-publish.db` + `%APPDATA%\@multi-publish\desktop\multi-publish.db` ⇒ 实开 **11 份，0 份读不动**：

| 库（…/multi-publish.db） | 字节数 | rewrite_history | tracked_content | performance_snapshot | pattern_performance | publish_history | viral_library |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `D:\tmp\mp-2626-qm1-profile` | 282624 | 0 | 0 | 0 | 0 | 0 | 0 |
| `D:\tmp\Multi-Publish-debug-profile` | 282624 | 0 | 0 | 0 | 0 | 0 | 0 |
| `D:\tmp\Multi-Publish-debug-profile.backups\20260926-010454` | 282624 | 0 | 0 | 0 | 0 | 0 | 0 |
| `D:\tmp\Multi-Publish-qm1-r2` | 282624 | 0 | 0 | 0 | 0 | 0 | 0 |
| `D:\tmp\p026c-qm1-profile` | 282624 | 0 | 0 | 0 | 0 | 0 | 0 |
| `D:\tmp\p26d-qm1-profile` | 286720 | 0 | 0 | 0 | 0 | 0 | 0 |
| `D:\tmp\qm1-packaged-profile-2701` | 282624 | 0 | 0 | 0 | 0 | 0 | 0 |
| `D:\tmp\qm1-packaged-profile-2702` | 282624 | 0 | 0 | 0 | 0 | 0 | 0 |
| `D:\tmp\qm1-t44-profile` | 282624 | 0 | 0 | 0 | 0 | 0 | 0 |
| `D:\tmp\shared-user-data-pre-merge-20260927-224314` | 282624 | 0 | 0 | 0 | 0 | 0 | 0 |
| `%APPDATA%\@multi-publish\desktop` | 282624 | 0 | 0 | 0 | 0 | 0 | 0 |

聚合断言：**11/11 份里这六张表全为 0 行**；`tracked.rewrite_history_id NOT NULL=0`、`tracked.publish_history_id NOT NULL=0`（0 行下 trivially 成立，故不构成独立证据，真正有分量的是上一行）。字节数只有一份是 286720（`p26d-qm1-profile`，本切片自己做 QM-1 打包验证时产生的 profile，效果闭环六表同样 0 行），其余 10 份一致为 282624，即 schema-only。

> 更正记录（防止下一会话把这段当已验证结论复用）：本节初稿写「`/d/tmp` 下 7 份 …… 全部字节数一致为 282624，逐表计数」，**三处不实**——当时只对 2 份真做了逐表计数（debug profile 与 `%APPDATA%`），其余是按字节数比出来的推断；「7 份」没有数过（实为 10 份）；「全部一致为 282624」被那份 286720 否证。上表是重跑一次全量枚举后的实测。教训按形态记：**把「我扫了目录」写成「我测了内容」，是一句读者无法复核的过度声明**；凡「全部 / 都 / 一律」这类全称量词，落笔前必须有一个把整个域跑完并聚合断言的脚本在场。

因此本切片**不能**给出「修完后榜上有 N 条」这类数字级证据（与 §11.1 里 P2-6c 的结论一致，且更彻底：连第一跳的 `rewrite_history` 也是 0 行，说明本机这些 profile 里从未跑过一次走引擎的改写）。可用的验收证据形态只有两种，本 PRD 一律按它们写判据：

1. **行为级回归**：注入真实 `store`（`os.tmpdir()` 隔离库）跑通「改写 id → 草稿 → payload → task → 列 → 归因行」全链（P2-6b 的 `phase4-events-tracked-content.test.js` 是同族先例，其「从真入口进、用真库跑、把读侧投影逐字搬进断言」的手法照搬）。
2. **接线守卫**：读源码断言每道投影白名单都含该键，漏一处即红。

### 2.3 存量能否回填：不能（schema 级证据，不是工程偷懒）

`tracked_content` 的全部列（`services/activate-viral-schema.js:63-79`）：
`id / platform / post_id / url / publish_history_id / rewrite_history_id / recrawl_status / last_recrawl_at / next_recrawl_at / owner_subject / created_at` —— **没有任何内容列**。
`rewrite_history` 只有 `original_excerpt`（截断 500 字）与 `rewritten_content`。

两侧不存在可 join 的内容键。P2-6b 那次的回填之所以成立，是因为存在 `(platform, post_id)` 这个**双方都有的强键**；这里连这种键都不存在，任何「按标题猜」「按时间就近猜」都属于错关联。按 P2-6b 立下的「宁缺毋滥：把 27 行接对，比把 70 行接错有价值」口径，本切片**不做存量回填，且如实声明存量永远接不上**（新数据自本次起才有线）。

---

## 三、方案

一句话：**加一个键，让它随内容流经它经过的每一层投影；再拧两下钥匙**。不新增表、不改 schema（`rewrite_history_id` 列早就在）、不动主进程写入逻辑（第 7–9 跳已就绪）。

### 3.1 唯一提取实现（禁止四个入口各抄一份读法）

新增 `apps/desktop/src/utils/rewrite-lineage.js`：

```js
extractRewriteHistoryId(res) -> string | null
```

- 入参是 `aiRewrite` 的完整 IPC 信封（**不是** `res.data`）：四个调用点都在判 `res.code === 0 && res.data.success` 之后才用数据，判据放在信封层可避免「有人传 `res`、有人传 `data`」的口径分裂。
- 合法 ⟺ `typeof === 'string'` 且 `trim()` 非空 且 长度 ≤ 64 且 不含控制字符（`/[\u0000-\u001f\u007f]/`）。任何一条不成立 ⇒ `null`。
- id 的真实形态由主进程生成（`performance-loop-store.js:14` `Date.now().toString(36) + Math.random().toString(36).slice(2, 10)`；**本机实测 20000 次采样长度为 15–16 字符**）。64 的上限不是格式校验，而是防「把别的整段字段塞进来」——渲染层**不得**按形态猜或自造 id，只透传，缺席就是缺席。

### 3.2 逐跳改动清单

| # | 文件 | 改动 | 不可破的判据 |
| --- | --- | --- | --- |
| 1 | `src/utils/rewrite-lineage.js` | 新增唯一提取实现 | 非法一律 `null`，不返回空串 |
| 2 | `src/views/RewriteView.vue` | 成功分支记 `rewriteLineageId`；`saveToDraft()` 条件挂 `rewriteHistoryId`；`invalidateSavedDraft()` 同时清 id | 改写结果被新结果取代后，旧 id 不得继续跟着新文案走 |
| 3 | `src/composables/useHotTopicsGenVideo.js` | 草稿快照条件挂键 | 草稿保存失败不得阻断视频生成（既有语义保持） |
| 4 | `src/views/Collection.vue` | `rewriteViaEngine` 返回值补该字段；下游草稿/文案库写入挂键 | Python 链路（`:1970`）不挂——它没有 id |
| 5 | `src/components/AiWriterPanel.vue` + `src/views/Publish.vue` | emit 载荷由「纯文本」改为携带 id；`@apply-content` 绑定同步 | 见 §3.4，改 emit 必须同步父模板绑定（R92） |
| 6 | `src/composables/usePublishDrafts.js` | `ARTICLE_FIELDS` 增 `rewriteHistoryId` | 键缺席时**不得写空串**（空串会绕过「缺席 = 不改」语义，`:29` 的 `ARRAY_FIELDS` 回退就是同类前例） |
| 7 | `src/composables/usePublishFlow.js` | `buildArticleData()` 条件挂载（与 `visibilitySemantic` 同风格） | 只在合法非空时挂，不得无条件 `data.rewriteHistoryId = undefined` |
| 8 | `src/composables/useBatchPublish.js` | `buildBatchArticlePayload()` 同口径挂键 | **既有 parity 锁会强制**：`useBatchPublish.test.js:1265`「批量 payload 键集必须覆盖单篇 `buildArticleData` 的全部键」，第 7 条一加、这条不同步就当场红 |
| 9 | `electron/services/pattern-attribution-service.js` | 新增 `setAfterRound` 语义由 recrawl 侧持有（本文件只加 owner 过滤，见 §3.3）；头注释「触发」改为如实描述 | 注释不得再宣称不存在的触发 |
| 10 | `electron/services/performance-recrawl-service.js` | `processRound` 收口处（`:60` 的 `finally`）在本轮**真的处理过到期条目**时调用注入的 after-round 回调；`start()` 保持幂等 | 回调抛错不得让巡检失败（旁路 try/catch + warn）；本轮 0 条到期 ⇒ 不触发重算（不做无谓全表替换） |
| 11 | `electron/bootstrap.js`（真正的 start 站点，`:256` 那块） | 在既有 `performanceRecrawl.start()` **之前**挂 `setAfterRound(() => patternAttribution.recomputeAll())` | 不得新增第二处 `start()` 调用（曾误加在 phase3-services，已撤，理由见 §2.1 B3）；容器取不到服务时保持既有静默跳过语义 |
| 12 | 头注释 `performance-recrawl-service.js:5-6` | 触发描述按实测改正（含 `failed` 那处漂移） | 注释不得再宣称实现里没有的东西 |

### 3.3 归属收口（这是本切片**主动激活**的风险，必须同 PR 处理）

`pattern_performance` 是一张**持久化聚合表**，而 `recomputeAll()`（`_listAllTracked`，`:102-108`）与 `listPatternPerformance`（`performance-loop-store.js:441`）目前都**完全不按归属过滤**、读侧 IPC 也不 fail closed。

在 B1 修好之前这不构成真实问题（表恒空）。**把链路接通的那一刻，跨归属聚合就从"理论"变成"事实"**：同一台机器上先后登录过两个账号（`owner_subject` 不同，或 legacy 桶与 Logto 桶混存）时，A 的内容表现会被平均进 B 看到的榜单里。按 AGENTS.md 的归属口径（「认不出是谁必须 fail closed，不得渲染成 0 条数据」，与 P2-6c 的 `performance:overview` 同判据），这条不能留成已知漏洞出厂。

做法（实现后的最终形态，与初稿的"按归属分区替换"不同 —— 理由写在下面）：

- `pattern_performance` 增列 `owner_subject TEXT`（`activate-viral-schema.js` 里走既有 `PRAGMA table_info` 幂等 ALTER 形态，同 `publish_history.rewrite_history_id` 的先例；`CREATE TABLE IF NOT EXISTS` 对**已存在**的表不补列，存量库必须靠 ALTER，否则读侧筛它会 `no such column`）。另加 `idx_pattern_perf_owner_dim(owner_subject, dimension, engagement_score)`，原 `idx_pattern_perf_dim` 保留不动。
- **聚合桶的键加一层归属**：`归属 → dimension → value → 桶`。这是本切片真正的正确性判据 —— 若仍是全局桶再给行打一个归属，两个账号的同模式样本会被平均成"一行看着合理的数字"，界面上无从发现（实测：改动前该场景产 1 行 avg=50，改动后产 2 行 avg=10/90，锁见 `pattern-attribution-service.test.js`）。
- legacy 归一与存储层 `_ownerPredicate`（`performance-loop-store.js:48`）同三态语义（NULL / 空串 / `__legacy__` 同桶），归因侧的 `_ownerBucket` 只做这一件事，不再造第二份口径。
- `replacePatternPerformance` 的行对象新增 `ownerSubject`（可为 `null`），**全表替换的语义保持不变**。
- `listPatternPerformance(opts, ownerSubject)` 按归属筛。归属条件与后续维度条件用 AND 串联，而 SQL 里 AND 优先级高于 OR —— 结合性保护在**共享谓词自己那对括号**里（`performance-loop-store.js:53` 返回的 sql 形如 `WHERE (… OR … OR …)`），本函数不重复包一层：实测在本函数里再加括号是冗余的（摘掉行为完全不变，M4 首版因此被证明无效），正解是把判据钉在谓词本身。该风险的**夹具要求**记在这里：legacy 桶必须横跨两种维度，否则摘掉谓词括号后结果集恰好不变，锁测不出它声称在测的东西（首版夹具只有一种维度，M4 全绿即为此坑，已补 `seedLegacySecondDimension` 后 M4 变红）。
- 读侧 IPC（`performance:list-pattern-performance`）改用 `resolveIpcOwnerSubject(identityService)`：`null` ⇒ `EC.AUTH_ERROR`（与 `:70-71` 的 `performance:overview` 同口径），`undefined` ⇒ legacy 桶；并补 `withSenderCheck`。
- `performance:recompute-attribution` **不按归属门控**，也保持无参：重算的输入是本机整库，不是某个归属的请求参数。把它做成 per-owner 需要把归属线程进 `processRound` 的回调（那条回调没有身份概念），换来的收益只是"少写别人的分区"，而全量替换本来就把所有归属一起算对。

**为什么放弃初稿的"按归属分区替换"**：初稿设想"只重算当前归属的分区、保留别人的"，那要求重算入口按归属参数化。但自动触发点（回采收口）在的主进程上下文里根本没有"当前用户"这一说（`identityService` 只在 IPC 层解析），硬要在定时器回调里取身份会引入"定时器跑的时候身份还没解析"的竞态 —— 与 P2-6b 把回填挂在首次发布之后（那时 `owner_subject` 由任务给出）是同一个道理。最终形态是"写侧全局重算 + 行上带归属 + 读侧按归属筛"：写侧无身份依赖，读侧 fail closed，隔离性由读路径保证，代价是一行 `owner_subject` 列。
- sender 守卫现状按实测：`performance-loop.js` 的 6 个 handler 中，`add-manual-snapshot:31`、`recompute-attribution:49`、`overview:68`、`trigger-recrawl:99` **已带** `withSenderCheck`；`list-tracked:14` 与 `list-pattern-performance:56` **没有**。本切片给后者补上（它归本切片的读面），`list-tracked` 单独登记见 §十一。

### 3.4 `apply-rewrite` 的观察（如实登记，不在本 PR 修）

`AiWriterPanel.vue` 在 `selectRewriteResult()` 里同时 `emit("apply-content")` 与 `emit("apply-rewrite")`，而实测全仓 `Publish.vue:424` **只绑定了 `@apply-content`**——`apply-rewrite` 自诞生起无人监听。这属 AGENTS.md R92「子组件 emit、父模板无绑定 = 编译期不可检测的运行时沉默失效」，但它不是本切片的断点（发布路径靠 `apply-content` 就走通了）。本 PR 只把 lineage 加在**真正被绑定的那条** emit 上，并把 `apply-rewrite` 无绑定这一事实登记为后续项。

---

## 四、数据校验

| 校验点 | 判据 | 失败行为 |
| --- | --- | --- |
| 提取（`extractRewriteHistoryId`） | 非空字符串 ∧ `trim()` 后非空 ∧ 长度 ≤ 64 ∧ 无控制字符 | 返回 `null`（**不是**空串） |
| 挂载（草稿 / payload） | 只在值合法时挂键；非法/缺席 ⇒ 键**不出现** | 静默不挂（不得 warn 刷屏：这是常态而非异常，未勾选爆款库的改写本来就没有关联需求） |
| 回填（`applyDraft`） | 归因字段走 `string|null` 特例，**不套**通用的 `|| ''` 默认值；键缺席时写 `null` 主动清掉 article 上的旧值 | 两个方向都会错：沿用旧值 = 跨草稿串关联；写成空串 = 未来任何 `!= null` 的读法把「没关联」读成「有关联」（QM-6 前端轴 F3） |
| 主进程入站 | `publish.js:273` 已整体 JSON 化，无需新增字段级校验 | — |
| 主进程写列 | `phase4-events.js:154` 的 `|| null` 已兜住缺席 | 留 NULL，不猜 |
| 归因行写入 | `owner_subject` 必填（来自 IPC 解析，不由渲染层传） | 归属解析为 `null` ⇒ `AUTH_ERROR`，不写库 |
| 幂等 | 重算是全量重算（`recomputeAll` 从快照重算），同输入同输出 | — |
| 指纹隔离 | `rewriteHistoryId` 是发布指向性/来源性元数据，**不得参与草稿内容指纹** | 需实测 `services/draft-fingerprint.js` 的白名单不含该键；若按字段白名单实现则自动排除，仍必须有一条断言钉住「同一内容、不同 lineage ⇒ 指纹相同（复用同一条草稿）」——否则每次改写都会在草稿库堆一条新记录，违反 `publish-fail-draft-guard` 的幂等契约 |

## 五、流程（打通后的完整时序）

```
用户勾选「爆款库」→ 改写
  └ rewrite-engine.js:243 addRewriteHistory → rewrite_history 行（含 knowledge_refs）
  └ rewrite-engine.js:255 result.rewriteHistoryId → IPC 信封
渲染层
  └ extractRewriteHistoryId(res)            ← 本切片新增（唯一实现）
  └ 存草稿：draft.rewriteHistoryId           ← 本切片新增
发布页
  └ applyDraft：ARTICLE_FIELDS 拷入 article   ← 本切片新增键
  └ buildArticleData → payload.rewriteHistoryId ← 本切片新增（批量同口径）
主进程
  └ publish:batch → task.article（整体保留，已就绪）
  └ task:success（phase4-events.js:147-158）→ addTrackedContent({rewriteHistoryId, publishHistoryId})
回采（本来就在跑：bootstrap.js:256 → start()，30s 首轮 + 24h）
  └ performance_snapshot
  └ 【本切片新增】本轮处理过 ≥1 条到期项 → 触发归因重算（此前这一半只有注释里有）
归因
  └ recomputeAll({ownerSubject}) → pattern_performance（按归属分区替换）
展示
  └ PerformanceInsights 四维榜 / ViralAnalysis narrative_structure Top10
  └ 数据回流看板「最近回采」由真实 captured_at 填充
```

## 六、功能逻辑要点

1. **lineage 是"来源戳"，不是"内容"**：它不参与指纹、不参与平台内容校验、不参与任何截断/转换逻辑（`usePublishFlow.js:311-406` 的元数据校验与内容转换链必须对它完全无感）。
2. **一份结果被改多次**：`RewriteView.vue:486` 的 `watch(rewriteResult)` 会在用户编辑结果时清空标题；新改写结果产生时 `invalidateSavedDraft()`（`:775`）已负责让旧草稿 id 失效。lineage 必须**同步失效**，否则「新文案 + 旧 rewrite_history 行」= 假归因，比空归因更糟。这是本切片最容易写错的一条，必须有专门用例。
3. **未勾选爆款库的改写**：仍然会写 `rewrite_history` 行（`addRewriteHistory` 不区分是否用库），但 `knowledge_refs` 为空数组 ⇒ 归因侧 `:50` `if (viralIds.length === 0) continue` 自然跳过。这不需要任何新代码，但需要一条用例把「有 lineage 但不可归因」与「无 lineage」区分清楚，防止后来者误加判据。
4. **重算触发时机**：只在「本轮真的处理过到期条目」后触发（§3.2 第 10 条）。0 到期还重算 = 每 24h 无谓地全表 `DELETE`+`INSERT`，并把 `computed_at` 刷成新的、伪装成"数据更新过"。
5. **手动按钮保留**：`PerformanceInsights.vue` 的重算按钮（`recomputeAttribution`）继续可用且语义不变——它是用户主动收口的出口，不因自动触发而移除。

## 七、交互逻辑

- 用户侧**没有任何新增操作**。整条链是"改写→存草稿→去发布"这一既有动作序列的后台记账。
- 唯一的可见变化是**数据出现**：`/performance-insights` 从「暂无归因数据」变为四维榜；看板「最近回采」从「从未」变为时间戳；`ViralAnalysis` 的 `narrative_structure` Top10 开始有柱。
- 失败不改变任何交互：lineage 缺席 = 今天的行为（空态），归因抛错 = 空态 + 一条 warn。**不得**因为"链路修好了"就把空态改判成错误态——空态在这里仍是合法结果（没发过带爆款库改写的作品就该是空）。
- 归属不明时（Logto 在但没有可用 sub）：`/performance-insights` 与 `ViralAnalysis` 拿到 `AUTH_ERROR`。实测两页原本的处理并不等价，本 PR 只改了该改的那一侧：
  - `PerformanceInsights.vue::loadData` 原实现把 `code !== 0` 用 `|| []` 折成空数组，于是「没验出身份」与「确实还没有归因数据」在界面上**完全同形**（用户会去点【重算归因】排障，而真正缺的是登录）。已改为：非 0 码或 `items` 非数组一律置 `loadError` → 出现既有「加载失败 / 重试」横幅（`pi-error`），空态仍在但不代表成功。**不新增文案**（`perfInsights.loadFailed` / `refresh` 是既有键）。回归锁两条：错误信封必须有出口；`code===0` 且 `items` 为空时只能有空态没有横幅（两种状态必须可区分）。
  - `ViralAnalysis.vue::loadPatternHits` **保持不动**：它的既有契约就是「渐进增强：失败整块隐藏」（`:545-552` 的注释与实现一致，未登录返回非 0 码即隐藏整块）。那是一个已声明的产品决定，不是漏项，不得顺手改。
- 附带一条环境事实：浏览器域（dev server 无 `window.electronAPI`）里 `invokeWithFallback` 返回 `code: -1`，所以本页在新实现下会显示错误横幅。该视图**没有像素基线**（实测 `base-screenshots/` 41 张里没有 `performance-insights*`，`git ls-files` 亦无匹配），因此不产生 Gate 7 / 7b 的基线重建义务 —— 这一点是查证过的，不是假设。

## 八、显示项

| 显示项 | 位置 | 本切片是否改 |
| --- | --- | --- |
| 四维模式效果榜（`hook_type / emotion_curve / narrative_structure / cta_style`） | `PerformanceInsights.vue` | 不改模板，只让它有数据 |
| 空态标题/提示 | `zh.js:3290/3291`、`:3316` | **不改文案**：现有文案已经准确描述了前提，之前是代码做不到而非文案说错。因此本 PR 不新增 locale 键（Gate 7 成对门禁无适用面） |
| 爆款分析 `narrative_structure` Top10 | `ViralAnalysis.vue:551` | 不改 |
| 数据回流看板「最近回采 / 覆盖率」 | `PerformanceFlowPanel.vue`（P2-6c 产物） | **本 PR 不改它，也不宣称修好了它**：自动回采本来就在跑（见 §2.1 B3 撤销记录），本机显示「从未」是因为 `tracked_content` 0 行没有可采的作品，属正确反映 |
| `pattern_performance` 行内新增的 `owner_subject` | 存储层 | 不进任何 UI，纯内部维度 |

## 九、提示文字

**本切片不新增、不修改任何用户可见文字。** 逐字引用与本切片相关的既有文案：

- `perfInsights.emptyTitle` = 「暂无归因数据」（`zh.js:3290`）
- `perfInsights.emptyHint` = 「发布带改写关联的内容并回采表现数据后，这里会展示各表达模式的效果排行」（`zh.js:3291`）
- `perfInsights.dimEmptyTitle` = 「该维度暂无归因数据」（`zh.js:3316`）

为什么值得把这三句写进 PRD：它们证明**产品意图早就存在**，缺的只是实现。修完后这三句仍然正确（未满足前提时依旧该这么说），所以不改。

主进程日志（非用户可见，但属可观测契约）：

- `PerformanceRecrawl` 的 `'scheduler started (30s delay + daily)'` 由既有 `start()` 打出，**它此前就在生产出现**（实测打包产物隔离 profile 启动：`[INFO] App performance-recrawl scheduler started`，2026-10-05T02:55:11.333Z）—— 这也是 §2.1 撤销 B3 的那条现场证据。
- 本切片唯一新增的可观测面是 `processRound` 收口后调 `recomputeAll()`，它自带既有日志 `PatternAttribution recomputed: N rows from M links`。**未新增日志键**，也不给 start 站点加重复日志。
- 因此"归因是否被自动算过"的现场判据是那条 `recomputed:` 日志出现与否，而不是 scheduler started。本机因 `tracked_content` 为 0 轮轮都不满足「处理过到期条目」，所以本机看不到它是**正确行为**（见 §2.2 的 0 行实测）；数字级取证仍待真实数据。

## 十、验收标准

1. **提取实现的行为用例**：合法信封 → id；`code !== 0` / `data.success === false` / `rewriteHistoryId` 缺失 / 空串 / 纯空白 / 超 64 字符 / 含 `\u0000` ⇒ 一律 `null`。
2. **逐跳穿透（四段真跑，不是一条大 E2E）**：`RewriteView.test.js` 断 `draftSave` 的**入参**带 id；`usePublishDrafts.test.js` 断快照与 `applyDraft` 回填（含"载入无关联草稿必须清掉旧值"）；`usePublishFlow.test.js` 断 `publishBatch` 第二参（payload）带键且脏值不挂；`phase4-events-tracked-content.test.js` 用**真库真事件入口**断 `tracked_content.rewrite_history_id` 落值并断归因侧那句 `WHERE rewrite_history_id IS NOT NULL` 能捞到它。**读侧投影必须逐字搬进断言**（P2-6b 先例）。这样拆而不是堆一条端到端：每一段红都能直接指认是哪一跳断了。
3. **归属收口**：两个归属各有一条可归因样本时，重算必须产出**两行**（同维度同取值、不同归属各一行），且各自的 `avg_*` 只由自己的样本算出 —— 而不是平均成一行"看着合理"的数字（改动前实测为 1 行 avg=50，改动后 2 行 avg=10/90）；`listPatternPerformance` 按归属筛；legacy 档在带维度筛选时不得因 OR/AND 优先级捞到别人的行；读侧 IPC 归属为 `null` ⇒ `AUTH_ERROR`（结构锁测量域必须止于下一个 `ipcMain.handle(`，否则后面 `performance:overview` 里的同名字样会让锁恒真）。
4. **失效同步**：「改写 → 存草稿 → 再次改写」后，第二次保存的草稿携带第二次的 id，且第一次的 id 不得残留在任何后续 payload。
5. **指纹隔离**：同内容不同 lineage ⇒ `computeDraftFingerprint` 相同、`draftSave` 返回 `reused: true`。
6. **触发收口**：`processRound` 处理过 ≥1 条到期项 ⇒ after-round 恰好一次；0 条 ⇒ 0 次；回调抛错 ⇒ 巡检仍成功收口且 `_running` 复位。
7. **接线唯一性与顺序守卫**：`start()` 的调用点清单必须**恰好等于** `['bootstrap.js']`（扫描域含 `bootstrap.js` / `bootstrap/phase1-context.js` / `bootstrap/phase3-services.js` / `main.js`，且剥掉注释行再判 —— 这一条是 B3 误判之后加的，专防"两处都调"和"注释里提一句当接线"两种形态）；`setAfterRound` 必须挂在同一个文件里且**下标早于** `start()`（否则 30s 首轮没有回调）；`start()` 自身仍幂等（二次调用不叠定时器）。
8. **批量 parity**：`useBatchPublish.test.js:1265` 既有键集锁必须绿（不得靠改锁来"通过"）。
9. **反证（每条都要实跑变红，不能只声明）**：
   - 摘掉 `ARTICLE_FIELDS` 里的新键 ⇒ 穿透红 + 接线守卫红；
   - 摘掉 `buildArticleData` 的条件挂载 ⇒ payload 用例红 + 批量 parity 锁红；
   - 把 after-round 无条件化（0 条也触发）⇒ 触发收口用例红；
   - **把聚合桶的归属层去掉（退回 `agg[dim][value]` 全局桶）⇒ 归属分桶用例红**（这条是本切片真正的正确性判据）；
   - 把归属谓词那对括号摘掉 ⇒ legacy 档 + 维度筛选那条红；
   - 摘掉 bootstrap 的 `start()` ⇒ 接线守卫红；摘掉 `setAfterRound` 接线 ⇒ 另一条接线守卫红。
10. **覆盖度如实声明**（哪些路径只有结构锁）：四个改写入口里，`RewriteView`（存草稿入参）与 `AiWriterPanel`（emit 载荷）有**行为锁**；`Collection.vue` 与 `useHotTopicsGenVideo.js` 目前只有「引用了共享实现」的结构锁 + 共享 `attachRewriteLineage/normalizeRewriteLineage` 的单元行为锁 —— 因为它们各自的挂载点埋在 2800 行视图 / 无既有测试的 composable 里，补端到端锁的代价与本轮收益不匹配。后果写清楚：这两条若漂移（例如挂载点被搬走或删除），CI 不会红，症状是"从采集页/一键成片发布的作品进不了归因榜"。下一次真实取证（P0-1 那批）时应一并补上，或在本项被再次触碰时强制补。
11. **门禁全绿清单**（提交前本地跑齐）：locale 成对/键存在/CJK 基线、品牌残留、`check-max-lines`、`check-gate-record-debt`、`check-unwired-tests`、`check-step-failfast`、eslint，以及 **Gate 17（显式 sender 守卫全局占比 ≥ 65%）**——本切片给 `list-pattern-performance` 补 `withSenderCheck` 是在抬这个比值，方向安全；但新增任何未包裹的 handler 都会把它压回去（P2-6c 就是被这条打回过一次，见 `PRD-PUBLISH-METRICS-DASHBOARD-2026-10-04.md` §十 第 6 条）。
12. **QM-1**：改动了 `apps/desktop/electron/`（recrawl / attribution / store / schema / bootstrap）⇒ 必须本地打包验证后再提 PR。

## 十一、范围边界与如实声明

- **存量永远接不上**（§2.3）：本次上线前发布的作品，其 `rewrite_history_id` 将永久为 NULL；界面上它们只进「不支持回采/未回采」计数，不进归因榜。这是设计决定，不是待办遗漏。
- **Python 改写链路无 lineage**（§2.1 表尾）：`Collection.vue:1970` 的 `aggregationRewrite` 不写桌面 `rewrite_history`，本切片不为它伪造关联。
- **`apply-rewrite` 无父绑定**（§3.4）：属既有 R92 类观察，登记为后续项，本 PR 不顺手改。
- **抖音/小红书/公众号的互动 parser 仍未注册**：这三家作品的 `performance_snapshot` 拿不到 ⇒ 它们的样本不会进榜（P2-6c 已把这条如实反映为「不支持回采」）。本切片不改变这一现状。
- **`useBatchPublish.js` 实测只剩 1 行行数余量**（`debt-baseline.json` 登记 622、容差 200 ⇒ 上限 822；HEAD 的 `split('\n')` 口径已是 822，即 growth=200 贴边）。因此批量侧的挂载被压成**单行** `attachRewriteLineage(data, a.rewriteHistoryId)`，并连带把单篇侧也改成同一形态（否则两侧形态不同，`useBatchPublish.test.js:1265` 那条按 `data.X =` 匹配的 parity 锁对本键失明）。**代价如实写**：这个键从此不在 parity 锁的可见域内，唯一防线是 `usePublishFlow.test.js` 的「单篇与批量两侧必须走同一条挂载规则」——它同时断正向（两侧都有 `attachRewriteLineage(data, …)`）与反向（不得退回裸赋值）。下次触碰本文件的人若把挂载点改回内联两行，会当场撞上 `LEDGER_GREW`；正解是拆文件，不是抬基线（`--update` 等于接受漂移，AGENTS.md 已把这条记为滞后型唯一正解）。
- **本次真实踩到的一条（记下来防止复发）：`tests/performance-loop-store.test.js` 不在 diff 里，却断言被我改坏的东西**。它把 `pattern_performance` 的建表 DDL **手抄成第三份**（另两份在 `activate-viral-schema.js` 与……就没了，第三份就是它），于是新列在这份拷贝里不存在，本地定向跑的几个文件全绿、**全量跑到它才红**：`table pattern_performance has no column named owner_subject`。这正是 AGENTS.md「验证范围取消费者并集而不是我改过的文件」的同族现场，而且这里还多一层：消费者的**夹具**自己抄了一份 schema。正解不是把那行 DDL 补个列（补了下次新增列再犯），而是让夹具去跑真迁移 —— 已改为 `migratePerformanceLoopSchema(db, (t, sql) => t.execOrThrow(sql))`，并加一条 `PRAGMA table_info(pattern_performance)` 漂移锁（迁移里删/改列即红）。**残留同族拷贝未清**：该文件第二个 describe（`:143` 附近）仍内联一份 `tracked_content` 的 `CREATE TABLE`，本 PR 没碰它的形状所以不红，登记为后续项（判据应当与上面完全一致）。
- **反证 M4 首版是无效的**：单维度夹具下，摘掉归属谓词的括号后结果集恰好不变（`NULL OR ='' OR (='__legacy__' AND dim=?)` 与带括号版在这份数据上同解），变异跑出来是绿的，而我差点把「M4 绿」读成"那层括号没用所以可以删"——它其实同时也证明了**我的锁测不到那件事**。补了 `seedLegacySecondDimension`（legacy 桶的第二种维度）后同一变异立刻变红。教训按形态记：**反证报绿时，先问夹具能不能让两种状态产生不同结果**，再决定是删冗余代码还是修夹具。
- **`performance:list-tracked` 是同源但不同面的一处越权读，本切片不修**：`performance-loop.js:14` 无 `withSenderCheck`，且 `SELECT * FROM tracked_content` 不带归属过滤；消费方实测是 `src/views/PublishHistory.vue:395/600`（`listTrackedContent({page:1,pageSize:100})`）。它与 §3.3 处理的是同一张表、同一个漏法，但属于「发布历史页的回采列表」而非「归因链」，且它返回的是行级内容（含 `url`/`post_id`），风险面比聚合榜更大。登记为独立后续项，理由不是"不改"，而是**改动判据不同**（列表侧要按归属分页并影响 total 语义），塞进本 PR 会让两个口径混在一次提交里难以复核。
- **批量侧的挂载点今天没有生产者**（前端轴 F4）：实测 `useBatchPublish.js` 只有一条建条目路径 `addArticle()`，其字段表不含 `rewriteHistoryId`，也没有"草稿→批量"导入。所以批量发布的改写产物**不会**带关联 —— 批量侧那一行 `attachRewriteLineage` 是为满足单篇/批量同口径（键集 parity 锁）而存在的前置接线，不是"已生效的功能"。补导入路径时必须同时登记进 `addArticle()` 字段表，否则又是一次"接口在、数据不来"。
- **改写→视频创作→发布 这条链不在归因范围内**（前端轴 F5）：`RewriteView.goToVideoCreate` 存的草稿带 lineage，但 `CreateView._loadDraftForRewrite` 只读 `content`/`title`，id 在交接缝被丢弃；而视频发布任务是否承载 `task.article`（`phase4-events.js:154` 的读取前提）**尚未取证**。不在本切片硬接：把没验过的通路接进归因，产出的就是看着合理的假数据。
- **`Collection` 的草稿写入绕过 `draftSave` IPC**（前端轴 F6，既有架构问题）：它直接 `storeSetSetting` 裸写 `drafts` 键，方言已与 IPC 侧漂移（`created_at`/`coverImage` vs `ARTICLE_FIELDS`）。本 PR 的 lineage 在这条路上仍能随行（裸写的就是同一个对象），但它**拿不到 draftId、也不参与指纹幂等**。统一走 `draftSave`/`draftList` 是独立一刀。
- **模式抽取产物仍可能为空**：归因还要求 pattern card `status === 'done'`（`pattern-attribution-service.js:58`）。若用户从未跑过模式抽取，链通了榜单仍是空——这是**第四个必要条件，不是第三个断点**，界面上「暂无归因数据」的提示对此仍然正确。
- **`sample_count` / `avg_*` 的口径变了**：写侧仍是全量重算（所有归属一起算，行按归属打戳），但聚合桶加了归属这一层，所以每个用户看到的是"本归属内的样本与均值"，不再是"本机全部样本"。这一语义变化必须在 CHANGELOG 收口里写明（本 PR 按 §二十一 的做法把 CHANGELOG 条目挪到 docs-only 回填 PR，避免置顶件把 auto-merge 拖成循环）。
## 十三、QM-6 双模型外部评审：发现与处置

评审绑定的 head：e7abfa4d6（合并 origin/main 之后、本轮处置之前的那个提交）。

两路都必须**看见产物**才算跑过（评审 CLI 的 rc 不构成证据）。实况：

- 后端轴：codeagent-wrapper --backend codex（primary 取自 ~/.claude/.ccg/config.toml 的 [routing.backend]，本文档不复制其值）→ 产出 qm6-findings-backend.md，8 条（1 Critical / 5 Warning / 2 Info）。
- 前端轴：--backend claude **静默空转**（rc=1，"claude completed without agent_message output"，无产物）。按既有替代通道改走 opencode run --model opencode/ling-3.1-flash-free 并收窄任务书（只审渲染层接线与命名/模式一致性）→ 产出 qm6-findings-frontend.md，8 条（1 Major / 7 Minor）。**偏差声明**：替代通道不是 config.toml 里那个 primary；"双模型"的独立性由「两个不同后端 CLI + 两份不同任务书」成立，不是同一模型跑两遍。

### 13.1 处置表（每条都按当前树复核，不照单全收）

| 编号 | 判定 | 处置 |
| --- | --- | --- |
| 后端 C-1 存量库先建 owner 索引、后 ALTER 补列 ⇒ 升级即无法启动 | **成立**（评审方已实测复现 no such column: owner_subject） | 索引移到 ALTER 之后；新增 activate-viral-schema.upgrade.test.js（旧 DDL→迁移成功 + 列与索引齐备 + 存量行不丢、可重复执行、新库同路径、排序结构锁）。N1 变异（把索引挪回去）实测 3 红 |
| 后端 W-1 用户手改结果正文后旧 lineage 残留 | **成立**，且正是本文 §六.2 自己立的判据没落地 | invalidateSavedDraft() 一并置 null；新增行为锁「改写→手改→存草稿 ⇒ 快照无该键」。N3 变异实测 1 红 |
| 后端 W-2 Collection 的 Python 改写分支携带引擎残留 id | **成立**（两条来源写同一个 rewriteResult、返回形状又同为 {result_content}，从结果本身无法判来源） | Python 成功分支显式清 id（位置在赋值之后）+ 结构锁。N4 变异实测 1 红 |
| 后端 W-3 触发判据是"遍历条数"而非"产出快照数" | **成立** | _recrawlOne 返回 Boolean(snapshotId)，收口按 produced 计数；补三条红测（全失败 / 全 unsupported / 快照被 store 吞掉返回 null）+ N2 变异（改成恒 true）实测 1 红 |
| 后端 W-4 读侧吞错，schema 故障与合法空态同形 | **成立**，且与本文 performance:overview 的既有口径不一致 | listPatternPerformance 返回 {items, error?}（表在位探测 + catch 带 error），IPC 把 error 翻成 REQUEST_ERROR；三条行为锁 + N5 变异实测 1 红 |
| 后端 W-5 出现两个 start() 站点，且 B3 取证与 base 事实矛盾 | **成立**，与本文 §2.1 自查撤销的 B3 误判同源 | 撤销 phase3 重复接线，after-round 挂到唯一 start 站点之前；接线锁改为「全仓调用点恰好等于 bootstrap.js」+ 顺序判据。M6b 摘掉 start() 实测 2 红 |
| 后端 I-1 stop() 不取消 30s 首轮 | 成立 | 保存句柄 + clearTimeout；两条对照锁（stop 后 0 次、不 stop 恰好 1 次——只测前者会让"永远不跑"也通过）。N6 变异实测 1 红 |
| 后端 I-2 返回的 dimensions 实为归属桶数 | 成立 | 按维度去重计数，桶数另出 buckets；空早退分支补齐同形键，防调用方读到 undefined |
| 前端 F1 apply-rewrite 事件无父绑定且不携带 lineage | 成立（绑定缺失部分已在 §3.4 登记） | 两个应用出口同口径携带 lineage，并在测试里逐个断言。理由：它们是同一份产物的两个出口，只挂一条就是给下一个绑定者留"有正文、没关联"的静默坑 |
| 前端 F2 三个入口的 lineage 状态命名与复位纪律不一致，Collection 从不清 | 成立 | 不做重命名（纯 churn），但补 clearRewriteResult() 成对出口，五处裸清结果全部改走它。附一条自伤记录见 §13.2 |
| 前端 F3 草稿白名单把通用 || 空串默认值套在 lineage 上，与 string\|null 契约相悖 | **成立**，与本文 §四 自己写的判据矛盾 | buildDraftSnapshot / applyDraft 对该字段特例走 normalizeRewriteLineage（缺席写 null，主动清旧值）；两条锁（快照必须 null 而非空串 / 脏值不落库） |
| 前端 F4 批量侧挂载点**没有生产者**（addArticle() 字段表不含该键，也没有草稿→批量导入路径） | **成立**（实测 useBatchPublish.js 只有 addArticle 一条建条目路径） | 不新造导入路径（超出本切片）。如实声明：批量侧今天是**前置接线**，键集 parity 锁要求两侧同口径；**批量发布的改写产物不会带关联**，直到有人补草稿→批量导入。这条与 §十 第 10 项的覆盖度声明并列 |
| 前端 F5 改写→视频创作→发布 这条链在 CreateView 交接处丢 lineage | **成立**（_loadDraftForRewrite 只读 content/title） | 不在本切片补：视频发布任务是否承载 task.article 尚未取证，把没验过的东西接进归因就是造假数据。登记为后续项，见 §十一 |
| 前端 F6 Collection 绕过 draftSave 裸写 drafts setting，方言已漂移（created_at/coverImage vs ARTICLE_FIELDS） | 成立（既有架构问题，非本次引入） | 登记后续项：统一走 draftSave/draftList（拿回 draftId 才享受指纹幂等）。本 PR 的 lineage 在该路径上仍能随行，因为裸写的就是同一个对象 |
| 前端 F7 草稿对象构造配方三处重复（id 生成配方全仓 19 处） | 成立 | 登记后续项（共享 newRewriteDraft() 工厂）。本 PR 不抽：抽工厂要动三个入口的字段集，与"打通一条链"混在一次提交里难以复核 |
| 前端 F8 单篇/批量 payload 16 键近重复装配 | 成立（P2-7 时代既有） | 不并入本 PR；本 PR 把两侧的 lineage 挂载收敛到**同一个函数**，先消掉一处漂移面 |

### 13.2 本轮新踩的两条（按形态记，防复发）

1. **批量替换脚本把自己刚插入的代码也替换了**：给 Collection.vue 加 clearRewriteResult() 时，先插定义再做 while 替换，于是函数体内的 rewriteResult.value = '' 也被换成 clearRewriteResult() ⇒ 无限递归、Collection 111 例全红。判据：**插入与替换必须互不重叠**（先替换后插定义，或让锚点排除定义体），改完立刻 grep 调用点数 + 跑该文件的测试，别信"操作成功"。
2. **中文文档必须走 Write/Edit 工具，不要塞进 shell 内联脚本**。本次把 PRD 段落写成 bash 里的 node -e，正文的反引号被 bash 当命令替换执行（现场：command not found: e7abfa4d6，并让一处标题留下空占位）；同一段里我把 join 的结果当数组再 spread，整节被炸成 3410 行单字符。两条口径：正文含反引号一律不进 shell 字符串；插入段落永远传数组、绝不先 join 再展开，且写文件后立刻回读行数与关键标记。

一条方法论回灌：**替代通道的评审抓到了主路径评审没抓的东西**（F3/F4/F5 三条后端侧都没提）。所以"claude 空转 ⇒ 降级为单模型"不是可接受的处理方式，换通道跑通比少一路评审更值得。

---

## 十二、风险与回滚

| 风险 | 处置 |
| --- | --- |
| 本切片是否新增后台自动出站？ | **没有**。自动回采早就在跑（`bootstrap.js:256` 调 `start()`，见 §2.1 的 B3 撤销记录），本 PR 不新增任何定时器或网络行为；新增的只是"采完之后顺手算一次"，而那次算是本机 sqlite 读 + 全表替换，不发任何出站请求。巡检范围仍由 `listDueForRecrawl` 限定（实测默认路径：`recrawl_status IN ('pending','ok','failed')` ∧ `next_recrawl_at <= now` ∧ `created_at >= now-7d`，**`LIMIT 50`**）⇒ 无到期项即零请求、零重算。附带纠正：`performance-recrawl-service.js:6` 的文件头「筛选」行原写「status ∈ (pending, ok)」，漏了实现里的 `failed`（实测 `performance-loop-store.js:174-176`；一次网络抖动若把作品永久排除在回采之外才是真事故），已按实现改正。 |
| 自动触发让归因从"用户点按钮才有"变成"每轮巡检后可能算一次" | 只在"本轮真的处理过 ≥1 条到期条目"时算；`recomputeAll` 内部已有 try/catch 并返回错误信封，`processRound` 的收口把它当旁路 —— 同步抛错与异步拒绝都就地吃掉（两条 rejection 用例 + M5 无条件化变异实测可红），回调失败绝不改变巡检成败。 |
| 每 24h 一次全量重算的开销 | 只在"本轮处理过到期条目"时触发；重算本身是单表全扫 + 分区替换，量级与 P2-6c 看板的 `OVERVIEW_TRACKED_LIMIT` 同阶。 |
| 归属分区是否需要改写 `replacePatternPerformance` 的既有契约 | **不改写**：写侧仍是全表替换，行上新增 `owner_subject`，隔离性由读路径保证（`listPatternPerformance` 按归属筛 + IPC fail closed）。放弃初稿"按归属分区替换"的理由见 §3.3 末段 —— 自动触发点在定时器回调里没有"当前用户"可用，硬取身份会引入身份解析竞态。`replacePatternPerformance` 的生产调用点实测只有 `pattern-attribution-service.js:35/93` 两处，签名保持单参，两侧无需同 PR 改。 |
| 回滚 | 链路各跳彼此独立：关掉 bootstrap 的 `start()` 即回到"仅手动"；摘掉渲染层挂载点即回到 lineage 缺席（等价于今天的行为）。无 schema 破坏性变更（新增列可留）。 |
