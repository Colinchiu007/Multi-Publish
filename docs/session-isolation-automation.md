# Multi-Publish 会话隔离自动化

## 目标

共享仓库根（例如 `D:/Data/projects/Multi-Publish`）是只读协调根，长期保持 main 且干净。运行时代码任务必须创建在隔离 worktree（默认 `<仓库父目录>/mp-worktrees/mp-<task>`，可用 `-WorktreeRoot` 或 `MP_WORKTREES` 覆盖），避免多个 Codex 会话共享同一个 Git HEAD、index 和 stash。

## 自动入口

从仓库根目录运行：

    powershell -ExecutionPolicy Bypass -File scripts/start-mp-task.ps1 -TaskName story2video-fix

启动器会依次检查共享根目录、安装并校验 Git hooks、调用 session-init.sh 创建或复用独立 worktree，并打开定位到该 worktree 的 PowerShell。依赖安装较慢时可以使用 -NoDeps，但交付测试前仍必须完成 worktree 依赖门禁。worktree 根默认取仓库父目录下的 `mp-worktrees`，可通过 `-WorktreeRoot` 或 `MP_WORKTREES` 覆盖；Git Bash 路径会自动探测，也可用 `-GitBash` 或 `MP_GIT_BASH` 指定。

## 新机器一键启用

新电脑克隆仓库后，先运行一次：

    powershell -ExecutionPolicy Bypass -File scripts/bootstrap-write-guard.ps1

该命令按顺序完成：安装 Git hooks → 跑两个自检测试 → 注册健康巡检与写保护计划任务 → 启动 Write Guard watcher → 健康门禁（要求 main clean、hooks 一致、write guard 运行）。任一步失败返回非零；可重复运行（幂等）。`-Minutes` 可调巡检间隔（1-60 分钟），`-WorktreeRoot` / `MP_WORKTREES` 可改隔离目录，`-SkipTests` 可跳过自检。

安装质量节拍 skill 只会带来门禁文本，真正生效还需要仓库脚本与计划任务；bootstrap 就是让新机器补齐这部分的统一入口。

## 健康守护

只读健康检查：

    powershell -ExecutionPolicy Bypass -File scripts/mp-worktree-health.ps1 -RequireClean -RequireHooks

检查内容包括：主 worktree 是 main、工作区干净、没有 shared-root-violation、hooks 与源码 SHA-256 一致，以及 linked worktree 都位于隔离目录（默认 `<仓库父目录>/mp-worktrees`，可用 `-WorktreeRoot` 覆盖）。报告默认写入 %LOCALAPPDATA%\Multi-Publish\session-isolation\health.json，不写入仓库。传入 -RequireWriteGuard 时，还会要求实时写保护任务已注册且 watcher 正在运行。

## 实时写保护

写保护由 scripts/guard-shared-root-writes.ps1 执行，随当前用户登录自动启动。它监听共享主目录，把 apps/、packages/、ops-center/、config/、.github/ 等运行时路径下非 gitignored 的新建/修改/删除文件移入：

    %LOCALAPPDATA%\Multi-Publish\session-isolation\quarantine\

tracked 文件会从 HEAD 精确恢复，违规记录追加到同一目录的 violations.jsonl。docs/、01-docs/、scripts/、openspec/、.ccg/、.agent_context/、.hermes/ 及根级流程文档保持可写；node_modules/、dist/ 等 gitignored 构建产物不会被误隔离。文件被占用时只做有界重试并保留原文件，不会覆盖或删除数据。

## Windows 计划任务

当前用户注册两个任务：健康巡检每 15 分钟运行一次（可用 -Minutes 调整为 1-60 分钟），写保护在登录时启动：

    powershell -ExecutionPolicy Bypass -File scripts/install-session-isolation-task.ps1 -Minutes 15

查看任务：

    Get-ScheduledTask -TaskPath '\Multi-Publish\'

移除任务（同时移除健康巡检与写保护）：

    powershell -ExecutionPolicy Bypass -File scripts/install-session-isolation-task.ps1 -Unregister

健康巡检只读，不会自动 stash、切分支、删除文件或覆盖用户变更；写保护会自动隔离运行时目录的直接写入并把 tracked 文件恢复到 HEAD。异常时通过退出码、用户目录 JSON 和隔离日志暴露问题；恢复动作仍使用 session-init.sh 或 safe-worktree-remove.ps1。

## 自检

    powershell -ExecutionPolicy Bypass -File scripts/session-isolation-automation.test.ps1
    powershell -ExecutionPolicy Bypass -File scripts/session-write-guard.test.ps1

自检覆盖脚本存在性、当前主目录健康状态、报告写出、main/primary 识别、计划任务注册后稳定指向共享主目录 scripts 的合同，以及写保护的隔离/恢复/放行行为。自检最后会重新注册任务，避免验证本身关闭持续守护。

## 边界

Git 没有 pre-checkout hook，Git hooks 不能阻止所有客户端的首次目录选择；--no-verify 也能跳过提交 hook。因此新任务必须从 start-mp-task.ps1 入口创建，Git hooks、实时写保护、健康守护和 GitHub 分支保护分别承担入口、直接落盘拦截、持续发现和远程交付兜底。
