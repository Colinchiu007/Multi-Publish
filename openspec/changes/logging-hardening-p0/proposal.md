## Why

2026-08-12 全仓日志体系审计（PR #658，`01-docs/LOGGING-AUDIT-2026-08-12.md`）发现 4 个 Critical 缺口：抖音上传授权 token 明文落盘、api-publish-engine HTTP 服务 5xx 错误路径零日志、auth/webhook 安全路径完全静默、重试/熔断事件零日志。当前日志不足以支撑生产排障与安全审计，且存在凭据泄漏风险，需先行修复。

## What Changes

- 修复 `packages/python-backend/src/multi_publish/publishers/douyin.py:445`：上传授权日志不再输出 token/签名 URL 明文，仅记录脱敏元信息。
- `packages/api-publish-engine/src/publish-api-server.js`：所有 catch 分支在返回错误响应前记录错误日志（error code + message + stack，经脱敏）；消除 `:925`、`:955` 空 catch 吞错。
- `packages/api-publish-engine/src/auth/*` 与 `src/webhook-manager.js`：鉴权/JWKS/introspection/entitlement/webhook 签名与投递失败记录安全日志（不记 token 原文）。
- `packages/api-publish-engine/src/retry-middleware.js`：重试第 N 次、熔断 open/half-open/close 事件记录日志（支持注入 logger）。
- 为上述行为补回归测试（脱敏断言、错误路径日志断言、熔断事件断言）。

## Capabilities

### New Capabilities
- `logging-hardening`: 日志体系加固契约——敏感信息脱敏、错误路径必记录、鉴权/安全事件必记录、重试/熔断可观测。

### Modified Capabilities
<!-- 无：现有 openspec/specs 无 logging 能力规格被修改 -->

## Impact

- 代码：`packages/python-backend/src/multi_publish/publishers/douyin.py`；`packages/api-publish-engine/src/publish-api-server.js`、`src/retry-middleware.js`、`src/webhook-manager.js`、`src/auth/*`
- 测试：python-backend pytest、api-publish-engine node 测试（server/retry/webhook/auth）
- 无 API/依赖/配置变更；日志行为为纯增量（仅新增输出，不改变响应）
