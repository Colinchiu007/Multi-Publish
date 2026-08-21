# Review — restore-s2v-foreground-progress

审查对象：`apps/desktop/src/views/CreateView.vue` + `CreateView.test.js`（启动流水线前台进度恢复 + 防重复启动），
背景 PR #1019「auto-background video pipeline runs」曾把「启动流水线」改为自动后台 + toast，造成当前界面无进度展示且连点起重复任务。

方式：CCG 双模型并行审查（`--backend opencode` + `--backend claude`，reviewer 角色，只读固定 diff）。
opencode 后端初因 ROLE_FILE 外部目录权限/命令行超长失败，改为内联压缩 diff（`-U2`）后完成。

## Claude（第一轮）
- Critical：无
- Major #1：`selectPipeline` 未重置 `startingPipeline` → 切换流水线可能残留 busy 标志锁死启动 → 已修复（selectPipeline 内 `this.startingPipeline = false`）
- Major #2：`resetPipelineUiState` 未重置 `startingPipeline` → 取消/后台路径残留 → 已修复（resetPipelineUiState 内 `this.startingPipeline = false`）
- Minor：handleStartPipeline 双层守卫注释（已补充）、测试覆盖 busy 复位与 selectPipeline 清理（已补充）、openRunningPipeline 默认 toast 语义、非编排路径防重（低优先，未改）

## Claude（复审）
- 确认 Major #1/#2 已闭合，新增测试断言覆盖。
- Critical：无
- Warning W1：`startExplainerPipeline`/`startMediaPipeline` 依赖外层 finally 兜底（语义正确；建议性，非阻塞）
- Warning W2：`selectPipeline` 未清 `story2videoRunMeta`（既有行为，影响低，非阻塞）

## OpenCode
- Critical C1：声称 `updateOrchestrationStatus` 将 `pipelineRunStatus.status` 展开为对象导致 UI/测试失效。
  → 判定为误报：`snapshotStatus = statusResult.data.status` 经对象展开后 `pipelineRunStatus.status = snapshotStatus.status` 为字符串
  （`{status:"running"}` 展开即字符串值）；CreateView.test.js 213 用例全绿，`toMatchObject({status:"running"})` 通过。
- Warning W1：提交内容未含两处 `startingPipeline` 重置（当时为未提交工作区状态）→ 已由后续提交补齐同一分支。
- Warning W2：登录门 await 窗口连点可能弹双登录框（startPipeline 内层守卫仍保证不重复启动；Claude 已评估可接受）
- Warning W3：`runOrchestrationInBackground` 现无调用方，保留为后台完成监听（s2vBackgroundTracking）备用入口，注释已注明。

## 处置
- 审查修复已落地：selectPipeline / resetPipelineUiState 清理 `startingPipeline`、handleStartPipeline 注释、测试断言补充。
- 全量桌面 Vitest：458 文件 / 8375 用例通过（1 skip）；eslint 通过；vite build:vue 成功。
- 剩余 W1/W2（Claude）、W2/W3（OpenCode）均为非阻塞建议，记录待后续。

## 环境说明
- 共享主目录 Write Guard 计划任务登记损坏（schtasks/Export-ScheduledTask 报"找不到文件"，预存状态），start-mp-task.ps1 被
  mp-worktree-health 拦截；改用 `scripts/session-init.sh restore-s2v-foreground-progress`（Git for Windows Bash）创建隔离 worktree。
- 审查期间 `--backend claude`（带 `--dangerously-skip-permissions`）在 worktree 自动对工作区做了 commit+push（f9d43737f，
  co-author Claude Sonnet 4.6，内容为审查修复前的实现快照）。已核验无遗留代理进程；保留该提交并把审查修复作为独立提交补齐，
  最终分支与 PR 状态正确。
