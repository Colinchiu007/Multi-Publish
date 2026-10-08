---
record: docs-only-head-sha
task: CI 变更集取源修到语义层——docs-only 与执行记录判据改取检出合并提交的双亲，决策搬进被单测的 scripts/ci-pr-changeset.js
date: 2026-10-05
---

## 本次执行记录：CI 变更集取源修到语义层（docs-only-head-sha，2026-10-05）

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | PASS | 运行时代码（`.github/workflows/` + `scripts/`）⇒ 独立 worktree `D:/Data/projects/mp-worktrees/mp-docs-only-head-sha`，裸分支 `docs-only-head-sha`，由 `scripts/start-mp-task.ps1 -TaskName docs-only-head-sha` 创建；判据以 `git worktree list` + `git -C <绝对路径> rev-parse --abbrev-ref HEAD` 实证（不看 rc）。基线 `origin/main@331883e28`，工作区起于 clean |
| 第一性原因（QM-5 ①） | PASS | `changes` job 用 `--base=<event base.sha>` 且不传 `--head` ⇒ 判据默认取 `HEAD`，而 PR 事件检出的是 `refs/pull/N/merge`（合并提交）。`base.sha` 冻结在 PR 打开那一刻，此后 main 的提交全落进 `merge-base(base, 合并提交)..合并提交`。引入点：docs-only 短路落地时（change `docs-only-ci-shortcircuit`）只对齐了"本地怎么跑"，没对齐"CI 检出的到底是什么" |
| 逃逸分析（QM-5 ②） | PASS | 单元层：`classify-docs-only.test.js` 全部夹具用分支顶当 head，`merge-base` 恒等于 base ⇒ 夹具对"事件 base 滞后"这一维**结构性免疫**。集成层：CI 的 `Changes` 步骤打印 `docs-only=false` 但没有对照，红不出东西。审查层：第一版修法（绑 `pull_request.head.sha`）自认为闭合，实际只覆盖形态 A —— 由 QM-6 后端评审实测出形态 B（分支 re-sync 过新 main）后本机复现确认。测试层第二条教训：把 bash 里的支路改成 `if false`，四条文本结构锁 29/25/31/26 **全绿** ⇒ "防再犯锁"只在测形状 |
| 系统性漏洞定位 | PASS | (1) 变更集取源没有"检出物是什么"的判据，两处消费各写一遍；(2) 门禁的自测住在 bash 里，只能被文本锁观察；(3) 空值路径 `args.head \|\| 'HEAD'` 会把"取证失败"读成"取到了 HEAD" |
| 修复 + 回归保护（QM-5 ④） | PASS | 新增 `scripts/ci-pr-changeset.js`（唯一取源实现：合并提交双亲 > 事件 payload > 非 PR 空对，取值不全一律 rc=1，git 故障原样上抛）；`classify` 与 `Gate 2c2` 都改为消费它的 `pr-base/pr-head` 产出。回归锁 `scripts/ci-pr-changeset.test.js` 11 条，含双形态正控、双形态负控（A：默认 HEAD 必误算；B：冻结 base + 事件 head 仍误算）、单亲落 payload、非 PR 空对、fail-closed 抛错、`rev-list` 故障上抛、双亲字段形状异常、CLI KEY=VAL + GITHUB_OUTPUT；夹具自带「HEAD 恰好两个亲」自检。`classify-docs-only.test.js` 保留形态 A 的事故复现，并把"正解"措辞改准（它只覆盖一半） |
| 防止再次发生（QM-5 ⑤） | PASS | ① 取源决策离开 bash ⇒ 只能被行为测试观察，文本锁不再构成证据；② 每次运行打印 `source=/base=/head=`（无现场=下次无人知道测了什么）；③ `Gate 2c2` 不再自算第二遍，两份 merge-base 口径漂移在结构上不可能；④ 新增 `docs/ci-changeset-acquisition.md` 记录两种失效形态与判据表；⑤ 反证 8 条（N1–N8）逐条实测变红并记录在文档 §4 |
| 行尾与 diff 对账 | PASS | 两份被改文档实测 `i/lf w/crlf attr/text=auto`，编辑逐行沿用目标行尾、未做整体归一；删除重复夹具 68 行时断言"被删区间自带 CR=68"（行尾未被改写）。`git diff --numstat` 与 `--ignore-cr-at-eol --numstat` 两口径逐项相等。新建 `ci-pr-changeset.*` 由 Write 落盘为 LF，git 的 `LF will be replaced by CRLF` 告警按 AGENTS.md 属真信号（blob 存 LF），非噪声 |
| 接线棘轮 | PASS | `scripts/ci-pr-changeset.test.js` 被 `quality-gate.yml` 的 classify step 显式点名（`node --test`），且 `.gitignore:106 scripts/*.js` 会静默吞掉新脚本 ⇒ 已补 `!scripts/ci-pr-changeset.js` 与既有 `!scripts/*.test.js` 两条 negation，判据 `git check-ignore -v` 实测命中 negation 行而非忽略行。`check-unwired-tests.js`（57 个测试文件）、`check-step-failfast.js`（5 个多测试步骤）、`.github/scripts/check-test-egress-guard.js`（测试面 18 / 已接 14 / 欠账 4/4）、`check-max-lines.js`、`check-no-brand-residue.js`、`check-gate-record-debt.js` 全部实跑通过 |
| 本地测试实跑 | PASS | `ci-pr-changeset 11/11`、`classify-docs-only 27/27`、`check-pr-exec-record 25/25`、`workflow-contract 31/31`、`check-gate-record-debt 29/29`。`workflow-contract` 需要 `js-yaml` ⇒ 该 worktree 起先以 `-NoDeps` 创建，报 `MODULE_NOT_FOUND` 后补 `pnpm install --frozen-lockfile`（rc=0），首轮的"1 test / 1 fail"是依赖缺失不是判据失败 |
| QM-1 打包 / QM-4 视觉 | N/A | 未触 `apps/desktop/electron/`、`packages/rpa-engine/` 与任何渲染面；改动面是 CI workflow + 门禁脚本 + 新脚本 |
| QM-6 CCG 双模型外部评审 | PASS（带通道偏差） | 真源 `~/.claude/.ccg/config.toml`：backend=`codex`、frontend=`claude`。**后端（codex）两轮**：第一轮 findings 落盘 `.ccg/review/qm6-backend-docs-only-head-sha.json`（4 条 = 1 warning + 3 info，**0 Critical**）；第 1 条（re-sync 形态下事件 head 仍误算）经本机夹具复现成立 ⇒ 已采纳并改取合并提交双亲；第 3 条（Gate 2c2 空值静默退回 HEAD）已补守卫闭合；第 2/4 条为夹具与判据搬家类建议，已随之实现。**第二轮复核**（针对 `02e519915`，实测在 `b585cb38d` 上逐条对账）：1 warning + 3 info、**0 Critical** —— warning（`try/catch` 吞 git 故障落回 payload）确认已被 `b585cb38d` 的 `rev-list --parents` 实现修掉；3 条 info 分别为形状校验（已闭合）、checkout ref 变更风险（遗留，见下）、`args.head \|\| 'HEAD'` 脚本级兜底（遗留，见下）。**前端**：`--backend claude` 三次全败（`rc=0` 但 `completed without agent_message output` 且无产物，AGENTS.md 的 2 次重试上限已用满）⇒ 按既有替代通道口径降级 `opencode run --model opencode/nemotron-3-ultra-free`，产物 `.ccg/review/qm6-frontend-docs-only-head-sha.json`（5 条：2 WARNING / 2 MINOR / 1 PASS）。其 W1「`try/catch` 吞掉全部 git 故障并静默落回 payload 支路」经核实成立 ⇒ 改为一次确定性 `rev-list --parents` 调用、故障原样上抛，并补两条行为测试（N8 实测抓住该变异）；W3 同源已随该实现闭合；M2/M4 属防御性分支观察，M2 由非 PR 空对测试覆盖，M4 与既有"取值不全 rc=1"重叠，不另写。独立性由两个不同产物文件实测，不是同一模型跑两遍 |
| 远程同步 | PASS | squash merge commit `64ebcb015c717219a86cc9755d7b0642bdef814f`（`#2923`，2026-10-05T18:13:04+08:00，离线取证 `git log origin/main --grep='(#2923)$' --format=%H\|%cI`）；`git ls-remote --heads origin docs-only-head-sha` 返回 0 行 ⇒ 远端分支已删。合并前 CI 现场证据：`QG Changes` job 111703526187（head `a5a1c1655`）打印 `[classify] source=merge-ref-parents` —— 新取源支路在真实 PR run 上生效，`docs-only=false` 与混合 PR 性质相符 |

### 遗留（不假装已闭合）

- `check-pr-exec-record.js` 的 `args.head || 'HEAD'` 仍会把显式传入的空串读成 `HEAD`。调用方守卫已堵住可达路径，脚本级拒绝（`--head=""` ⇒ 判取证失败）另次改动做（与 #33 的 worktree 同文件，放那边一并落）。
- **后端复核（第二轮，产物 `.ccg/review/qm6-backend-recheck-02e5199.json`，1 warning + 3 info，0 Critical）残留两条加固建议**：① 若后续把 `actions/checkout` 的 `ref:` 改成 `head.sha` 或分支名，取源会静默落回事件 payload 支路、形态 B 复活而现有测试全绿 —— 正解是在 workflow 结构锁中断言 changes job 的 checkout 不得设 `ref:`；② 脚本对畸形 sha 的形状校验已在 `b585cb38d` 闭合（40 位 hex），复核实测确认。
- **真实 `refs/pull/2923/merge` 已实测（本条从"未验证"降级为"已验证"）**：`git fetch origin refs/pull/2923/merge` 得合并提交 `add994192`，`git rev-list --parents -n 1` 给出恰好两个亲 —— `^1=656dbb35`（GitHub `baseRefOid`，即当前 main tip，注意 main 已从 `331883e2` 前进过）、`^2=b585cb38`（本 PR `headRefOid`）。三种取法在真对象上对照：双亲取法 `files=10`（与 `gh pr view --json files` 独立报出的 10 个文件一致）；冻结 base + 默认 HEAD `files=20`（**多出的 10 个正是期间别人的文件**，形态 A 在这条真 PR 上现场复现）；冻结 base + 事件 head `files=10`（本分支没做过 re-sync，所以形态 B 在此不适用 —— 这不否定它，夹具那条负控仍红）。
- 前端主通道（claude）本轮不可用属机器态，不是代码问题；若下轮恢复，应补一次真·双模型并把偏差行改写。
