# 分支整合计划

1. 从 `origin/main` 的干净 worktree 开始。
2. 快进合并 `codex/fix-desktop-dev-startup`，其中已包含 Trellis 分支的三个提交。
3. 合并 `codex/refresh-codebase-map`，处理任何冲突后检查合并结果。
4. 运行集成后的定点回归和 Git 范围检查。
5. 推送集成头到 `origin/main`，再确认远端 SHA。

## 排除范围

不纳入任何 worktree 的未提交文件。原始 Trellis worktree 与桌面修复 worktree 留存的其他会话变更保持原样。
