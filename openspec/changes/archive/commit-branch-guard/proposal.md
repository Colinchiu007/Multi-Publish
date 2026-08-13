# commit-branch-guard — 提交分支守卫

## Why（背景与问题）

2026-08-13 11:04:24，另一并发会话在共享工作区（D:/Data/projects/Multi-Publish）执行 `git checkout -b codex/video-no-text-prompt-enhancement`，把共享 HEAD 从 main 切走；1 分 43 秒后（11:06:07）本会话的 docs 提交 `1624ae9f` 落到该 feature 分支（reflog 实证）。

根因：
1. 两个会话共享同一 Git 工作目录（违反 Worktree 隔离铁律），且无机制阻止共享目录内 `git checkout -b`；
2. 既有 `.git/hooks/pre-commit` 只做质量节拍检查，不校验分支；docs-only 提交（.md/.yaml）连质量节拍检查也被跳过；
3. `.agent_context/` 是文档规定的活跃会话信号，但仓库中没有任何代码创建它 → 共享检测永远空转；
4. 「提交前人工确认分支是 main」是 TOCTOU 竞态，无法在共享工作区中防住并发切换。

## 目标

让「提交落到错误分支」从概率事件变为必被拦截：任何提交（含 docs-only）在 pre-commit 强制校验
当前分支 == 会话声明分支（`.agent_context/expected-branch`）。

## 非目标

- 不在此 change 阻断共享工作区本身（长期方案 = 强制 worktree + post-checkout 告警，另行立项）；
- 不改变既有质量节拍 wrapper 检查逻辑。