# Multi-Publish 日志合同（LOGGING CONTRACT）

- 版本：v1
- 日期：2026-08-13
- 基线：`origin/main`（日志体系 7 项加固 #658/#659/#664/#678/#684/#689/#696 全部合并后）
- 状态：**契约化生效中**——本文件为单一权威文档；`openspec/specs/logging-contract/spec.md` 为契约化表述（合并归档后路径生效）；`packages/shared-utils/src/__tests__/logging-contract.test.js` 为防漂移门禁。
- 配套代理读版：`.ccg/spec/observability/index.md`

> 本文档记载的是**已落地实现**的合同（非愿景）。修改任一设施行为时，必须同步更新本文档与对应 OpenSpec spec，且通过契约测试。

---

## 1. 适用范围与设施清单

| 设施 | 位置 | 出口 | 用途 |
|------|------|------|------|
| L1 桌面主进程 logger | `apps/desktop/electron/services/logger.js` | console + 文件双写（同源脱敏） | 桌面主进程数十文件引用（近似计数，非门禁）；sidecar stdout/stderr 汇入；renderer 错误经 IPC 汇入 |
| L2 shared-utils logger | `packages/shared-utils/src/logger.js` | 文件（同步）+ console | 无法依赖桌面环境的引用方（format-adapter/rules、cover-processor/presets） |
| L3 api-publish-engine logger | `packages/api-publish-engine/src/logger.js` | console（`DEBUG` env 控制 debug） | api-router 等模块；**生产语义 = 容器 stdout** |
| L4 access/audit log | `src/access-log.js`、`src/audit-log.js` | access：console JSON 行；audit：JSON 文件 | publish 请求访问与业务审计 |
| L5 Python 后端 | `packages/python-backend/src/multi_publish/core/logging_setup.py` | loguru stderr + 全局按日文件 + per-module 文件 | server.py 导入即初始化；发布/鉴权/TTS/视频等数十文件（近似计数，非门禁） |
| 容器 | `packages/api-publish-engine/docker-compose.yml`、`deploy/logto/docker-compose*.yml` | Docker json-file | 业务 API / Logto / PostgreSQL / 监控容器 |
| CI | `.github/workflows/*.yml` | GitHub Actions 日志 + upload-artifact | 构建/测试诊断产物（retention 7-30 天） |

---

## 2. 日志级别（Level 枚举）

统一顺序：**DEBUG < INFO < WARN < ERROR**（数值越小越详细）。

| 设施 | 枚举 | 默认级别 | 依据 |
|------|------|---------|------|
| L1 桌面 | `LOG_LEVELS = { DEBUG:0, INFO:1, WARN:2, ERROR:3 }` | `INFO`（`LOG_LEVEL` env 可覆盖） | `logger.js:19-21` |
| L2 shared-utils | `debug/info/warn/error` | `debug` | `logger.js:16-17` |
| L3 api | ISO + JSON meta；`DEBUG` env 开 debug；**本身不做脱敏**——由调用点/统一错误出口经 `log-redact` 处理 | 默认 info 级 | `src/logger.js:6-20`、`src/log-redact.js` |
| L5 Python | `DEBUG/INFO/WARNING/ERROR` | `INFO`（构造参数可覆盖） | `logging_setup.py:30,73` |

规则：
- 调用方 SHALL 使用语义级别：`debug` 调试细节 / `info` 关键流程 / `warn` 可恢复异常与重试 / `error` 失败与崩溃。
- 桌面主进程 `console.log(prefix, body)` 与文件写入 SHALL 使用**同一个已脱敏 body**（禁止控制台走原样、文件走脱敏的分叉）。

---

## 3. 脱敏清单（Sensitive Data Redaction）

### 3.1 五组模式（3 处 JS 内联实现必须同源）

| # | 模式 | 替换 | 覆盖 |
|---|------|------|------|
| ① | `Bearer\s+[A-Za-z0-9._~+/=-]+` | `Bearer ***` | Authorization Bearer token |
| ② | 带引号键值：`api[_-]?key / access_token / refresh_token / password / secret / authorization / cookie` 后接 `:` 或 `=` | 保留键名、值替换 `***` | JSON 风格 `"apiKey":"x"`、`password: "p"` |
| ③ | 无引号键值：`api[_-]?key / access_token / refresh_token / password / secret / cookie`（**无 authorization**，② 才含）后接 `=` | `key=***` | URL/表单风格 `access_token=xxx&...` |
| ④ | `sk-[A-Za-z0-9_-]{4}` 开头长串 | 保留 `sk-` + 前 4 位，其余替换 `***` | sk- 前缀密钥 |
| ⑤ | `eyJ` 开头三段 base64url JWT | `eyJ***` | 通用 JWT |

同源实现位置（**禁止单边修改**，契约测试断言三处一致）：
- `apps/desktop/electron/services/logger.js:96-102`
- `packages/shared-utils/src/logger.js:22-28`
- `packages/api-publish-engine/src/log-redact.js:12-19`（供 `publish-api-server.js:12,49,270-274` 等使用）

### 3.2 Python 侧

- **源头不打印优先**：loguru 无正则脱敏，敏感字段 SHALL NOT 进入日志文本。正面样板：`douyin.py:124-128` `_upload_auth_log_message` 仅输出 `code / has_data / has_upload_url` 元信息，禁止 token/签名 URL 明文。
- 兜底：sidecar stdout/stderr 汇入 L1 时会再经 L1 redact。

### 3.3 原则

1. **源头不打印敏感字段** 是首要纪律；redact 只是最后防线。
2. 脱敏对象包括 tag/module、message、meta（JSON 化后）、Error stack。

---

## 4. 字段与格式

| 设施 | 格式 |
|------|------|
| L1 桌面 | `[ISO8601] [LEVEL] [module] message` + 可选 meta（JSON ≤8000 字符截断）；单条 message ≤4096 字符，超长截断加 `…`（`logger.js:26,117,168`） |
| L2 shared-utils | `[时间] [LEVEL] [tag] message`；**无 meta、无长度截断**（`logger.js:70-82`） |
| L3 access | 单行 JSON：`ts / method / path / status / durationMs / requestId / ip / userAgent / errorCode`（`access-log.js:25-35`）；请求入口生成 requestId → 响应头 `x-request-id` |
| Bridge→Python | BasePythonBridge 携带 `X-Request-Id` 头（traceId=runId，header 安全 ASCII ≤64 校验）；Bridge 日志 `POST <path> traceId=<id>`（不含 body） | `base-python-bridge.js` `_post` |
| L4 audit | JSON 文件：publish 成败、ownerSubject、platform、title、error code |
| L5 loguru | `time | level | name:function:line | message`；**stderr 仅 WARNING+**（sidecar stderr→warn 语义）、**stdout 仅 DEBUG/INFO（<WARNING）**；全局按日 + per-module 文件（`logging_setup.py:55-88`） |

---

## 5. 保留策略（Retention）

| 设施 | 策略 | 依据 |
|------|------|------|
| L1 桌面 | 按日 `userData/logs/app-YYYY-MM-DD.log`；单文件 500MB 超限滚动 `.1`；按日保留 30 天过期清理（**注意：`.1` 滚动备份不匹配按日清理正则，不受 30 天清理——文档化限制，如需治理列为待增强**）；单条 4096 截断；meta 8000 截断 | `logger.js:24-26,49-65` |
| L2 shared-utils | `app.log` 5MB → `.1`（保留最近一份） | `logger.js:19,64-66` |
| L5 Python | loguru 3MB 轮转 / 15 天保留 / gz 压缩 | `logging_setup.py:83-85` |
| 容器 | json-file `max-size: 50m` × `max-file: 5`（每容器 ≤250MB） | `packages/api-publish-engine/docker-compose.yml`、`deploy/logto/docker-compose.yml`、`docker-compose.monitoring.yml` |
| CI | upload-artifact retention 7-30 天 | `.github/workflows/*.yml` |
| ops-center | systemd journald（宿主保留策略，非本仓库管理） | `ops-center/deploy/ops-center.service` |

规则：
- 日志文件写失败 SHALL NOT 完全静默：L1 行为为 console 先行输出、文件写失败静默回退（**暂无失败计数暴露**，如需计数列为待增强）；其余设施保持现状并记入静默边界。
- 需要更久留痕时，上集中采集（Loki/ELK），不靠无限放大本地保留。

---

## 6. 强制日志点（Must-Log，不得静默）

| 路径 | 记录内容 | 证据 |
|------|---------|------|
| IPC 调用错误 | `[IPC] <label>` + 脱敏消息（统一 try-catch） | `apps/desktop/electron/ipc-handlers/helpers.js:67-101,135` |
| 主进程兜底 | unhandledRejection / uncaughtException | `electron/main.js:56-62`；退出前 `log.flush()` `shutdown.js:118` |
| renderer 错误 | Vue errorHandler / window error / unhandledrejection → IPC `logs:error`（无 electronAPI 回退 console） | `src/utils/report-error.js:6-21`、`src/main.js:19-36` |
| API 5xx | error code + message + stack（经脱敏，各 500 截断） | `publish-api-server.js:270-274` |
| auth 失败（introspection/JWKS/entitlement/生产配置） | 以异常上抛 → API 统一错误路径记录原因码（如 `LOGTO_RUNTIME_CONFIG_INVALID`、introspection 失败原因） | `src/auth/logto-runtime.js`、`src/auth/production-readiness.js`（模块内不自记日志，走集中错误出口） |
| webhook 入站签名校验失败 | `WEBHOOK_SIGNATURE_INVALID` 等异常上抛 → API 统一错误路径记录（hook=logto-webhook） | `src/auth/logto-webhook.js:125-129`、`publish-api-server.js:602` |
| webhook 出站投递失败 | hook code + url + error 摘要（`webhook-fire-rejected` / `webhook-delivery-failed` / `webhook-send-error`） | `webhook-manager.js:68,127,129,185` |
| retry 与熔断 | 重试第 N 次/原因/delay；熔断开启、拒绝、恢复（circuitKey） | `retry-middleware.js:55,70,97` |
| Python 发布授权 | 仅元信息（code/has_data/has_upload_url），禁止 token 明文 | `douyin.py:124-128` |

---

## 7. 禁止项（SHALL NOT）

1. **敏感字段明文落盘/控制台**：token、apiKey、password、secret、authorization、cookie、JWT、refresh_token（3.1 五组模式全覆盖）。
2. **生产代码裸 `console.log` 绕过 logger**（桌面主进程）；调试完的临时日志必须移除。
3. **文件写失败完全静默**（L1 现状：console 先行、文件写失败静默回退，无失败计数暴露——如需计数列为待增强）。
4. **单条日志无上限**：message 超 4096 / meta 超 8000 必须截断标记（L1）；access userAgent ≤256（`access-log.js:33`）、path ≤512（`access-log.js:12`）；renderer→IPC 错误上报 ≤2000（`report-error.js:13`）。
5. **auth 失败吞异常**：必须带原因码进入统一错误出口（§6），不得空 catch。
6. **audit sink 不经 5 组脱敏**：`audit-log.js` 把 error/details 原样落盘，仅依赖源头不打印纪律（如需 redact 门禁列为待增强）。
7. **Bridge traceId 非 header 安全字符不得发送**：`X-Request-Id` 仅接受 `[A-Za-z0-9._:-_]` ≤64 的 ASCII 值（Node http 对非法头字符同步抛错）；CJK 等异常值降级为不发送并 warn。

---

## 8. 静默边界（Documented Silent Zones）

以下区域为**文档化边界**（设计使然或已知限制），排障时先确认是否命中：

| 边界 | 说明 | 处理建议 |
|------|------|---------|
| remotion-composer / story2video-engine 引擎库 | 库内无 logger 注入（静默）；编排层有日志（`story2video-compose-engine.js:527` logger 注入） | 需要时按需注入 logger；已列 P2（C6） |
| pre-Vue 入口脚本失败 | renderer 加载前无法经 IPC 上报 | 主进程 stdout/文件兜底 |
| runSelfCheck 排队被拒 | timeline 只记录开始执行的请求，排队被拒不进 timeline/不计数 | 以模拟器语义 + governor 源码为准（learnings 复盘更新 2） |
| L2 引用方 | 同步写、无 meta、写失败静默 | 已文档化；如需增强走注入式 logger |
| ops-center journald | 宿主日志策略，非仓库管理 | 如需留痕配置 journald 保留 |

---

## 9. 契约验证

- **防漂移测试**：`packages/shared-utils/src/__tests__/logging-contract.test.js`——断言 3 处 JS 脱敏同源、各设施保留/截断常量与本文档一致。
- **OpenSpec**：`openspec/specs/logging-contract/spec.md`（5 项 Requirement，归档后生效）。
- **文档门禁**：CI `check-docs-sync`（代码变更必须带 01-docs/ 变更）。
- **修改流程**：改任何设施行为 → 同步本文档 + 对应设施 spec（desktop-logging / shared-utils-logging / logging-hardening / python-service-logging / http-request-tracing / container-log-rotation）→ 契约测试保持绿。

---

## 10. 证据索引（抽查用）

- L1：`apps/desktop/electron/services/logger.js:19-27,49-65,96-108,162-173,189-200`；测试 `logger.test.js`
- L2：`packages/shared-utils/src/logger.js:16-28,64-66`；测试 `src/__tests__/logger.test.js`
- L3：`packages/api-publish-engine/src/logger.js`、`src/log-redact.js:12-19`、`src/access-log.js:25-35`、`src/audit-log.js`
- L5：`packages/python-backend/src/multi_publish/core/logging_setup.py:30,60-85`、`publishers/douyin.py:124-128`
- 容器：`packages/api-publish-engine/docker-compose.yml`、`deploy/logto/docker-compose.yml`、`deploy/logto/docker-compose.monitoring.yml`
- 强制日志点：`helpers.js:67-101`、`main.js:56-62`、`report-error.js:6-21`、`publish-api-server.js:270-274`、`webhook-manager.js:68`、`retry-middleware.js:55,70,97`
- 审计基线：`01-docs/LOGGING-AUDIT-2026-08-12.md`
