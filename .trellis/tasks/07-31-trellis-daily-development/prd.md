# Trellis 日常开发接入

## Goal

让 Multi-Publish 可以按 Trellis 的方式组织 spec、task 和 workspace，但不破坏现有的 `AGENTS.md`、`.quality-rhythm` 和 `.ccg` 工作流。

## Requirements

- 提供仓库内的 Trellis 入口说明
- 提供 backend / frontend / guides 三类 spec
- 提供一个能作为模板的示例 task
- 明确 Trellis 与现有质量门禁的关系

## Acceptance Criteria

- 读仓库根目录就能知道 Trellis 放在哪里
- 后续任务能够按同一套目录结构继续创建
- 没有引入业务代码变更
- 没有覆盖或简化现有强约束流程
