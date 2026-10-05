---
record: agent-automerge-rule
task: 在 AGENTS.md 写入「PR 自动合并」规则——把「PR 需人工点合并」松绑为 agent 自动合并，同时保留五类 fail-closed 边界与残留风险声明
date: 2026-10-05
sync_status: PENDING
sync_reason: 本 PR 尚未合并，merge SHA 还不存在，无法取证
sync_backfill_owner: 下一个会话（合并后就地改写为 PASS + merge SHA，并在同一次提交删除本段三个 sync_* 字段与 scripts/gate-record-debt-ledger.json 的本条登记）
---

## 本次执行记录：AGENTS.md 写入 PR 自动合并规则（agent-automerge-rule，2026-10-05）

> 分支：`agent-automerge-rule`（worktree `D:/Data/projects/mp-worktrees/mp-agent-automerge-rule`）
> 范围：📝 纯流程文档。变更集仅 `AGENTS.md` + 本执行记录 + `.quality-gates.md` + `scripts/gate-record-debt-ledger.json`，全部在 docs-only 白名单内 ⇒ 走快速通道（豁免 QM-1 打包、QM-2 代码必检、QM-4 视觉、TDD、QM-6）。
> **本 PR 自身按新写入的规则自动合并**（自举验证）。

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | PASS | 隔离 worktree 内编辑 → 经 PR 落地。**一次性绕过已如实登记**：共享根当时被 `ccg-gate` 会话占用（3 项已跟踪暂存改动），`start-mp-task.ps1` 的 `mp-worktree-health.ps1 -RequireClean` 判 `ok: false` 并拒绝建区（铁律 A 要求停并报告）；经用户明确授权后改用 `git worktree add -b agent-automerge-rule <path> origin/main`（中立 cwd `D:\Temp` + PowerShell 原生 `D:\` 路径，基线取 `origin/main` 而非滞后的本地 main），事后手动补跑被绕过的环节全部通过：`install-git-hooks.ps1` rc=0、`pnpm install --frozen-lockfile` 20.7s、`ensure-electron` v43.1.1 就绪、`verify-worktree-deps.js` OK 11 项。共享根全程未被本任务写入（复查仍是那 3 项，非我所改） |
| 第一性原因（QM-5 ①） | PASS | 要松绑的不是安全机制，而是**最后一道人工闸门**。本仓的合并前置已全部机械化：required status checks（远端分支保护）、质量节拍（QM-1~6 + `.quality-gates.md`）、执行记录取证（`openspec/records/` + ledger 销账）。「人点的那一下」不再增加判断力，只增加往返——本轮实测两次 docs PR 的等待全部耗在等 CI 与解冲突上 |
| 逃逸分析（QM-5 ②） | PASS | 单元 / 集成 / E2E / 视觉四层 N/A（未触运行面）。逃逸在**流程层**：此前每轮 docs PR 都停在「等人工点合并」，而实测 #2943（两次 rebase 解冲突、CI 全绿）与 #2946（回填销账）无人干预也能正确收口，说明闸门够用——但这只证明「够用一次」，不证明「永远够用」，故规则里保留 fail-closed 清单与残留风险声明，而不是写成无条件自动合并 |
| 修复 + 回归保护（QM-5 ④） | PASS | 新增 `### PR 自动合并` 章节（41 行）：默认动作（squash + 删远端分支，与仓库惯例一致）、5 条允许判据、4 类禁止自动合并情形、5 条任何情况下仍禁止、5 步合并后收尾清单、残留风险段；并把分层策略那句「经 PR 审查与 CI 后合并回 main」改为「经 PR 与 CI 后合并回 main（合并动作由 agent 自动执行，见下文）」。回归保护＝判据本身落在 AGENTS.md，下个会话加载即读得到；`check-pr-exec-record --mode=enforce` 强制每条分支携带执行记录 |
| 防止再次发生（QM-5 ⑤） | PASS | ① 判据第 2 条把「skipping 属预期」与「`classify-docs-only` 先判 `docs-only=true`」绑死，防止判定失灵被误当成正常短路跳过重型 job；② 禁止清单明写「门禁未绿时合并」是本条最典型失守形态；③ 残留风险段明写三道闸门**挡不住「门禁本身写错了」**（判据改宽、变异反证被跳过、任务勾选与证据不符），据此把「agent 自查争议」定为不可省略的判据第 5 条；④ 禁止改动分支保护规则与 `CI_IGNORED_PATHS` 白名单的 PR 必须人工过目——那是在改「谁来守门」 |
| 行尾与 diff 对账 | PASS | `AGENTS.md` 41 insertions / 1 deletion；实测 CRLF=1070、裸 LF=0、无 NUL 与乱码，行尾风格未变。`.quality-gates.md` 与 ledger 按各自既有行尾追加（分别为全 CRLF / 2 空格缩进 CRLF），详见各文件实测 |
| 接线棘轮 | N/A | 本次**未新增任何 `*.test.js`**，不涉及 workflow 显式点名 |
| QM-1 打包 / QM-4 视觉 | N/A | 未触运行面。变更集 4 个文件全部在 docs-only 白名单（`AGENTS.md` 属根级 `*.md`，另三个分别命中 `openspec/**`、`.quality-gates.md`、`scripts/gate-record-debt-ledger.json`） |
| QM-6 CCG 双模型外部评审 | 未执行（docs-only 豁免） | 快速通道豁免 QM-6；本机 `codeagent-wrapper` 通道此前实测不干净（前端路两次空转、后端路 stdout 截断且无 rollout）。**不以自审冒充外部评审通过** |
| 远程同步 | PENDING | 本 PR 在途：合并后取 `git log origin/main --grep='(#NNNN)$' --format=%H|%cI` 回填 merge SHA 与时间，`git ls-remote --heads origin agent-automerge-rule` 返回 0 行证远端分支已删；回填后删除上方三个 `sync_*` 字段，并在**同一次提交**删除 `scripts/gate-record-debt-ledger.json` 的本条登记 |

### 遗留（不假装已闭合）

- **本 PR 是自举验证**：它自己就要按刚写进 AGENTS.md 的规则自动合并。若它因五条判据中任何一条不满足而停下，那恰恰说明规则在起作用，应先查判据而不是强行合并。
- **规则写进 AGENTS.md ≠ 机制强制**。AGENTS.md 是提示式约定，`check-pr-exec-record` 只强制「有执行记录」，不强制「记录内容属实」。这次松绑掉的人工判断力，机械闸门只能部分替代（见残留风险段）。
- **绕过 `-RequireClean` 是一次性授权，未沉淀为常例**。共享根当时被 `ccg-gate` 会话占用；下次若再遇到同样情形，仍应先报告而非默认绕过。长期解法是让各会话用独立 worktree 提交、或给健康检查引入「脏但可隔离」的例外路径。
- 规则对**其他 agent** 是否生效取决于它们是否加载 AGENTS.md；`/init` 类工具生成的根 AGENTS.md 未必含本节。
