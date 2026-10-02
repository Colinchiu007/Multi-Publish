---
record: backfill-gate-rows-own
task: 回填 #2754 / #2755 两条批量回填记录自身的远程同步行并销账（18→16）
date: 2026-10-02
sync_status: PENDING
sync_reason: 本 PR 自身尚未合并，merge SHA 与远端分支删除状态此刻不存在（这正是 PENDING 的语义）
sync_backfill_owner: 下一个会话（回填后删除本段三个 sync_* 字段）
---

## 本次执行记录：回填 #2754 / #2755 两条批量回填记录自身的远程同步行并销账（backfill-gate-rows-own，2026-10-02）【docs-only】

> 范围：📝 纯文档/流程变更（3 个文件均在 docs-only 白名单内）；本条自身按精简模板记录。
> 动因：#2754、#2755 是「替别人销账」的两轮批量回填，各自按既有语义给自己留了一行 PENDING。两条 PR 早已合并，这行现在可以被取证——留着不回填，就是本 change 要防的那个形态（已合并的记录顶着"没干完"的字样被下一个会话读到）。

| 门禁 | 状态 | Fresh 证据 |
| --- | --- | --- |
| 变更类型与隔离 | PASS | 纯文档变更，但**共享根此刻有并发会话的在途未提交改动**（`git status --porcelain` 实测：`openspec/changes/enforce-gate-record-presence/tasks.md` 与 `openspec/records/exec-record-wiring-71a.md` 两个 M）。为不与他人竞争同一份 index/HEAD，改在独立 worktree `D:/Data/projects/mp-worktrees/mp-backfill-gate-rows-own` + 裸分支 `backfill-gate-rows-own`（基线 `origin/main` = `d70d7e7a`）完成；建后用 `git -C <绝对路径> rev-parse --show-toplevel` 与 `--abbrev-ref HEAD` 实证可进入且分支正确。git 写一律走 PowerShell 原生 `D:\` 路径。那两份别人的改动全程未 `git add`、未改写。 |
| 判定：docs-only | PASS | 3 个文件：`.quality-gates.md`、`scripts/gate-record-debt-ledger.json`、`openspec/records/backfill-gate-rows-own.md`。commit 后跑 `node scripts/classify-docs-only.js --base=origin/main --head=HEAD` 取判定（实测见 PR 说明）。跳过 QM-1 / QM-4 / TDD / QM-6（零运行时代码，与先例 #2754、#2755、#2762 同面）。 |
| 行尾（CRLF）对账 | PASS | 改前实测本 blob 7,989 行**全部**以 `\r` 结尾（`bareLF=0`），脚本前置断言不成立即抛错；逐行 `split('\n')` + 只替换目标行内容 + 新行补 `\r` + `join('\n')`，不做任何多数派 eol 统一回写。账本原文件含 `\r\n`，按 `eol="\r\n"` 逐行回写。两口径 `git diff --numstat` 与 `--ignore-cr-at-eol --numstat` 实测**完全相等**（`.quality-gates.md` 2/2、账本 0/6），无幽灵行。 |
| 取证口径（不凭记忆写 SHA） | PASS | 两条各按「head 分支 → PR → 合并 SHA → 双源对照」取：`gh pr view <N> --json state,mergeCommit,mergedAt,headRefName`（#2754 → `ae5134f7…`，#2755 → `32ba87c1…`，均 state=MERGED）；`git log origin/main --grep='(#N)$' --format=%H|%cI` **唯一命中同一 SHA**；`git merge-base --is-ancestor <sha> origin/main` 通过；`git ls-remote --heads origin <branch>` 返回 **0 行**。一条如实记下的差异：#2755 的 committer 时间是 `2026-10-01T19:43:31+08:00` 而 `gh` 报 `2026-10-01T11:43:31Z`——同一时刻的两种偏移写法，**不得**写成"逐字一致"，取证行按各自原样记录。 |
| 账本销账与回填必须同批 | PASS | `scripts/gate-record-debt-ledger.json` 按 **JSON 语义**删 2 键（18→16），并逐键断言未涉及键的序列化值与原文件解析结果**完全相同**（脚本内 `JSON.stringify` 对照，不符即抛错）；回填与删条目在同一次 commit。跑 `node scripts/check-gate-record-debt.js` → 见 PR 说明的现场输出。 |
| 接线棘轮 | N/A | 未新增任何 `*.test.*` 文件，`check-unwired-tests.js` / `check-step-failfast.js` 无新面可漏。 |
| QM-1 打包 / QM-4 视觉 | N/A | 未触 `apps/desktop/electron/` 与 `packages/rpa-engine/`，未触 UI 文件。 |
| QM-6 CCG 双模型外部评审 | N/A | 纯文档销账，零运行时代码；按 AGENTS.md「纯文档/流程变更不强制 QM-6」。 |
| 品牌残留（Gate 12） | PASS | 取证行只写分支名与 SHA；`node scripts/check-no-brand-residue.js` 实测见 PR 说明。 |
| 文档同步（doc-gate） | PASS | 不改任何用户可见行为；`bash scripts/check-docs-sync.sh --base=main --head=HEAD` 实测见 PR 说明。 |
| 远程同步 | PENDING | 本条自己写的行：合并前无法取证（PENDING 的既有语义）。回填者＝下一个会话，取证口径沿用上方那一行里的四条命令。 |

### 遗留（不假装已闭合）

- **账本还剩 16 条**，其中 12 条是 2026-08 那批「不代其他会话改写其执行记录」的历史登记项。它们的收口证据其实可取（多数 PR 早已合并），但登记原因写的是「回填者＝该记录作者」——按既定决定不代改；若要统一收口，应先由质量节拍侧明确「后来的 docs 会话是否有权替别人的记录回填」，而不是由本 PR 单方面改写。
- 另 4 条是别的会话自己的 PR 记录行（`batch-cover-reselect` #2752、`account-groups-persistence` 等）与本次新增的本条，均由各自的后续 docs PR 回填。
- 共享根那两个 M 属并发会话，本 PR 未触碰；它们落地时若也改 `.quality-gates.md` 顶部，会与本条撞置顶区——按既有口径走参照解，不要 union 硬合。
