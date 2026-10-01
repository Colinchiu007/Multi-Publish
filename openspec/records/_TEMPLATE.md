---
# 用法：复制本文件为 `openspec/records/<分支名或任务 slug>.md`。
# 文件名就是这条记录的键（与历史 `.quality-gates.md` 的"标题键"互不重叠，两套语义不混）。
# 下划线开头的文件与 `_exempt/` 子目录不参与记录计数。
record: <slug>
task: <一句话说明这次干了什么>
date: <YYYY-MM-DD>
# ↓ 下面三个字段只在「远程同步」尚无法收口时填写；回填成 PASS 后必须整段删除。
#   留下不删 = 门禁报「已回填却仍留登记字段」。登记随文件走，不存在外部清单要记得同步删条目。
sync_status: PENDING
sync_reason: <为什么现在收不了口（例如：本 PR 尚未合并，merge SHA 还不存在）>
sync_backfill_owner: <谁来回填（例如：下一个会话）>
---

## 本次执行记录：<标题>（<slug>，<YYYY-MM-DD>）

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 |  | 运行时代码：worktree 路径 + 裸分支；纯文档：就地编辑 + 经 PR 落地 |
| 第一性原因（QM-5 ①） |  |  |
| 逃逸分析（QM-5 ②） |  |  |
| 修复 + 回归保护（QM-5 ④） |  |  |
| 防止再次发生（QM-5 ⑤） |  |  |
| 行尾与 diff 对账 |  | 两口径 numstat 必须相等，并给出删除数归因 |
| 接线棘轮 |  | 新增 `*.test.js` 必须被 workflow 显式点名，否则等于没写 |
| QM-1 打包 / QM-4 视觉 |  | 未触运行面时写 N/A |
| QM-6 CCG 双模型外部评审 |  | 本机无 `codeagent-wrapper` 时如实写「未执行」，不得以自审冒充通过 |
| 远程同步 | PENDING | 合并后取 `git log origin/main --grep='(#NNNN)$' --format=%H|%cI` 回填 merge SHA 与时间，`git ls-remote --heads origin <branch>` 返回 0 行证远端分支已删；回填后删除上方三个 sync_* 字段 |

### 遗留（不假装已闭合）
-
