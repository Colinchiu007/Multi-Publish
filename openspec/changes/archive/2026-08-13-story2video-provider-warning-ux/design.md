# Design: 模型服务异常横幅运行归属 + 关闭按钮

## 背景

`ProviderAnomalyBus`（commit d0a59fc2 引入）以 `Map<providerId, entry>` 保存异常快照，仅内存、重启清空；生产代码从不调用 `clear()`。`pipeline:getRunContext` 无条件附加 `providerAnomalyBus.snapshot()`，导致任一运行都会携带全部历史异常。CHANGELOG 声称「运行结束清空」但从未实现。

## 决策与备选

| 方案 | 说明 | 结论 |
|------|------|------|
| A：运行归属过滤（选定） | 以运行快照 `createdAt` 为时间边界，`snapshotSince(createdAt)` 只下发该运行创建后（含）的异常 | 语义正确、多运行安全、无并发副作用 |
| B：运行起止时全局 `clear()` | run start/end 调用 `providerAnomalyBus.clear()` | 拒绝：多运行并发会误删其他运行警告；运行结束即清空与「结束后仍可查看提示」冲突 |
| C：`report` 携带 runId | 异常条目记录归属 runId | 拒绝：`callAdapter` 调用链无 runId 上下文，侵入面大、收益低 |

实现细节：
- `ProviderAnomalyBus.snapshotSince(sinceIso)`：解析 `sinceIso`；非法/缺失返回全量 `snapshot()`（回退旧行为，不隐藏警告）；否则过滤 `Date.parse(lastAt) >= since`。同一主进程同一时钟，无跨时区问题。
- `pipeline.js`：`providerAnomalyBus.snapshotSince(snapshot.createdAt)`，`createdAt` 缺失（`|| null`）时由 `snapshotSince` 回退全量。
- `CreateView.vue`：新增 `dismissedProviderWarnings` 状态与 `dismissProviderWarnings()`；`providerWarningText` 计算属性在关闭后返回空；`startPipeline()` 与 `cancelPipeline()` 重置状态。样式镜像 `.bgm-skipped-notice-close`。

## 风险与回退

- createdAt 缺失 → 回退全量（行为同现状，只可能多显示、不隐藏）。
- X 关闭状态为组件内存态 → 组件重新挂载后重新评估（与 BGM 提示一致）。
- `providerWarnings` 字段形状与文案不变 → 前端既有测试兼容。
