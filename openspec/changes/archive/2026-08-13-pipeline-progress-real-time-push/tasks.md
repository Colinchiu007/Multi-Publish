## 1. 主进程：轻量快照与事件推送（spec: 阶段进度实时事件推送 / 轻量快照）

- [x]1.1 `getRunSnapshot(runId, { progressOnly })`：progressOnly 时返回 run 状态 + stages（status/startedAt/completedAt/progress/summary）+ run.progress + runId/pipeline，**不含 context**（`pipeline-engine.js`）
- [x]1.2 PipelineEngine 事件桥接：`ipc-handlers/pipeline.js` 注册 PipelineEngine Backlot 事件订阅（stage:start/stage:complete/stage:fail/pipeline:complete/pipeline:fail/checkpoint:pause）→ 构造 progress-only 快照 → 受信主窗口 `webContents.send('pipeline:update', snapshot)`
- [x]1.3 onProgress 落盘后触发推送：`_executeStage` 的 `onProgress` 写 `stage.progress` 后标记 run 待推送（复用 1.2 桥）
- [x]1.4 节流合并：每 run 500ms 窗口合并推送（窗口内最后一次快照；run 终态立即发送）；`_destroyRun`/完成时清理计时器

## 2. preload / renderer API（spec: renderer 订阅与轮询兜底 / 安全约束）

- [x]2.1 preload `onPipelineUpdate(callback)`：`ipcRenderer.on('pipeline:update', ...)` 返回取消函数（`preload/publish.js` + `index.bundle.js` 同步）
- [x]2.2 `src/api/publisher.js` 封装 `onPipelineUpdate`
- [x]2.3 CreateView：`mounted` 订阅 `onPipelineUpdate` → 更新 `orchestrationStages`/`orchestrationContext`（仅进度子集）/`pipelineRunStatus.progress`；收到事件重置 3s 轮询计时；卸载取消订阅
- [x]2.4 事件与轮询竞态缓解：事件只写进度字段，不覆盖完整 context（轮询继续写完整快照）

## 3. 测试与验证

- [x]3.1 契约测试：progressOnly 快照不含 context；含 `stage.progress`/`summary`/状态；完整 `getRunContext` 行为不变
- [x]3.2 推送测试：onProgress → 事件 payload 反映最新进度；500ms 内高频更新合并为一次（假时钟）；run 终态立即发送
- [x]3.3 preload/安全：`onPipelineUpdate` 暴露 + 取消订阅移除监听；access-control/sandbox 双模式；channel 白名单断言
- [x]3.4 UI 测试：CreateView 事件驱动更新阶段清单；轮询兜底（无事件时 3s 拉取轻量快照）；卸载清理监听
- [x]3.5 回归：stage-executor/pipeline-story2video-contract/StageProgress/CreateView 全量 + Vite build + locale CJK + preload 打包验证（sandbox 双模式 + 启动冒烟）
