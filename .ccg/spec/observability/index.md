# Observability 编码规范（日志合同 · 代理精简版）

> 权威细节见 `01-docs/LOGGING-CONTRACT.md`；契约化表述见 `openspec/specs/logging-contract/spec.md`；防漂移门禁 `packages/shared-utils/src/__tests__/logging-contract.test.js`。
> 本文件是写日志相关代码的**最小强制约束**。

## 铁律（MUST）

1. **脱敏 5 组同源**：JS 日志出口必须包含 5 类模式（Bearer / 带引号键值 / 无引号键值 / sk- / eyJ JWT），且与三处内联实现（desktop `services/logger.js`、shared-utils `src/logger.js`、api-publish-engine `src/log-redact.js`）保持同源——**禁止单边修改**。
2. **源头不打印敏感字段**：token/apiKey/password/secret/authorization/cookie/JWT 一律不进日志文本；redact 只是最后防线。Python 侧（loguru 无正则脱敏）尤其依赖此纪律（样板 `douyin.py:124-128`）。
3. **走 logger，不裸 console**：桌面主进程生产代码禁止 `console.log` 绕过 logger；控制台与文件必须用同一已脱敏 body。
4. **级别语义**：`debug` 细节 / `info` 关键流程 / `warn` 可恢复异常与重试 / `error` 失败崩溃。默认级别：桌面 INFO、shared-utils debug、Python INFO。
4b. **跨进程 traceId**：pipeline 场景把 runId 作为 traceId 经 serviceBus → Bridge 以 `X-Request-Id` 头透传到 Python（StageExecutor/story2video 执行器已接线）；traceId 只进头/控制字段，绝不进业务 payload；头值必须 header 安全 ASCII（`[A-Za-z0-9._:-_]` ≤64），非法值降级不发送并 warn。
5. **保留与截断**：桌面 500MB 超限滚动 `.1` + 30 天按日保留（`.1` 备份不受按日清理）+ 单条 4096 / meta 8000 截断；shared-utils 5MB→`.1`；Python loguru 3MB/15 天/gz（stderr 仅 WARNING+、stdout 仅 DEBUG/INFO）；容器 json-file 50m×5。改默认值必须同步合同文档与契约测试。

## 强制日志点（不得静默）

- IPC 错误（统一 try-catch `[IPC]` 前缀）；主进程 unhandledRejection/uncaughtException；renderer 错误经 IPC `logs:error` 汇入。
- API 5xx：error code + message + stack（经脱敏、500 截断）进统一错误出口。
- auth 失败：不吞异常，带原因码（如 `LOGTO_RUNTIME_CONFIG_INVALID`）进入统一错误路径。
- webhook 入站签名校验失败：`WEBHOOK_SIGNATURE_INVALID` 等异常上抛 → API 统一错误路径；出站投递失败：hook code + url + error 摘要。
- retry/熔断：重试第 N 次/原因/delay；熔断开启/拒绝/恢复（circuitKey）。
- 长耗时本地子进程：必须记录关联 ID、启动、成功、失败/超时和产物校验；诊断心跳必须使用部署默认可见的日志级别，停滞才升级 WARN。仅记录 basename、计数、耗时、字节数和已脱敏的摘要，禁止完整路径、命令或业务内容。

## 禁止项（SHALL NOT）

- 敏感字段明文落盘/控制台；裸 console.log 绕过 logger；日志文件写失败完全静默；单条日志无上限；auth 失败空 catch。

## 静默边界（文档化，非缺陷）

- remotion-composer / story2video-engine 引擎库无 logger 注入（编排层有日志）。
- pre-Vue 入口脚本失败无法 IPC 上报（主进程 stdout/文件兜底）。
- runSelfCheck 排队被拒不在 timeline/计数（以模拟器语义 + governor 源码为准）。

## 修改流程

改任何设施行为 → 同步 `01-docs/LOGGING-CONTRACT.md` + 对应设施 spec（desktop-logging / shared-utils-logging / logging-hardening / python-service-logging / http-request-tracing / container-log-rotation）→ 契约测试保持绿。
