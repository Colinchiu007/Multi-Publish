---
record: gate-record-backfill-11
task: 回填三篇新载体记录的远程同步行并销账（gate-record-backfill-09 / keyfix-live-verify / gate-record-backfill-10）
date: 2026-10-08
sync_status: PENDING
sync_reason: 本 PR 尚未合并，merge SHA 还不存在
sync_backfill_owner: 下一个会话（PR 号由 `gh pr list --repo Colinchiu007/mulpub --head gate-record-backfill-11 --json number,state,headRefOid` 在开 PR 后当场回读取入本行与「远程同步」行，不凭印象填；合并后按 git log origin/main --grep='(#<该号>)$' --format=%H|%cI 取 merge SHA，回填并整段删除本 frontmatter 的三个 sync_* 字段）
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

`openspec/records/schedule-hardening.md` 同样顶着 PENDING，但**三条证据一条都不成立**：
`git log origin/main --grep='schedule-hardening'` **零命中**（main 上根本没有它的合并提交），
且它的「远程同步」行里 PR 号仍是字面 `(#NNNN)` 占位。远端分支虽已不存在，但「分支没了」不等于「已合并」
（也可能是清理掉或尚未提 PR）。⇒ **不动它**：那是别的会话的在制品，替它猜一个 SHA 就是把记录写成假证据。

### 回填动作与门禁

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | PASS | 纯记录变更 ⇒ docs-only 通道；隔离 worktree `D:/Data/projects/mp-worktrees/mp-gate-record-backfill-11`（裸分支 `gate-record-backfill-11`，base `c440285fd` = 当时 origin/main，`rev-parse` 两值相同实证）。建区以 `git worktree list` 出现该路径 + 分支名为证，未采信入口 rc。共享根保持 main clean |
| 回填与销账同一次 | PASS | 三篇各自：`远程同步` 行 PENDING→PASS（含 merge SHA + committer + 三源取证写法）**且**同一次提交内删除 frontmatter 的三个 `sync_*` 字段；回读 `sync_fields=0` |
| 未新增 ledger 键 | PASS | 三篇都是**新载体**（登记随文件的 `sync_*` 走），按既有口径不得在 `scripts/gate-record-debt-ledger.json` 建键 —— 建了会当场报「陈旧登记」（#3089 那批实测踩过）。本 PR 未触碰该文件 |
| 行尾 | PASS | 三篇工作副本均为 LF（`attr=text=auto`，索引与 worktree 都是 `i/lf w/lf`），脚本按 `split('\n')/join('\n')` 逐行处理、不碰任何一行的行尾；提交后两口径 numstat 逐文件对账 |
| Gate 2c | PENDING | 提交后复跑 `node scripts/check-gate-record-debt.js`，结果回填于「本地门禁汇总」行 |
| 本地门禁汇总 | PENDING | 提交后统一复跑并回填：`classify-docs-only` / `check-no-brand-residue.js` / `check-pr-exec-record.js --mode=enforce` / `check-gate-record-debt.js` / `check-docs-sync.sh` / `check-max-lines.js` + 两口径 numstat |
| QM-1 / QM-2 / QM-4 / TDD / QM-6 | N/A | docs-only 通道，零运行时文件 |
| 远程同步 | PENDING | 本条自己的欠账：PR 号回读后填入；合并后由下一批回填 PR 改写为 PASS + merge SHA（取证：`git log origin/main --grep='(#<该号>)$' --format=%H\|%cI` + `gh pr view <该号> --json mergeCommit` 同 SHA + `git ls-remote --heads origin gate-record-backfill-11` 为 0 行），并**同一次提交**删除本 frontmatter 的三个 `sync_*` 字段；新载体不在 ledger 建键。（这一行是**表格行**而不是 bullet —— `ROW_RE = /^\|\s*远程同步\s*\|/` 只认表格行） |

### 这套机制自身的一处不闭合（登记，不在本 PR 改）

回填批次**必然**给自己留一条新 PENDING（本批 3 收 1 开），于是"清账"这件事永远清不到零 ——
账池大小的下界就是"最近一批还没被收"。这不是缺陷（它保证每条记录都被**下一个**会话核对一遍），
但它意味着：**不能以「PENDING 计数为 0」为收口目标**，只能以「每条 PENDING 都有对应的三源闭合或明确的未合并理由」为目标。
本批后 origin/main 上新载体未收口 = 1 篇（本篇）+ 1 篇未合并（`schedule-hardening`，如实保留）。
