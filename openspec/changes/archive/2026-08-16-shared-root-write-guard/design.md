# 设计：共享主目录实时写保护

## 目标

把共享主目录从“事后哨兵”升级为“事前闸门”：任何会话在共享根下对运行时目录的直接文件写入，在落盘后尽快被隔离，不依赖模型自觉或 Git hook。

## 边界

- 监听根：`D:/Data/projects/Multi-Publish`
- 允许目录：`docs/`、`01-docs/`、`scripts/`、`openspec/`、`.ccg/`、`.agent_context/`、`.hermes/`，以及根级 `AGENTS.md`、`README.md`、`CHANGELOG.md`、`.quality-gates.md`
- 守卫目录：`apps/`、`packages/`、`ops-center/`、`config/`、`.github/`，以及根级 `package.json`、`pnpm-workspace.yaml` 等运行时配置
- 忽略：`.git/` 与 gitignored 路径（node_modules、dist、coverage、test-results 等），避免误伤合法依赖/构建产物
- 隔离根：`%LOCALAPPDATA%\Multi-Publish\session-isolation\quarantine\`

## 处理规则

1. FileSystemWatcher 监听根目录，Created/Changed/Renamed/Deleted 事件先进入去重队列，主循环 400ms 后统一处理，避免编辑器的多次写事件把半成品文件移走。
2. 对每个候选路径：
   - 相对路径首段在允许目录/允许文件 → 跳过
   - gitignored → 跳过
   - 位于守卫目录且非忽略：
     - 文件存在且是 tracked → 先移动到隔离区，再用 `git restore --source=HEAD --worktree -- <path>` 精确恢复单文件
     - 文件存在且 untracked → 移动到隔离区
     - 文件已删除且 tracked → 直接精确恢复
     - 其他情况 → 追加失败日志，保留原文件，交给健康巡检兜底
3. 移动使用唯一时间戳目标名，保留原始相对路径语义；移动失败（文件被占用）做 5 次、每次 500ms 的有界重试，仍失败只记录违规，不覆盖不删除。
4. 每次处理追加一行 JSON 到 `violations.jsonl`，记录时间、相对路径、动作、tracked 状态、文件大小。
5. 恢复路径写入进程内 ignoreSet，短时间忽略 watcher 对恢复产生的 Created/Changed 事件，避免自我隔离。

## 任务注册

- `install-session-isolation-task.ps1` 扩展为同时注册：
  - `Multi-Publish\Session Isolation Health`（每 15 分钟）
  - `Multi-Publish\Session Isolation Write Guard`（AtLogOn，常驻 watcher）
- 写保护任务：`MultipleInstances IgnoreNew`、`StartWhenAvailable`、`ExecutionTimeLimit` 长周期、主进程退出时由任务重启策略兜底。
- `-Unregister` 同时移除两个任务，保持幂等。

## 可观测

`mp-worktree-health.ps1` 报告新增 `writeGuard`：任务是否注册、watcher 是否运行、隔离文件数、违规日志数。`-RequireWriteGuard` 时任务未注册/未运行计入 `ok=false`。

## 测试策略

用临时目录创建真实 git 仓库（含 tracked 文件、guard 目录、docs 目录、node_modules 目录），调用 watcher 单次处理函数而非真实异步监听，保证确定性：
- untracked 新建 → 被隔离、原路径消失
- tracked 修改 → 副本进隔离、工作树恢复 HEAD 内容
- docs 新建 → 放行
- node_modules 新建 → 放行
- 违规日志生成且位于仓库外
- 删除 tracked 文件 → 恢复
