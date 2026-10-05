# QM-6 评审记录与逐条处置：发布历史 ↔ 表现数据关联链

- 切片：`publish-tracked-link-lineage`（P2-6b，见 `01-docs/PRD-PUBLISH-TRACKED-LINK-2026-10-04.md`）
- 日期：2026-10-04
- 被审对象：`git diff origin/main...HEAD`（基线 `e5fb069b7`，实现提交 `a19701da5`）

## 一、执行方式与偏差声明（不掩饰）

| 轴 | 配置的真源 | 实际用的通道 | 偏差 |
| --- | --- | --- | --- |
| 后端 | `~/.claude/.ccg/config.toml` `[routing.backend].primary = codex` | **主路由** `codeagent-wrapper --backend codex` | 无偏差。跑满 14 分钟、期间 3 次 `failed to parse function arguments: missing field 'cmd'`，最终落盘 8 条 findings（0 Critical / 4 Warning / 4 Info） |
| 前端 | `[routing.frontend].primary = claude` | **替代通道** `opencode-cli run --auto -m opencode/longcat-2.5-preview-free` | **有偏差**：主路由 claude 轴三次均 `claude completed without agent_message output`（41s / 52s / 38s，findings 文件始终不落盘），按 AGENTS.md「最多重试 2 次、3 次全败才跳过」停止主路由；不以自审冒充通过，改走替代通道，产出 4 条（0 Critical / 3 Warning / 1 Info） |
| 后端（第二意见） | 同上 | **替代通道** `opencode-cli ... nemotron-3-ultra-free` | 与主路由**并行**跑（写不同文件，避免两条通道互相覆盖），产出 8 条（3 Critical / 2 Warning / 3 Info）。独立性来自底模不同（codex vs nemotron），不来自同一 harness |

> 三路合计 20 条 findings。**替代通道给出的 3 条 Critical 里有 1 条不成立**（见 §二 B7），
> 逐条按"能否构造出它所称的危害"核实，不按严重度标签接受或拒绝。

原始 findings 逐字入库，本文件不转述代替它们：
`QM6-FINDINGS-TRACKED-LINK-BACKEND.json`（codex）、
`QM6-FINDINGS-TRACKED-LINK-BACKEND-FALLBACK.json`（nemotron）、
`QM6-FINDINGS-TRACKED-LINK-FRONTEND.json`（longcat）。
任务书（含我给的核查范围）同目录 `QM6-BRIEF-*.md`。

## 二、逐条处置

编号前缀：B=codex 后端轴，FB=替代通道后端轴，F=前端轴。

| # | 严重度（评审给的） | 主张 | 核实方式与结论 | 处置 |
| --- | --- | --- | --- | --- |
| B1 | Warning | 历史索引未过滤 `status==='success'`，非成功行带 postId 时也会成为唯一命中 | 读 `phase4-events.js` 的 `task:failed` 分支：它写 `result: null` ⇒ **当前**不产 postId；但"当前不会发生"不是判据（审核回写路径将来可能带）。判据可加，成本一行 | **已修**：判据层加 `record.status !== 'success' ⇒ historySkipped`；新增用例 + 反证 M9 实测变红 |
| B2 | Warning | `backfillRan` 在跑之前就置真；候选查询全库读而历史按 owner 读 ⇒ 一次抛错本会话永久放弃 | 两条都成立。抛错分支旧代码 `backfillRan = true` 在 `try` 外，`listRecords` 抛错 ⇒ 后续发布不再尝试，且现场只有一条 warn。候选查询不带 owner 也确实与"按 owner 读历史"不对称 | **已修**：latch 移到 `outcome.ok` 之后；`linkExistingTrackedContent` 返回 `ok`；候选查询改由 SQL 端按归属过滤。新增 W1（同接线只跑一次）+ W2（抛错不 latch）；反证 M10/M11 变红 |
| B3 | Warning | legacy 归属不对称：历史缺 owner → LEGACY 桶，tracked 行 owner 为 NULL → 判为不可判定 | 事实正确，但**方向是故意的**：把 NULL 也算进 LEGACY 会让"归属未知"的行被任何 legacy 历史认领 —— 那是造出错链的方向。留 NULL=不写 是 fail-safe | **修正文档与注释，不改行为**（评审给的选项二）：PRD §三 判据 6 写明两桶口径与不对称理由；代码注释同义 |
| B4 | Warning | `listRecords` 抛错、"同一接线只跑一次"两条出口无测试；旧幂等测试换了新接线故测不到 latch | 成立——旧 T4/T5 用的是新 `wire()`，latch 在测试里根本不可表示 | **已修**：新增 W1（连续两次 emit ⇒ `listRecords` 恰 1 次）与 W2（抛错后第二次发布可重试且真的补上） |
| B5 | Info | 歧义按历史**行数**判，同一 taskId 的重复历史行会被误算成歧义 | 成立：审核回写会让同一任务留多行 ⇒ 按行数判会把可回填的判成"猜不出" | **已修**：索引值改 `Set<taskId>`，歧义按去重后的 taskId 数判；新增「重复行不算歧义」用例 + 反证 M12 |
| B6 | Info | 渲染层仍只拉 `tracked_content` 前 100 条，库长大后的旧行进不了表现列 | 成立（`PublishHistory.vue:600` `pageSize: 100`）。但改它是另一条产品决策（分页/按 taskId 批量查），且不在本刀 diff 面内 | **登记残余**：PRD §十 第 6 条，附坐标 |
| B7 | Info | 5000 上限无截断日志，而注释里写了"如实报截断" | **我写的注释撒了谎**——代码没实现它说的事。这类"文档承诺 > 实现"是本仓明令禁止的形状 | **已修**：`historyTotal` 由 `listRecords` 的 `total` 转发，`historyTruncated` 进 diagnostics 与日志；两条用例（截断要报 / 未截断不得谎报）+ 反证 M8 |
| B8 | Info | 测试用的是 sql.js 包装器，而 PRD/CHANGELOG 写的是 `node:sqlite` | 成立：`node:sqlite` 是我**测活库**用的，夹具用的是 `sqlite-wrapper`（sql.js）。两个事实被我写成一件事 | **已修文档措辞**（见本文件 §四），不改夹具——夹具走生产同一包装器才是对的 |
| FB1 | **Critical** | 候选查询不按 owner 过滤 ⇒ 多用户共享库时他人行占满 LIMIT，我的行永远排不到 | 与 B2 后半同一事实，成立。单 owner 机器上不可见 ⇒ 属"窗口存在但不可观测"类，正因不可观测才要在 SQL 端堵 | **已修**：`listUnlinkedTrackedForBackfill(limit, ownerSubject)`，显式 owner 走等值、无身份走 legacy 桶（NULL/空串/`LEGACY_OWNER_SUBJECT`，常量 import 自 `store-schema` 不抄第二份）。S1 用例 + 反证 M10 |
| FB2 | Warning | 回填无并发保护 | 主进程单线程，且候选查询与写都是同步 SQL；真正的竞争来自**别的会话进程**写同一库，那属既有 SQLite 写者模型（本仓另有按 accountId 的串行锁先例），本刀是"只补 NULL"的单向写，重复写最坏是后到者 `changes=0` | **登记不修**：理由如上，写进 PRD §十（不新增一把无人需要的锁） |
| FB3 | Info | `writesAttempted` 与 `linked` 的关系在日志里不够直白 | 已并列打印 `linked=N/M scanned`，M 为候选数 | 不改 |
| FB4 | **Critical** | `setTrackedPublishHistoryId` 未校验空白串：`'   '` 是 truthy 会被写进库 | **真缺陷，且后果比评审说的更重**：那个死键既永远 join 不上（读侧按 taskId 查），又让 `IS NULL` 从此不成立 ⇒ 该行被**永久锁死在"无数据"**，比留 NULL 更糟 | **已修**：两个参数都先 `trim()` 再判空。S2 用例（空白拒 / 之后仍能写正确值） |
| FB5 | Warning | 空 postId 与无主行应合并成一种"跳过"口径 | 二者语义不同：前者是"无从匹配"，后者是"不该匹配"。合并会让 `unowned` 计数消失 | 不改，PRD 已分列 |
| FB6 | Info | 建议加 JSDoc 说明方法适用面 | 采纳 | 已写（含"为什么不合进 updateTrackedContent"） |
| FB7 | **Critical** | 夹具的 `(db, sql)` 双参回调易被误写成单参而静默建 0 表，建议改用 `store-schema` 导出的 `execSchemaSql` | 前半观察正确（我自己实测踩过并写进 PRD §8.2），**但建议不可执行**：实测 `store-schema.js` 的 `module.exports` 里**没有** `execSchemaSql`（只有 LEGACY_OWNER_SUBJECT 与若干 migrate*）。更关键的是该条把"已有自证"当风险读——夹具现在会**主动抛错**（缺表即 `夹具失效`），危害路径已闭合 | **拒绝（按证据）**：不新增导出仅为满足一条 Info 级偏好；保留自证 + 注释。**严重度下调**：这不是 Critical，测试夹具失效会红，不会把坏数据带进产品 |
| F1 | Warning | 列名 `publish_history_id` 与语义（发布任务 id）错位，DDL 层无说明 | 成立：三处口径此前只在两处注释里 | **已修**：`activate-viral-schema.js` 的 CREATE TABLE 内加 `--` 语义注释（含读侧坐标与契约锁文件），使"只看 schema"的人也不会写错 |
| F2 | Info | 编排层硬编码 store 方法名，改名会静默失效 | 部分成立：静默失效路径已被 `ok:false` + warn 出声；且 T3/S1 用**真 mixin**，改名会让契约锁直接红——这正是评审建议的"结构断言" | 已覆盖，不再加 Symbol/常量层（那会是第二套机制） |
| F3 | Warning | `updateTrackedContent` 与 `setTrackedPublishHistoryId` 两个写者各写一半，前者收到 `publishHistoryId` 会静默忽略 | 成立，且"静默忽略"需要被钉成**契约**而不是遗漏 | **已修**：方法头写明不对称的理由 + F3 锁用例（通用更新口传 `publishHistoryId` 必须不写、而传 `recrawlStatus` 必须写，后者防假通过） |
| F4 | Warning | `listRecords` 默认 `limit=50`，新代码传 5000 但无防再犯锁 | 成立：漏传 limit 的症状恰好是"存量不存在"，正是本切片要防的那类假象 | **已修**：F4 结构锁断言调用点带 `TRACKED_LINK_HISTORY_SCAN_LIMIT` 且常量 ≥1000 |

统计：修 12 条（含 4 条 Critical/Warning 级真缺陷）、修正文档 3 条、登记不修 3 条（各附理由）、拒绝 1 条（FB7，按"建议不可执行 + 已有自证"两条证据）。**0 Critical 遗留**。

## 三、这次评审实际改变了什么（不以"已评估"充数）

1. **两处会造成真实数据事故的缺陷**只有在被追问时才浮出：
   - 空白关联键（FB4）会把一行永久锁死在"无数据"，且比留 NULL 更难发现；
   - 候选查询不带归属（B2/FB1）在多用户共享库上是"我的行永远排不到"，而**单 owner 机器上完全不可见**——这条我自己在 §十.5 里当残余登记过，评审把它判成必须先修，理由成立：不可观测不等于可接受。
2. **我写的注释承诺了一个没实现的行为**（B7「如实报截断」）。这类缺口靠自审抓不到，因为写注释和写代码的是同一次心智。
3. **两条 latch 语义**：`backfillRan` 提前置真会让"一次抖动 ⇒ 整会话放弃"，而表现只是"这次启动没补上"——没有重试路径的自愈不是自愈。
4. **歧义计数口径**从"行数"改成"去重后的 taskId 数"（B5）——原口径会把可回填的行误判成猜不出，症状与本次要修的那个 Bug 同形（该亮的还是空的）。
5. 反证从 8 条扩到 **12 条**（M9–M12 覆盖新增的四条判据），每条都有独占红出口并实测变红。

## 四、文档措辞纠正（B8）

- 原文（PRD §八 T3、CHANGELOG）写「真 `node:sqlite` 临时库」——**不准确**。
  事实分两层：① **活库取证**用 `node:sqlite`（`readOnly`）；② **测试夹具**用 `apps/desktop/electron/services/sqlite-wrapper`（sql.js wasm）+ 真 `migratePerformanceLoopSchema` + 真 mixin。
  两处均已按此改写。夹具走生产同款包装器是刻意的：它才能暴露 `execOrThrow` 与 `no such table` 被吞成 `changes:0` 这类真实接缝行为。

## 五、通道现场（可复核）

- 主路由后端：`D:/Data/projects/.tools/tmp/qm6-backend.log`（START→EXIT，含 3 次 codex 工具参数错误）、wrapper 自留日志 `codeagent-wrapper-8512.log`（终 430KB，实测仍在写 ⇒ "我的驱动 observed_bytes 平" ≠ "评审死了"，这条区分救了一次误判）
- 主路由前端三次失败现场：`qm6-frontend.log`（三次 EXIT code=1 / findings_landed=false）
- 替代通道：`qm6-fallback-frontend.log`、`qm6-fallback-backend-par.log`（各 `findings_parseable=true`）
- 驱动：`qm6-run-primary.js`（主路由，短 prompt 才能避开 wrapper 的 stdin 模式）、`qm6-fallback.js`（带 `-FALLBACK` 后缀隔离，防两条通道互相覆盖同一文件）
