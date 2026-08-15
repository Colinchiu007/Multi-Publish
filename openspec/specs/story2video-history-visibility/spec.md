# Story2Video History Visibility

## Purpose

确保 Story2Video 流水线在失败、暂停或取消后仍能从历史记录中被用户及时找到，并保持运行终态、当前阶段终态与阶段结束时间一致。

## Requirements

### Requirement: 终态与当前阶段一致
当流水线进入 `failed` 或 `cancelled` 终态时，系统 SHALL 将当前 stage 标记为相同终态并记录阶段结束时间。

#### Scenario: compose 阶段失败
- **WHEN** compose stage 执行失败并进入流水线失败终态
- **THEN** run status 为 `failed`，当前 stage status 为 `failed`，且当前 stage 有 `completedAt`

#### Scenario: 当前阶段取消
- **WHEN** 用户取消运行中的流水线
- **THEN** run status 与当前 stage status 均为 `cancelled`，且当前 stage 有 `completedAt`

### Requirement: 未完成任务优先展示
历史列表 SHALL 在已完成项目之前展示 running、paused 和 failed 任务，并在同一状态组内按 `updatedAt || createdAt` 倒序。

#### Scenario: 失败任务与已完成项目同时存在
- **WHEN** 历史数据包含 failed run、paused run 和 completed projects
- **THEN** failed/paused runs 出现在 completed projects 之前，且每组最新项在前
