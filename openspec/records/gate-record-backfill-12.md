---
record: gate-record-backfill-12
task: 回填三篇新载体记录的远程同步行并销账（gate-record-backfill-11 / sync-status-field-cleanup / gate-debt-status-field）
date: 2026-10-08
sync_status: PENDING
sync_reason: 本 PR 尚未合并，merge SHA 还不存在
sync_backfill_owner: 下一个会话（PR 号由 `gh pr list --repo Colinchiu007/mulpub --head gate-record-backfill-12 --json number,state,headRefOid` 在开 PR 后当场回读取入本行与「远程同步」行，不凭印象填；合并后按 git log origin/main --grep='(#<该号>)$' --format=%H|%cI 取 merge SHA，回填并整段删除本 frontmatter 的三个 sync_* 字段）
---

## 本次执行记录：回填三篇记录的远程同步欠账（gate-record-backfill-12，2026-10-08）【docs-only】

- 判定：`node scripts/classify-docs-only.js --base=origin/main --head=HEAD`（**提交后**复跑）→ 结果见下表
- 保留门禁：变更类型与隔离声明 ✅ | 行尾对账 ✅ | 品牌残留 ✅ | 文档同步 ✅ | Gate 2c ✅ | 远程同步 PENDING（本条自己的欠账）

### 这批的特殊之处：它是在一把**刚被补宽的门禁**下做的回填

#3140（`2542a9b29`）把 `sync_status` 纳入了「已收口却仍留登记字段」的残留判据。所以本批的删除动作是**那条新判据的第一次自我适用**：
三篇记录各自少删一个 `sync_*` 字段，改宽后的门禁就会当场把本 PR 打红。写完即跑自查 ⇒
`node scripts/check-gate-record-debt.js` 顶部 `OK…记录文件登记字段无残留`（见「Gate 2c」行）。

净效果 **3 收 1 开**，账池压回机制下界。

### 证据（每条三源，缺一就整条排除，不半量回填、不猜）

| 记录（== 分支名） | PR | main 上的 squash 提交 | committer |
| --- | --- | --- | --- |
| `gate-record-backfill-11` | #3128 | `f74de1d12d406423f2d5800c111aeec3c52ef49f` | 2026-10-08T12:36:03+08:00 |
| `sync-status-field-cleanup` | #3131 | `d1535e89436ca4386d587e041226ac473c6bcbdd` | 2026-10-08T13:04:31+08:00 |
| `gate-debt-status-field` | #3140 | `2542a9b29c4374765db8538969e8542913237b8e` | 2026-10-08T15:30:31+08:00 |

三条独立取证，三篇各自都过：① `git log origin/main --grep='(#N)$' --format=%H|%cI` 恰好 1 行（`#` 一个不漏）；
② `gh pr view N --json state,mergeCommit,headRefName` 的 oid 与 ① 同一个，且 `headRefName` 与记录文件名一致（归属核对，不靠分支名猜 PR）；
③ `git ls-remote --heads origin <branch>` 返回 0 行。

写回前硬断言：每文件 `^sync_` 字段**恰好 3 个**、`^\| 远程同步 \|` 行**恰好 1 条**且确以 `\| PENDING \|` 开头，任一不符整批抛错停手；
写回后逐文件回读 `PASS=1 / pending=0 / sync_fields=0`、目标 SHA 在文中出现。三篇全部达标。

### 回填动作与门禁

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | PASS | 纯 `openspec/records/**` 文档变更 ⇒ docs-only 通道；在隔离 worktree `D:/Data/projects/mp-worktrees/mp-gate-debt-status-field` 内以裸分支 `gate-record-backfill-12`（base `2542a9b29` = 当时 origin/main）做，`rev-parse` 两值相同实证。复用同一目录是因为该 worktree 属本会话且其原分支已合并删除；共享根保持 main clean |
| 回填与销账同一次 | PASS | 三篇各自：`远程同步` 行 PENDING→PASS（含 merge SHA + committer + 三源取证写法）**且**同一次提交内删除 `sync_status`/`sync_reason`/`sync_backfill_owner` **三个**字段；回读 `sync_fields=0` ×3 |
| 未新增 ledger 键 | PASS | 三篇都是新载体（登记随文件走），按既有口径不在 `scripts/gate-record-debt-ledger.json` 建键；本 PR 未触碰该文件 |
| Gate 2c | PASS | 删除动作完成后**立即**用被本会话补宽过的那版判据自查 ⇒ 顶部 `OK: 顶部记录带行，两源所有未收口的 远程同步 行均已登记，清单无陈旧项、记录标题无重复、记录文件登记字段无残留`，退出码 0；现场 `远程同步行 252 条 / 执行记录 455 篇 / 已登记欠账 9 条 / 记录文件 108 篇`。**形状**：本批只应动「记录文件」+1（本篇）、「已登记欠账」不变（不建键）、「远程同步行」总数不变（改状态列不是行数） |
| 行尾 | PASS | 三篇工作副本都是 LF（`attr=text=auto` ⇒ 索引与 worktree 均 `i/lf w/lf`），脚本按 `split('\n')/join('\n')` 逐行处理、不碰任何一行的行尾；提交后两口径 numstat 逐文件对账 |
| 本地门禁汇总 | PENDING | 提交后统一复跑并回填：`classify-docs-only` / `check-no-brand-residue.js` / `check-pr-exec-record.js --mode=enforce` / `check-docs-sync.sh` / `check-max-lines.js` + 两口径 numstat |
| QM-1 / QM-2 / QM-4 / TDD / QM-6 | N/A | docs-only 通道，零运行时文件、零逻辑分支 |
| 远程同步 | PENDING | 本条自己的欠账：PR 号回读后填入；合并后由下一批回填 PR 改写为 PASS + merge SHA（取证：`git log origin/main --grep='(#<该号>)$' --format=%H\|%cI` + `gh pr view <该号> --json mergeCommit` 同 SHA + `git ls-remote --heads origin gate-record-backfill-12` 为 0 行），并**同一次提交**删除本 frontmatter 的三个 `sync_*` 字段。**注意**：自 #3140 起，少删任意一个字段都会被门禁当场判红（不再是"能过但留死字段"） |

### 账池现状与这套机制的下界（实测，不推算）

本批后仍带 `sync_status:` 的记录 = `_TEMPLATE.md`（模板示例，`_` 前缀不入计数）+ 本篇（活账）。
`check-gate-record-debt.js` 现场 `已登记欠账 9 条` 是 **ledger 侧**的历史 HOLD（多为 2026-08-13 那批 + 一条"不代其他会话改写归属"的孤立行），
本批一条都没动 —— 它们缺的是三源取证，不是回填动作，按「排除不猜」保留。

机制自身的下界仍然成立：**回填批次必然给自己留一条新 PENDING**，所以账池不可能清零；
收口目标只能写成「每条 PENDING 都有三源闭合或明确的保留理由」，不能写成「计数为 0」。
