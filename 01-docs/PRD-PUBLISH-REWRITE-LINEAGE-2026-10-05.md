# PRD：改写 → 发布 → 回采 → 归因 关联链打通（发布页优化 P2-6d）

- 日期：2026-10-05
- 关联：`01-docs/PRD-PUBLISH-PAGE-OPTIMIZATION-2026-10-08.md` §11.1（本项原登记为「可离线但留给后续切片」）
- 上游切片：P2-6a #2807（成功率恒 100%）、P2-6b #2861（`publish_history_id` 写侧 + 存量回填）、P2-6c #2866（数据回流看板）
- worktree：`D:/Data/projects/mp-worktrees/mp-rewrite-lineage-second-hop`，分支 `rewrite-lineage-second-hop`
- 前置取证：`listPatternPerformance` 的两个消费面是 `src/views/PerformanceInsights.vue:142/243` 与 `src/views/ViralAnalysis.vue:365/551`（IPC `performance:list-pattern-performance` → `ipc-handlers/performance-loop.js:56` → `store.listPatternPerformance`，`services/store/performance-loop-store.js:441`）。本切片不新增任何用户可见文案，locale 成对门禁（Gate 7）不适用，理由见 §八。

---

## 一、一句话

效果闭环的**第三跳（归因）**此前有三处结构性断路，导致「效果洞察」与「爆款分析」两页的模式效果排行**自功能诞生起恒空**，且数据回流看板的「最近回采」永远是「从未」；本切片把三处接通，让界面上早已存在的承诺文案变成可实现状态。

界面文案早就写明了它期望的前提（`src/locales/zh.js:3291`）：

> 发布带改写关联的内容并回采表现数据后，这里会展示各表达模式的效果排行

**这句话在当前代码下不可能成立** —— 因为「带改写关联的内容」这一形态在渲染层就被丢弃了，而「回采表现数据」的自动巡检从未被启动。

---

## 二、症状与实况取证

### 2.1 三处断点（逐跳核实，非推测）

一条归因样本要落地，必须同时满足四件事（判据来自 `services/pattern-attribution-service.js:43-73`）：

| 条件 | 代码位置 | 现状 |
| --- | --- | --- |
| ① `tracked_content.rewrite_history_id` 非空 | `pattern-attribution-service.js:44` `if (!t.rewrite_history_id) continue` | **恒空**（断点 B1） |
| ② 该 `rewrite_history` 行的 `knowledge_refs` 含 `table='viral_library'` | `:47-50` | 由改写时是否勾选「爆款库」决定，可达 |
| ③ 该作品有 `performance_snapshot` | `:53` `getLatestSnapshot(t.id)` | **只能手动产生**（断点 B3） |
| ④ 对应 pattern card `status === 'done'` | `:57-58` | 由模式抽取决定，可达 |

而重算本身的触发也缺一半（断点 B2）。

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

#### B3 自动回采巡检从未启动（比 B1/B2 更根本）

`services/performance-recrawl-service.js:5` 头注释写着「触发：bootstrap runWhenReady 后延迟 30s + 每 24h 巡检」，`start()`（`:158-168`）也确实实现了 30s 首轮 + 24h 周期定时器并 `unref()`。

但**生产代码里没有任何地方调用它**。实测（`grep -na "\.start()" bootstrap/*.js main.js`，带 `-a` 因为本仓文档类文件可能被判二进制）全部命中只有：

```
bootstrap/phase1-context.js:281  usageReporter.start()
bootstrap/phase1-context.js:302  publishReporter.start()
bootstrap/phase1-context.js:322  diagnosticsReporter.start()
bootstrap/phase2-bridges.js:60-61 splitterBridge / promptBridge .start()
bootstrap/phase3-services.js:154 loginStatusMonitor.start()
bootstrap/phase3-services.js:253 automationScheduler.start()
```

`performanceRecrawlService.start()` **零命中**。`container.setup.js:459-466` 的 `assertRequired([...,'performanceRecrawlService','patternAttributionService'])` 只保证「注册存在」，不启动任何东西——这是 AGENTS.md「注册≠注入≠生效」的同族现场，而且这次卡在第三格：注册了、注入了、**没人拧钥匙**。

后果链条：`performance_snapshot` 只能由手动 IPC（`performance-loop.js:105-106` 的 `performance:recrawl-round`）产生，而该 IPC 没有任何界面入口调用它 ⇒ P2-6c 看板里「最近回采 = 从未」「覆盖率 0/N」不是数据没采到，是**采集从未自动跑过**。

### 2.2 本机数据面实测（结论：不可做数字级验收）

用 `node:sqlite` 以 **readOnly** 打开本机全部候选库（`/d/tmp` 下 7 份 + `%APPDATA%\@multi-publish\desktop` + `D:\tmp\Multi-Publish-debug-profile`，全部字节数一致为 282624，即 schema-only），逐表计数：

```
rewrite_history=0  tracked_content=0  performance_snapshot=0  pattern_performance=0
publish_history=0  viral_library=0
tracked.rewrite_history_id NOT NULL=0   tracked.publish_history_id NOT NULL=0
```

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
| 11 | `electron/bootstrap/phase3-services.js` | 调 `performanceRecrawlService.start()` 并把 `patternAttributionService.recomputeAll` 接到 after-round | 启动失败不得冒泡影响其余启动阶段 |
| 12 | 头注释 `performance-recrawl-service.js:5` | 与代码对齐（本来就想说的事，现在才真的发生） | — |

### 3.3 归属收口（这是本切片**主动激活**的风险，必须同 PR 处理）

`pattern_performance` 是一张**持久化聚合表**，而 `recomputeAll()`（`_listAllTracked`，`:102-108`）与 `listPatternPerformance`（`performance-loop-store.js:441`）目前都**完全不按归属过滤**、读侧 IPC 也不 fail closed。

在 B1 修好之前这不构成真实问题（表恒空）。**把链路接通的那一刻，跨归属聚合就从"理论"变成"事实"**：同一台机器上先后登录过两个账号（`owner_subject` 不同，或 legacy 桶与 Logto 桶混存）时，A 的内容表现会被平均进 B 看到的榜单里。按 AGENTS.md 的归属口径（「认不出是谁必须 fail closed，不得渲染成 0 条数据」，与 P2-6c 的 `performance:overview` 同判据），这条不能留成已知漏洞出厂。

做法（实现后的最终形态，与初稿的"按归属分区替换"不同 —— 理由写在下面）：

- `pattern_performance` 增列 `owner_subject TEXT`（`activate-viral-schema.js` 里走既有 `PRAGMA table_info` 幂等 ALTER 形态，同 `publish_history.rewrite_history_id` 的先例；`CREATE TABLE IF NOT EXISTS` 对**已存在**的表不补列，存量库必须靠 ALTER，否则读侧筛它会 `no such column`）。另加 `idx_pattern_perf_owner_dim(owner_subject, dimension, engagement_score)`，原 `idx_pattern_perf_dim` 保留不动。
- **聚合桶的键加一层归属**：`归属 → dimension → value → 桶`。这是本切片真正的正确性判据 —— 若仍是全局桶再给行打一个归属，两个账号的同模式样本会被平均成"一行看着合理的数字"，界面上无从发现（实测：改动前该场景产 1 行 avg=50，改动后产 2 行 avg=10/90，锁见 `pattern-attribution-service.test.js`）。
- legacy 归一与存储层 `_ownerPredicate`（`performance-loop-store.js:48`）同三态语义（NULL / 空串 / `__legacy__` 同桶），归因侧的 `_ownerBucket` 只做这一件事，不再造第二份口径。
- `replacePatternPerformance` 的行对象新增 `ownerSubject`（可为 `null`），**全表替换的语义保持不变**。
- `listPatternPerformance(opts, ownerSubject)` 按归属筛。归属谓词必须**加括号**再拼维度条件：legacy 档返回的是三段 OR，而 SQL 里 AND 优先级高于 OR，不加括号会让别的归属的行在"legacy 档 + 维度筛选"这一组合下漏进来 —— 且只在一种身份形态下坏，主账号路径永远测不出（锁见 `pattern-attribution-service.test.js` 的「legacy 档…不得因 OR/AND 优先级漏进别人的行」）。
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
| 回填（`applyDraft`） | 键缺席 ⇒ `article` 上该字段保持原值/不写 | **禁止**写空串（空串会被下游当成"有值"） |
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
回采（本切片起才自动跑）
  └ recrawl.start()（bootstrap 接线，30s 首轮 + 24h）→ performance_snapshot
  └ 本轮处理过到期条目 → 触发归因重算
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
- 归属不明时（Logto 在但没有可用 sub）：`/performance-insights` 与 `ViralAnalysis` 拿到 `AUTH_ERROR`。当前两页对非 0 码的处理必须**实测确认**它们不会静默渲染成"空 = 没数据"（这正是 P2-6c 里首次取数失败必须有可见出口的同一条判据）；若确认会，需按 P2-6c 的做法给出可见出口。

## 八、显示项

| 显示项 | 位置 | 本切片是否改 |
| --- | --- | --- |
| 四维模式效果榜（`hook_type / emotion_curve / narrative_structure / cta_style`） | `PerformanceInsights.vue` | 不改模板，只让它有数据 |
| 空态标题/提示 | `zh.js:3290/3291`、`:3316` | **不改文案**：现有文案已经准确描述了前提，之前是代码做不到而非文案说错。因此本 PR 不新增 locale 键（Gate 7 成对门禁无适用面） |
| 爆款分析 `narrative_structure` Top10 | `ViralAnalysis.vue:551` | 不改 |
| 数据回流看板「最近回采 / 覆盖率」 | `PerformanceFlowPanel.vue`（P2-6c 产物） | 不改，仅因 B3 修好而开始反映真实值 |
| `pattern_performance` 行内新增的 `owner_subject` | 存储层 | 不进任何 UI，纯内部维度 |

## 九、提示文字

**本切片不新增、不修改任何用户可见文字。** 逐字引用与本切片相关的既有文案：

- `perfInsights.emptyTitle` = 「暂无归因数据」（`zh.js:3290`）
- `perfInsights.emptyHint` = 「发布带改写关联的内容并回采表现数据后，这里会展示各表达模式的效果排行」（`zh.js:3291`）
- `perfInsights.dimEmptyTitle` = 「该维度暂无归因数据」（`zh.js:3316`）

为什么值得把这三句写进 PRD：它们证明**产品意图早就存在**，缺的只是实现。修完后这三句仍然正确（未满足前提时依旧该这么说），所以不改。

主进程日志（非用户可见，但属可观测契约）：`performance-recrawl-service.js:167` 已有 `'scheduler started (30s delay + daily)'` 的 `log.info`——这条日志**此前从未在生产出现过**（因为 `start()` 没人调）。本切片后它会真的出现，这本身就是 B3 修好的现场证据，验收时按它判。

## 十、验收标准

1. **提取实现的行为用例**：合法信封 → id；`code !== 0` / `data.success === false` / `rewriteHistoryId` 缺失 / 空串 / 纯空白 / 超 64 字符 / 含 `\u0000` ⇒ 一律 `null`。
2. **逐跳穿透（四段真跑，不是一条大 E2E）**：`RewriteView.test.js` 断 `draftSave` 的**入参**带 id；`usePublishDrafts.test.js` 断快照与 `applyDraft` 回填（含"载入无关联草稿必须清掉旧值"）；`usePublishFlow.test.js` 断 `publishBatch` 第二参（payload）带键且脏值不挂；`phase4-events-tracked-content.test.js` 用**真库真事件入口**断 `tracked_content.rewrite_history_id` 落值并断归因侧那句 `WHERE rewrite_history_id IS NOT NULL` 能捞到它。**读侧投影必须逐字搬进断言**（P2-6b 先例）。这样拆而不是堆一条端到端：每一段红都能直接指认是哪一跳断了。
3. **归属收口**：两个归属各有一条可归因样本时，重算必须产出**两行**（同维度同取值、不同归属各一行），且各自的 `avg_*` 只由自己的样本算出 —— 而不是平均成一行"看着合理"的数字（改动前实测为 1 行 avg=50，改动后 2 行 avg=10/90）；`listPatternPerformance` 按归属筛；legacy 档在带维度筛选时不得因 OR/AND 优先级捞到别人的行；读侧 IPC 归属为 `null` ⇒ `AUTH_ERROR`（结构锁测量域必须止于下一个 `ipcMain.handle(`，否则后面 `performance:overview` 里的同名字样会让锁恒真）。
4. **失效同步**：「改写 → 存草稿 → 再次改写」后，第二次保存的草稿携带第二次的 id，且第一次的 id 不得残留在任何后续 payload。
5. **指纹隔离**：同内容不同 lineage ⇒ `computeDraftFingerprint` 相同、`draftSave` 返回 `reused: true`。
6. **触发收口**：`processRound` 处理过 ≥1 条到期项 ⇒ after-round 恰好一次；0 条 ⇒ 0 次；回调抛错 ⇒ 巡检仍成功收口且 `_running` 复位。
7. **自动巡检接线守卫**：断言 bootstrap 里真的存在 `performanceRecrawlService.start()` 调用（结构锁），且 `start()` 幂等（二次调用不叠定时器）。
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
- **`performance:list-tracked` 是同源但不同面的一处越权读，本切片不修**：`performance-loop.js:14` 无 `withSenderCheck`，且 `SELECT * FROM tracked_content` 不带归属过滤；消费方实测是 `src/views/PublishHistory.vue:395/600`（`listTrackedContent({page:1,pageSize:100})`）。它与 §3.3 处理的是同一张表、同一个漏法，但属于「发布历史页的回采列表」而非「归因链」，且它返回的是行级内容（含 `url`/`post_id`），风险面比聚合榜更大。登记为独立后续项，理由不是"不改"，而是**改动判据不同**（列表侧要按归属分页并影响 total 语义），塞进本 PR 会让两个口径混在一次提交里难以复核。
- **模式抽取产物仍可能为空**：归因还要求 pattern card `status === 'done'`（`pattern-attribution-service.js:58`）。若用户从未跑过模式抽取，链通了榜单仍是空——这是**第四个必要条件，不是第三个断点**，界面上「暂无归因数据」的提示对此仍然正确。
- **重算的归属分区使多设备场景下榜单是"按本机各归属分别累积"**，`sample_count` 语义随之从"全部样本"变为"该归属样本"。这一语义变化必须在 CHANGELOG 收口里写明。

## 十二、风险与回滚

| 风险 | 处置 |
| --- | --- |
| B3 让应用**自动**向平台发起回采请求（此前只在手动 IPC 时发生） | 巡检范围由 `listDueForRecrawl` 严格限定（实测默认路径：`recrawl_status IN ('pending','ok','failed')` ∧ `next_recrawl_at <= now` ∧ `created_at >= now-7d`，**`LIMIT 50`**）⇒ 无到期项即零请求；请求间保留 2–5s 抖动；任何失败只记 `failed`/连续 3 次转 `manual`，不冒泡。启动点放在 phase3-services，与其他 monitor 同层。附带纠正：`performance-recrawl-service.js:6` 的文件头「筛选」行写的是「status ∈ (pending, ok)」，漏了实现里的 `failed`（实测 `performance-loop-store.js:174-176`），属同批 docs-vs-code 漂移，本 PR 一并改正。 |
| 每 24h 一次全量重算的开销 | 只在"本轮处理过到期条目"时触发；重算本身是单表全扫 + 分区替换，量级与 P2-6c 看板的 `OVERVIEW_TRACKED_LIMIT` 同阶。 |
| 归属分区是否需要改写 `replacePatternPerformance` 的既有契约 | **不改写**：写侧仍是全表替换，行上新增 `owner_subject`，隔离性由读路径保证（`listPatternPerformance` 按归属筛 + IPC fail closed）。放弃初稿"按归属分区替换"的理由见 §3.3 末段 —— 自动触发点在定时器回调里没有"当前用户"可用，硬取身份会引入身份解析竞态。`replacePatternPerformance` 的生产调用点实测只有 `pattern-attribution-service.js:35/93` 两处，签名保持单参，两侧无需同 PR 改。 |
| 回滚 | 链路各跳彼此独立：关掉 bootstrap 的 `start()` 即回到"仅手动"；摘掉渲染层挂载点即回到 lineage 缺席（等价于今天的行为）。无 schema 破坏性变更（新增列可留）。 |
