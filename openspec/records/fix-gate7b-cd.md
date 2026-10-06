---
record: fix-gate7b-cd
task: 修 Gate 7b round2 后 cwd 只回一层导致取证脚本按 apps/scripts 解析、一律假红
date: 2026-10-05
---

## 本次执行记录：Gate 7b round2 cwd 回根修复（fix-gate7b-cd，2026-10-05）

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | 运行时代码（CI workflow） | worktree `D:/Data/projects/mp-worktrees/mp-fix-gate7b-cd`，裸分支 `fix-gate7b-cd` |
| 第一性原因（QM-5 ①） | ✅ | #2934 引入的 GATE-7B 段：round2 在 `apps/desktop` 里跑完 `test:visual` / `test:visual:supplement` 两套 suite 后只 `cd ..` 一次，cwd 停在 `apps/`；随后的取证脚本 `node scripts/check-baseline-freshness.js` 按**仓库根**相对路径调用，在 `apps/` 下被解析成 `apps/scripts/...` ⇒ `Cannot find module`。**一字之差的路径层级错误，不是判据错误** |
| 逃逸分析（QM-5 ②） | ✅ | ①结构锁 `.github/scripts/workflow-contract.test.js` 的 Gate 7b 三条断言只查 `--json-out=` / `--verdict-rounds=` / vite 5174 三个**参数**，不查 cwd 层级 ⇒ 漏网；②#2934 的单测跑的是 checker 的 `--verdict-rounds` 逻辑，workflow 层只验"参数在不在"，**shell cwd 从未被断言**；③#2934 自身的 PR #2934 Gate 7b 走的是"round1 干净即过、零开销"快路径，round2 段根本没执行 ⇒ 引入即绿 |
| 修复 | ✅ | `cd ..` → `cd ../..`，附两条归因注释（round2 两套 suite 在 `apps/desktop`、取证脚本在仓库根、#2934 只回一层的后果） |
| 回归保护（QM-5 ④） | ✅（上游已有，本 PR 复用） | `.github/scripts/workflow-contract.test.js` 的 Gate 7b 三条断言 + `scripts/check-baseline-freshness.js` 的 34 条单测（含 `--verdict-rounds` 三态、`--json-out` 红绿两态落盘、畸形输入 fail closed）。**本 PR 自陈**：未新增 cwd 层级断言——见「遗留」第 1 条，不要把这轮的绿当成 cwd 已进锁 |
| 防止再次发生（QM-5 ⑤） | ✅ | 三行注释把"两套 suite 在 `apps/desktop`、取证脚本在仓库根"这两个坐标写进 diff 现场，下一个改 Gate 7b 的人不会只看到孤零零的 `cd ../..` |
| 行尾与 diff 对账 | ✅ | `git diff --numstat` 与 `--ignore-cr-at-eol --numstat` 两口径一致（单文件 3 增 1 删：`cd ..`→`cd ../..` + 2 行注释） |
| 接线棘轮 | N/A | 本 PR 不新增 `*.test.js` |
| QM-1 打包 / QM-4 视觉 | N/A | 未改 `apps/desktop/electron/`、未动依赖区间、未触 UI |
| classify-docs-only | false（混合 PR） | 改动含 `.github/workflows/quality-gate.yml` ⇒ 完整质量节拍，不借道快速通道 |
| QM-6 CCG 双模型外部评审 | 未执行 | 本 PR 为单字符 CI 路径修复，无外部评审通道产物 |
| 远程同步 | PASS | 已合并：squash 落地 `ff08ec3755b7b252598a3aabd5b1567f8a7fd836`（PR #2966，`2026-10-06T03:21:45Z`）。取证（2026-10-06 现取）：`git log origin/main --grep='(#2966)$' --format='%H\|%cI'` 得该 SHA 与时间；`git ls-remote --heads origin fix-gate7b-cd` 返回 **0 行**，证远端分支已随 squash 删除 |

### 遗留（不假装已闭合）

- **cwd 层级未进结构锁**：本 PR 改的正是这个接缝，但 `workflow-contract.test.js` 至今**不断言** Gate 7b 段末尾的 `cd` 落点。照现判据，把 `cd ../..` 改回 `cd ..`（复现 bug）或改成一个不存在的目录，结构锁仍会绿——因为它只查参数不查状态。**正解**：给 Gate 7b 块补一条断言 round2 段末尾的 `cd` 至少回两层（或直接断言 `cd ../..` 字面量），并按反证纪律做一次"把锁改成 no-op 必须立刻变红"的变异。本轮**刻意不夹带**：那会同时改 workflow 与测试，`git merge-tree` 对 main 的冲突面会从 1 个文件扩到 2 个，代价大于本轮收益；下一刀单独做。
- **本 PR 属禁止 agent 自动合并的类别**：改动了 `.github/workflows/`。按 AGENTS.md「PR 自动合并」节「需要改动 `.github/workflows/` 分支保护规则本身、或改动 `CI_IGNORED_PATHS` 白名单的 PR」这一条**并不直接命中**（本 PR 改的是 Gate 7b 段的一个 `cd`，既非分支保护规则也非白名单）；实际执行时是先取人工过目（用户于 2026-10-06 明确授权合并），再执行 squash。
- **它连带修复的假红**：`#2947`（日志契约迁移）在本 PR 合并前的 QG Visual 红灯，与日志改动**无关**——该 PR 触及 round2 重采路径，其 `create-history` 补充视图 15s 就绪超时后重采即触发本 bug。同类假红当时也污染了 main 上 `f3aec57a0` 的 Gate Result。