## Context

延续 http-request-tracing（PR #664，已合并）：API 侧已有 requestId/结构化 access log。本 change 补齐 python-backend（FastAPI sidecar）侧：uvicorn access 目前走标准 logging → stderr，不进 loguru 文件；Electron `base-python-bridge.js:120-121` 把 stderr 映射为 warn，导致每行请求在桌面日志里都是 WARN。

规格契约见 `openspec/changes/python-logging-hardening/specs/python-service-logging/spec.md`（R1-R4）。

## Goals / Non-Goals

**Goals:**
- uvicorn/fastapi/stdlib 日志 → loguru 按日文件（R1）
- 结构化请求日志（method/path/status/duration_ms/request_id）+ 关 uvicorn 默认 access（R2）
- requestId 透传/回显（R3）
- INFO 请求日志走 stdout，stderr 仅 WARNING+（R4，消除 sidecar 误标）

**Non-Goals:**
- 不改 desktop base-python-bridge（stdout→info 映射已是正确方向，python 侧适配即可）
- 不做跨进程 traceId 传递（P2 项）
- 不引入第三方日志库（loguru 已在用）

## Decisions

**D1: 用 loguru InterceptHandler 桥接 stdlib，而非逐 logger 手动转发**
标准 recipe：`InterceptHandler.emit` 把 stdlib LogRecord 转发到 loguru；在 `install_stdlib_intercept()` 中给 root + uvicorn/fastapi logger 挂 handler（propagate=False）。备选：uvicorn 传 `log_config` 自定义 formatter → 只覆盖 uvicorn，fastapi/其他 stdlib 日志仍漏。

**D2: stdout/stderr 分流 = 级别分流**
loguru stderr sink 提到 `WARNING`，新增 stdout sink 于 `level`（默认 INFO）。请求日志（INFO）→ stdout（sidecar→info ✓）；WARNING/ERROR 仍在 stderr（sidecar→warn ✓）。备选：按 logger name 分流（脆）。注意：console 颜色仅 stderr 保留，stdout 无颜色便于管道。

**D3: 请求日志用 FastAPI http middleware，关闭 uvicorn access_log**
`@app.middleware("http")` 记录 method/path/status/duration_ms/request_id（perf_counter 计时），响应头回显 `x-request-id`；`uvicorn.run(..., access_log=False)` 且 `install_stdlib_intercept()` 里 `logging.getLogger("uvicorn.access").disabled = True` 全局抑制默认 access，避免双写。备选：保留 uvicorn access 并桥接 → 与结构化中间件双写文件。

**D4: requestId 解析复用 API 侧白名单语义**
`re.fullmatch(r"[A-Za-z0-9._:-]{1,64}")`，否则 `uuid.uuid4().hex`。与 api-publish-engine `_resolveRequestId` 一致，保证跨组件关联 ID 格式兼容。

## Risks / Trade-offs

- [stdout 输出含业务 INFO] → 业务 INFO 本就该是 info 级；stderr 仅 WARNING+ 的语义与 Electron 映射一致。
- [disabled uvicorn.access 影响他人] → 结构化中间件是唯一 access 来源，覆盖更全（含 requestId）；如需原始 uvicorn 格式可回退 access_log=True。
- [中间件异常路径] → 异常时 `logger.exception` 记录后 re-raise，保证状态码语义不变。

## Migration Plan

- 单 PR；合并后 sidecar 重启即生效；无配置/数据迁移；回滚 = revert PR。

## Open Questions

无。
