## Context

延续 logging-hardening-p0（PR #659，已合并）：`publish-api-server.js` 已有 `_logWarn/_logError/_logMessage`（脱敏 + stack 截断）与 `AccessLogger`（文本行）。本 change 只做关联与结构化，不改变错误日志/响应的既有行为。

规格契约见 `openspec/changes/http-request-tracing/specs/http-request-tracing/spec.md`（R1-R3）。

## Goals / Non-Goals

**Goals:**
- 每请求 requestId：生成/透传校验/响应头回显/错误日志携带（R1+R3）
- access log 结构化 JSON（ts/method/path/status/durationMs/requestId/ip/userAgent/errorCode）（R2）
- 纯附加：响应新增 `x-request-id` 头，不破坏既有客户端与测试

**Non-Goals:**
- 不做跨进程 traceId（renderer→IPC→Bridge→Python，P2 项）
- 不改桌面 logger / python / ops-center（另立 change）
- 不做 access log 文件落盘/轮转（沿用容器 stdout 语义）

## Decisions

**D1: requestId 生成与透传策略**
`_handle` 入口生成：透传头存在且匹配 `/^[A-Za-z0-9._:-]{1,64}$/` 则采纳，否则 `crypto.randomUUID()`。理由：透传支持网关/客户端侧关联；白名单防日志注入与超长头滥用。备选：一律自生成（失去跨跳关联）→ 拒绝。

**D2: 错误日志关联方式 = `_ctx(req, extra)` 辅助**
新增 `this._ctx(req, extra)` 返回 `{ path, method, requestId }`，把既有 `{ path: url, method }` 调用点改为 `this._ctx(req, {...})`。备选：模块级 current requestId（并发不安全）→ 拒绝；每个调用点手写 requestId（易漏）→ 拒绝。

**D3: errorCode 采集点 = `_json`**
`_json(res, status, data)` 中若 `status>=400 && data.error` 则 `res.req._errorCode = data.error`；res.end 钩子读取后传给 access log。备选：在每个 catch 显式传（漏点多）→ 拒绝。注意：`_json` 已有 gzip 分支，两分支都需写回 `_errorCode`（统一在 `_json` 开头处理，早于分支）。

**D4: AccessLogger 结构化**
`log(req, res, startTime, info)`：info = `{ requestId, path, errorCode }`；输出 `JSON.stringify({ ts, method, path, status, durationMs, requestId, ip, userAgent, errorCode })`；保留 `writeFn`/`enabled` 选项。ip 取 `req.socket.remoteAddress`，ua 取 `req.headers["user-agent"]`，path 取 path 部分（不含 query，避免 URL 参数入日志）。备选：继续文本行（无法被采集）→ 拒绝。

## Risks / Trade-offs

- [JSON 转义/超长行] → path 截断 512、ua 截断 256；writeFn 失败沿用静默（现状）。
- [透传头伪造] → 仅作关联 ID 不用于鉴权；长度/字符白名单。
- [响应头附加影响既有测试] → 现有测试断言响应体/状态码不受影响；新增断言仅检查头存在。

## Migration Plan

- 单 PR；合并后无配置/数据迁移；回滚 = revert PR。

## Open Questions

无。
