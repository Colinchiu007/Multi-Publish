## Why

用户希望在新电脑安装质量节拍 skill 后，直接启用共享主目录写保护与会话隔离机制。现状仅安装 skill 不会生效：项目里的启动器、健康检查、计划任务脚本仍硬编码 `D:/Data/projects/mp-worktrees`、`D:/Program Files/Git/...` 与 `D:/Data/projects/Multi-Publish`，也没有一条命令完成 hooks、计划任务、watcher 与自检的 bootstrap 入口。新机器必须改造脚本并补齐一键启用步骤。

## What Changes

- 参数化并自动探测路径：
  - `start-mp-task.ps1` 增加 `-WorktreeRoot` / `-GitBash`，默认由仓库父目录推导或读取 `MP_WORKTREES` / `MP_GIT_BASH`。
  - `mp-worktree-health.ps1` 增加 `-WorktreeRoot` / `-GitPath`，outside worktree 校验不再写死 D 盘。
  - `guard-shared-root-writes.ps1` / `install-session-isolation-task.ps1` 增加 `-GitPath` 自动探测。
  - `gwm-task.sh` / `session-cleanup.sh` / `fix-worktree-node-modules.sh` 的 `MP_WORKTREES` 默认值改为仓库父目录推导。
  - `scripts/hooks/pre-commit` 的 worktree 提示不再写死 D 盘。
- 新增 `scripts/bootstrap-write-guard.ps1`：安装 hooks、注册计划任务、启动 Write Guard watcher、跑两个自检测试并执行 `mp-worktree-health.ps1 -RequireWriteGuard` 门禁，幂等可重跑。
- 同步分发文档：`docs/session-isolation-automation.md`、`.quality-rhythm/SKILL.md`、`.quality-rhythm/integrations/README.md`、`.quality-rhythm/integrations/env-checklist.md`、`AGENTS.md`，让新机器按文档一条命令启用。

## Capabilities

### New Capabilities

- `bootstrap-write-guard`：Multi-Publish 新电脑一键启用会话隔离写保护的幂等入口。

### Modified Capabilities

- `session-isolation-write-guard`：隔离 worktree 根与 Git 工具路径可移植推导/覆盖，并提供一键 bootstrap 与自检门禁。

## Impact

- `scripts/`、`docs/`、`.quality-rhythm/`、`AGENTS.md`、`openspec/` 流程/文档文件；不触碰 `apps/`、`packages/` 等运行时代码。
- 不 push、不合并远端；本地提交与 `origin/main` 差异将在交付中单独说明。