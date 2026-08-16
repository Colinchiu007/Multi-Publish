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

