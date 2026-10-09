---
record: batch-d-pagination-m15
task: M-15 三列表渲染截断 + 加载更多（Accounts / CopyLibraryView / HotTopics）
date: 2026-10-09
sync_status: PENDING
sync_reason: 关联 PR 尚未合并，无 merge SHA 可取证
sync_backfill_owner: 下一会话（合并后单开回填 PR 收口）
---

## 任务执行记录：批次 D 第一部分（batch-d-pagination-m15，2026-10-09）

编号约定：M-15 为**审查报告正文编号**。

| 节拍 | 状态 | Fresh 证据 |
|------|------|-----------|
| 会话隔离前置 | PASS | 独立 worktree `mp-batch-d-pagination-m15`（D 盘），分支 `batch-d-pagination-m15`，基线 `f49dbfa9`；`pnpm install --frozen-lockfile` rc=0 |
| 找第一因（QM-5 甲） | PASS | M-15 的根因是「筛选后全量渲染」且全仓无机械守卫拦这个形态；报告定性为"随数据量增长必然劣化"的结构缺口 |
| 数据方差（QM-5 乙） | PASS | 渲染层截断（slice）不改变 store 数据与筛选语义；全选语义显式保留在渲染集合上（Accounts 特例，PRD §2.2 声明） |
| 修复 + 回归保护（QM-5 丙） | PASS | Accounts 截断回归 3 用例（含反证）；HotTopics 截断回归 3 用例（含全选语义验证）；既有 116+9+42 全绿 |
| 反证（QM-5 丙必做） | PASS | 渲染上限调到超过总数（等于退回不截断）⇒ 「加载更多」必须消失的断言内置为用例；Accounts/HotTopics 各 1 条 |
| 显示项与提示（§3） | PASS | 6 条 locale 文案 zh/en 成对（shownTruncated / loadMoreTopics 等），措辞"已显示前 N"如实告知未看完全部 |
| 三处重复消除 | PASS | `LoadMoreRow.vue` 共用组件消除三处重复模板与样式 |
| 行尾 diff 对账 | PASS | 两口径 numstat 一致 |
| 门禁自测 | PASS | check-max-lines rc=0（Accounts 重锚 1578，理由：M-15 功能增量本身需 ~10 行，与批次 B/C 重锚同规则）；check-debt-budget rc=0 |
| QM-1 打包 / QM-4 视觉 | N/A | 无运行面改动；视觉变化为新增提示行 + 按钮（组件测试覆盖） |
| QM-6 CCG 跨家族外部评审 | 待跑 | 提交后执行 |
| 远程同步 | PENDING | 合并后回填 |

## 关键判断与取舍

1. **不上虚拟滚动**：方案 §6 明确不做；slice + 加载更多是报告 M-15 认可的最低成本路径。
2. **全选语义显式取舍**：Accounts 的全选只作用于已渲染卡片（用户看得见才能取消），
   HotTopics 的全选作用于全量筛选结果（PRD §2.2 与测试均钉死）。
3. **筛选变化不重置渲染上限**：用户显式点过的"加载更多"是意图表达，切换筛选后
   条目变少时提示自然消失，无需清零。
4. **重锚声明**：Accounts.vue 超点名目标 10 行（1578 > 1568），原因是 M-15 功能
   增量本身需要新增渲染截断逻辑——按门禁合法出路"说明理由后一并上调 targets"
   重锚到 1578，之后再增一行仍会立刻判红。
5. **M-8 不在本 PR**：CreateView 拆分是独立 openspec change（方案 §10.4），
   立项草案 M8-SPLIT-PROPOSAL-DRAFT.md 已随批次 C 入库。
