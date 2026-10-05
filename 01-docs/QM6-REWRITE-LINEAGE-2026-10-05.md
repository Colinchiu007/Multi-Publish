# QM-6 双模型外部评审原始产物：改写→发布→归因关联链（2026-10-05）

- 后端轴：codeagent-wrapper --backend codex（评审绑定 e7abfa4d6）
- 前端轴：claude 后端静默空转后改走 opencode run --model opencode/ling-3.1-flash-free（替代通道，偏差声明见处置文档）
- 逐条处置与反证结果：见 01-docs/PRD-PUBLISH-REWRITE-LINEAGE-2026-10-05.md 第十三节

---

## 一、后端轴原文

# QM-6 双模型审查（后端/接线轴）：rewrite-lineage-second-hop

- 审查范围：`git diff origin/main...HEAD`（HEAD = `e7abfa4d6`，28 文件，+1547/-87）
- 规格：`01-docs/PRD-PUBLISH-REWRITE-LINEAGE-2026-10-05.md`
- 审查维度：正确性 / 边界 / 安全 / 规格合规
- 验证记录：Critical 1 用仓库自身 `sqlite-wrapper` + `migratePerformanceLoopSchema` 实测复现（`migration failed: no such column: owner_subject`）。其余为代码路径推演，未跑完整测试套件。
- 状态说明：审查时工作区存在**未提交**改动（`bootstrap.js`、`bootstrap/phase3-services.js`、`performance-recrawl-service.autostart.test.js`），与 HEAD 不一致；以下行号与结论按 HEAD `e7abfa4d6` 判定。其中 W-5 的修正方向已在工作区出现，但尚未提交，且不影响 C-1 的判定。

---

## Critical

### C-1 存量库迁移顺序错误：在 ALTER 加列之前创建 owner 索引，升级直接启动失败

- 文件:行号：`apps/desktop/electron/services/activate-viral-schema.js:114`（`CREATE INDEX idx_pattern_perf_owner_dim ... ON pattern_performance(owner_subject, ...)`），真正补列的 ALTER 在 `:128-131`，执行顺序上索引在前。
- 失败场景：
  1. 用户已运行过 P2-6c，本地 `multi-publish.db` 中 `pattern_performance` 表已存在且**没有** `owner_subject` 列；
  2. `BaseStore.init()`（`services/store/base-store.js:81-97`）调用 `migratePerformanceLoopSchema`；
  3. `CREATE TABLE IF NOT EXISTS` 对已存在表是 no-op；随后 `execSchemaSql` 走 `db.execOrThrow`（sqlite-wrapper 有该方法）执行 `CREATE INDEX ... (owner_subject, ...)`；
  4. SQLite 在 prepare 阶段直接报 `no such column: owner_subject`，异常向 `base-store.init()` 抛出并被 catch 成 `return false`；
  5. `phase3-services.js` 对 `store.init() === false` 抛 `Local data store failed to initialize` → **应用无法启动**。
- 实测复现（已跑，仓库内代码，新库则全绿）：
  ```
  建旧 DDL 的 pattern_performance 后调用
  migratePerformanceLoopSchema(db, (t, sql) => t.execOrThrow(sql))
  => migration failed: no such column: owner_subject
  ```
- 修复建议：把 `idx_pattern_perf_owner_dim` 的创建移到 ALTER 块之后（或先 ALTER 再建索引）；补一条“旧 DDL → 迁移成功且 `PRAGMA table_info(pattern_performance)` 含 `owner_subject`”的升级路径用例。当前新增测试全部从空库起步，覆盖不到这条存量库路径。

---

## Warning

### W-1 改写页手动编辑结果后，旧 `rewriteLineageId` 仍会进草稿/payload（假归因）

- 文件:行号：`apps/desktop/src/views/RewriteView.vue:490-493`（编辑触发 `invalidateSavedDraft()`）、`:787-789`（`invalidateSavedDraft()` 只清 `savedDraftId`）、`:744`（`attachRewriteLineage(saved, rewriteLineageId)`）。
- 失败场景：
  1. `aiRewrite` 成功返回 `rewriteHistoryId: 'AAA'`，`rewriteLineageId = 'AAA'`；
  2. 用户在可编辑结果 textarea（`:220` `v-model="rewriteResult"`）把正文改掉；
  3. `watch(rewriteResult)` 触发，`invalidateSavedDraft()` 只把 `savedDraftId` 置空，`rewriteLineageId` 仍是 `'AAA'`；
  4. 点击「存入草稿 / 去发布」，`saveToDraft()` 把旧 `'AAA'` 挂到**已编辑的新正文**上；
  5. 发布后 `tracked_content.rewrite_history_id='AAA'`，归因榜把新正文的表现归给旧 `rewrite_history` 行。
- 这正是 PRD §六.2 明令禁止的「新文案 + 旧 rewrite_history 行 = 假归因」，且 PRD §4「失效同步」要求 `invalidateSavedDraft()` 同时清 id，当前实现没有做到。
- 修复建议：在 `invalidateSavedDraft()`（或 watch 的用户编辑分支）同时 `rewriteLineageId = null`；补一条「改写 → 手动编辑正文 → 保存草稿，`draftSave` 入参**不得**含 `rewriteHistoryId`」的行为锁。现有「第二次改写没给 id」用例覆盖的是新改写替换，覆盖不了原位编辑。

### W-2 采集页 Python 改写成功后会携带引擎链路残留的旧 id

- 文件:行号：`apps/desktop/src/views/Collection.vue:815`（`collectRewriteLineageId = null` 初始）、`:848`（唯一写点，引擎成功）、`:1979-1986`（`aggregationRewrite` 成功覆盖 `rewriteResult.value`）、`:2133`（`attachRewriteLineage(draft, collectRewriteLineageId)`）。
- 失败场景：
  1. 先走任一引擎改写并成功，`collectRewriteLineageId = 'AAA'`；
  2. 再采集知乎/百家号等走 stealth 分支的 URL，`api.aggregationRewrite` 成功，`rewriteResult.value` 被换成 Python 改写结果；
  3. Python 链路没有桌面 `rewrite_history` 行（PRD §2.1 已声明），但 `collectRewriteLineageId` 未清；
  4. 点击「存入草稿」，`saveDraftAfterRewrite()` 把旧 `'AAA'` 挂到 Python 改写正文 → 为无 lineage 的链路伪造了关联。
- 修复建议：凡非 `rewriteViaEngine` 成功分支改写 `rewriteResult`（`:1986`）必须先 `collectRewriteLineageId = null`；或把「结果来源」与 id 一起保存。补一条 Python 分支后 `saveDraftAfterRewrite` 草稿不含该键的结构/行为锁。

### W-3 `afterRound` 的触发条件按“被遍历条数”而非“本轮产出新快照”

- 文件:行号：`apps/desktop/electron/services/performance-recrawl-service.js:66-70`（`processed++` 在 `_recrawlOne` 之前/无论成败）、`:85-91`（`processed > 0` 即触发）。
- 失败场景：
  1. 到期 50 条全部网络失败（`_recrawlOne` 抛错，无一条写 `performance_snapshot`），或全部为无 parser 平台（只把状态改 `unsupported`）；
  2. `processed=50 > 0`，收口仍执行 `recomputeAll()` → `pattern_performance` 全表 DELETE+INSERT，`computed_at` 被刷新；
  3. 数据并没有任何新形态，界面/看板却呈现“刚计算过”的假象——这与 PRD §六.4 禁止“0 到期也重算”的动机完全相同，失败季每天都会白做一次全表替换。
- 修复建议：只在 `_recrawlOne` 成功写出快照（或至少未抛错）后累加触发计数；补「全部失败 / 全部 unsupported ⇒ 不触发 afterRound」用例。

### W-4 `listPatternPerformance` 吞掉查询错误，读失败与“确实无数据”同形

- 文件:行号：`apps/desktop/electron/services/store/performance-loop-store.js:458`（`catch (e) { return [] }`，本函数 :471）、`apps/desktop/electron/ipc-handlers/performance-loop.js:62-67`（把空数组当成功返回）。
- 失败场景：
  1. `pattern_performance` 因 schema 漂移/查询错误读不出来（例如列被改、表缺失）；
  2. sqlite-wrapper 的 `all()` 对这类错误不抛、返回空数组；
  3. IPC 返回 `{code:0, data:{items:[]}}`，前端新逻辑把空 `items` 判为合法空态 → 用户看到「暂无归因数据」且无错误横幅；
  4. 这与本切片在 `performance:overview` 侧同款修复（`listTrackedForOverview` 返回 `error`、handler 翻成 `REQUEST_ERROR`）口径不一致，会掩盖迁移/读侧故障。
- 修复建议：仿 `listTrackedForOverview` 增加表在位探测/错误携带，查询失败让 IPC 返回 `REQUEST_ERROR`；补「读取失败不得渲染成空榜」的用例。

### W-5 自动巡检接线出现两个 `start()` 站点，且“B3 从未启动”取证与 base 矛盾

- 文件:行号：HEAD `apps/desktop/electron/bootstrap/phase3-services.js:169-190`（新增 `performanceRecrawlService.start()` + afterRound 接线）；base（`origin/main`）`apps/desktop/electron/bootstrap.js:257-259` 早已调用 `performanceRecrawl.start()`。
- 失败场景/风险：
  1. 合并后同一 singleton 被 `start()` 两次（`start()` 幂等，定时器不叠加，运行时侥幸不双跑）；
  2. phase3 登记了 `cleanups.push(() => performanceRecrawlService.stop ...)`，而 bootstrap 站点没有对应 cleanup，两处站点职责/生命周期认知不一致；
  3. PRD §2.2「B3：自动巡检从未启动、start() 零命中」的取证是错的（漏扫 `electron/bootstrap.js`），以错误前提写下的接线锁（HEAD 版 test 只锁 phase3）测不出“重复站点/站点击穿”这一同类漂移。
- 修复建议：只保留一个 `start()` 站点，且在 start() 之前挂 `setAfterRound`（杜绝 30s 首轮无回调）；接线结构锁改为“全仓恰好一处 `.start()` + afterRound 在 start 之前”。审查时工作区已有未提交改动向这个方向修，但 HEAD diff 仍是双站点。

---

## Info

### I-1 30s 首轮定时器句柄未保存，`stop()` 后仍可能触发

- 文件:行号：`apps/desktop/electron/services/performance-recrawl-service.js:189-204`。
- 场景：`start()` 用 `setTimeout` 安排首轮但不保存句柄，`stop()` 只 `clearInterval`；若 stop 后进程未立即退出（测试、重复 startServices），首轮仍会在 30s 后 `processRound`，此时 store 可能已 close。
- 修复建议：保存首轮句柄并在 `stop()` 中 `clearTimeout`，或把首轮也纳入同一状态机。

### I-2 `recomputeAll()` 返回的 `dimensions` 实际是归属桶数量

- 文件:行号：`apps/desktop/electron/services/pattern-attribution-service.js:127`（`dimensions: Object.keys(agg).length`）。
- 场景：两个账号各一条可归因样本时 `dimensions=2`，虽然只有一种维度；该字段被日志/接口诊断消费时会产生误导。
- 修复建议：维度数按 `new Set(Object.values(agg).flatMap(Object.keys)).size` 计算，或改字段名。

---

## 汇总

| 编号 | 严重度 | 一句话 |
| --- | --- | --- |
| C-1 | Critical | 存量库迁移先建 owner 索引后 ALTER，升级即 `no such column`，应用无法启动（已实测复现） |
| W-1 | Warning | 改写页手动编辑正文不清 lineage，新文案携旧 id 造成假归因 |
| W-2 | Warning | Collection Python 改写成功后残留引擎链路旧 id，伪造关联 |
| W-3 | Warning | 触发判据为“遍历条数”，全失败/全 unsupported 轮次也会全表重写并刷新 computed_at |
| W-4 | Warning | 归因榜读侧吞错误，查询失败与“无数据”同形，掩盖故障 |
| W-5 | Warning | HEAD 上自动巡检双 `start()` 站点，B3 取证与 base 事实不符 |
| I-1 | Info | `stop()` 无法取消 30s 首轮 |
| I-2 | Info | `dimensions` 语义是归属桶数 |

---

## 二、前端轴原文（替代通道）

# QM-6 前端评审发现 — 改写归因链 second-hop（rewrite-lineage）

审查范围：apps/desktop/src/utils/rewrite-lineage.js 及四个改写入口（views/RewriteView.vue、components/AiWriterPanel.vue、composables/useHotTopicsGenVideo.js、views/Collection.vue）的调用，usePublishDrafts.js 的 ARTICLE_FIELDS、usePublishFlow.js 的 buildArticleData、useBatchPublish.js 的 buildBatchArticlePayload。日期：2026-10-05。

MINOR|components/AiWriterPanel.vue:385|`apply-rewrite` 事件在 defineEmits(:208) 声明并 emit，但全仓零消费方（`@apply-rewrite` 绑定数=0，仅 Publish.vue:420 挂载该面板且只绑 apply-title/apply-content），且它是唯一**不携带 lineage** 的应用事件——lineage 只走 apply-content 第二参(:384 → Publish.vue:424)；未来父组件若绑 apply-rewrite 会静默丢掉归因|删除该死 emit，或给 apply-rewrite 第二参同样传 panelRewriteLineageId，并在 AiWriterPanel.test.js 接线断言中登记所有 apply 事件均带 lineage

MINOR|views/Collection.vue:815|同一「本次改写 id」状态三个入口三种命名、三种复位纪律：`rewriteLineageId`（RewriteView.vue:333，运行开始显式置 null :594）、`panelRewriteLineageId`（AiWriterPanel.vue:256，运行开始显式置 null :335）、`collectRewriteLineageId`（本文件，**从不复位**，仅成功时覆盖 :848）；Collection 目前仅靠「读点被 rewriteResult 非空门控」(:2129) 才没读到陈旧 id，而 clearResult()(:2109-2114) 清结果不清 id，是潜伏的 stale-id 陷阱|统一命名为 rewriteLineageId 并在各入口运行开始时显式置 null，或抽 useRewriteLineage() composable 持有 {id, reset, extract}，三处共用

MINOR|composables/usePublishDrafts.js:110|ARTICLE_FIELDS 白名单把通用 `|| ''` 默认值套在 rewriteHistoryId 上（:120 applyDraft 同理），非改写草稿落库为 `rewriteHistoryId: ''`、applyDraft 后 article 状态携带 `''`——与 rewrite-lineage.js 文档化的 `string | null` /「键缺席=无关联」契约(:11-12、:65-71) 相悖；attachRewriteLineage 挂载前会归一故 payload 安全，但任何未来消费方用 `article.rewriteHistoryId != null` 判断会把 `''` 读成「有关联」|对该字段特判保持 null/缺席语义：`article.rewriteHistoryId = draft.rewriteHistoryId || null`（buildDraftSnapshot 保存侧同理），不套 `|| ''`

MINOR|composables/useBatchPublish.js:192|批量 payload 的 lineage 挂载点读 `a.rewriteHistoryId`，但全仓没有任何生产者写该键：唯一建条目路径 addArticle()(:250-274) 字段表不含 rewriteHistoryId，批量也无草稿导入路径——批量发布改写产物永远静默无归因（无报错无日志），挂载是等待生产方的死接线|补「草稿→批量」导入并在其中映射 rewriteHistoryId（同时登记进 addArticle 字段表），或在挂载点注释明「等待生产者」并加一条「批量条目有内容却无 lineage 来源即红」的接线测试

MAJOR|views/CreateView.vue:2022|RewriteView.goToVideoCreate(RewriteView.vue:792-799) 先把带 rewriteHistoryId 的草稿经 draftSave 存进全局库(:744) 再跳 `/create?draft=<id>`，但接收方 _loadDraftForRewrite 只读 `draft.content`(:2022) 与 `draft.title`(:2028-2029)，rewriteHistoryId 在交接缝被丢弃——主进程归因正读 task.article?.rewriteHistoryId( bootstrap/phase4-events.js:154)，「改写→视频创作→发布」这条链归因静默缺失，且与同文件 goToPublish 链（经 applyDraft/ARTICLE_FIELDS 能恢复该键）形成不对称|把 `draft.rewriteHistoryId` 带入 CreateView（存入组件状态并注入流水线启动参数），使视频发布任务能携带 article.rewriteHistoryId；若视频发布本就不在归因链内，则在 RewriteView.goToVideoCreate 与 PRD 中明确声明并停止在视频交接草稿上挂键

MINOR|views/Collection.vue:1459|Collection 绕过 draftSave/draftList IPC 契约，直接 `storeSetSetting('drafts', …)` 裸写同一底层 setting 键（主进程 electron/ipc-handlers/store.js:398-457 读写的就是这个键，故今天链路碰巧能通），但草稿方言已漂移（Collection 写 `created_at`/`coverImage`，IPC 侧契约是 ARTICLE_FIELDS 的 `createdAt`/`cover_url` 等）；一旦 draftSave 侧迁移存储或加写侧处理（如指纹幂等去重，usePublishDrafts.js:169 已依赖 draftSave 返回 data.draftId），Collection 的裸写入会被静默排除在归因链外|草稿写入统一走 draftSave IPC（拿回 draftId），读取走 draftList，废弃对 'drafts' setting 键的裸读写

MINOR|views/RewriteView.vue:734|改写产物草稿对象在三个入口各抄一份：RewriteView.saveToDraft(:734-742)、useHotTopicsGenVideo.runGenVideoRewrite(:156-163)、Collection.getDraftFromItem(:2116-2126)，`id: Date.now().toString(36)+Math.random().toString(36).slice(2,6)` 配方全仓 19 处重复，且 Collection 已漂移出 `created_at` 方言——下一个新字段（正如本次的 rewriteHistoryId）只会加进其中几份而漏其余|抽共享 `newRewriteDraft({title, content, source})` 工厂（内部完成 id 生成、时间戳与 attachRewriteLineage），三个入口改调工厂

MINOR|composables/usePublishFlow.js:203|buildArticleData(:203-244) 与 buildBatchArticlePayload(useBatchPublish.js:167-203) 是逐字段近重复装配（title/content/contentFormat/author/cover_url/video_path/aiGenerated/platformOverrides/visibilitySemantic/rewriteHistoryId/images/cover_path/cover_file/tags/topics/mentions 共 16 键），仅叶级 helper 共享；注释自承「两份必然漂移」(:163-165)，目前仅靠 useBatchPublish.test.js:1265 的键集 parity 测试兜底——下一个条件挂载字段必须同步改两处+测试，漏一处即静默少键且 parity 测试是唯一防线|把共享装配抽成单一 builder（以 batch 专属键 platforms/publishTime/targets 参数化），parity 测试改为断言「两处共用同一 builder」而非比对键集
