# Multi-Publish 会话隔离自动化

## 目标

D:/Data/projects/Multi-Publish 是只读协调根，长期保持 main 且干净。运行时代码任务必须创建在 D:/Data/projects/mp-worktrees/mp-<task>，避免多个 Codex 会话共享同一个 Git HEAD、index 和 stash。

## 自动入口

从仓库根目录运行：

    powershell -ExecutionPolicy Bypass -File scripts/start-mp-task.ps1 -TaskName story2video-fix

启动器会依次检查共享根目录、安装并校验 Git hooks、调用 session-init.sh 创建或复用独立 worktree，并打开定位到该 worktree 的 PowerShell。依赖安装较慢时可以使用 -NoDeps，但交付测试前仍必须完成 worktree 依赖门禁。

## 健康守护

只读健康检查：

    powershell -ExecutionPolicy Bypass -File scripts/mp-worktree-health.ps1 -RequireClean -RequireHooks

检查内容包括：主 worktree 是 main、工作区干净、没有 shared-root-violation、hooks 与源码 SHA-256 一致，以及 linked worktree 都位于 D 盘隔离目录。报告默认写入 %LOCALAPPDATA%\Multi-Publish\session-isolation\health.json，不写入仓库。

## Windows 计划任务

当前用户注册每 5 分钟运行一次的计划任务：

    powershell -ExecutionPolicy Bypass -File scripts/install-session-isolation-task.ps1

查看任务：

    Get-ScheduledTask -TaskPath '\Multi-Publish\' -TaskName 'Session Isolation Health'

移除任务：

    powershell -ExecutionPolicy Bypass -File scripts/install-session-isolation-task.ps1 -Unregister

守护任务只读检查，不会自动 stash、切分支、删除文件或覆盖用户变更。异常时通过退出码和用户目录 JSON 报告暴露问题；恢复动作仍使用 session-init.sh 或 safe-worktree-remove.ps1。

## 自检

    powershell -ExecutionPolicy Bypass -File scripts/session-isolation-automation.test.ps1

自检覆盖脚本存在性、当前主目录健康状态、报告写出、main/primary 识别，以及计划任务注册后稳定指向共享主目录 scripts 的合同。自检最后会重新注册任务，避免验证本身关闭持续守护。

## 边界

Git 没有 pre-checkout hook，Git hooks 不能阻止所有客户端的首次目录选择；--no-verify 也能跳过提交 hook。因此新任务必须从 start-mp-task.ps1 入口创建，Git hooks、健康守护和 GitHub 分支保护分别承担入口、持续发现和远程交付兜底。
