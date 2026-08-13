# Analysis — 双模型后端不可用降级（2026-08-13）

CCG 要求 M+ 复杂度双模型并行分析。本次探测延续此前结论（antigravity 地区不可用、claude 超时），按「机制硬化规则 / 子代理降级」由主代理基于代码实测编写规划：

- 既有事件推送先例：`ipc-handlers/render.js:17`（render:progress）、`bootstrap/phase4-events.js`（publish:progress）、`bootstrap.js:80`
- preload 订阅先例：`preload/publish.js:58-61`（ipcRenderer.on + 返回 removeListener 清理）
- pipeline IPC：`ipc-handlers/pipeline.js`（ipcMain.handle + withSenderCheck）
- 现状轮询：`CreateView.vue` `updateOrchestrationStatus` 每 3s 调 `pipelineGetRunContext`（pipeline-engine `getRunSnapshot` 全量返回 `{ stages, context }`）
- 规划依据：PRD 7.1.9.3（Phase 3）、`01-docs/PLAN-VIDEO-PIPELINE-PROGRESS-FEEDBACK-2026-08-13.md` §五 Phase 3
