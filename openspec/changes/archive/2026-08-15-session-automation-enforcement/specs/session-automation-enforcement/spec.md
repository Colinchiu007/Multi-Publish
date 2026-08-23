# 会话隔离自动化规范

## ADDED Requirements

### Requirement: 统一任务入口
运行时代码任务 MUST 通过 start-mp-task.ps1 创建或复用 D 盘独立 worktree。

#### Scenario: 启动任务
- Given 共享主目录为 main 且干净
- When 使用合法 kebab-case 任务名启动
- Then session-init.sh 创建对应 mp-<task> worktree

### Requirement: 持续健康检查
健康检查 MUST fail closed when the primary root is not main, dirty, marked, or has mismatched hooks.

#### Scenario: 健康合同失败
- Given primary root has a branch or hook mismatch
- When the health script runs with required checks
- Then it exits non-zero and writes a report outside the repository

### Requirement: Windows 计划任务
安装器 MUST register a per-user recurring task and MUST support idempotent removal.

#### Scenario: 任务执行
- Given the task is registered
- When Windows Task Scheduler runs it
- Then the health report is refreshed and a successful state exits zero
