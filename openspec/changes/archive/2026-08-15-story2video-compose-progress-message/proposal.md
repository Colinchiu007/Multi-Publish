## Why

长列表视频在 concat 分块合成阶段可能持续数分钟，但 renderer 只显示取整后的 87%～89%，丢弃引擎已上报的“分块 k/N”消息，用户仍会误判任务卡死。引擎侧按块上报已由 PR #839 交付，本变更补齐最后一段前端展示链路。

## What Changes

- 在 Story2Video compose 运行态优先展示合法非空的 `context.compose_progress.message`。
- 保留 `stage.summary`、`stage.progress.message` 的既有优先级，并保留历史快照的 phase/percent 本地化回退。
- 为 StageProgress 单元层和 CreateView 集成层补充按块消息与空白消息回退测试。
- 同步 PRD、性能分析报告和进度反馈计划，明确该变更改善“假卡死”观感但不缩短实际编码耗时。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `story2video-compose-progress`: compose legacy context 的运行中详情展示新增 concat message、本地化与历史快照回退合同。

## Impact

- Renderer：`CreateView.vue`、`StageProgress.vue`。
- 测试：对应 Vue 单元/集成测试。
- 文档：Story2Video PRD、concat 性能分析、流水线进度反馈计划。
- 无 API breaking change、无依赖变更、无 FFmpeg 或流水线执行语义变更。
