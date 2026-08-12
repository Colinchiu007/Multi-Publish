## Context

审计报告（PR #658）确认的 4 个 Critical 缺口集中在两处代码域：
- `packages/python-backend/`：loguru 三 sink（全局文件 / per-module 文件 / stderr→桌面日志），`douyin.py:445` 把上传授权 `data` 字典（含 token/签名 URL）前 200 字符明文落盘。
- `packages/api-publish-engine/`：`logger.js` 为 console-only 且无脱敏；`publish-api-server.js` 各 catch 仅写 JSON 响应不记日志（含 `:925,:955` 空 catch）；`auth/*` 10 文件与 `webhook-manager.js` 零日志；`retry-middleware.js` 重试/熔断零日志。

规格契约见 `openspec/changes/logging-hardening-p0/specs/logging-hardening/spec.md`（R1-R4）。

## Goals / Non-Goals

**Goals:**
- 消除已知敏感信息明文落盘（R1）
- HTTP 服务错误路径、鉴权/安全事件、重试/熔断全部可观测（R2-R4）
- 纯增量日志：不改变任何 API 响应语义、状态码或请求行为
- 每项行为有回归测试

**Non-Goals:**
- 不引入第三方日志库（winston/pino/loguru 已用于 Python；JS 保持零依赖）
- 不做 access log 结构化 / requestId / traceId（P1 项，另立 change）
- 不改 desktop logger 的 console 脱敏与保留策略（P1 项）
- 不统一 5 套 logger（P1 项）

## Decisions

**D1: Python 脱敏 = 不输出敏感字段（而非正则清洗）**
`douyin.py:445` 改为只记录非敏感元信息（`code==0`、可选 `expires_in` 键存在性），不 `json.dumps(data)`。备选：对 `upload_token` 做正则脱敏 → 字段结构未知、易漏；拒绝。
风险：丢失排查细节 → 保留键名/状态码作为替代信息。

**D2: api-publish-engine 新增 `src/log-redact.js` 脱敏辅助（复用 desktop 正则思路）**
提供 `redactText(str)`（Bearer/apiKey/authorization/sk-/cookie/refresh_token/access_token 等模式）。备选：直接照抄 desktop logger 正则到各处 → 重复；引入第三方 redact 库 → 依赖面扩大。选轻量单文件 + 单测。
风险：正则不全 → 测试覆盖已知模式 + 文档注明是兜底，源头仍需"不打印敏感字段"。

**D3: 服务端错误日志统一经 `this._logError(code, err, context)` 辅助**
在 `publish-api-server.js` 增加私有方法：`log.error('PublishApiServer', code, { message, stack(截断500), context })`，所有 catch 分支（含 925/955 空 catch）在 `_json` 响应前后调用。备选：逐处手写 → 级别/格式不一致。风险：stack 序列化开销 → 仅 error 级、截断。

**D4: auth/webhook 采用「调用方记录」模式**
不在 `auth/*` 纯函数内部 console，而在 `publish-api-server.js` 的 `_checkAuth`/webhook handler/entitlement 检查点记录失败原因码与安全上下文（hook id、platform、key id 前 4 位、原因码），不记 token 原文。备选：auth 函数内直接日志 → 纯函数污染、难注入测试。风险：可能漏点 → 用 grep 断言 auth 失败分支均可达日志（测试覆盖）。

**D5: retry-middleware 支持 `opts.logger` 注入**
`withRetry` 增加 `opts.logger`（默认 `{warn(){},info(){}}` no-op），记录：重试第 N 次（attempt、原因、退避 delay）、熔断 open/half-open/close（circuitKey）。备选：模块级单例 → 测试隔离差、跨请求串扰。

## Risks / Trade-offs

- [日志量增加] → 仅 warn/error 级、截断 stack、成功路径不新增。
- [脱敏正则遗漏新字段] → R1 测试断言已知敏感模式 + 文档注明"源头不打印"优先。
- [auth 日志引入性能开销（introspection 高频失败）] → 鉴权失败仅 warn 级、不含请求体。
- [行为回归] → 纯增量日志，回退策略 = revert 提交；测试覆盖响应语义不变（现有 server 测试全量保留）。

## Migration Plan

- 单 PR（`codex/logging-p0-fixes`）承载全部 4 项修复与测试；合并后无需数据迁移/配置变更。
- 回滚：revert PR 即可，日志恢复原状，不影响业务。

## Open Questions

无（可安全延后的仅 P1/P2 项，已在 Non-Goals 明确）。
