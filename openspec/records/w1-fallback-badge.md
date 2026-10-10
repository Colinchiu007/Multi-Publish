---
record: w1-fallback-badge
task: §6.1 发布方式徽标 fallback 第三态补测 + 捞回 kuaishou-idle-observability 规划工件
date: 2026-10-09
---

## 本次执行记录：§6.1 发布方式徽标 fallback 第三态补测 + 快手观测规划捞回（w1-fallback-badge，2026-10-09）

- **本记录为事后补建**：#3189 已合并，但合并时执行记录存在性门禁 `scripts/check-pr-exec-record.js` 仍运行在 `--mode=advisory`（quality-gate.yml:119，恒退 0），未携带任何记录。本 PR 按门禁纪律补建记录并回填远程同步，不新增行为变更。

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | ✅ | 双形态：① 运行时代码路径仅测试 `apps/desktop/src/views/PublishHistory.test.js`（+8）→ 隔离 worktree `D:\Data\projects\mp-worktrees\mp-w1-fallback-badge` + 裸分支 `w1-fallback-badge`，基线 `origin/main`=`12ddd4a2e`；② docs-only 捞回 `openspec/changes/api-publish-kuaishou-idle-observability/`（5 文件 +203），源为孤儿 worktree `mp-w3-closure`——本地项目目录 `Multi-Publish`→`mulpub` 改名致旧 `.git` 失效、规划工件随之失联。共享根全程保持 `main`。 |
| 第一性原因（QM-5 ①） | ✅ | 三态徽标**功能早已落 main**：`PublishHistory.vue:992 deliveryModeValue` 返回 `api|dom|fallback`（其余归 ''）、locales zh/en 已配 `modeFallback`=降级发布、CSS 有 `.delivery-mode-fallback`。缺口只是**回归测试**——§6.1 describe 块原只有 api/dom/无-mode 三例，独缺 fallback 第三态。 |
| 逃逸分析（QM-5 ②） | ✅ | 漏测的正是"第三态存在性 + 视觉标识"：无 mode/两态旧测不能证 fallback 分支渲染出徽标与正确文案/类名，若日后 `deliveryModeValue` 或徽标类名回退，原测试全绿仍会漏。 |
| 修复 + 回归保护（QM-5 ④） | ✅ | 新增 1 条 mount 断言：`result.mode=fallback` → 徽标存在 + 文案含「降级发布」+ class 含 `delivery-mode-fallback`。Fresh：`vitest run src/views/PublishHistory.test.js -t "发布方式徽标"` → **1 file passed，14 passed \| 59 skipped**（59 为 `-t` 过滤项，worktree 分支内容即合并内容）；CI `QG Unit Tests`=SUCCESS（required 检查）。 |
| 防止再次发生（QM-5 ⑤） | ✅ | 补齐三态全覆盖矩阵后，§6.1 每个 `deliveryModeValue` 返回值都有对应断言。 |
| locale 成对（Gate 7） | N/A | 本 wave 未改 locales；`modeApi/modeDom/modeFallback`(+Hint) 三键在 zh/en 已配对（上游 PR #3166 期落地）。 |
| 行尾对账 | ✅（CI 为准） | CI `Gate Result`=SUCCESS（含行尾/控制字节对账门）；改动经 Write 直写、未走 checkout EOL 转换。未在本机单列 `git diff --numstat` 两口径，以 CI 为权威证据。 |
| 接线棘轮 | N/A | 未新增 `*.test.js` 文件，只在既有 `PublishHistory.test.js` 加用例；该文件已被 CI `QG Unit Tests` 点名执行。 |
| QM-1 打包 / QM-4 视觉 | N/A | 未触 electron 构建产物路径，无样式/布局改动（仅补测 + openspec 文档）；渲染态不变。 |
| 变异反证 | 未执行 | feature 已在 main、本 wave 仅补测试，未做注入变异；以"用例针对真实 `deliveryModeValue` 分支、双维度断言 class+文案" + CI 单测门绿为替代证据，如实标注、不以自审冒充。 |
| QM-6 CCG 双模型外部评审 | 未执行 | 小体量「补测试 + 捞回文档」wave，未起双模型外部评审；如实记「未执行」。 |
| 远程同步 | PASS | 已合并 #3189 = squash `f77693d66178a0550d547365c06113f44b10af83`，committer `2026-10-09T09:19:54+08:00`。取证：`git log origin/main --grep='(#3189)$' --format=%H\|%cI` 唯一命中该 SHA 且为当前 HEAD 祖先（`git merge-base --is-ancestor` 通过）；`git ls-remote --heads origin w1-fallback-badge` 返回 **0 行**证远端分支随 squash 删除。合并证据在补建时已存在，故本行直接写 PASS、无 frontmatter `sync_*` 字段、无 ledger 登记项可销（沿 `fix-public-link-followups` 先例）。 |

### 遗留（不假装已闭合）

- **本地分支仍被占用**：`w1-fallback-badge` 由 worktree `mp-w1-fallback-badge` 检出，`gh --delete-branch` 只删了远端、无法删在用的本地分支（`cannot delete branch ... used by worktree`）——属预期，未强删。
- **失联环境未清理**：捞回源孤儿 worktree `D:\Data\projects\mp-worktrees\mp-w3-closure` 与改名后无 `.git` 的旧壳 `D:\Data\projects\Multi-Publish` 仍在盘上，未 `git worktree prune`/处置；此属破坏性动作，待另行授权。
- **presence 门禁仍是 advisory**：本 wave 靠人工补建记录收口，不是门禁拦住的。转阻断（删 `--mode=advisory`）前，同类"合并即失联记录"仍可能复发。
