# Design — 阶段进行中信息实时推送与快照裁剪（Phase 3）

## Context

- 现状：renderer 每 3s 轮询 `pipeline:getRunContext` → `getRunSnapshot()` 返回 `{ stages, context }`（完整 context）；`stage.progress`/`stage.summary` 已在 `pipeline-progress-feedback`（PR #756）落地，但只在轮询快照可见，延迟 ≤3s。
- 既有事件推送先例：`ipc-handlers/render.js:17`（`render:progress`）、`bootstrap/phase4-events.js` + `bootstrap.js:80`（`publish:progress`）；preload 订阅先例 `preload/publish.js:58-61`（`ipcRenderer.on` + 返回 `removeListener` 清理）。
- PipelineEngine Backlot 事件：`stage:start/stage:complete/stage:fail/pipeline:complete/pipeline:fail/checkpoint:pause`（`pipeline-engine.js:724-760`，未桥接 renderer）。
- 约束：不改变 `stage.progress` 字段语义与既有 context 契约；`pipeline:getRunContext` 完整路径保留；IPC 安全（sender 校验、channel 白名单、payload 最小化）；preload 变更需 sandbox 双模式验证。

## Goals

- `pipeline:update` 实时事件推送（节流 500ms 合并）+ 轻量快照（progress-only）。
- renderer 事件驱动更新 + 3s 轮询兜底自愈。
- 安全：channel 白名单、payload 最小化、受信窗口、订阅可取消。

## Non-Goals

- 不改 `stage.progress` 契约与执行器（Phase 1/2 已交付）。
- 不做全量快照替代（完整 context 仍按需 `pipeline:getRunContext`）。
- 不做多窗口广播（仅受信主窗口）。

## Decisions

1. **推送桥位置：`ipc-handlers/pipeline.js` 注册订阅**（同文件已有 pipeline invoke 逻辑；桥接 PipelineEngine 事件 → 主窗口 `webContents.send('pipeline:update', lightSnapshot)`）。
   - 替代：bootstrap 阶段挂载 → 放弃：pipeline 逻辑聚拢在 ipc-handlers/pipeline.js 更内聚。
2. **节流：500ms 窗口合并**（每 run 独立计时器；窗口内最后一次快照为准；run 终态事件立即发送不等待）。
   - 替代：逐事件直发 → 放弃：高频 onProgress（逐段 TTS/逐平台）会刷屏 IPC。
3. **轻量快照：`getRunSnapshot(runId, { progressOnly: true })`**（新选项；返回 run 状态 + stages(含 progress/summary/status/时间戳) + run.progress + runId/pipeline；不含 context）。
   - 替代：新 IPC channel → 放弃：复用既有 getRunContext invoke 通道语义，加选项最小侵入。
4. **preload：`onPipelineUpdate(callback)`** 沿用 `onRenderProgress` 模式（`ipcRenderer.on('pipeline:update', (_e, payload) => callback(payload))`，返回取消函数）。
5. **前端：CreateView 订阅 + 轮询兜底**：`mounted` 订阅 `onPipelineUpdate` → 更新 `orchestrationStages`/`orchestrationContext`（合并 payload.progress）/`pipelineRunStatus`；收到事件重置 3s 轮询计时（`updateOrchestrationStatus` 仍保留）；卸载取消订阅。
   - 竞态：事件与轮询可能同时更新同一状态——事件 payload 为轻量进度子集，轮询为完整快照；以轮询完整快照为准合并（事件仅更新进度字段，不覆盖 context）。
6. **安全**：channel 常量白名单（`pipeline:update`）；payload 由 progress-only 快照构造（不含 context/凭据）；窗口获取沿用 `BrowserWindow.getFocusedWindow()`/主窗口引用，仅对受信窗口发送；preload 变更跑 `preload.access-control.test.js` + sandbox 双模式。

## Risks / Trade-offs

- 事件推送增加 IPC 频率（节流后 ≤2 次/秒/run），可接受；节流丢失中间值仅影响展示精度，最终值必达。
- 快照裁剪后事件不含 context：依赖 context 的 UI（素材选择、BGM 提示）继续走 `pipeline:getRunContext`，事件不覆盖这些字段。
- preload/IPC 变更安全敏感：回归 `preload.test.js`/`access-control.test.js`，打包后验证 `window.electronAPI.onPipelineUpdate`。
- 轮询兜底与事件并存：若事件先到、轮询随后覆盖旧值，可能短暂回退——以「轮询只写完整快照、事件只写进度子集 + 不覆盖 context」缓解。
