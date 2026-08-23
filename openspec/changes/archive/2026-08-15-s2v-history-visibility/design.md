## Context

`PipelineEngine._finalizeRun` 是失败、取消和完成终态的共同收口；失败路径此前只写 run 顶层字段。CreateView 的历史数据由项目列表与 pipeline history 合并，原排序把 projects 插入 paused/failed runs 之前。

## Design

1. 在 `_finalizeRun` 的 failed/cancelled 分支中，将 `run.stages[run.currentStage]` 设为对应终态并写入 `completedAt`。完成分支保持由 `_advanceRun` 标记 stage 的现有语义。
2. 在 `CreateView.loadHistory` 中使用安全时间键（`updatedAt || createdAt || 0`），排序为 running、paused/failed、projects、其他 runs；每组按最新时间优先。
3. 失败环节名称继续由现有 failed-stage 优先逻辑计算，避免通过列表位置猜测失败阶段。

## Risks

- 历史项目顺序从接口原始顺序变为时间倒序；这是 PRD 明确的用户可见排序合同。
- 失败/取消 stage 新增 `completedAt`，仅表示阶段已结束，不改变 run 结果或恢复契约。

