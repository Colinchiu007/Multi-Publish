---
record: backfill-2898-record
task: 回填 #2898 的远程同步行并销账，同时把「CHANGELOG 截断抢救」写成一条 CHANGELOG 条目
date: 2026-10-05
sync_status: PENDING
sync_reason: 本 PR 尚未合并，merge SHA 还不存在；回填者＝下一个会话，回填后必须删除本段三个 sync_* 字段
sync_backfill_owner: 下一个会话（取 git log origin/main --grep='(#NNNN)$' 的 merge SHA 与时间）
---

## 本次执行记录：#2898 记录销账 + CHANGELOG 条目（backfill-2898-record，2026-10-05）【docs-only】

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | 纯文档 | 文件面 3 个：`CHANGELOG.md`、`openspec/records/changelog-restore.md`（回填）、本记录载体。**没在共享根就地编辑**：实测共享根此刻有另一会话的暂存内容（`MM .quality-gates.md` + `M scripts/gate-record-debt-ledger.json`），从那里 commit 会把别人的在制工作卷进我的提交，故照旧建 worktree `D:/Data/projects/mp-worktrees/mp-backfill-2898-record`（分支 `backfill-2898-record`，base `1d3ba92cb`），三连实证 toplevel/branch/head 全对 |
| 判定 | docs-only=true | `node scripts/classify-docs-only.js --base=origin/main --head=HEAD`（三个文件均命中文档白名单：根级 `*.md` 与 `openspec/**`）。注意 `openspec/records/changelog-restore.md` 是**修改既有文件**，不是新增记录 —— Gate 2c2 的"执行记录存在性"由本载体新文件满足 |
| 回填与销账同次发生 | ✅ | `openspec/records/changelog-restore.md`：`远程同步` 行 `PENDING` → `PASS` + merge SHA，且**同一次提交删除** frontmatter 的 `sync_status` / `sync_reason` / `sync_backfill_owner` 三行（残留计数实测 **0**）。由 `mp-backfill-carrier.js` 做，它自带判据：旧行必须恰为一行且是 PENDING（不幂等，重复跑第二次拒绝而非把 PASS 再改一遍）、三个字段连同其上方 `#` 注释一起删、删后 frontmatter 不得再有 sync_ 键、CRLF 只允许因删除的行而变、`loneCR` 不得变。diff = `1/4` |
| 证据当场重取（不用记忆） | ✅ | `git log origin/main --grep='(#2898)$' --format=%H\|%cI` ⇒ 唯一命中 `fd28e782fe976be03ebbc1d7473c70fe83c20b0c` / `2026-10-05T02:03:37Z`；`git ls-remote --heads origin changelog-restore` ⇒ **0 行**（远端分支随 squash 合并删除）。两条都在本 PR 的这一次运行里取的，不是复述上一轮 |
| 行尾与 diff 对账 | ✅ | `CHANGELOG.md` 顶插 18 行条目 + 1 空行 = **19 行**：`git diff --cached --numstat` = `19 0`，`--ignore-cr-at-eol --numstat` = `19 0`，**两口径逐文件相等且删除数为 0**。staged blob `7,482,675` 字节、CR 计数 **0**（blob 仍是 LF）、H1 条目 1,137 → 1,138。最强的一条判据：`staged blob.endsWith(origin/main 全文)` == **true** ⇒ 除顶插块外一个字节都没动。写盘脚本另断言 `doubleCR` 不变、`loneCR` 不变、CRLF 增量恰好等于新行数 —— 本仓曾因"对 CRLF 文本又跑一遍 LF→CRLF"造出 122 行 `\r\r\n`，这次把这条判据前置到写盘前 |
| 品牌残留 | ✅ | `node scripts/check-no-brand-residue.js`（Gate 12 的同一实现，本 PR 就落在它的扫描域内）：PASS |
| 文档同步 | ✅ | `bash scripts/check-docs-sync.sh --base=main --head=HEAD`（args 必须是 `--base=main`，写 `origin/main` 会被脚本再前缀一次 ⇒ `couldn't find remote ref refs/heads/origin/main`）：`✅ 仅文档/流程变更，无需额外同步` |
| 记录欠账 | ✅ | `node scripts/check-gate-record-debt.js` rc=0：回填一条记录**必须顺手删掉它的登记项**这条耦合由本门禁强制；新载体的登记随文件走（frontmatter），因此"销账"＝改 PASS 且删三字段，本 PR 两条都做了 |
| 接线棘轮 | N/A | 本 PR 不新增任何 `*.test.*` 文件 |
| QM-1 打包 / QM-4 视觉 | N/A | 未触运行面 |
| QM-6 CCG 双模型外部评审 | 未执行 | 纯文档回填按 AGENTS.md 不强制；且本会话 QM-6 通道实测两路都取不到产物（见下条），不以自审冒充通过 |
| 远程同步 | PENDING | 合并后取 `git log origin/main --grep='(#NNNN)$' --format=%H\|%cI` 回填 merge SHA 与时间，`git ls-remote --heads origin backfill-2898-record` 返回 0 行证远端分支已删；回填后删除上方三个 sync_* 字段 |

### 顺带取到的一条工具通道实况（⑤，与 QM-6 直接相关）
本会话对 QM-6 双模型通道的实测，写在这里是为了让下一个人不必重踩：
- `codeagent-wrapper --backend codex`：跑完 rc=0，但 stdout 只留一句中途陈述（"三块 diff 已读完，现在核对…"），**没有交付要求的 findings 文件** ⇒ 按"评审 CLI rc=0 不算跑过，判据是产物或自身 stdout 有正文"这条口径，它**没通过**。
- `codeagent-wrapper --backend claude`（本仓 `routing.frontend.primary` 真源值）：`claude completed without agent_message output`，rc=1，无产物。这就是遗留清单里第 ⑤ 条的复现现场。
- 兜底 `opencode run --model opencode/ling-3.1-flash-free`：模型可列出、任务被接受，但停在连续十余次 `> build · <model>` 的空转，同样无产物。
⇒ 结论：本轮三个 PR 的 QM-6 **一律如实记「未执行/部分执行」**，不写成通过。要修的是交付通道本身（要求评审者把 findings **写进仓库内文件**已被证明不足以兜住，还需要在它空转时有超时后的"未交付即红"判据）。

### 遗留（不假装已闭合）
- 本 PR 只回填 **#2898**。#2901（CHANGELOG 棘轮）、#2904（依赖审计第三域）、#2905（override 收上界）三条记录仍是 PENDING，需各自合并后再销账；它们的 CHANGELOG 条目也未写（写本条时都还没合并，把未落地的东西写进台账正是这次截断事故的同类错误）。
- CHANGELOG 的历史重复（302 种标题 / 1,138 条）仍未清，理由见 #2898 记录与本条引用。
