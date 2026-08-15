## Why

Story2Video 在 compose 阶段失败时，流水线顶层 run 已进入 failed，但当前 stage 仍保留 running，导致历史详情显示错误的进行中状态。与此同时，创作页历史列表把失败/暂停任务放在全部已完成项目之后，用户无法及时找到刚刚失败、可断点恢复的任务。

## What Changes

- `_finalizeRun` 在 failed/cancelled 终态同步当前 stage 状态并记录 `completedAt`。
- CreateView 历史记录把未完成任务放在已完成项目之前，并在组内按更新时间倒序。
- 补充 failed/cancelled stage 终态与历史排序回归测试。
- 更新 PRD、详细视频 PRD、CHANGELOG、learnings 与质量门禁记录。

## Impact

- 运行快照与历史详情的 stage 状态保持一致。
- 失败/暂停任务在历史列表中可见，并保留断点恢复入口。
- 不改变 IPC 契约、暂停/完成状态机或发布历史入口。

