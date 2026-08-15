## Context

PR #839 已在 compose 引擎完成每块结束后的进度上报，`StageExecutor` 也会把合法非空 message 保存在 `context.compose_progress`。当前两个 renderer 兼容分支仍只根据 phase/percent 重建文案，因此最后一段数据链断裂。

## Goals / Non-Goals

**Goals:**

- 让按块 message 在 StageProgress 与 CreateView 兼容路径中可见。
- 保持统一 stage progress、完成摘要和历史快照的既有优先级。
- 对空白/非法 message 安全回退。

**Non-Goals:**

- 不修改 compose 引擎、FFmpeg、转场、分块大小或百分比算法。
- 不承诺降低实际合成时间。
- 不把 legacy compose progress 重构为新的跨进程协议。

## Decisions

1. **在两个 renderer 兼容分支中消费 message。** `StageProgress.vue` 是当前模板的实际展示组件；`CreateView.vue` 保留同名兼容方法，二者维持同一优先级以免未来调用路径分叉。备选方案是只改 StageProgress，但会留下重复逻辑行为不一致。
2. **仅接受 trimmed 后非空字符串。** 合法值按原文纯文本返回；空白、非字符串继续走 phase/percent 本地化回退。备选方案是仅判断 truthy，但空白字符串会导致空详情。
3. **中文保留按块 message，英文使用成对 locale。** 新增 `stageProgress.composeConcat` zh/en 键；中文合法 message 保留完整 k/N，英文与历史快照使用百分比本地化回退。备选方案是正则解析中文 message 提取 k/N，但会让英文协议耦合中文格式；结构化 chunkDone/chunkTotal 则需要另行扩展引擎契约。
4. **单元 + 父组件集成双层保护。** 子组件测试锁定优先级和空白回退，CreateView 测试锁定 context 透传与实际 DOM。

## Risks / Trade-offs

- [Risk] 当前引擎 message 为中文，英文界面无法直接显示 k/N → 英文使用 locale 百分比文案；如需英文 k/N，后续以结构化 chunkDone/chunkTotal 独立变更完成。
- [Risk] CreateView 与 StageProgress 存在重复详情逻辑 → 两处同改并用集成测试锁定；不在本 Bug 中扩大为重构。
- [Risk] message 未来承载外部内容 → 仅使用 Vue 文本插值，且合同限定系统内部生成。

## Migration Plan

无需数据迁移。发布后新运行按块展示 message；历史快照无 message 时继续使用旧回退。回滚只需撤销 renderer 优先级变更，主进程上报可继续保留。
