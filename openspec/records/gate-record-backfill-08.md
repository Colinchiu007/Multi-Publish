---
record: gate-record-backfill-08
task: 批量回填三条「已合并但远程同步仍 PENDING」的执行记录（#3039 / #3078 / #3083）并销账
date: 2026-10-07
sync_status: PENDING
sync_reason: 本 PR 尚未合并，merge SHA 还不存在
sync_backfill_owner: 下一个会话（合并后按 git log origin/main --grep='(#NNNN)$' --format=%H|%cI 取 merge SHA——NNNN 由 `gh pr list --head gate-record-backfill-08 --json number` 当场回读取得，不得凭印象填——回填本行并整段删除本 frontmatter 的三个 sync_* 字段）
---

## 本次执行记录：批量回填远程同步欠账（gate-record-backfill-08，2026-10-07）【docs-only】

- 判定：`node scripts/classify-docs-only.js --base=origin/main --head=HEAD`（**提交后**复跑）→ `docs-only=true`，files=5：`.quality-gates.md`、`openspec/records/audit-writeback-key-fix.md`、`openspec/records/bilibili-buckets-backfill.md`、`openspec/records/gate-record-backfill-08.md`、`scripts/gate-record-debt-ledger.json`
- 保留门禁：变更类型与隔离声明 ✅ | 行尾对账 ✅ | 品牌残留 ✅ | 文档同步 ✅ | Gate 2c ✅ | 远程同步 PENDING（本条自己的欠账）

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型 | PASS | 纯流程/记录变更（`.quality-gates.md`、`openspec/records/**`、`scripts/gate-record-debt-ledger.json`），零运行时代码 ⇒ docs-only 通道。仍按并发纪律在隔离 worktree `D:/Data/projects/mp-worktrees/mp-gate-record-backfill-08`（裸分支 `gate-record-backfill-08`，base `e24660047`）做，共享根 `D:/Data/projects/Mulpub` 保持 main clean |
| 回填对象与双源取证 | PASS | 三条各按「`git log origin/main --grep='(#N)$'` 取 merge SHA + `git ls-remote --heads origin <branch>` 返回 0 行证远端分支已删」双源闭合，**不凭记忆写 SHA**：① #3039 = `e0f788501f92e8513057dd137e352e0caed89e44`（2026-10-07T04:11:23Z）；② #3078 = `8a959ef68279d7cf2eed37d7a5fae0a0b8a9c942`（2026-10-07T18:47:55+08:00）；③ #3083 = `e24660047a87e9f8a2ceca8e59c5664739e87b93`（2026-10-07T20:28:25+08:00）。三个分支名 `sync-backfill-batch-07` / `bilibili-buckets-backfill` / `audit-writeback-key-fix` 的 `ls-remote` 计数当场各为 **0** |
| 合并方式判定（squash 还是 merge） | PASS | 按 main 上**合并提交自己的主题**判，不读 PR 标题：三条 `git log` 主题分别以 `(#3039)`/`(#3078)`/`(#3083)` 结尾且各只有一条命中 ⇒ squash 落地，符合仓库惯例 |
| 回填与销账同一次 | PASS | ① `openspec/records/audit-writeback-key-fix.md`：`远程同步` 行 PENDING→PASS **且** 删除 frontmatter 第 5–7 行的 `sync_status`/`sync_reason`/`sync_backfill_owner`；② `openspec/records/bilibili-buckets-backfill.md`：同样两个半动作在同一提交；③ `.quality-gates.md` 的 batch-07 记录：行改 PASS **且** 删除 `scripts/gate-record-debt-ledger.json` 里对应的登记键（旧载体的登记在 ledger，不在 frontmatter，两套载体的销账介质不同，不得混用） |
| 精确定位（防误伤别人的行） | PASS | `.quality-gates.md` 全文有 **2 条** `远程同步 PENDING` 行（另一条是别的会话欠账，第 6980 行，不归本 PR）。第一版脚本按「第 N 个命中」定位 ⇒ 断言当场抛错 `期望命中 1 行，实得 2`，**在写盘之前就停手**；改为**内容锚点** `本条自己的欠账` 定位，并断言 `ANCHOR_HITS=1` 才动手。改完后 `ANCHOR_LEFT=0`、`PENDING_ROWS_LEFT=1`（另一条原样保留） |
| 行尾与 diff 对账 | PASS | 所有编辑逐行 `split('\n')` 处理、**不碰行内容里的 `\r`**，替换行时按原行结尾补回同一行尾（`OLD_LINE_TAIL_PRESERVED=true`）。提交后按 `git diff --numstat` 与 `--ignore-cr-at-eol --numstat` 两口径对账，两口径一致 ⇒ 无幽灵行 |
| Gate 2c | PASS（**提交后**复跑；第一次跑不作证据，见下行） | 复跑判据与现场数字见下一行「Gate 2c 提交后复跑」。 |
| ⛔ 一次被自己采纳的**域不符**取证（如实登记） | 已纠正 | 本 PR 第一次跑 `check-gate-record-debt.js` 得到 `OK`，我据此把「Gate 2c PASS」写进了执行记录 —— 但**那次跑在本记录文件还是未跟踪状态时**，而 `listRecordFiles` 按跟踪文件枚举（本地读到 86 篇、CI 读到 87 篇，差的正是这一个文件）。于是那条 `OK` 的扫描域里根本没有本 PR 新增的记录，它对自己的新增文件**结构性失明**。CI 用提交后的树当场报红：`❌ 记录文件整块缺 远程同步 行 1 篇：gate-record-backfill-08.md`。根因是我照旧写法只给了 frontmatter 的 `sync_*` 三字段与一条 bullet，漏了 `ROW_RE = /^\|\s*远程同步\s*\|/` 要求的**表格行**。口径：**凡「跑一次自证脚本」的判据，必须在提交后的树上跑**（与 `classify-docs-only` 必须提交后跑是同一条纪律的第三个落点，见 [[project-mulpub-docs-sync-gate]]）。 |
| Gate 2c 提交后复跑 | PASS | **绑最终 head（rebase 到 `6bc65b3be` 之后复跑）现场**：`远程同步行 251 条 / 执行记录 452 篇（全部 ## 标题 460 个）/ 已登记欠账 9 条 / 记录文件 88 篇` + `OK: 顶部记录带行，两源所有未收口的 远程同步 行均已登记，清单无陈旧项、记录标题无重复、记录文件登记字段无残留`；品牌残留同轮复跑 `7237 个 tracked 文件 0 命中`。<br>**这一行是 re-sync 后重取过的**：上一版写 `250 / 451 / 8 / 87 / 7185`，那是 base `e24660047` 上的读数，期间 #3053 与 #3087 各带进一篇记录、一条登记与若干文件，四项计数整体上移。绝对数会随 base 漂，**所以可复核的判据要写成差值**：旧 base 上「本文件未提交时 86 篇 vs 提交后 87 篇」的**差 1** 才是「自证脚本跑在未提交的树上 ⇒ 对自己的新增文件失明」这条教训的硬证据，它与 base 无关 |
| classify-docs-only（提交后） | PASS | `node scripts/classify-docs-only.js --base=origin/main --head=HEAD` ⇒ `docs-only=true`，files=5 |
| check-pr-exec-record（提交后，enforce） | PASS | `本 PR 变更文件 5 个（A=1 M=4 D=0）｜ 新增记录 1 篇 …｜ 载体M=4` + `OK: 本 PR 携带执行记录或带原因的豁免`（注意 `载体M=4` —— 回填型 PR 改的正是别人的记录，这条数字就是那个「没有合法出路」的形状） |
| 品牌残留 | PASS | `node scripts/check-no-brand-residue.js` ⇒ `PASS（扫描 7237 个 tracked 文件，无品牌残留…）`（rebase 后复跑；旧 base 上那次是 7185，差的是 #3053/#3087 带进来的文件） |
| 文档同步 | PASS | `bash scripts/check-docs-sync.sh --base=main --head=HEAD` ⇒ `✅ 仅文档/流程变更，无需额外同步`（该脚本自己拼 `origin/$BASE`，传 `origin/main` 会 `fatal: couldn't find remote ref refs/heads/origin/main`；且**必须在提交后跑**，未提交时它读 HEAD 会报「无变更」，那不构成证据） |
| QM-1 / QM-2 代码必检 / QM-4 / TDD | N/A | docs-only 通道跳过（零运行时文件） |
| QM-6 双模型外部评审 | N/A | 纯记录回填，按 AGENTS.md 不强制 |
| 远程同步 | PENDING | 本条自己的欠账：合并后由后续回填 PR 改写为 PASS + merge SHA（取证 `git log origin/main --grep='(#NNNN)$' --format=%H|%cI`，NNNN 由 `gh pr list --head gate-record-backfill-08 --json number` 当场回读），并**同一次提交**删除本 frontmatter 的三个 `sync_*` 字段；新载体不在 `gate-record-debt-ledger.json` 建键 |

## 遗留（不在本 PR 处理）

1. `.quality-gates.md` 现在还有**两条** `远程同步 PENDING` 行：`:6980`（旧会话欠账）与 `:9360`（#3053 的 `creator-monitor-impl`，本 PR rebase 时随 main 进来）。两条都已在 ledger 登记 ⇒ Gate 2c 不报未登记。**排除不猜**：不替别的会话判它们的 PR 是否已合并。另注：行号会随每次 re-sync 漂，任何"按行号定位别人记录"的动作都必须换成内容锚点 + 唯一性断言（本 PR 解 ledger 冲突时就因此把 v1 脚本的 `PENDING_ROWS_LEFT=1` 读成了"只剩一条"，而 rebase 后实测是两条）。
2. 本条记录自己按惯例留下一笔新欠账（合并后由后续回填 PR 收）。这是仓库当前对「回填型 PR 在执行记录门禁下没有合法出路」的实际处置方式（`check-pr-exec-record.js` 出路②要求 M 的文件 == 本分支那篇记录，而回填的定义恰恰是 M 别人的记录），已如实登记而非绕过。
