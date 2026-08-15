## MODIFIED Requirements

### Requirement: 归档三同步自动检查
系统 SHALL 提供 `scripts/openspec-sync-check.js`：扫描 `.ccg/tasks` 下 task.json 的 `openspecChange` 关联与 `openspec/changes` 状态，并以可自动化的错误码报告三同步漂移。无关联任务不得误报。

- `status=completed` 与 `currentPhase in {completed, archived}` MUST 双向一致；任一方向不一致均为 task 元数据错误。
- `openspecState=superseded` 只能在 `supersededBy` 是非空字符串时用于豁免缺失 change；否则为 task 元数据错误。
- 当已完成 CCG task 关联的 change 仍 active 时，检查 SHALL 返回非零 workflow violation；若该 active change 的 `tasks.md` 缺失、没有 task checkbox，或仍有未完成 checkbox，检查 SHALL 额外报告可追踪性 violation。
- 已完成 task 关联的 change 既不 active 也未归档且未具备有效 supersession 证据时，检查 SHALL 返回 nonzero workflow violation。
- 输入/元数据错误使用 exit `2`；有效数据的 workflow violation 使用 exit `1`；无发现使用 exit `0`。

#### Scenario: task 完成但 change 未归档
- **WHEN** CCG task 的 `status=completed`、`currentPhase=completed` 且关联的 OpenSpec change 仍 active
- **THEN** 检查输出 active-change workflow violation，提示归档该 change

#### Scenario: active change 仍有未完成任务
- **WHEN** 一个已完成 CCG task 关联 active change，且其 `tasks.md` 含有一个或多个 `- [ ]` checkbox
- **THEN** 检查除 active-change violation 外还输出 incomplete-task-tracking violation，并包含未完成数量

#### Scenario: 终态字段双向漂移
- **WHEN** task 的 `status=completed` 与非终态 `currentPhase` 组合，或 task 使用终态 `currentPhase` 但 `status` 不是 `completed`
- **THEN** 检查把该记录报告为 task-state input error 并返回 exit `2`

#### Scenario: superseded 缺少替代证据
- **WHEN** task 的 `openspecState=superseded` 但 `supersededBy` 缺失、非字符串或 trim 后为空
- **THEN** 检查把该记录报告为 supersession-evidence input error，不允许其豁免缺失 change

#### Scenario: 无关联任务
- **WHEN** task.json 无 `openspecChange` 字段
- **THEN** 检查跳过该 task，不产生 change-state violation
