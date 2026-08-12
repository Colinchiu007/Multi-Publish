# Multi-Publish 日志体系评估报告

- 日期：2026-08-12
- 基线：`origin/main` @ `17a75dcc`（Merge pull request #648）
- 分支：`codex/logging-system-audit`
- 任务：`.ccg/tasks/logging-system-audit`
- 方式：全仓只读审计（Electron 主进程 / Renderer / Node packages / Python / Infra-CI），证据均为 `file:line`，未修改任何运行时代码

---

## 1. 结论摘要

**总体评价：日志体系"地基已有、深度不足"——覆盖面广但不成体系、不一致，关键路径存在静默区和敏感信息泄漏点，尚不足以支撑生产级排障与安全审计。**

- 桌面主进程是当前唯一"完整闭环"的日志设施：统一 logger、按日文件、错误汇入、设置页可视、进程级兜底、文件侧脱敏。
- 但全仓存在 **5 套互不兼容的 logger**（其中 1 套疑似死代码）、**无结构化/JSON、无 requestId 关联、HTTP/auth/重试熔断路径大面积静默**、**1 处明确的敏感 token 明文落盘**、以及 **容器侧无日志轮转/保留策略**。
- 结论：**不够完善**。优先级最高的动作是修敏感泄漏 + 给 HTTP/auth 错误路径补日志，其次是收敛 logger 与结构化，最后是保留策略与跨进程追踪。

---

## 2. 现状盘点：5 套日志设施

| # | 设施 | 位置 | 能力 | 覆盖 |
|---|------|------|------|------|
| L1 | 桌面主进程 logger | `apps/desktop/electron/services/logger.js` | console+文件双写；按日 `userData/logs/app-YYYY-MM-DD.log`；级别 `LOG_LEVEL`（默认 INFO）；文件侧脱敏；异步写队列 + `flush()`；单文件 >500MB 删除；`clearLogs()/getLogsInfo()` 供设置页 | 约 90 个主进程文件引用；renderer 错误经 IPC `logs:error` 汇入；sidecar stdout/stderr 经 `base-python-bridge.js:120-121` 汇入 |
| L2 | shared-utils logger | `packages/shared-utils/src/logger.js` | `userData/logs/app.log`（非按日）；同步写；5MB 滚动到 `.1`；无脱敏；无 meta | 被 `src/format-adapter/rules.js:1`、`src/cover-processor/presets.js:1` 引用（平台配置加载失败时同步写 `userData/logs/app.log`，无脱敏）；注释声称与 desktop 行为一致，实际不同（且注释指向不存在的 `apps/desktop/electron/logger.js`） |
| L3 | api-publish-engine logger | `packages/api-publish-engine/src/logger.js` | console-only；ISO + JSON meta；`DEBUG` env 控制 debug | api-router 等少数模块 |
| L4 | api-publish-engine access/audit | `src/access-log.js`、`src/audit-log.js` | access：console 文本行 `method url status duration`；audit：JSON 文件（publish 成败、ownerSubject、platform、title、error code） | publish 请求与业务审计 |
| L5 | Python 后端 | `packages/python-backend/src/multi_publish/core/logging_setup.py` | loguru：stderr + 全局按日文件 + per-module 文件（douyin/wechat/bilibili/server/rpa_engine/publisher_manager）；3MB 轮转 / 15 天保留 / gz 压缩 | server.py 导入即初始化（`server.py:124`）；发布、鉴权、TTS、视频等 29 文件 |

辅助设施：

- **Renderer 错误上报**：`apps/desktop/src/utils/report-error.js`（IPC `logError` → 主进程 ERROR 级落盘，无 electronAPI 时回退 console）；`src/main.js` 注册 Vue `errorHandler` + `window error` + `unhandledrejection`。
- **主进程兜底**：`apps/desktop/electron/main.js:56-62` 注册 `unhandledRejection` / `uncaughtException` 日志；`shutdown.js:118` 退出前 `log.flush()`。
- **IPC 统一错误日志**：`apps/desktop/electron/ipc-handlers/helpers.js:67-101` 统一 try-catch + `log.error('[IPC] …')`；`:135` 记录未授权调用来源。
- **OpsCenter**：`ops-center/backend/main.py:27` `logging.basicConfig(INFO)`；登录成败（username+ip，`auth_service.py:135-147`）、快照/恢复、配置写出均有日志；systemd 部署（`ops-center/deploy/ops-center.service`）走 journald。

---

## 3. 做得好的地方（建议保留）

1. **桌面主进程日志闭环完整**：统一 logger、按日文件、`getLogsInfo`/`clearLogs` 设置页（`src/components/LogsSettings.vue:104,121`）、IPC 通道 `logs:info/clear/error`（`electron/ipc-handlers/logs.js`）及对应测试（`logs.test.js`）。
2. **文件侧脱敏已有基础**：`services/logger.js:68-73` 覆盖 Bearer/apiKey/authorization/sk-，且有测试（`logger.test.js:51`）。
3. **PipelineEngine 阶段级日志是内容标杆**：`run.id + pipeline + stage + duration_ms + error(slice 500)`（`pipeline-engine.js:1694,1714,1735`）。
4. **进程级/渲染级错误兜底齐全**：unhandledRejection、uncaughtException、Vue errorHandler、window error、unhandledrejection 全覆盖。
5. **CI 诊断产物有保留策略**：`upload-artifact` retention 7-30 天（`visual-test.yml:101`、`quality-gate.yml:399`、`build.yml:116` 等）。
6. **JS 侧零第三方日志库**（package.json 0 命中 winston/pino/electron-log），自研轻量；Python 侧使用 loguru（`requirements-runtime.txt:5`）。

---

## 4. 缺口与风险（分级）

### A. 敏感信息 / 安全（最高优先）

| ID | 级别 | 位置 | 问题 | 影响 |
|----|------|------|------|------|
| A1 | **High** | `packages/python-backend/src/multi_publish/publishers/douyin.py:445` | `logger.info(f"上传授权成功: {json.dumps(upload_token, …)[:200]}")` 将抖音**上传授权 token** 明文写入日志 | 该行经 loguru 三个 sink 落盘（全局按日文件 + per-module `publish_douyin_*.log` + stderr→桌面日志），保留 15 天；泄密后可用 token 冒用上传通道 |
| A2 | **Med** | `apps/desktop/electron/services/logger.js:142-143` | 控制台输出使用**原始** module/message/meta（未脱敏），只有文件侧 `body` 走 `redact()` | 开发/CI 捕获 stdout 时敏感信息外泄；与"日志脱敏"的用户认知不符 |
| A3 | **Med** | `packages/api-publish-engine/src/logger.js`、`src/access-log.js` | 无任何脱敏；access log 记录完整 `req.url` | URL/query/meta 中若含凭据会原文落盘 |
| A4 | **Low-Med** | `services/logger.js:68-73` | 脱敏正则仅 4 类（Bearer/apiKey/authorization/sk-）；**Cookie、JWT（非 sk- 前缀）、refresh_token、password 字段不在覆盖内** | 后续调用方一旦拼入即泄漏，无兜底 |

### B. 静默关键路径（排障不可诊断）

| ID | 级别 | 位置 | 问题 |
|----|------|------|------|
| B1 | **High** | `packages/api-publish-engine/src/publish-api-server.js` 全部 catch（535-538 / 583-586 / 639-642 / 719-721 / 934-935 / 964-965 / 1062-1063；另有 925、955 为 `catch(e) { /* empty */ }` 完全吞错） | 所有错误仅转 JSON 响应，**从不记录错误详情/堆栈**；生产 5xx 无日志可查（publish 路径有 audit-log error code，其余全盲） |
| B2 | **High** | `packages/api-publish-engine/src/auth/*`（10 文件，0 处 console/logger）+ `webhook-manager.js` | OIDC introspection / JWKS / entitlement / webhook 签名校验失败**全部静默**（`_checkAuth` 失败路径 0 日志，爆破不可观测；`webhook-manager.js:156` req error 空处理、`:165-167` catch 直接 return false）——安全事件无法追溯 |
| B3 | **Med** | `packages/api-publish-engine/src/retry-middleware.js` | 重试次数、熔断开启（`CIRCUIT_OPEN`）**无任何日志**；重试风暴/熔断不可观测 |
| B4 | **Med** | `packages/api-publish-engine/src/access-log.js:11` | access log 仅 `method url status duration`；**无 requestId、remote IP、user-agent、JSON、错误码**；且全仓无**自生成**请求级 id（python 层仅透传上游 provider 的 `x-request-id`：`_http_client.py:204,221`） |
| B5 | **Med** | `packages/python-backend/src/server.py:654` | uvicorn access log 走标准 logging → stderr（Electron stderr 捕获或 journald），**不进 loguru 按日文件**（loguru 不桥接标准 logging） |
| B6 | **Low-Med** | `ops-center/backend/main.py:27,110` | 仅 basicConfig；无请求中间件/requestId/统一 access 格式；依赖 uvicorn 默认 access log |

### C. 基础设施与一致性

| ID | 级别 | 问题 |
|----|------|------|
| C1 | **Med** | 5 套 logger 并存、能力不一致；`packages/shared-utils/src/logger.js` 仍被 `format-adapter/rules.js`、`cover-processor/presets.js` 引用（同步写、无脱敏、注释指向不存在的路径），与 desktop logger 行为不一致 |
| C2 | **Med** | 全仓均为文本行日志，**无 JSON/结构化**、无统一 level 枚举（L1 大写 DEBUG/INFO vs L2 小写 debug/info） |
| C3 | **Med** | 保留策略不完整：L1 按日文件**无旧文件自动清理**（仅手动 clear + 单文件 500MB 删除）；L2 仅 1 个 `.1` 备份；容器（publish-api/logto/postgres）默认 json-file **无 rotation**；python 3MB/15 天较合理 |
| C4 | **Low** | L1 `services/logger.js:134-145` 仅 meta JSON cap 8000，message 不截断，超长行可能刷爆文件 |
| C5 | **Low** | 无统一 traceId 串联 IPC/Bridge/Python 任务（PipelineEngine 有 `run.id` 是正面例子） |
| C6 | **Low** | `packages/story2video-engine`（引擎库）与 `packages/remotion-composer`（渲染组件）无自建日志；编排层 `services/story2video-compose-engine.js:525` 注入 desktop logger 有日志，remotion 子进程流由 `render-engine.js` 捕获——边界未文档化 |

---

### 4.4 双模型审查补充发现（Claude 独立审查 2026-08-12）

> antigravity 因账户区域不可用失败（review-anti.out："not eligible for Antigravity... not currently available in your location"），按降级规则未盲等；Claude 审查完成（review-claude.out，Session c3ad4d35）。Claude 确认核心缺口证据准确，并更正 4 处事实（已并入上文 A1/B4/C1/C6 与正面清单），另补充以下发现：

| ID | 级别 | 位置 | 发现 |
|----|------|------|------|
| N1 | **Med** | `packages/api-publish-engine/src/audit-log.js:25-32` | 每次 `log()` 同步 `JSON.stringify` 整个 entries 数组落盘（O(n²)），无条数上限/保留期，启动 `_load` 读全文件；发布路径每发一条写一次。建议追加式 append + 上限截断 |
| N2 | **Med** | `packages/api-publish-engine/src/api-key-manager.js`（0 日志）、`publish-api-server.js:672-685` | API key 创建/撤销与登录失败**零审计**；`_checkAuth` 失败路径 0 日志 → 爆破/误用不可观测。建议 key 生命周期 + auth 失败记 audit 级日志 |
| N3 | **Med** | `apps/desktop/electron/services/logger.js:59-61,121-124` | 单文件达 500MB 上限时**直接删除整个当日文件**（非轮转），繁忙日一次性丢光全天日志——数据丢失风险。建议改 rename 滚动 + 启动时按保留 N 天清理旧文件 |
| N4 | **Med** | `apps/desktop/electron/services/base-python-bridge.js:120-121` | sidecar stdout→info / stderr→warn；loguru 的 WARNING/ERROR 与 uvicorn access 全混在 stderr，导致桌面日志里每行请求都是 WARN，**按级别过滤失真**。建议按行内容识别或 python 侧明确分级输出 |
| N5 | **Low** | `packages/api-publish-engine/src/retry-middleware.js:2-8` | 注释为乱码 `?`（提交时 GBK→UTF-8 编码损坏），误导后续维护，建议重写 |
| N6 | **Low** | `apps/desktop/electron/services/logger.js:113-116` | 文件写失败完全静默（appendFile 错误回调内只 `settle()` 丢弃），磁盘满时用户无从知晓日志停写。建议失败降级 console + 计数暴露到 `getLogsInfo` |

---

## 5. 补充与细化建议


### P0（先修，堵泄漏 + 补静默）

1. **修 A1**：`douyin.py:445` 改为不记录 token（记录 `upload_token` 键名/类型/过期时间等元信息，或仅 bool），并补回归：断言日志文件不含 token 字段。
2. **补 B1**：`publish-api-server.js` 统一在 `_json` 响应前记录 error（error code + message + stack，经脱敏）；500 必须可追溯。
3. **补 B2**：`auth/*` 与 `webhook-manager.js` 增加安全日志（不记 token 原文）：introspection/JWKS 失败原因、webhook 签名校验失败（带 hook id、原因码）、entitlement 判定结果。
4. **补 B3**：`retry-middleware.js` 记录重试第 N 次/原因、熔断开启/半开/恢复（带 circuitKey）。

### P1（收拢一致性 + 结构化的第一步）

5. **A2/A4**：`services/logger.js` console 输出与文件输出共用同一 `redact()`；扩展脱敏正则（Cookie、refresh_token、通用 JWT、password）。
6. **B4 + C2**：为 api-publish-engine 引入 requestId（入口生成 → 响应头 `x-request-id` → 日志串联），access log 升级为 JSON（method/path/status/duration/requestId/ip/ua/errorCode）。
7. **C1**：重构 `shared-utils/src/logger.js`（`rules.js`/`presets.js` 有引用）为注入式 logger 或复用 L1，并修正误导注释；api-publish-engine 明确"生产=容器 stdout"语义并补齐文件/级别/脱敏能力，或统一复用 L1 式 logger。
8. **C3（桌面侧）**：L1 增加旧日志自动清理（如按天保留 N 天 / 总量上限），并纳入 `getLogsInfo` 展示。
9. **B5**：python server 显式关闭 uvicorn access log 或加 InterceptHandler 把标准 logging 桥接进 loguru 按日文件，避免"请求日志漂移"。

### P2（进一步细化）

10. **C5**：跨进程 traceId（renderer→IPC→Bridge→Python）按 runId/sessionId 贯穿；PipelineEngine 已是正面样板。
11. **C3（容器侧）**：Compose 统一配置 `logging: driver: json-file, options: {max-size, max-file}`；ops-center 若需留痕配置 journald 保留策略。
12. **C4**：L1 message 增加长度上限（与 meta 同规则），超长截断并标记。
13. **C6**：为 remotion-composer / story2video-engine 增加"按需 logger 注入"约定或文档化静默边界。
14. 补充"日志合同"文档：统一 level 枚举、脱敏清单、日志字段、保留策略，挂入 `01-docs/` 与 `.ccg/spec/`。

---

## 6. 双模型交叉验证

- **antigravity**：后端不可用（区域限制），已记录降级，未产出有效意见。
- **Claude**（review-claude.out）：独立逐行核对后结论——核心缺口（A1/A3/A4、B1/B2/B3/B5、C2/C3/C4/C5）**证据准确、分级恰当**；更正 4 处事实：① B4 并非全仓 0 命中 requestId（python `_http_client.py:204,221` 透传上游 `x-request-id`，但仍无自生成 id）；② C1 shared-utils logger 并非死代码（`rules.js:1`、`presets.js:1` 引用）；③ C6 story2video 编排层 `story2video-compose-engine.js:525` 有日志（引擎库静默才成立）；④ "全仓无第三方日志库"不成立（Python 用 loguru）。另补充 8 个发现（见 4.4）。
- **合并结论**：维持 A1/B1/B2 为 **Critical**，建议按 P0 清单先修；补充发现全部采纳并已并入报告。完整审查输出保留于 `.ccg/tasks/archive/2026-08/logging-system-audit/review-{anti,claude}.out`。


---

## 7. 证据索引（抽查用）

- 桌面 logger：`apps/desktop/electron/services/logger.js:19-27,68-79,134-145`；测试 `logger.test.js:51`
- IPC 错误日志：`apps/desktop/electron/ipc-handlers/helpers.js:67-101,135`；`logs.js:32-40`
- renderer 上报：`apps/desktop/src/utils/report-error.js:6-21`；`apps/desktop/src/main.js:19-36`；preload `system.js:275-277`
- 主进程兜底：`apps/desktop/electron/main.js:56-62`；`shutdown.js:118`
- shared-utils logger：`packages/shared-utils/src/logger.js:12-14,42-68`
- api-publish-engine：`src/logger.js`、`src/access-log.js:8-13`、`src/audit-log.js:34-50`、`src/publish-api-server.js:95,507`（access 接线）及 B1 catch 列表
- auth 静默：`packages/api-publish-engine/src/auth/*`（10 文件 0 日志）
- retry 静默：`packages/api-publish-engine/src/retry-middleware.js:53-87`
- Python：`packages/python-backend/src/multi_publish/core/logging_setup.py:25-113`；`server.py:121-124,654`；sidecar 捕获 `apps/desktop/electron/services/base-python-bridge.js:117-121`
- 敏感泄漏：`packages/python-backend/src/multi_publish/publishers/douyin.py:445`
- ops-center：`ops-center/backend/main.py:27,110`；`ops-center/deploy/ops-center.service:15`；nginx `ops-center/deploy/nginx-ops.conf`（无自定义 access/error log）
- 容器：`packages/api-publish-engine/docker-compose.yml`、`deploy/logto/docker-compose.yml`（均无 logging 配置）
- CI：`.github/workflows/*.yml`（upload-artifact retention 7-30 天）
- 双模型审查：antigravity（区域不可用）、Claude（review-claude.out，4 处事实更正 + 8 补充发现）
- 补充证据：`packages/python-backend/src/multi_publish/_http_client.py:204,221`（上游 x-request-id）；`packages/shared-utils/src/format-adapter/rules.js:1`、`cover-processor/presets.js:1`；`packages/api-publish-engine/src/webhook-manager.js:156,165-167`；`src/api-key-manager.js`（0 日志）；`requirements-runtime.txt:5`（loguru）
