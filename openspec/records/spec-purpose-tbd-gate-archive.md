---
record: spec-purpose-tbd-gate-archive
task: 归档 spec-purpose-tbd-gate 并把 1 条 Requirement 同步进主规格（Gate 12d 交付收尾）
date: 2026-10-08
---

## 本次执行记录：归档 spec-purpose-tbd-gate（spec-purpose-tbd-gate-archive，2026-10-08）【docs-only】

> 分支：`spec-purpose-tbd-gate-archive`（worktree `D:/Data/projects/mp-worktrees/mp-spec-purpose-tbd-gate`，起点 `origin/main 800f7c385`）
> 判定：`node scripts/classify-docs-only.js --base=800f7c385 --head=HEAD` → **docs-only=true（files=5）**
> 范围：🗄️ `openspec/` 归档与主规格同步 ⇒ 文档/流程变更，不进 worktree 之外的运行路面（本次确实开了独立分支，因为共享根另有会话在写）

### 为什么还要单独一次 PR

PR #3099 把 Gate 12d 落进 CI，PR #3111 把它的执行记录销账。剩最后一格：change 本身还挂在
`openspec/changes/` 里，它对主规格 `openspec-integration` 的那 1 条 Requirement **尚未同步进主 spec**
（`openspec/specs/openspec-integration/spec.md` 停在 11 条）。不同步，主规格就一直缺这条契约，
而 `openspec/specs/**` 是本仓「规格真相源」。

### 归档实跑（数字全部当场取）

- 命令：`npx openspec archive spec-purpose-tbd-gate -y`
- 输出：`Applying changes to openspec/specs/openspec-integration/spec.md: + 1 added`、
  `Totals: + 1, ~ 0, - 0, → 0`、`Change 'spec-purpose-tbd-gate' archived as '2026-10-08-spec-purpose-tbd-gate'`
- 归档器提示：`Task status: 27/29 tasks / Warning: 2 incomplete task(s) found. Continuing due to --yes`
  —— 那 2 格正是 5.3/5.4：5.3 的事实已在记录 #3099 与 #3111 里闭合（因回填 PR 必须是「纯载体变更」
  而不能与本文件同批勾选，见下），5.4 由本次执行闭合。两条均已补上实测取证后勾选。
- 主规格 Requirement 计数：`grep -c "^### Requirement:"` 归档前 **11** → 归档后 **12**
- 变更集（`git diff --cached --numstat origin/main`，两口径逐字相同）：4 个 rename
  （其中 3 个 0/0 即逐字节未变，tasks.md 15/2）+ 主规格 70/2；`git show` 侧显示
  `rename ... (100%) ×3`、`(78%)` ×1、`5 files changed, 85 insertions(+), 4 deletions(-)`

### 一处预期与实跑不同（这条最值得留给下一个人）

tasks 5.4 当初写的是「归档后本 change 自己会写 `TBD` 到新增规格 —— 正是这条门禁的活体测试场景」。
**实跑没有发生**：归档器只在**新建**主规格文件时写 TBD，而本 delta 落到的是**已存在**的
`openspec-integration/spec.md` ⇒ 没有产生 TBD，主规格份数也不变（`扫描 151 份主规格，违规 0`）。

⇒ 因此**不能**拿"归档后仍然 0 违规"当作 Gate 12d 有效的证据 —— 它这次只证明了「归档不会破坏既有 Purpose」。
门禁的承重证据仍在 #3099 那边（15 格反证 + CI 上 step [8] completed/success + 日志正文逐字）。
要构造那条活体场景，得归档一个**新建 capability** 的 change；本轮不为此专门造一个 change（那会是
为一个测试去制造工件），改为记在遗留里。

副产物：归档器顺手吃掉了 `## Purpose` 与 `## Requirements` 之间的空行（主规格 −2 行的其中一行）。
判据不受影响（逐行扫描器认标题行，不依赖空行），已由 `check-spec-purpose.js` 当场复跑确认。

### 顺带修掉的一处事实漂移

主规格 Purpose 自述「共 11 条」，而归档后实际 12 条。这句是**能被逐字复核的现场数字**，
所以随计数一并改为「共 12 条」，并补写第 12 条的来源（`本规格由归档 change openspec-integration 产生，
第 12 条由归档 change spec-purpose-tbd-gate 追加`）。不修，下一个会话读到的就是一个假的总量。

### 门禁表（docs-only 精简模板 + 判定证据）

| 门禁 | 状态 | 证据（当场实跑） |
|------|------|------------------|
| 变更类型与判定 | PASS | `classify-docs-only.js --base=800f7c385 --head=HEAD` → `docs-only=true / files=5`（全部在 `openspec/` 白名单内） |
| 行尾对账 | PASS | `git diff --cached --numstat origin/main` 与 `--ignore-cr-at-eol --numstat` 逐字相同（5 行同款），无整文件改写 |
| 品牌残留 | PASS | `check-no-brand-residue.js` → 7250 个 tracked 文件 PASS |
| 文档同步 | PASS | `check-docs-sync.sh --base=main --head=spec-purpose-tbd-gate-archive` → 仅文档/流程变更，无需额外同步 |
| 记录欠账 | PASS | `check-gate-record-debt.js` → OK（本记录自带 `sync_*` 登记，无需 ledger 条目） |
| 执行记录 | PASS | `check-pr-exec-record.js --base=origin/main --mode=enforce` → 本 PR 新增本记录 |
| 文档绝对路径 | PASS | `check-doc-abs-paths.js --base=800f7c385 --head=HEAD` → 改动集 1 个受管文件 PASS |
| 主规格 Purpose（Gate 12d 本体） | PASS | `node scripts/check-spec-purpose.js` → `扫描 151 份主规格，违规 0`；23 条锁 `23/23` |
| OpenSpec 校验 | PASS | `openspec validate --all --strict` → 164 passed / 10 failed，`✗ spec/` **0 项**，10 项全是他人的 `change/…`（与归档前同一集合） |
| QM-1 / QM-2 / QM-4 / TDD / QM-6 | N/A | docs-only 通道：未触运行时代码、未改门禁判据本身（本轮只归档与同步规格文本） |
| 远程同步 | PASS | PR #3114 已 squash 合并，merge SHA `cd5ba8e486d51312e2dd37bf94bffc91a4a4324c`（committer 时间 `2026-10-07T16:21:44Z`，取自 `git log origin/main --grep='(#3114)$' --format=%H\|%cI`）；`git ls-remote origin refs/heads/spec-purpose-tbd-gate-archive` 返回 **0 行**。main 上按行级包含复核（squash 后分支 head 不是 main 的祖先）：`git grep -ac "^### Requirement:" origin/main -- openspec/specs/openspec-integration/spec.md` = **12**、`git grep -ao "共 12 条"` 命中、`openspec/changes/archive/2026-10-08-spec-purpose-tbd-gate` 在树内、活跃 `openspec/changes/spec-purpose-tbd-gate` 计数 **0**、那条 `### Requirement: 主规格的 Purpose 完整性必须有门禁` 在 main 上。回填与销账（删除本记录 frontmatter 三个 `sync_*`）发生在同一次提交 |

### 遗留（不假装已闭合）

- Gate 12d 的「归档即写 TBD」活体场景本轮未构造（见上节）。要验它，需归档一个新建 capability 的 change；
  在那之前，门禁的有效性依据是 15 格变异反证与 CI 逐字日志，不是"归档后没红"。
- 本 PR 与 #3111 的顺序揭示了一条可复用的排期口径：**销账 PR 只能是纯载体变更**
  （`check-pr-exec-record.js` 的「纯回填」定义），所以 tasks.md 的勾选天然要和归档同批，
  不能塞进销账 PR。本轮先误塞过一次，被该判据当场拒掉（rc=1），已退回。
