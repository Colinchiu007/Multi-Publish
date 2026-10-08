---
record: gate-record-backfill-11
task: 回填三篇新载体记录的远程同步行并销账（gate-record-backfill-09 / keyfix-live-verify / gate-record-backfill-10）
date: 2026-10-08
sync_status: PENDING
sync_reason: 本 PR 尚未合并，merge SHA 还不存在
sync_backfill_owner: 下一个会话（PR 号 **3128** 已由 `gh pr list --repo Colinchiu007/mulpub --head gate-record-backfill-11 --json number,state,headRefOid` 回读取入（state=OPEN，headRefOid=`461f527777311227cd134b6dba47bae8173b757a`），非凭印象；合并后按 git log origin/main --grep='(#3128)$' --format=%H|%cI 取 merge SHA，回填并整段删除本 frontmatter 的三个 sync_* 字段）
---

## 本次执行记录：回填三篇记录的远程同步欠账（gate-record-backfill-11，2026-10-08）【docs-only】

- 判定：`node scripts/classify-docs-only.js --base=origin/main --head=HEAD`（**提交后**复跑）→ 结果见下表「classify-docs-only」行
- 保留门禁：变更类型与隔离声明 ✅ | 行尾对账 ✅ | 品牌残留 ✅ | 文档同步 ✅ | Gate 2c ✅ | 远程同步 PENDING（本条自己的欠账）

### 这一批收的是本会话自己留下的账

上一批（#3125）在收 #3113/#3116 时，按机制必然**新开一条**（本篇所属记录的上一环 `gate-record-backfill-10`）。
同时翻 origin/main 发现还有两篇更早的：`gate-record-backfill-09`（#3092）与 `keyfix-live-verify`（#3100）——
两条 PR 都在 2026-10-07 就合并、远端分支都已删，记录却还写着 PENDING。**这两条是本会话前段自己开的**，
当时只收了别人的账，没给自己那两条留收口动作。净效果 **3 收 1 开**。

「已合并却顶着没干完的字样」会被下一个读到的会话当成还有活 ⇒ 重复开工，这正是 `check-gate-record-debt.js`
要解决的问题；所以攒批不如就地收干净。

### 证据（每条三源，缺一就整条排除，不半量回填、不猜）

| 记录（== 分支名） | PR | main 上的 squash 提交 | committer |
| --- | --- | --- | --- |
| `gate-record-backfill-09` | #3092 | `1dd530d1becffca1faf4bf27b6582291405a4f48` | 2026-10-07T13:18:34Z |
| `keyfix-live-verify` | #3100 | `cc7f0bc8aa89006449a7c47c9f9ecb1e60fc5e64` | 2026-10-07T22:33:20+08:00 |
| `gate-record-backfill-10` | #3125 | `2e53ae336a162812349226af2a7585bc93d58f03` | 2026-10-08T11:35:03+08:00 |

三条独立取证，三篇各自都过：① `git log origin/main --grep='(#N)$' --format=%H|%cI` 恰好 1 行（`#` 一个不漏 ——
这个模式在本仓记忆里已因漏写 `#` 四次把已合并判成未合并）；② `gh pr view N --json state,mergedAt,mergeCommit`
的 oid 与 ① 同一个；③ `git ls-remote --heads origin <branch>` 返回 0 行。

写回前的硬断言（三条全过才动手）：每文件 `^sync_` 字段**恰好 3 个**、`^\| 远程同步 \|` 行**恰好 1 条**、
且该行确以 `\| PENDING \|` 开头；任一不符整批抛错停手。写回后逐文件回读 `PASS=1`、`pending=0`、`sync_fields=0`、目标 SHA 在文中出现。

### 明确排除的一条（不猜）

`openspec/records/schedule-hardening.md` 在**我开始取证的那一刻**确实也顶着 PENDING，且三条证据一条都不成立：
`git log origin/main --grep='schedule-hardening'` 零命中、它的「远程同步」行里 PR 号还是字面 `(#NNNN)` 占位。
当时 origin/main = `2e53ae336`。⇒ 按「分支没了不等于已合并，替它猜 SHA 就是把记录写成假证据」判为**排除**。

**但这条排除是有时间戳的，而且已经过期了**：建本 worktree 时 base 变成 `c440285fd`，
那正是另一会话的回填 PR #3127 落地的那次提交 —— 它把 `schedule-hardening` 收成了 PASS
（PR #3123，merge SHA `2475fa74c270710445ac9cb8961e24c5f86c853c`，`git log --grep='(#3123)$'` 可复核），并删掉了它的 `sync_*` 字段。
本 PR **不碰该文件**（diff 里没有它）。

留下的方法论：**「排除」不是一个可以写完就放着的结论，它和「回填」一样带时效**。
跨 base 之后必须重取，否则记录里会出现一条"当时对、现在错"的排除理由，而下一个会话会照读。
这也是本仓既有口径「为合并背书的两源核对会在并发合并中过期 ⇒ 必须在请求合并那一刻重取」在**排除侧**的镜像。

### 回填动作与门禁

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | PASS | 纯记录变更 ⇒ docs-only 通道；隔离 worktree `D:/Data/projects/mp-worktrees/mp-gate-record-backfill-11`（裸分支 `gate-record-backfill-11`，base `c440285fd` = 当时 origin/main，`rev-parse` 两值相同实证）。建区以 `git worktree list` 出现该路径 + 分支名为证，未采信入口 rc。共享根保持 main clean |
| 回填与销账同一次 | PASS | 三篇各自：`远程同步` 行 PENDING→PASS（含 merge SHA + committer + 三源取证写法）**且**同一次提交内删除 frontmatter 的三个 `sync_*` 字段；回读 `sync_fields=0` |
| 未新增 ledger 键 | PASS | 三篇都是**新载体**（登记随文件的 `sync_*` 走），按既有口径不得在 `scripts/gate-record-debt-ledger.json` 建键 —— 建了会当场报「陈旧登记」（#3089 那批实测踩过）。本 PR 未触碰该文件 |
| 行尾 | PASS | 三篇工作副本均为 LF（`attr=text=auto`，索引与 worktree 都是 `i/lf w/lf`），脚本按 `split('\n')/join('\n')` 逐行处理、不碰任何一行的行尾；提交后两口径 numstat 逐文件对账 |
| Gate 2c | PASS（提交 `0e4dfd59c` 后复跑） | `node scripts/check-gate-record-debt.js` ⇒ 顶部 `OK: 顶部记录带行，两源所有未收口的 远程同步 行均已登记，清单无陈旧项、记录标题无重复、记录文件登记字段无残留`；现场 `远程同步行 251 条 / 执行记录 453 篇（全部 ## 标题 461 个）/ 已登记欠账 8 条 / 记录文件 102 篇`。**形状判据**：本批收了 3 条、开 1 条 ⇒ 「远程同步行」总数不变（改的是状态列不是行数）、「已登记欠账」必须不变（本篇是新载体，登记随文件走、不建 ledger 键）、「记录文件」因本篇 +1。绝对数会随 base 漂，可复核的是这三条形状 |
| 本地门禁汇总 | PASS（提交 `0e4dfd59c` 后实跑） | `classify-docs-only --base=origin/main --head=HEAD` ⇒ **`docs-only=true` / files=4**（四篇全在 `openspec/records/` 下）；`check-no-brand-residue.js` ⇒ `PASS（扫描 7269 个 tracked 文件，无品牌残留…）`；`check-pr-exec-record.js --base=origin/main --mode=enforce` ⇒ `OK`（`变更文件 4 个（A=1 M=3 D=0）｜新增记录 1 篇｜载体M=3`）；`.github/scripts/check-max-lines.js` ⇒ `超限文件=98 挂账=98 墓碑=1 ✅ 无新增超大文件，挂账清单与现实一致`；`check-docs-sync.sh --base=main --head=HEAD` ⇒ `✅ 仅文档/流程变更，无需额外同步`。行尾两口径 numstat 逐文件相同（`1/4` ×3 + `65/0`）⇒ 无幽灵行 |
| QM-1 / QM-2 / QM-4 / TDD / QM-6 | N/A | docs-only 通道，零运行时文件 |
| 远程同步 | PENDING | 本条自己的欠账：PR 号 **3128**（回读来源见 frontmatter，同一次 `gh pr list --json number,state,headRefOid`）；合并后由下一批回填 PR 改写为 PASS + merge SHA（取证：`git log origin/main --grep='(#3128)$' --format=%H\|%cI` + `gh pr view 3128 --json mergeCommit` 同 SHA + `git ls-remote --heads origin gate-record-backfill-11` 为 0 行），并**同一次提交**删除本 frontmatter 的三个 `sync_*` 字段；新载体不在 ledger 建键。（这一行是**表格行**而不是 bullet —— `ROW_RE = /^\|\s*远程同步\s*\|/` 只认表格行） |

### 这套机制自身的一处不闭合（登记，不在本 PR 改）

回填批次**必然**给自己留一条新 PENDING（本批 3 收 1 开），于是"清账"这件事永远清不到零 ——
账池大小的下界就是"最近一批还没被收"。这不是缺陷（它保证每条记录都被**下一个**会话核对一遍），
但它意味着：**不能以「PENDING 计数为 0」为收口目标**，只能以「每条 PENDING 都有对应的三源闭合或明确的未合并理由」为目标。
本批后未收口账池（**在 `c440285fd` + 本 PR 提交后的工作树上实测**，不是推算）：

- 新载体：`grep -l "^| 远程同步 | PENDING" openspec/records/*.md` ⇒ **2 个命中**，其中 `_TEMPLATE.md` 是模板里的示例文本（不是欠账），真实欠账只有本篇 1 条；
- legacy 源：`.quality-gates.md` 里 **1 条** PENDING 行 —— 即 `:6980` 那条孤立记录，ledger 原文写明「该块丢了 `## ` 标题、不代其他会话改写归属」，属**已登记的故意保留**，不是漏收；
- 另有 12 篇记录仍带 `sync_status:` 字段但状态列已是 PASS —— 门禁按「行」判不按「字段」判，所以它们不计入欠账；`check-gate-record-debt.js` 现场 `已登记欠账 8 条` 与本批前**完全相同**（本批未建也未销任何 ledger 键）。

⇒ 收口目标只能写成「每条 PENDING 都有三源闭合或明确的保留理由」，本批后该不变量成立。
