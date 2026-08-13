# Proposal: Story2Video 模型服务异常横幅跨运行残留 + 关闭按钮

## Why

Story2Video「全能创作」启动流水线后，`providerWarnings` 取自主进程 `ProviderAnomalyBus` 的**全局内存快照**（最近 5 条、从不清理）。用户不退出应用重新进入页面并启动新流水线时，旧运行（如 agnes-video 160s）的异常仍被附加到新运行上下文，横幅错误残留；同时横幅没有任何关闭入口，用户无法消除提示。

## What Changes

- `pipeline:getRunContext` 下发的 `providerWarnings` 按**运行归属**过滤：仅包含该运行创建时间（含）之后记录的异常快照。
- `ProviderAnomalyBus` 新增按时间边界过滤的能力（`snapshotSince`），供 IPC 层复用与单测。
- 前端异常横幅增加 **X 关闭按钮**；关闭状态在本次运行内保持，启动新流水线或取消流水线时重置。
- 前端启动新流水线时先清空旧 `providerWarnings` 状态，避免轮询返回前闪现陈旧横幅。

## Capabilities

- **New Capabilities**: `story2video-provider-warning-ux` — 模型服务异常提示按运行归属 + 可关闭横幅。
- **Modified Capabilities**: 无（既有行为未被任何 spec 正式约束，本次以新能力承载契约）。

## Impact

- 主进程：`apps/desktop/electron/services/provider-anomaly.js`（新增过滤方法）、`apps/desktop/electron/ipc-handlers/pipeline.js`（按 createdAt 过滤）。
- 渲染进程：`apps/desktop/src/views/CreateView.vue`（关闭按钮/状态重置）、`apps/desktop/src/styles/create-view.css`（关闭按钮样式）。
- 测试：`provider-anomaly.test.js`、`pipeline.test.js`、`CreateView.test.js`。
- 兼容性：`createdAt` 缺失时回退全量快照，不隐藏既有警告；`providerWarnings` 字段形状不变。
