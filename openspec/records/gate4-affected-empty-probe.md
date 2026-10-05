---
record: gate4-affected-empty-probe
task: 把 quality-gate Gate 4「本次 PR 有没有受影响的非桌面项目」判据从字符串全等三态化，修掉被 nx stdout 提示污染引发的 CI 假红（#2596 的两个红项根因）
date: 2026-10-05
# 这三个字段只在「远程同步尚无法收口」时存在：PR 未合并 → 拿不到 merge SHA 属预期。
# 合并后必须整段删除（= 状态就地收口成 PASS 并删掉登记），不要留"历程"。
sync_status: PENDING
sync_reason: PR #2951 未合并，暂无 merge SHA 可写
sync_backfill_owner: 下一轮会话（回填与销账必须在同一次提交发生）
---

## 本次执行记录：Gate 4 affected 空集判据三态化（gate4-affected-empty-probe，2026-10-05）

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 隔离与会话前置 | PASS | 开工路径：worktree `D:/Data/projects/mp-worktrees/mp-gate4-affected-empty-probe` · 分支 `gate4-affected-empty-probe` · `start-mp-task.ps1` 建区（`pnpm install --frozen-lockfile` + `ensure-electron` + `verify-worktree-deps` 三项均 OK）· `pre-code-edit-guard.ps1` rc=0 · 共享根全程停在 `main` 且 clean（开工时 tip `0f3e9944`） |
| 根因取证（QM-5 真因） | PASS | run 37255412754 / job 111592883332 日志三段原文互证：`##[warning]nx affected detection failed (exit 0)` → `NX   No tasks were run` → `FAIL: 台账文件不存在 —— sink 根本没产出`。`Gate Result`（job 111598965756）自身只报 `unit-tests : failure`，纯连带 |
| 变更边界 | PASS | 只改门禁与其判据：`.github/workflows/quality-gate.yml`、`.github/scripts/workflow-contract.test.js`、`scripts/nx-affected-probe.{js,test.js}`、`scripts/check-test-egress-ledger.test.js`、`.gitignore`、记录载体。**不触碰任何运行时代码**，故 QM-1 打包与 QM-4 视觉均 N/A |
| 修复 + 回归保护（QM-5 底线） | PASS | 判据搬进可单测的 `scripts/nx-affected-probe.js`（`empty`/`non-empty`/`unparsable` 三态，改为逐行找可独立 parse 的 JSON 数组，与 nx stdout 提示解耦）；`scripts/nx-affected-probe.test.js` 新增 **15 例**并接进 static-gates Gate 2c；`workflow-contract.test.js` 新增 5 条断言；#2902 留下的 `check-test-egress-ledger.test.js` 顺序锁**当场抓到本次改动**，锚点已按新形态更新 |
| 防止再次发生（QM-5 预防） | PASS | ① 锁**判定语义**（真跑纯函数）而非 workflow 文本——判据形态已连换两次，纯文本锁锁不住「支路还走不走」；② **6 项变异验证逐一确认会红**（判据退回全等 / 删 empty 分支 / 早退条件退化为只看 `$nxExit` / 退化为「没拿到清单」 / 语义测试摘出 static-gates / 去掉 `throw`），未变异原文 32/32 绿。其中第 3 项是验证中**发现并补上的锁缺口**：原锁只查早退分支位置、不查早退条件本身；③ fail-closed 方向未放松：nx 非零退出**一律** `unparsable`、只有确证空数组才 `empty`、空输入/非数组输出不猜、脚本故障 `throw` |
| 行尾 / diff 对账 | PASS | 逐文件实测全 CRLF（CRLF/bareLF）：quality-gate.yml `1353/0`、workflow-contract.test.js `886/0`、check-test-egress-ledger.test.js `207/0`、.gitignore `292/0`、本文件同族。`git diff --numstat` 与 `--ignore-cr-at-eol --numstat` 两口径**逐字一致**：`65/0、27/11、1/0、28/0、9/0、10/2、2/1、144/0、191/0`（+ 本文件） |
| 测试与门禁 | PASS | `nx-affected-probe` 15/15 · `workflow-contract` 32/32 · `check-test-egress-ledger` 15/15 · `check-unwired-tests` 检查域 58 份全接线 rc=0 · `check-step-failfast` rc=0 · `check-gate-record-debt` 232 行/432 篇/18 条登记 rc=0 · `check-changelog-growth` 1160→1161 条 rc=0 · `check-no-brand-residue` 6896 tracked 文件 0 残留 · `check-docs-sync` ✅ · pre-commit 质量节拍 + CCG 门禁通过 |
| 红→绿对照 | PASS | 受污染输入（提示文本逐字取自 CI 日志）：`OLD -> early-exit? false degraded? true ⇒ 跑 0 个任务 ⇒ 台账缺失 ⇒ 红` / `NEW -> kind=empty projects=[] ⇒ 早退 ⇒ 绿`。**如实说明**：本地 nx 未复现 CI 的缓存提示态（本地 cache/db 自洽，且本机 nx 版本未打出该提示），故红端以「旧全等判据在同一输入上确实漏判」取证，而非本地复现整条 CI 链 |
| QM-1 打包 / QM-4 视觉 | N/A | 未改动 `apps/desktop/electron/` 与 `packages/rpa-engine/`，无产物与 UI 变化 |
| QM-6 CCG 双模型或外部评审 | **未执行** | 本会话不具备 codex / claude 双路外部评审能力（无 `codeagent-wrapper` 调用面），**不冒充已跑**。本条属门禁类改动，按 AGENTS.md「改 `.github/workflows/` 的 PR 必须人工过目」**不自动合并**，交人工裁决 |
| 远程同步 | PENDING | 合并后取 `git log origin/main --grep='(#2951)$' --format=%H\|%cI` 拿 merge SHA 与时间；`git ls-remote --heads origin gate4-affected-empty-probe` 返回 0 行证远端分支已删；然后删除本 frontmatter 的 `sync_*` 三字段、删除 `scripts/gate-record-debt-ledger.json` 的同标题登记项（回填与销账必须同一次提交） |

### 残留风险与未闭合项（不假装已闭合）

- **QM-6 未评审**：本 PR 把一条判定由红转绿，方向上是「放松」。fail-closed 由上面 4 条约束守住、且变异验证证明锁会红，但**判据本身写错了它挡不住** —— 这正是 AGENTS.md「PR 自动合并」一节点名的残留风险，需要第二双眼睛，故本 PR 明确不自动合并。
- **三态化只覆盖「stdout 被提示污染」这一类**：若将来 nx 改变 `--json` 的**输出结构本身**（而非掺提示），判据会退回 `unparsable` —— 那是**降级跑测试**（安全方向，代价是白跑一遍），不是跳过。属可接受降级，不属未闭合缺陷。
