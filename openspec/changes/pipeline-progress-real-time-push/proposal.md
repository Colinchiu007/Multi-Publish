## Why

阶段进行中信息目前依赖 renderer 每 3s 轮询 `pipeline:getRunContext` 全量快照（`getRunSnapshot` 返回 `{ stages, context }`，context 含完整阶段输出），进度更新延迟 ≤3s 且轮询载荷包含大量非进度数据。同一 run 的 `stage.progress` 变化（publish 逐平台、finalize_assets 逐段 TTS、compose 逐片段等）在两次轮询之间用户看不到即时反馈。

## What Changes

- **主进程实时事件推送**：PipelineEngine 阶段事件（stage:start / stage:complete / stage:fail / checkpoint:pause / pipeline:complete / pipeline:fail）+ 阶段进度更新（onProgress 落盘后）桥接到 renderer：`win.webContents.send('pipeline:update', snapshot)`；进度更新事件按 500ms 窗口合并（防抖），避免高频执行器循环刷屏。
- **快照裁剪（轻量快照）**：`getRunSnapshot` 增加 `progressOnly` 选项（或新 `getRunProgressSnapshot`），事件与轮询载荷只含阶段状态 + `stage.progress`/`summary` + run 级 `progress`，不含完整 context；完整 context 仍按需经既有 `pipeline:getRunContext` 获取（如素材选择面板）。
- **preload 订阅 API**：新增 `onPipelineUpdate(callback)`（`ipcRenderer.on('pipeline:update')`，返回取消订阅函数），沿用 `onRenderProgress` 的 removeListener 清理模式。
- **前端事件驱动 + 轮询兜底**：CreateView 订阅 `onPipelineUpdate` 更新 `orchestrationStages` / `orchestrationContext` / `pipelineRunStatus.progress`；既有 3s 轮询保留为兜底（事件丢失/窗口重载后自愈），事件到达时重置轮询计时。
- **安全与边界**：事件 channel 白名单（仅 `pipeline:update`）；payload 只含进度/状态数据（不携带用户文件路径外的敏感字段、不含 context 完整输出）；仅向受信主窗口发送（沿用现有窗口获取逻辑）；preload 修改后验证 sandbox true/false 双模式 `window.electronAPI.onPipelineUpdate` 可用。

## Capabilities

### New Capabilities
- `pipeline-progress-push`: 流水线阶段进行中信息的实时事件推送（`pipeline:update`）与轻量快照裁剪——主进程事件桥接 + 节流合并、`getRunSnapshot` progress-only 模式、preload `onPipelineUpdate` 订阅（可取消）、renderer 事件驱动更新 + 轮询兜底、channel/payload 安全约束。

### Modified Capabilities
- `pipeline-progress-feedback`: `stage.progress`/`stage.summary` 契约不变，本次增加「事件推送」这一传输路径（Delta 由本 change 承载；原 spec 保留）。

## Impact

- `apps/desktop/electron/services/pipeline-engine.js`：事件发射点（stage 状态变化 + onProgress 落盘）接入推送桥；`getRunSnapshot` 支持 progress-only。
- `apps/desktop/electron/ipc-handlers/pipeline.js` 或 `bootstrap`：订阅 PipelineEngine 事件 → `webContents.send('pipeline:update', ...)` + 节流。
- `apps/desktop/electron/preload/publish.js` + `index.bundle.js`：`onPipelineUpdate` API。
- `apps/desktop/src/api/publisher.js`：`onPipelineUpdate` 封装。
- `apps/desktop/src/views/CreateView.vue`：事件订阅 + 轮询兜底（重置计时）。
- 测试：pipeline-engine 事件→snapshot 契约、preload access-control、CreateView 事件更新、节流合并、快照裁剪载荷断言。
