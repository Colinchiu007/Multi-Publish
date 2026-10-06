---
record: fix-m2-alias
task: 撤回报告附录 C.2 对 P0-2「重试后结果卡永不更新」的「运行坐实」结论，并沉淀缺陷复现型测试的三条纪律
date: 2026-10-07
---

## 本次执行记录：撤回 M-2「运行坐实」结论 + 沉淀缺陷复现型测试的系统性风险（fix-m2-alias，2026-10-07）

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | PASS | **纯文档（docs-only 通道）**。全程在隔离 worktree `D:\Data\projects\mp-worktrees\mp-fix-m2-alias`、裸分支 `fix-m2-alias`；共享主工作区 `D:\Data\projects\mulpub` 未被写入。`scripts/pre-code-edit-guard.ps1` 判据（`git rev-parse --git-dir != --git-common-dir`）本 worktree 满足。pre-commit 分支守卫输出「隔离 worktree 自动声明期望分支 fix-m2-alias」。**变更集零生产代码** —— 原计划的 M-2 修复两处（`usePublishFlow.js` 消费侧别名展开、`publishProgress.js` store 侧 `taskIdAliases` 记账）已 `git checkout --` 全量回退，未进入任何提交 |
| 第一性原因（QM-5 ①） | PASS | 报告附录 C.2 的缺陷复现型断言 `expect(flow.result.value).toBeNull()` **抢在 `watch` 排空之前执行**。真实用户会等界面刷新，`watch` 早已触发完毕 —— 断言的观察时刻与用户可见时刻不对齐。深层原因是构造时序与真实用户路径不一致，不是被测代码有 bug |
| 逃逸分析（QM-5 ②） | PASS | ①单元层：断言只验证了「我造出的这个状态」，没有任何一问是「真实路径下同样成立吗」；②集成/E2E 层：仓库内不存在覆盖「重试后结果卡刷新」的端到端路径，无第二道网；③视觉回归：不涉及（断的是数据流不是像素）；④审查层：CCG 评审读的是报告文字而非可复现脚本，无法对断言时序提出质疑 |
| 修复 + 回归保护（QM-5 ④） | PASS（形态变更） | **回归保护的对象从「代码缺陷」换成了「方法论缺陷」**：P0-2 的修复被撤回（撤回即保护 —— 避免为一个不发生的问题引入别名表与额外状态），换来报告 §C.7 的逐时点实测表 + §C.8 的三条纪律 + 纪律 2 被点名为「直接拦住 M-2 无效提交」的可追溯事实 |
| 防止再次发生（QM-5 ⑤） | PASS | 三条纪律落进**报告正文 §C.8**（本 PR），而非只留在提交信息里：①缺陷复现型断言必须回答「真实用户路径下同样成立吗」；②修复前先做反证，撤掉修复核心断言必须转红；③反证不通过时先怀疑自己的实证。§C.8 末节另附「对本报告其余结论的连带影响」，逐条标注 P0-1/P0-3 反证一次通过、P0-5 复现条件已收窄、P0-4 始终未实证 |
| 行尾与 diff 对账 | PASS | `git diff --numstat` 与 `git diff --ignore-cr-at-eol --numstat` 两口径完全一致（`CHANGELOG.md` 64/0、`docs/frontend-deep-review-2026-10-05.md` 97/3）。删除数归因：报告 3 处删除 = C.2 标题加撤回标记、C.5 影响表条目改写、附录 C 引言；无 CRLF 噪声 |
| 接线棘轮 | N/A | 本次不新增任何 `*.test.js`（M-2 缺陷复现型测试随修复一并撤回，见「遗留」） |
| QM-1 打包 / QM-4 视觉 | N/A | 未触运行面：diff 内零生产代码，无 `apps/desktop/electron/` 与 `packages/rpa-engine/` 改动 |
| QM-6 CCG 双模型外部评审 | 未执行 | pre-commit 的 CCG 门禁已跑，判定 `改动全部命中文档白名单（§11.2b docs-only 快通道）…S 复杂度低风险，按 CCG 决策矩阵不调外部模型`（判定落盘 `.ccg/reviews/853a4bd2….json`，2 项通过）。本 PR 的评审对象是**我自己结论的撤回**，证据是一次真实的反证失败，无外部模型可提供的信息增量，故不以自审冒充通过 |
| docs-only 判定 | PASS | `node scripts/classify-docs-only.js --base=origin/main --head=HEAD` ⇒ `docs-only=true`，合并态 files=3（`CHANGELOG.md`、`docs/frontend-deep-review-2026-10-05.md`、`openspec/records/fix-m2-alias.md`）。CI 侧 19 个 check：8 个 pass（含 `Gate Result`）、11 个 `skipping`（含 `QG Coverage` / `QG Desktop Shards` / `QG Static`）—— skipping 在此是预期短路，但已先跑判定脚本确认不是判定失灵 |
| 配套门禁 | PASS | `check-changelog-growth.js` PASS；`check-max-lines.js` rc=0 |
| 远程同步 | PASS | PR #3001 于 2026-10-07 01:47:35 +08:00 squash 合并，merge SHA `abdb8ce70f32e76d5a87c142db2b698652143abb`，origin/main 已核验；`git ls-remote --heads origin fix-m2-alias` 返回 0 行，远端分支已删 |

### 遗留（不假装已闭合）

- **P0-2 不是「不存在」，是「静态可疑、动态未能复现」**。反证只证明了当前代码路径下结果卡会正确刷新，**没有证明隐患已消除**：`activeSession` 按 taskId 反查取最新 session，而 `watch` 持有的是旧引用，两者靠 `_recomputeSessionStatus` 里 `!allTerminal && status === 'done'` → 回 `running` 这条分支兜底。若将来 `watch` 改为不缓存引用、或那条回滚分支被重构掉，隐患会重新显形。**修复方案（(b) 别名表）已想清楚，是搁置而非否决**
- **M-2 的缺陷复现型测试已随修复撤回**，不留存。本仓此后再无自动化手段能守住这条路径，直到 §C.8 纪律被真正执行
- **M-4（`reportError` 未处理的 Promise 拒绝）** 确认无法在 vitest 覆盖，需要 Electron 主进程环境，仍未处理
- **M-6（覆盖率门禁零 Vue SFC）** 未开始，是下一步解锁覆盖率度量的前置项