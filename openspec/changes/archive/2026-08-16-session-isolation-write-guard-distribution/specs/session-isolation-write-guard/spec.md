# session-isolation-write-guard Specification

## Purpose

提供共享主目录的实时写保护，使新会话无法在共享 `main` 工作区直接落盘运行时代码；允许的流程/文档目录保持原有 main 小步提交能力，并可在新电脑上一条命令完成安装与自检。

## ADDED Requirements

### Requirement: 可移植路径解析

会话隔离脚本 SHALL 从共享主目录推导隔离 worktree 根（默认 `<repo-parent>/mp-worktrees`）与 Git for Windows 工具路径，不得依赖 D 盘硬编码；`-WorktreeRoot` / `-GitBash` / `-GitPath` 与 `MP_WORKTREES` / `MP_GIT_BASH` / `MP_GIT` SHALL 可覆盖默认值，启动器 MUST 将同一根目录传给 worktree 创建与健康检查。

#### Scenario: 新机器默认路径

- **WHEN** 在其他磁盘或用户目录克隆仓库并运行 `scripts/start-mp-task.ps1 -TaskName demo`
- **THEN** 隔离 worktree 创建在 `<repo-parent>/mp-worktrees/mp-demo`，健康检查接受该根下的 worktree

#### Scenario: 显式覆盖根目录

- **WHEN** 用户以 `-WorktreeRoot C:/worktrees` 或 `MP_WORKTREES=C:/worktrees` 启动任务
- **THEN** worktree 创建与 outside worktree 校验均使用该根，且不要求 D 盘路径存在

### Requirement: 一键启用与自检

新电脑 SHALL 通过 `scripts/bootstrap-write-guard.ps1` 一次完成 git hooks 安装、计划任务注册、Write Guard watcher 启动与自检；任一步失败 MUST 返回非零并停止。

#### Scenario: 新电脑 bootstrap 成功

- **WHEN** 新克隆仓库运行 bootstrap 且 Git for Windows / Windows 计划任务可用
- **THEN** `Session Isolation Health` 与 `Session Isolation Write Guard` 已注册，watcher 运行中，自检输出 PASS，健康检查 `ok=true`

#### Scenario: bootstrap 幂等重跑

- **WHEN** 同一环境再次运行 bootstrap
- **THEN** 不产生重复 watcher 或重复任务定义，健康检查保持 `ok=true`