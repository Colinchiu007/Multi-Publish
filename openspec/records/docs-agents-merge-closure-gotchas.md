---
record: docs-agents-merge-closure-gotchas
task: 把「PR 合并后收尾链」上实测到的六类假失败与共享根滞后前提，写入 AGENTS.md 的收尾清单与新增小节
date: 2026-10-10
sync_status: PENDING
sync_reason: 本 PR 尚未合并，merge SHA 还不存在；合并后由回填 PR 取证并删除本段三字段
sync_backfill_owner: 下一个会话（本 PR 作者侧）
---

## 本次执行记录：PR 收尾链假失败口径与共享根滞后防线（docs-agents-merge-closure-gotchas，2026-10-10）

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | ✅ | 纯流程文档（仅 `AGENTS.md` 一个正文载体 + 台账/记录/CHANGELOG 三载体）。按 AGENTS.md「分层分支策略」：不影响运行行为 ⇒ 不需要独立 worktree，在共享主工作区 `D:\Data\projects\mulpub` 就地编辑，但同样经 PR 落地（无「直推 refs/heads/main」这条路，分支保护对直推一律 `GH011`）。基线 `origin/main`=`299d3f5eb`，共享根 `main` 已 ff 到同一提交后才动笔 |
| 第一性原因（QM-5 ①） | ✅ | 本条记录的源头不是代码 Bug，而是**判据取 rc 不取产物**这一类错误在收尾链上的六次复发，全部来自本会话 `fix-account-tab-cookie-restore`（PR #3239 / 回填 #3240）的现场：`gh pr merge --squash --delete-branch` 恒 rc=1（gh 本地收尾要动 `main`，而 `main` 由共享根 worktree 持有）、`classify-docs-only.js --head=HEAD` 在未提交时返回 `docs-only=false files=0`（`HEAD==base` ⇒ 空 diff）、Git Bash 的 MSYS 把 `git show origin/main:<path>` 改成 `origin\main;<path>`、`safe-worktree-remove.ps1` 在 `node_modules` 深路径报 `Filename too long`（rc=255 但脚本 R6/R7 已兜底）、`git merge-base --is-ancestor` 对 squash 合并的分支必然判假、共享根 `main` 滞后时就地编辑会**反向撤销已合并的那一行** |
| 逃逸分析（QM-5 ②） | ✅ | 逃逸的是**文档层**而非测试层：AGENTS.md 的「合并后收尾清单」原本只写五步产物判据，没写「这五步各自有哪些已知假失败」。后果是每一类假失败都要下一个会话重新踩一遍并可能做出**破坏性**误判——以 rc=1 重跑合并（会把已合并的 PR 再动一次）、以 rc=255 改判清理失败随后手工递归删除（直接违反 R0）、以 `merge-base` 判假推断「没合进去」而重做一遍已完成的修复。第四类已经真实发生：本会话在 `main` 滞后 6 个提交的工作副本上编辑 `AGENTS.md`，diff 会连 #3239 刚合并的那条纪律条一起撤掉，且 `git diff --numstat` 两口径对账**照样通过**（它是行尾对账，不是内容逆否证） |
| 修复 + 回归保护（QM-5 ④） | ✅ | 正文落在 `AGENTS.md`：① 收尾清单新增第 6 条（`busy holders` 的定位与判读法：按「命令行含该 worktree 绝对路径」找持有者 → 核完整进程树 + 同一 PID 间隔 6s 两次 `UserModeTime` 采样判挂死 → 逐个按 PID 终止 → 终止前后 `Get-Process electron` 计数必须相等，防误杀别的 worktree 上用户实例；脏清单先复制留证再 `-Force -ConfirmDirtyDiscarded`，复制前先 `git ls-tree` 确认未被上游托管）；② 新增小节「收尾链上的已知假失败（判据一律取产物，不取 rc）」六条，逐条给出**正确判据**而非仅描述现象。回归保护形态：文档类变更的可执行锁本就不存在，此处的防再犯机制是既有门禁——`check-gate-record-debt.js`（本条 PENDING 已同次登记 ledger）与 `check-pr-exec-record.js`（本文件即其要求的记录载体），两者仍会在下一次被绕过时报红 |
| 防止再次发生（QM-5 ⑤） | ✅ | 四处落盘：① `AGENTS.md` 正文（上条）；② `CHANGELOG.md` 置顶条目；③ 内置记忆 `squash-merge-closure-gotchas.md`（跨会话第一入口）与 `account-tab-cookie-restore-status.md` 的状态收口段；④ 本执行记录（`openspec/records/`，供 `check-pr-exec-record.js` 取证）。刻意**不**新增脚本或 CI 门禁：这六条都是「退出码语义」问题，能被机械锁住的是产物判据本身（`state=MERGED`/`mergeCommit.oid`/远端分支 0 行/树等值），而那些已由 AGENTS.md 既有收尾清单第 1-2 条与 `check-pr-exec-record.js` 覆盖，再造一份脚本会与既有判据重复口径 |
| 行尾与 diff 对账 | ✅ | `git diff --numstat` 与 `git diff --ignore-cr-at-eol --numstat` 两口径逐文件相同（`AGENTS.md` 实测 `10 0` == `10 0`，插入 10 行、删 0 行）。四个既有载体均为 `i/lf w/crlf attr/text=auto`（工作副本 CRLF、blob LF），因此 Edit 一律用**不含换行的单行锚点**，多行锚点会因 `\r\n` vs `\n` 失配；本会话已实测发生一次失配后改用单行锚点。删除数为 0 ⇒ 无「逆否证已合并行」的可能 |
| 接线棘轮 | N/A | 本 PR 未新增任何 `*.test.js` / `*.test.mjs` / `*.test.sh` / `*.test.ps1`，`check-unwired-tests.js` 的欠账清单不变（该判据按文件增删比对，无新增即无登记） |
| QM-1 打包 / QM-4 视觉 | N/A | 未触 `apps/desktop/electron/` 或 `packages/rpa-engine/`，无 UI 文件、无样式、无文案改动，显示项与提示文字不变；docs-only 通道按 AGENTS.md 明确跳过 QM-1/QM-2 代码必检项/QM-4/TDD |
| QM-6 CCG 双模型外部评审 | 未执行 | 纯流程文档变更，按 AGENTS.md「纯文档/流程变更不强制 QM-6」；本会话亦未把自审冒充双模型外部评审。评审面留给下一个读 `AGENTS.md` 的会话：新增小节的六条判据是否被改宽（这是既有「残留风险」段点名的、机械闸门挡不住的那一类） |
| 远程同步 | PENDING | 合并后取 `git log origin/main --grep='(#NNNN)$' --format=%H|%cI` 回填 merge SHA 与时间，`git ls-remote --heads origin docs-agents-merge-closure-gotchas` 返回 0 行证远端分支已删；回填后删除上方三个 sync_* 字段，并在**同一次提交**内删掉 `scripts/gate-record-debt-ledger.json` 的登记项 |

### 遗留（不假装已闭合）

- **六条假失败里没有一条做过「把判据本身改成 no-op 必须立刻变红」的变异反证**。原因如实：它们不是自动化门禁，是写在文档里的判据口径，无测试体可施变异。风险敞口是「下一个会话照抄某条 rc 判据而忽略产物判据」，此时唯一防线仍是 `check-pr-exec-record.js` / `check-gate-record-debt.js` 这两个既有门禁，以及人工抽查本文件的基线差分（AGENTS.md「残留风险」段原话）。
- **共享根 `main` 滞后编辑会反向撤销已合并行**这一类，本 PR 只写成了纪律，没有落成机械锁。理论上可锁（比对 `git log HEAD..origin/main -- <目标文件>` 非空即拒），但它会在每一次正常的 docs 提交前都要求先 ff，且共享根被 `[shared-root-guard]` 强制留在 `main`、ff 时机由写保护 watcher 与人工交替决定——把它做成 pre-commit 拦截可能把「该 ff 了」变成「提交不了」。是否升级为门禁属人工裁决，未裁决前本条敞口保留。
- 本机其它 20 个 worktree 与 `D:\Data\projects\mp-worktrees` 下若干在跑实例的清理，不在本 PR 范围；`mp-fix-account-tab-cookie-restore` 已按 R1-R7 清理并经 R7 基线对账一致。
