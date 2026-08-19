## 质量节拍审查报告

- **任务**：s2v-pipeline-always-background
- **审查阶段**：Phase 2 Build → Phase 3 Ship 前门禁
- **审查时间**：2026-08-19
- **变更规模**：M / 中风险；renderer 状态机、历史续跑、i18n、PRD/OpenSpec 与回归测试

### 双路审查状态

| 审查路由 | 结果 | 说明 |
|---|---|---|
| antigravity wrapper | 未完成 | wrapper 在 Git Bash 启动时返回 Windows ERROR_PATH_NOT_FOUND，未生成报告 |
| Claude wrapper | 未完成 | 同轮 wrapper 未生成报告；既有环境记录也显示 Claude API/CLI 连接失败 |
| 本地独立审查 | 降级 | 两个 delegated ccg-review 代理在限定等待窗口内未返回，随后关闭；主代理按 file:line 对状态机、测试与 diff 做独立复核 |

外部双模型未成功返回报告，以下结论不冒充“双模型通过”；按质量节拍环境降级规则记录为主代理独立审查。

### 发现摘要

- **CRITICAL**：0
- **MAJOR / WARNING**：0
- **MINOR**：0
- **INFO**：2
  - `apps/desktop/src/views/CreateView.vue:3872` 的自动后台 helper 只接受并校验字符串 `runId`，随后停止轮询、清理 renderer 状态、刷新历史，不调用 `pipelineCancel`；符合运行事实与 UI 语义统一的目标。
  - `apps/desktop/src/views/CreateView.vue:3884` 的暂停检查点路径保留 `paused` 状态并调用 `updateOrchestrationStatus()`；`scene_asset_selection` 仍通过候选素材面板等待用户确认，未被自动后台逻辑吞掉。

### 核验维度

| 维度 | 结论 | 证据 |
|---|---|---|
| 启动状态机 | PASS | 三条编排启动入口均校验 `code=0`、非空字符串 `runId`、`success !== false`；`paused=true` 走检查点，其他未完成结果自动后台 |
| 历史续跑 | PASS | `historyRunId()` 优先使用 `runId`；running/非 paused 恢复留在 history，paused 恢复进入交互面板 |
| 并发与取消 | PASS | 自动后台 helper 与历史 running 续跑不调用 `pipelineCancel`，不删除主进程 run，不释放并发槽位；显式取消路径保留 |
| 轮询竞态 | PASS | `orchestrationStatusRequestId` 与 runId 双重快照守卫丢弃过期响应；停止轮询时递增请求序列 |
| 错误恢复 | PASS | 状态查询失败停止轮询、清理素材选择状态并进入 failed/error；不继续展示 stale checkpoint |
| 测试覆盖 | PASS | CreateView/CreateViewHistory 224 passed；pipeline-engine/resume-orchestration 77 passed |
| 文档与 locale | PASS | PRD、视频创作 PRD、CHANGELOG、learnings、glossary、OpenSpec 已同步；zh/en 成对；CJK 总基线 1485 无新增 |

### 评估结论

- **Completeness**：9/10
- **门禁状态**：通过（外部模型不可用已显式记录）
- **遗留风险**：未执行完整 Electron Windows 打包；本次运行时代码修改集中在 renderer，`pnpm run build:vue` 已通过。提交前不应把本地构建产物纳入 diff。
- **建议下一步**：推送隔离分支，创建 PR，等待 CI；合并后归档 CCG task 并回填远程 SHA。
