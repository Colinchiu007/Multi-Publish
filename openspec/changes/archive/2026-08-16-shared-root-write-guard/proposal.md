## Why

现有会话隔离机制只在 Git 操作边界生效：pre-commit 拦错误分支提交、post-checkout 在切换后恢复 main、健康任务每 15 分钟报告脏状态。它们都无法阻止新会话直接在共享主目录中创建或修改运行时代码，因为 apply_patch 和普通文件写入不触发任何 Git hook。reflog 显示共享根 2026-08-16 09:31-09:38 被切到 feature 分支并产生过提交，11:16 又出现误复制残留，说明需要一道实时写闸门。

## What Changes

- 新增 `scripts/guard-shared-root-writes.ps1`：实时监听共享主目录，把 `apps/`、`packages/`、`ops-center/`、`config/`、`.github/` 等运行时路径下非 gitignored 的新建/修改/删除文件移入 `%LOCALAPPDATA%` 隔离目录，跟踪文件从 HEAD 恢复，并追加违规日志。
- 放行 `docs/`、`01-docs/`、`scripts/`、`openspec/`、`.ccg/`、`.agent_context/`、`.hermes/` 与根级流程文档，保证既有 main 小步提交流程不受影响。
- 新增 `scripts/session-write-guard.test.ps1`：用临时 git 仓库做确定性测试，覆盖新建隔离、跟踪文件恢复、允许目录放行、gitignored 放行、违规日志。
- 扩展 `scripts/install-session-isolation-task.ps1`：一次注册/移除健康巡检与实时写保护两个计划任务；写保护任务使用 AtLogOn，跟随当前用户登录。
- 扩展 `scripts/mp-worktree-health.ps1`：健康报告新增 writeGuard 注册/运行状态与隔离文件计数，`-RequireWriteGuard` 时纳入 ok 判定。
- 更新 `docs/session-isolation-automation.md` 操作说明。

## Capabilities

### New Capabilities

- `session-isolation-write-guard`: 共享主目录实时写保护——运行时目录写拦截、跟踪文件恢复、隔离目录与违规日志、Windows 登录启动任务、健康报告集成。

### Modified Capabilities

- `openspec-integration`（分层分支策略执行边界补充）：运行时代码既不能直接提交，也不能在共享主目录直接落盘。

## Impact

- 新增：`scripts/guard-shared-root-writes.ps1`、`scripts/session-write-guard.test.ps1`
- 修改：`scripts/install-session-isolation-task.ps1`、`scripts/mp-worktree-health.ps1`、`docs/session-isolation-automation.md`、`.ccg/tasks/shared-root-write-guard/task.json`
- 不涉及：apps/、packages/ 运行时代码（仅新增工具脚本与流程文档）
