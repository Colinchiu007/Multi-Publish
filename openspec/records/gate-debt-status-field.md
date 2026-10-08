---
record: gate-debt-status-field
task: 把 sync_status 纳入 check-gate-record-debt.js 的「已收口却仍留登记字段」判据，让门禁的自述与判据一致
date: 2026-10-08
---

## 本次执行记录：sync_status 纳入登记字段残留判据（gate-debt-status-field，2026-10-08）

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | PASS | 改 `scripts/check-gate-record-debt.js` 工具脚本自身 ⇒ 按 AGENTS.md 属**混合 PR**（`classify-docs-only` 必判 false，不借 docs-only 通道），走隔离 worktree `D:/Data/projects/mp-worktrees/mp-gate-debt-status-field`（裸分支 `gate-debt-status-field`，base `41008fd93`）。建区以 `git worktree list` 实证，未采信入口 rc；共享根保持 main clean |
| 人工授权 | PASS | 这是「谁来守门」的改动，AGENTS.md 要求人工过目 ⇒ 动手前用决策简报列了三处门禁改动，用户选定「门禁①：sync_status 纳入残留判据」，另两处（PR 侧补产暗档渲染、`.quality-rhythm/**` 进白名单）**未获授权、本 PR 不做** |
| 根因（QM-5 ①） | PASS | 引入点不是某次误删，而是**判据从来没覆盖第三个字段**：`check-gate-record-debt.js:32-33` 只声明 `RECORD_FIELD_REASON` / `RECORD_FIELD_OWNER`，`:280` 的通过文案却写「记录文件登记字段无残留」。AGENTS.md `:93` 与 `:99` 两处都要求回填时删「`sync_*` 三字段」⇒ 文档口径与门禁判据长期不一致，实测 origin/main 上 **11 篇**把 `sync_status: PASS` 留在原地还能报 OK |
| 逃逸分析（QM-5 ②） | PASS | 单元层：既有 31 例里唯一相关的一条 `已收口却仍留登记字段判为陈旧字段` 的夹具只塞了 `sync_reason`+`sync_backfill_owner` 两个键 ⇒ 「只留 sync_status」这一形态在测试里**根本不可表示**（不是断言松，是没有那个输入）。分类＝**测试场景缺失**。这条正是「断言 X 已实现所以 Y 应为空」式盲区的变体：夹具的字段集就是判据的字段集，两者一起漏 |
| 系统性漏洞（QM-5 ③） | PASS | 具体到文件与环节：`scripts/check-gate-record-debt.js` 的 `readRecord()` 里 `hasAnyRegistration` 只枚举两个键；配套夹具 `scripts/check-gate-record-debt.test.js::recFile(dir, name, {fm})` 对 fm 内容无"必须覆盖全部登记字段"的约束。属**门禁缺失漏洞**（判据面缺一元）而非流程缺失 |
| 修复 + 回归保护（QM-5 ④） | PASS | ①新增 `RECORD_FIELD_STATUS = 'sync_status'`；②`hasAnyRegistration` 改为 `[REASON, OWNER, STATUS].some(...)`；③陈旧文案点名补第三个字段；④`module.exports` 导出该常量。测试两条**成对**新增：正向 `只留 sync_status 也必须判陈旧字段`（断言 `staleRecordFields.length===1` 且点名文件名**与字段名**），反向 `未收口记录带着 sync_status: PENDING 不得判为陈旧字段`（断言 `stale=0` 且 records 源的未登记 open 仍为 1 条）。全量 `node --test` ⇒ **31 tests / 31 pass / 0 fail** |
| ⛔ 关键约束：只放宽「残留」，不得放宽「登记」 | PASS（并锁住） | `hasRegistration` 实测**只**被 `:216` 的 closed 分支消费（`grep -n hasRegistration` 全仓 2 处：定义 + 该使用点），所以把三字段并进去不会影响未收口记录的要求。反向那条用例就是这条约束的锁：**若有人把 `sync_status` 也算进"已登记"，未收口记录只写一个 `sync_status` 就能冒充登记、绕过 `缺非空 sync_reason` 判红** —— 那等于把登记要求从两个字段降到一个。故注释里显式写明这一侧不得合并 |
| 变异反证（证明锁在跑，不是装饰） | PASS | 把实现退回 `[REASON, OWNER]`（即摘掉 STATUS）后实跑：**fail 恰好 1 条，且就是新增的那条正向用例**（`MUTANT_RED=["只留 sync_status 也必须判陈旧字段…"]`、`MUTANT_CAUGHT_BY_NEW_TEST=true`）；收尾从内存里的 pristine 做**逐字节**比对还原（`RESTORED_bytes_equal_self=true`），并回读 `git diff --numstat` 回到 `9 4` 证明工作树未被变异污染。另记一条 TDD 现场：先写测试时**反向那条自己先红过一次**，根因是我把断言写错（误以为合法登记的未收口记录会进 `open` 清单，实际 `open` 只收"未登记"的），改断言为 `records 源 open 数 === 0` 后才得到"只有正向红"的正确起点 —— 这是**我的测试写错**，不是实现问题，如实记着免得下次把这种红当成"锁生效" |
| 真实仓库不误红 | PASS | 在含本改动的树上跑 `node scripts/check-gate-record-debt.js` ⇒ 顶部 `OK`、退出码 0，现场 `远程同步行 252 / 执行记录 454 / 已登记欠账 9 / 记录文件 107`。当时树上仍带 `sync_status:` 的 3 篇（`_TEMPLATE.md` 与两篇未收口记录）全部**不被判残留**，因为 `_` 前缀文件本就不入记录计数、另两篇的行是 PENDING 走的是"必须登记"那一侧 |
| 行尾与 diff 对账 | PASS | 两个目标文件工作副本都是 CRLF（`i/lf w/crlf attr/text=auto`）。**这里也自伤过一次**：第一版补丁脚本用 `\n` 拼多行替换串，往 CRLF 文件里写进 6 条 LF-only 行（实测 `crlf=299 lf-only=6`）。正解不是"统一行尾"，而是**把那一行 `\n` 补回 `\r\n`**：逐字节扫描只给"裸 `\n`"补 `\r`，实跑 `converted=6` ⇒ `crlf=305 lf-only=0`，与基线同档。最终 `git diff --numstat` 与 `--ignore-cr-at-eol --numstat` **逐文件完全相同**（`9/4` + `28/0`）⇒ 无幽灵行 |
| eslint | N/A（口径如实） | CI 的 eslint 步骤是 `pnpm exec eslint electron/ src/ --quiet`（`quality-gate.yml:494`，域在 `apps/desktop`），**不覆盖仓库根 `scripts/`**；根 `package.json` 无 lint script、根目录无 eslint 配置。故本 PR 的语法证据是 `node --check` 两个文件均通过 + 31 例全跑，不假报"eslint 已过" |
| QM-1 打包 / QM-2 代码必检 / QM-4 视觉 / QM-6 | N/A（逐条给理由） | QM-1 触发条件是改 `apps/desktop/electron/**` 或 `packages/rpa-engine/**`，本 PR 零命中；QM-2 六项均为渲染/主进程代码检查，不适用；QM-4 零 UI 文件；QM-6 触发条件是 M+/中高风险运行时逻辑（主进程服务/IPC/核心引擎/安全/状态机/持久化），本 PR 是 9 行判据 + 28 行测试、无分支于生产路径。**但**它是门禁改动，所以把该走的补偿做齐了：人工授权 ✅、TDD 先红后绿 ✅、变异反证 ✅、真实仓库不误红 ✅、反向用例锁住"不得放宽登记要求" ✅ |
| 本地门禁汇总 | PASS（提交 `e3ea9f2e4` 后实跑） | `classify-docs-only --base=origin/main --head=HEAD` ⇒ **`docs-only=false` / files=3**（改了 `scripts/` 工具脚本自身 ⇒ 混合 PR，重型门禁照跑）；`check-no-brand-residue.js` ⇒ `PASS（扫描 7308 个 tracked 文件，无品牌残留…）`；`check-pr-exec-record.js --base=origin/main --mode=enforce` ⇒ `OK`（`变更文件 3 个（A=1 M=2 D=0）｜新增记录 1 篇`）；**被本 PR 改动的那个门禁自己** ⇒ `node scripts/check-gate-record-debt.js` **退出码 0** + 顶部 `OK…记录文件登记字段无残留`，现场 `远程同步行 252 / 执行记录 454 / 已登记欠账 9 / 记录文件 108 篇`（这条是关键：判据改宽后**真实树不误红**，且本篇仍带三字段属合法登记）；`.github/scripts/check-max-lines.js` ⇒ `✅ 无新增超大文件，挂账清单与现实一致`；`check-unwired-tests.js` ⇒ `检查域内测试文件 68 个 / OK: 全部测试均已接线或按欠账登记`（未新增测试**文件**，两条用例进既有 `check-gate-record-debt.test.js`，该文件已由 Gate 2c 点名执行）；`check-docs-sync.sh --base=main --head=HEAD` ⇒ `✅ 仅文档/流程变更`。锁本体 `node --test scripts/check-gate-record-debt.test.js` ⇒ **31 pass / 0 fail**。行尾两口径 numstat 逐文件相同（`33/0`、`9/4`、`28/0`）⇒ 无幽灵行 |
| 远程同步 | PASS | 已合并：squash 落地 `2542a9b29c4374765db8538969e8542913237b8e`（committer 2026-10-08T15:30:31+08:00）。取证两源一致：`git log origin/main --grep='(#3140)$' --format=%H|%cI` 唯一命中该 SHA 与时间，`gh pr view 3140 --json mergeCommit` 报同一 oid；`git ls-remote --heads origin gate-debt-status-field` 返回 **0 行**证远端分支已随合并删除。该记录是门禁改动本身（把 `sync_status` 纳入残留判据）。**本篇的删除动作就是那条新判据的第一次自我适用**：三个字段少删一个，改宽后的门禁当场把本 PR 打红。 本 frontmatter 的三个 `sync_*` 登记字段（`sync_status` / `sync_reason` / `sync_backfill_owner`）已在本条由 PENDING 转 PASS 的**同一次提交**内整段删除 |

## 明确留在场上的边界（不假装已闭合）

1. **`.quality-rhythm/**` 白名单与 PR 侧暗档渲染**这两处门禁改动未获授权，本 PR 不碰，仍停在 `docs/visual-capture-settle-and-attribution.md` §9.3 与 `openspec/records/sync-spec-mirror-purpose-gate.md` 的登记里。
2. **历史 11 篇由 #3131 单独清理**，不在本 PR 顺手改（那是另一批文件、另一种性质）。若本 PR 先合、#3131 后合，中间窗口里 main 上仍可能有残留 `sync_status` 被新判据打红 —— 实测顺序上 #3131 已先落地（`d1535e894`），所以本 PR 的「真实仓库不误红」是在**已清理的树**上量的，这个前提写清楚。
3. 本判据只认 frontmatter 里**存在**该键（不看值）。若将来有人想留一个 `sync_status: N/A` 之类的"已完成标记"，会被判残留 —— 这是刻意的：登记字段的语义就是"还没收口"，收口了就删。
