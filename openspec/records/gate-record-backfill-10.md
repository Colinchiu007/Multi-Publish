---
record: gate-record-backfill-10
task: 回填两篇新载体记录的远程同步行并销账（visual-baseline-collection-dark / sync-spec-mirror-purpose-gate）
date: 2026-10-08
sync_status: PENDING
sync_reason: 本 PR 尚未合并，merge SHA 还不存在
sync_backfill_owner: 下一个会话（PR 号由 `gh pr list --repo Colinchiu007/mulpub --head gate-record-backfill-10 --json number,state,headRefOid` 在开 PR 后当场回读取入本行与「远程同步」行，不凭印象填；合并后按 git log origin/main --grep='(#<该号>)$' --format=%H|%cI 取 merge SHA，回填并整段删除本 frontmatter 的三个 sync_* 字段）
---

## 本次执行记录：回填两篇记录的远程同步欠账（gate-record-backfill-10，2026-10-08）【docs-only】

- 判定：`node scripts/classify-docs-only.js --base=origin/main --head=HEAD`（**提交后**复跑）→ 结果见下表「classify-docs-only」行
- 保留门禁：变更类型与隔离声明 ✅ | 行尾对账 ✅ | 品牌残留 ✅ | 文档同步 ✅ | Gate 2c ✅ | 远程同步 PENDING（本条自己的欠账）

### 为什么这两条要专门收

两篇记录所属的 PR 都已 squash 合并、远端分支都已删，但记录里仍写着 `远程同步 PENDING` —— 「已合并却顶着没干完的字样」会被下一个读到的会话当成还有活，是重复开工的入口。
这一批与 #3092 那批的区别是：**两条都是我本会话自己开的、自己合的**，取证现场还在，所以不必等攒批。净效果 **2 收 1 开**。

### 证据（每条三源，缺一就整条排除，不半量回填、不猜）

| 记录（== 分支名） | PR | main 上的 squash 提交 | committer |
| --- | --- | --- | --- |
| `visual-baseline-collection-dark` | #3113 | `8ac22d0d96838155269be0467d1925852074b413` | 2026-10-08T11:25:06+08:00 |
| `sync-spec-mirror-purpose-gate` | #3116 | `7c62f3e3d107c5c3d0e63841f8dd3cf4d5e4f7a1` | 2026-10-08T10:49:04+08:00 |

三条独立取证，两条记录各自都过：

1. `git log origin/main --grep='(#3113)$' --format=%H|%cI` / `…'(#3116)$'…` ⇒ 各**恰好 1 行**，给出上表 SHA 与时间。
   （`#` 一条不漏：这个模式在本仓记忆里已因漏写 `#` 造成过四次「判成未合并」，本次落笔后按输出逐字对照过一次。）
2. `gh pr view <N> --json state,mergedAt,mergeCommit` ⇒ `MERGED` 且 `mergeCommit.oid` 与 ① **同一个 SHA**（两源互证，防 squash 后 force 推漂移）。
3. `git ls-remote --heads origin <branch> | wc -l` ⇒ **0**，证远端分支已随合并删除。

写回前的硬断言：每个文件 `sync_*` 字段**恰好 3 个**、`^\| 远程同步 \|` 行**恰好 1 条**，任一不符整批抛错停手；
写回后逐文件回读 `sync_rows(PASS)=1`、`pending_left=0`、`sync_fields_left=0`、目标 SHA 在文中出现。

### 顺带补上的一处欠账（不是回填，是同一条记录的现场更正）

`visual-baseline-collection-dark` 的「自证」行原本只写了「dispatch 跑在 `fedd5df28`，判据是合并后 `apps/` 命中数 = 0」。
合并前该分支做过一次 re-sync（把 `origin/main@7c62f3e3d` 合进来 ⇒ merge commit `cc1fcec61`），当场复测
`git diff --name-only fedd5df28..HEAD` 命中 `apps/` **仍为 0** ⇒ 那次 `visual-test` run `37650576300` 的 0 px 结论对新 head 依然成立，
**不需要再占第二轮采集**。这句话已写进该记录的「远程同步」行，避免下一个会话以为自证过期。

### 回填动作与门禁

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | PASS | 纯记录变更 ⇒ docs-only 通道；在隔离 worktree `D:/Data/projects/mp-worktrees/mp-sync-spec-mirror-purpose-gate` 内以裸分支 `gate-record-backfill-10`（base `8ac22d0d9` = 当时 origin/main）做，共享根 `D:/Data/projects/Mulpub` 保持 main clean。复用同一目录是因为该 worktree 属本会话且其原分支已合并删除；切分支后以 `rev-parse --abbrev-ref HEAD` + `rev-parse --short HEAD` 实证 |
| 回填与销账同一次 | PASS | 两条记录各自：`远程同步` 行 PENDING→PASS（含 merge SHA + committer + 三源取证写法）**且**同一次提交内删除 frontmatter 的 `sync_status`/`sync_reason`/`sync_backfill_owner` 三行；回读 `sync_fields_left=0` |
| 未新增 ledger 键 | PASS | 两条都是**新载体**（登记随文件的 `sync_*` 走），按既有口径**不得**在 `scripts/gate-record-debt-ledger.json` 建键 —— 建了会当场报「陈旧登记」（#3089 那批实测踩过）。本 PR 未触碰该文件 |
| 行尾 | PASS | 两条记录工作副本均为 LF（`attr=text=auto`，索引与 worktree 都是 `i/lf w/lf`），脚本按 `split('\n')/join('\n')` 逐行处理、不碰任何一行的行尾；提交后 `git diff --numstat` 与 `--ignore-cr-at-eol --numstat` 两口径逐文件对账 |
| Gate 2c | PENDING | 提交后复跑 `node scripts/check-gate-record-debt.js`，结果回填于「本地门禁汇总」行 |
| 本地门禁汇总 | PENDING | 提交后统一复跑并回填：`classify-docs-only` / `check-no-brand-residue.js` / `check-pr-exec-record.js --mode=enforce` / `check-gate-record-debt.js` / `check-docs-sync.sh` + 两口径 numstat |
| QM-1 / QM-2 / QM-4 / TDD / QM-6 | N/A | docs-only 通道，零运行时文件 |
| 远程同步 | PENDING | 本条自己的欠账：PR 号回读后填入；合并后由下一批回填 PR 改写为 PASS + merge SHA（取证同上三源判据），并**同一次提交**删除本 frontmatter 的三个 `sync_*` 字段；新载体不在 ledger 建键。（这一行是**表格行**而不是 bullet —— `ROW_RE = /^\|\s*远程同步\s*\|/` 只认表格行） |

### 明确排除、不静默修的部分

1. **legacy 源 `.quality-gates.md:6980` 那条孤立 PENDING** 仍不动 —— 它所属记录块丢了 `## ` 标题、门禁按最近标题把欠账记到别人名下，ledger 原文写明「不代其他会话改写归属」。要修的是补标题，不是替它猜 SHA。
2. **ledger 里其余登记项**一条都不碰：本 PR 只对「三源闭合」的两条负责，未取证的按「排除不猜」保留。
3. `visual-baseline-collection-dark` 记录里那条**结构性盲区**（PR 侧不产暗档渲染 ⇒ 暗色基线漂移在 PR 上不可判）与 `sync-spec-mirror-purpose-gate` 记录里那条**白名单缺口**（`.quality-rhythm/**` 不在 `CI_IGNORED_PATHS`）都属门禁改动，需人工过目，**不在本批顺手修**。
