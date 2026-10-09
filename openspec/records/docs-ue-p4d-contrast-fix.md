---
record: docs-ue-p4d-contrast-fix
task: P4D 深色可读性第三批——ProfileMenu 未登录「登录」标题（18 视图同源）+ PublishHistory 单视图 20 处，36→19；dark 覆盖收编 tokens.css 并以 html 前缀解决级联落败
date: 2026-10-09
sync_status: PENDING
sync_reason: PR #3207 尚未合并，merge SHA 待合并后取证
sync_backfill_owner: 本会话（ue-p4d-contrast-fix 作者）
---

## 本次执行记录：P4D 深色可读性第三批（docs-ue-p4d-contrast-fix，2026-10-09）

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | PASS | 运行时代码（CSS/文档/基线）经隔离 worktree `D:/Data/projects/mp-worktrees/mp-ue-p4d-contrast-fix`、裸分支 `ue-p4d-contrast-fix` 修改；共享主目录保持 main；本 PR 为落地载体 |
| 第一性原因（QM-5 ①） | PASS | 36 处残留低对比按 class 归组为两个共享模式：① `.mp-profile-copy strong` #4d4f6f 硬编码（侧栏全局组件 ProfileMenu，18 个视图各渲染 1 处「登录」标题）；② PublishHistory 单视图 20 处（.history-tab muted 档 1.96:1 / .secondary-action #4f505a / 表格硬编码亮色） |
| 逃逸分析（QM-5 ②） | PASS | contrast-audit.js（Gate 7c，PR #3103 上线）此前以「基线无退化」放行存量暗色欠账；逐视图采样只断言「不新增」，未推动收敛。逃逸链：视觉回归（暗色通道批次 1 才建立）→ 对比度门禁（只防退化）→ 代码评审（无暗色清单项） |
| 系统性漏洞定位 | PASS | 修复维度缺失：暗色可读性长期无量化门槛，存量 61 处挂账无收敛节奏。本批起按「共性模式修」推进：一次 CSS 覆盖治约 20 个样本 |
| 修复 + 回归保护（QM-5 ④） | PASS | tokens.css 集中 dark 覆盖 10 条规则（html 前缀）；contrast-audit 基线 36→**19**（-47%），无退化 exit=0；基线 JSON 登记残留归属（el-message 3 / accounts 原生控件 5 / create Remotion 2） |
| 防止再次发生（QM-5 ⑤） | PASS | 级联落败实证写入门禁块与文档 v1.6（tokens 先注入 + 同特异性被 scoped 反超 → 必须 html 前缀）；探针误诊教训（`/src/styles/*` SPA fallback）同批记录，防下次误判 |
| 行尾对账 | PASS | `git diff --numstat` 与 `--ignore-cr-at-eol --numstat` 两口径一致（M4 A0 D0） |
| 测试接线 | PASS | tokens.slots.test.js 等样式契约 + PublishHistory.test.js 共 **116/116 绿**（vitest，本机实测）；contrast-audit.js 已接线 quality-gate.yml Gate 7c |
| QM-1 打包 / QM-4 视觉 | N/A | 未动 electron/ 主进程与打包配置；视觉对比以 contrast-audit 实测数据为准（36→19） |
| QM-6 CCG 双模型外部评审 | PASS | scripts/ccg-review.ps1（Deep 模式）双家族执行，记录在 `.ccg/reviews/`；评审发现见下节 |
| 远程同步 | PENDING | 合并后取证 `git log origin/main --grep='(#3207)$' --format=%H|%cI` 得 merge SHA，`git ls-remote --heads origin ue-p4d-contrast-fix` 应返回 0 行；随后删除上方 sync_* 三字段 |

### 复盘：已闭合
- 级联落败（tokens 先注入被 scoped 反超）→ html 前缀修正，实测回归 19 无退化
- PublishHistory 行数 1394 零容差 → dark 块迁出组件净零行，行数门禁 rc=0
- 「规则不进 CSSOM」误诊 → 探针路径 `/src/styles/*` 落 SPA fallback；真实路径 `/styles/*` 正常
