# cross-process-traceid Specification

定义跨进程 traceId 契约：桌面 PipelineEngine 的 runId 经 StageExecutor → serviceBus → Python Bridge，以 `X-Request-Id` 请求头透传到 Python sidecar，使桌面日志与 Python 日志可按同一 id 关联。

## ADDED Requirements

### Requirement: Bridge 请求携带 X-Request-Id 并记录 traceId
当调用方提供 traceId 时，Python Bridge SHALL 在 HTTP 请求头携带 `X-Request-Id`，并在 Bridge 日志输出 `traceId=`；未提供 traceId 时 SHALL 保持现状（不发头、不增加日志行）。

#### Scenario: 带 traceId 的请求头与日志
- **WHEN** Bridge 业务方法收到 traceId 并发起 `_post`
- **THEN** 请求头含 `X-Request-Id: <traceId>`，Bridge 日志含 `traceId=<traceId>`

#### Scenario: 不带 traceId 的请求无新增行为
- **WHEN** 调用方不传 traceId
- **THEN** 请求头不含 `X-Request-Id`，无新增日志行

### Requirement: 阶段执行器传递 runId 为 traceId
StageExecutor 内置 SPLIT/OPTIMIZE/OPTIMIZE_BATCH 执行器与 story2video 自定义执行器（story2video_optimize、GENERATE_ASSETS、FINALIZE_ASSETS）SHALL 把 `runId` 作为 traceId 传给 serviceBus / alignScenes 调用（经 options.traceId），且 traceId SHALL NOT 进入发送给 Python 的业务 payload。

#### Scenario: 阶段调用携带 traceId
- **WHEN** 执行 SPLIT/OPTIMIZE/OPTIMIZE_BATCH 阶段
- **THEN** serviceBus 收到 `options.traceId === runId`，且业务请求体不含 traceId 字段

### Requirement: serviceBus 与 Bridge 透传 traceId
serviceBus 的 splitText/optimizePrompt/optimizePromptsBatch/optimizeVideoPrompt/optimizeVideoPromptsBatch SHALL 从 options 提取 traceId 透传给对应 Bridge，且不得把 traceId 混入 payload。

#### Scenario: 透传且不污染 payload
- **WHEN** serviceBus 收到含 traceId 的 options
- **THEN** Bridge 收到同一 traceId，业务 payload（optimize 请求对象等）不含 traceId

### Requirement: audio-aligner 消费 X-Request-Id
本仓 Python sidecar `audio-aligner` SHALL 读取 `/align` 请求的 `X-Request-Id` 头，并将其写入 stdlib 日志（成功与异常路径均含 `request_id`）。

#### Scenario: 对齐请求带 request_id
- **WHEN** 客户端以 `X-Request-Id: run_xxx` 调用 `/align`
- **THEN** 对齐日志含 `request_id=run_xxx`；异常路径同样包含

### Requirement: 外部边界
splitter/prompt 等外部 Python sidecar 的 `X-Request-Id` 消费、以及 python-backend server.py / api-publish-engine 的 request-id 白名单对接，SHALL 在合同文档中标注为外部边界（本 change 仅保证桌面侧发出头）。

#### Scenario: 边界文档化
- **WHEN** 审查设计文档与 LOGGING-CONTRACT.md
- **THEN** 外部 sidecar 消费与 server.py 白名单对接被明确标注为边界
