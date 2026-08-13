# 审查记录：s2v-pipeline-background-run（2026-08-13）

## 外部独立审查（降级记录）
- antigravity：区域不可用（Eligibility check failed，既有模式）。
- claude：wrapper stdin 挂起 exit 1（已加 CLAUDE_CODE_GIT_BASH_PATH + SDK PATH 仍失败，本环境已知问题）。
- 降级：`codeagent-wrapper --backend codex` 独立审查，产出 1 Critical / 3 Warning / 2 Info。

## 发现与处置
| 级别 | 发现 | 处置 |
|------|------|------|
| 🔴 Critical 1 | updateOrchestrationStatus 无 runId 守卫：detach 清空 runId 后在飞响应仍写回/跳转（僵尸重挂/污染新 run） | 修复：发起时捕获 runId 快照，await 后校验 `orchestrationRunId === runId` 才写回，catch 同守卫；回归测试「在飞轮询过期响应不写回」 |
| 🟠 Warning 2 | detach 无防重入/检查点守卫；检查点以 running 呈现会误转后台卡死 | 修复：方法内重校验 `sceneAssetSelectionActive/needsCheckpoint`；回归测试「检查点等待态不允许转后台」 |
| 🟠 Warning 3 | reset 字段不全 | 核对：needsCheckpoint/sceneAssetAttention/dismissedBgmSkippedNotice/dismissedProviderWarnings/orchestrationResultPath/story2videoRunMeta 全量覆盖（抽取自 cancelPipeline 全量 + 新增 2 字段） |
| 🟠 Warning 4 | 停留创作视图时后台 run 完成无通知 | 记录为已知边界：历史页 5s 轮询已覆盖；创作视图完成通知超出本次需求范围，PRD 文档说明 |
| 🟢 Info 5 | toast 未提示仍占并发名额 | 已更新文案「（仍占用并发名额）」 |
| 🟢 Info 6 | 重置需清 s2vOptionsToastTimer | 核对：showS2VOptionsToast 每次设置新 timer 前 clearTimeout 旧 timer，无残留冲突，不处理 |

## 主代理 6 项自检
- 异常处理：loadHistory 内部 try/catch；updateOrchestrationStatus 竞态守卫；detach 幂等 guard。PASS
- 权限边界：无新 IPC/鉴权面。PASS
- 一致性：resetPipelineUiState 与 cancelPipeline 原逻辑逐项对齐（行为等价 + 新增 2 字段）。PASS
- 边界值：空 runId / null status / 检查点等待态守卫。PASS
- 代码风格：eslint 0 error（1 个既有 warning）。PASS
- 硬编码：用户可见文案走 locales（CJK scan 基线 1531 = 当前 1531）。PASS
