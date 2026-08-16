# session-isolation-write-guard Specification

## Purpose
提供共享主目录的实时写保护，使新会话无法在共享 `main` 工作区直接落盘运行时代码；允许的流程/文档目录保持原有 main 小步提交能力。
## Requirements
### Requirement: 运行时目录写保护

共享主目录 SHALL 实时拦截守卫目录下非 gitignored 文件的新建、修改与删除；被拦截文件 MUST 移入仓库外隔离目录，tracked 文件 MUST 从 HEAD 精确恢复，并追加违规日志。

#### Scenario: 新建运行时文件被隔离

- **WHEN** 会话在 `apps/` 或 `packages/` 下创建一个非 gitignored 新文件
- **THEN** 该文件被移动到 `%LOCALAPPDATA%` 隔离目录，原路径消失，违规日志新增一条记录

#### Scenario: 修改 tracked 文件后恢复

- **WHEN** 会话修改 `apps/` 下已跟踪文件
- **THEN** 修改副本被隔离，工作树从 HEAD 恢复原文件，`git status` 保持干净

#### Scenario: 删除 tracked 文件后恢复

- **WHEN** 会话删除守卫目录下已跟踪文件
- **THEN** 文件从 HEAD 精确恢复

### Requirement: 允许目录放行

docs/scripts/openspec 等流程目录 SHALL 保持可写；gitignored 构建产物 SHALL 不被误隔离。

#### Scenario: 文档目录正常写入

- **WHEN** 会话在 `docs/` 或 `scripts/` 下新建文件
- **THEN** 文件不被隔离

#### Scenario: gitignored 产物放行

- **WHEN** 会话在 `node_modules/` 或 `dist/` 下生成文件
- **THEN** 文件不被隔离

### Requirement: 失败安全与幂等

隔离操作 SHALL 有界重试；无法移动时 MUST 保留原文件并记录失败，不得覆盖或删除用户数据；重复触发 SHALL 保持幂等。

#### Scenario: 文件被占用

- **WHEN** 目标文件正被其他进程占用且移动失败
- **THEN** 守卫保留原文件，写入失败日志，健康巡检仍可发现脏状态

#### Scenario: 并发实例

- **WHEN** watcher 已运行且任务再次触发
- **THEN** 新实例被 MultipleInstances IgnoreNew 忽略，不产生双 watcher

### Requirement: 计划任务与可观测

写保护 SHALL 随当前用户登录自动启动，健康报告 SHALL 包含任务注册、进程运行与隔离统计；`-RequireWriteGuard` 校验失败时健康检查 MUST 返回非零。

#### Scenario: 登录自动启动

- **WHEN** 当前用户登录 Windows
- **THEN** `Session Isolation Write Guard` 任务启动 watcher

#### Scenario: 健康报告反映守卫状态

- **WHEN** 健康巡检执行且任务未注册或 watcher 未运行
- **THEN** 报告 `writeGuard` 标记异常，`-RequireWriteGuard` 时 `ok=false`

