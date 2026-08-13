## Why

排障跨进程关联缺失：桌面 PipelineEngine 已用 `runId` 贯穿阶段日志（正面样板），但 Bridge→Python sidecar 的 HTTP 请求**不带任何关联 id**——audio-aligner 等 Python 侧日志无法与桌面 runId 关联，一次 pipeline 失败要跨桌面日志/Python 日志手工拼时间线。审计 P2 C5 要求「跨进程 traceId（renderer→IPC→Bridge→Python）按 runId/sessionId 贯穿」。

## What Changes

- `BasePythonBridge._post` 支持可选 `traceId`：存在时写 `X-Request-Id` 请求头并在 Bridge 日志输出 `traceId=`，实现桌面↔Python 请求级关联。
- splitter/prompt/aligner 三个 Bridge 业务方法接受 `traceId`（从 options 提取，不进入业务 payload）。
- `service-bus.js` 的 splitText/optimizePrompt/optimizePromptsBatch/optimizeVideoPrompt/optimizeVideoPromptsBatch 透传 `options.traceId`（提取后不进 payload）。
- `stage-executor.js` 内置 SPLIT/OPTIMIZE/OPTIMIZE_BATCH 与 `story2video-stages.js` 自定义执行器（story2video_optimize / GENERATE_ASSETS / FINALIZE_ASSETS）把 `runId` 作为 traceId 传给 serviceBus / `alignScenes`；`subtitle-align-service.js` 透传到 AlignerBridge。
- Python 消费（本仓）：`packages/audio-aligner/aligner/api.py` 读取 `X-Request-Id` 头并写入 stdlib 日志（含异常路径）。

## Capabilities

### New Capabilities
- `cross-process-traceid`: 跨进程 traceId 契约——桌面 runId 经 Bridge 以 `X-Request-Id` 头透传到 Python sidecar 日志，实现 pipeline 全链路关联。

### Modified Capabilities
<!-- 无 -->

## Impact

- 桌面：base-python-bridge / splitter-bridge / prompt-bridge / aligner-bridge / service-bus / stage-executor / story2video-stages / subtitle-align-service + 对应测试
- Python：audio-aligner/aligner/api.py + tests
- 边界（不改）：python-backend server.py 与 api-publish-engine 的 request-id 白名单（`[A-Za-z0-9._:-]`，runId 含 `_` 不被采纳）；外部 sidecar（splitter/prompt 外部仓库）仅收到头，消费为外部契约
