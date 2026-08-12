## Why

P0 日志加固（PR #659，logging-hardening-p0）已补齐错误路径日志，但审计缺口 B4 仍在：access log 仅 `method url status duration` 文本行，无 requestId/ip/ua/errorCode，且全仓无自生成请求级 ID——生产排障无法把一次请求的错误日志、access 记录与用户反馈关联起来。

## What Changes

- `publish-api-server.js`：每个请求生成 requestId（优先透传合法 `x-request-id` 头，否则自生成 UUID），响应头回显 `x-request-id`；`_logWarn/_logError` 的上下文自动携带 requestId。
- `access-log.js`：升级为结构化 JSON（ts/method/path/status/durationMs/requestId/ip/userAgent/errorCode），errorCode 来自错误响应的 error 码。
- 保持向后兼容：`enabled`/`writeFn` 选项不变，未传新参数时字段为 null/缺省。

## Capabilities

### New Capabilities
- `http-request-tracing`: API 发布服务器请求级关联与结构化访问日志契约——requestId 生成/回显、错误日志关联、access log JSON 结构。

### Modified Capabilities
<!-- 无 -->

## Impact

- 代码：`packages/api-publish-engine/src/publish-api-server.js`、`src/access-log.js`
- 测试：`test/access-log.test.js`、`test/logging-hardening.test.js`（或新增 request-tracing 用例）
- 无 API 语义/状态码变更；响应新增 `x-request-id` 头（附加，不破坏既有客户端）
