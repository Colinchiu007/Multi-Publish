## 设计

### 现状

- `start-mp-task.ps1`：写死 `D:\Program Files\Git\usr\bin\bash.exe` 与 `D:\Data\projects\mp-worktrees`。
- `mp-worktree-health.ps1`：outside worktree 校验与 rootAllowed 写死 D 盘。
- `guard-shared-root-writes.ps1`：写死 git.exe 候选，PATH 存在时回退。
- `gwm-task.sh` / `session-cleanup.sh` / `fix-worktree-node-modules.sh`：各自写死 D 盘 worktree 根。
- 没有新机器一键入口；`.quality-rhythm` 分发文档缺失写保护 bootstrap 步骤。

### 方案

1. 统一默认值规则：worktree 根 = `<repo-parent>/mp-worktrees`，可被 `-WorktreeRoot` 或 `MP_WORKTREES` 覆盖；Git Bash / git.exe 优先 `-GitBash` / `-GitPath`，其次 `MP_GIT_BASH` / `MP_GIT`，再次 PATH 与常见安装位置探测。
2. `start-mp-task.ps1` 将解析后的根目录写入 `MP_WORKTREES` 环境变量再调用 `session-init.sh`，保证 `gwm-task.sh` 使用同一根。
3. `mp-worktree-health.ps1` 使用同一规则计算 `worktreeKey`，outside 校验改为前缀匹配，并在报告中记录 `worktreeRoot`。
4. 新增 `bootstrap-write-guard.ps1`，顺序：安装 hooks → 自检（可 `-SkipTests`）→ 注册计划任务 → 启动 watcher（已运行则跳过）→ 健康门禁 `-RequireWriteGuard`，任一步非零即失败。
5. 分发文档统一改为“仓库父目录 `mp-worktrees`”的通用描述，并给出新电脑命令与验证命令。

### 测试

- PowerShell AST 解析所有改动 `.ps1`。
- `session-write-guard.test.ps1`、`session-isolation-automation.test.ps1` 保持全绿，自检增加 `-WorktreeRoot` 健康检查。
- 在当前机器运行 `bootstrap-write-guard.ps1` 验证幂等与计划任务/健康状态。
- `openspec validate --strict` 校验新 change。