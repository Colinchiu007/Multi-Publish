## Why

审计缺口 B5 + Claude N4：python-backend 的 uvicorn access log 走标准 logging → stderr，不进 loguru 按日文件；Electron sidecar 捕获 stderr 时把每行请求都标为 WARN（`base-python-bridge.js:120-121` stdout→info / stderr→warn），按级别过滤失真。请求日志无法与桌面侧/API 侧 requestId 关联。

## What Changes

- `packages/python-backend/src/multi_publish/core/logging_setup.py`：新增 stdlib logging → loguru 的 InterceptHandler（uvicorn/fastapi 日志统一进 loguru 按日文件）；新增 stdout INFO sink（访问/请求日志走 stdout，消除 stderr→warn 级别错标），stderr 保留 WARNING+。
- `packages/python-backend/src/server.py`：新增结构化请求日志中间件（method/path/status/duration_ms/request_id），requestId 优先透传合法 `x-request-id` 头否则自生成，响应头回显 `x-request-id`；关闭 uvicorn 默认 access log 避免重复。

## Capabilities

### New Capabilities
- `python-service-logging`: Python 服务日志契约——stdlib 日志接入 loguru 文件、结构化请求日志（含 requestId 透传/回显）、INFO 走 stdout 的级别语义。

### Modified Capabilities
<!-- 无 -->

## Impact

- 代码：`packages/python-backend/src/multi_publish/core/logging_setup.py`、`src/server.py`
- 测试：`tests/test_logging_setup.py`（拦截器）、新增 `tests/test_request_logging.py`（中间件结构化/requestId）
- 无 API/响应语义变更（新增响应头 `x-request-id`，附加字段）
