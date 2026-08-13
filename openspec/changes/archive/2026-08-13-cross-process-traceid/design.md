## Context

- 桌面侧：`StageExecutor.execute({ runId, ... })` 已有 runId（`stage-executor.js:192`），但内置 SPLIT/OPTIMIZE/OPTIMIZE_BATCH 执行器解构时丢弃（仅 CUSTOM 保留，`:638`）。
- 桥接侧：`BasePythonBridge._post(path, body, timeout)` 只发 Content-Type/Length（`base-python-bridge.js:228-248`），无关联头。
- Python 侧：本仓 `audio-aligner/aligner/api.py` 用 stdlib logging，无 request 日志；`python-backend/server.py` 已有 `x-request-id` 中间件（`server.py:124-159`，白名单 `^[A-Za-z0-9._:-]{1,64}$`，runId 的 `_` 不被采纳）。

## Goals / Non-Goals

**Goals:**
- pipeline runId 贯穿全部执行器（内置 + story2video 自定义：story2video_optimize :1514、GENERATE_ASSETS optimizeVideoPrompt :620/:1855、alignScenes :2184/:2435）→ serviceBus → Bridge → `X-Request-Id` → Python sidecar 日志（R1-R4，Claude 审查 C1-C3）
- audio-aligner 生产日志可见（`logging.basicConfig(INFO)`，成功/失败均含 request_id）（W1）
- 非 pipeline 直调保留透传能力（options.traceId），不强制造 id（R5）

**Non-Goals:**
- 不改 python-backend server.py / api-publish-engine 的 request-id 白名单（runId 与 server.py 路径的对接列为边界/后续）
- 不改外部 sidecar 仓库（smart-sentence-splitter / prompt-engine）
- 不改造 renderer 侧 IPC payload 携带 traceId（pipeline runId 主进程侧自持；renderer 参与为后续项）

## Decisions

**D1: traceId = runId（pipeline 场景），按需透传（非 pipeline 场景）**
PipelineEngine runId 已是跨阶段关联键（正面样板），直接复用，不另造 id；非 pipeline 的 serviceBus 直调（如 IPC「优化提示词」）保留 options.traceId 透传能力，由调用方决定是否传。

**D2: traceId 不进业务 payload**
serviceBus/各 Bridge 从 options 提取 traceId 后传给 `_post`，绝不让 `run_xxx` 混入发送给 Python 的 JSON body（避免污染业务数据与外部 API 契约）。

**D3: 头名统一 `X-Request-Id`**
与 python server.py 中间件、api-publish-engine access log 的既有头名一致（非新造 `X-Trace-Id`），最大化互操作。

**D4: 本仓 Python 消费 = audio-aligner**
splitter/prompt sidecar 是外部仓库，本 change 只保证「发出头」（可测），消费行为记为外部契约边界；audio-aligner 在 `/align` 读取头并写入日志（成功/失败均含 request_id）。

**D5: `_post` 签名向后兼容**
`_post(path, body, timeout, traceId)` 第 4 参可选；既有调用（不传 traceId）行为不变（不发头、不多日志）。

## Risks / Trade-offs

- [外部 sidecar 不消费头] → 记为文档化边界；本仓可验证的只有「头已发出」。
- [runId 含 `_` 与 server.py 白名单不兼容] → 明确边界：本 change 不 thread 到 server.py 路径；后续如需，单独扩展白名单（含契约测试）。
- [日志噪音] → 仅 traceId 存在时才加 Bridge 请求日志行，避免非 pipeline 调用刷屏。

## Migration Plan

- 单 PR；无运行时迁移；回滚 = revert。
