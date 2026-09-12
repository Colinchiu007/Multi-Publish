# PRD：全项目日志覆盖补强（logging-coverage-audit）

> 日期：2026-09-12 | 分支：codex/logging-coverage-audit | 状态：已实施

---

## 1. 背景与目标

### 1.1 问题陈述

用户反馈：「梳理整个项目代码中所有该写日志的地方，尤其是便于排查 bug 的点。现在遗漏的地方还有很多，仔细排查一下，需要日志颗粒度更细。」

经四路并行探子扫描（Electron IPC/服务层、packages 引擎、RPA 发布链、Python/桥接层），确认 **160+ 个日志缺口点**，其中高严重度 50+。核心病灶：

| 病灶 | 影响 | 典型场景 |
|---|---|---|
| `catch(e){return{code,message}}` 无日志 | IPC 失败无任何痕迹 | 用户点按钮无响应，日志空 |
| `return {success:false}` 分支无日志 | RPA 发布失败静默 | 「未登录」「找不到输入框」日志里一条都没有 |
| 子进程 stderr 丢弃 | ffmpeg/Remotion 报错丢失 | 只见「退出码 1」，不知为何失败 |
| 静默降级无日志 | 数据来源不可信 | AI 失败返回 `[]`、RPA 不可用返回假数据 |
| 渲染进程 console 吞掉 | 页面 JS 报错不可见 | 选择器失败原因无法定位 |
| 崩溃无处理器 | 浏览器崩溃静默 | 白屏无任何日志 |

### 1.2 目标

1. **排查 bug 时日志能回答「在哪失败的、为什么失败的」**——每个失败路径至少一条含上下文的日志。
2. **根因级修复优先**——在汇聚点（如 `publish()` 结果出口、`run_command()` 异常出口）一次堵住一类缺口，而非逐点铺日志。
3. **不破坏现有行为**——所有修改只加日志，返回值/控制流不变。
4. **日志本身可脱敏、可控制**——不引入新的敏感信息泄露。

---

## 2. 日志分层策略（数据校验规则）

### 2.1 级别语义（强制）

| 级别 | 语义 | 使用场景 | 本 PR 落点示例 |
|---|---|---|---|
| `error` | 故障，需要人看 | 异常捕获、子进程非 0 退出、崩溃 | `publish` catch、`run_command` 失败、`render-process-gone` |
| `warn` | 降级/失败但已兜底 | 返回失败结构体、fallback 触发、重试耗尽 | `publish failed`、`not logged in`、cookie 恢复失败 |
| `info` | 关键路径里程碑 | 开始/成功/状态迁移 | `publish start/done`、`pending->publishing` |
| `debug` | 高频细节 | 分片进度、轮询细节 | （本 PR 未加，预留） |

### 2.2 必须包含的字段（颗粒度合同）

失败类日志**必须**包含（按可用性）：

- **身份**：`platform`、`accountId`（脱敏）、`taskId`、`traceId`
- **定位**：`url`（截断 200 字符）、`selector`（截断 160）、`exitCode`、`HTTP status`
- **原因**：`error message`、`stderr` 尾部（截断 800-2000）
- **上下文**：`timeoutMs`、`durationMs/elapsed`、`retried`

成功类里程碑日志应包含：`platform`、关键产物标识（`url`/`postId`/`mediaId`）。

### 2.3 脱敏规则

- cookie 值、Authorization、apiKey **永不入日志**（现有 logger 已有 redact，本 PR 遵循）。
- URL 中 `token/secret/password/code` 类参数由 `audit-logger.redactUrlString` 脱敏。
- stderr 尾部截断后仍可能含敏感串，统一走 logger 的 redact 管道。
- 日志中的 selector、URL、消息文本统一 `String(...).slice(0, N)` 截断防刷屏。

---

## 3. 功能逻辑：各模块日志点清单

### 3.1 RPA 发布链（apps/desktop/electron/services/rpa-view-*.js）

**流程**：`publish()` → API 尝试 → RPA 窗口创建 → cookie/存储恢复 → 平台 `_publish_*` → 结果确认

| # | 位置 | 日志点 | 级别 | 触发条件 |
|---|---|---|---|---|
| 1 | rpa-view-manager.publish 入口 | `publish start platform=... hasTitle=... hasVideo=... timeoutMs=...` | info | 每次发布 |
| 2 | rpa-view-manager API 结果 | `publish done via API` / `API publish returned failure error=...` | info/warn | API 返回 |
| 3 | rpa-view-manager RPA 结果 | `publish done platform url=...` / `publish failed platform error url=` | info/warn | **根因修复：此前失败分支零日志** |
| 4 | rpa-view-manager catch | `publish platform: msg \| stack=前3帧` | error | 异常 |
| 5 | rpa-view-session._createWindow | `page console: msg (source:line)` | warn | 渲染进程 console ≥ warning 级 |
| 6 | rpa-view-session._createWindow | `render process gone: reason= exitCode=` | error | 崩溃 |
| 7 | rpa-view-session._createWindow | `page unresponsive` | warn | 无响应 |
| 8 | rpa-view-session cookie 恢复 | `cookie restore failed name= err=` | warn | 单条失败 |
| 9 | rpa-view-helpers._waitForElement | `waitForElement timeout sel= timeoutMs= url=` | warn | **根因修复：选择器超时此前静默** |
| 10 | rpa-view-helpers._navigateAndWait | `nav failed url= code= desc=` | warn | did-fail-load |
| 11 | rpa-view-platforms 各「not logged in」 | `[platform] not logged in url=` | warn | **6 处平台全部补齐** |
| 12 | rpa-view-platforms douyin | `no file input url=` / `publish timeout url=` | warn | 静默 return 补日志 |
| 13 | rpa-view-platforms wechat_mp | 保存/群发/确认按钮不可用各分支 | warn | **5 处静默 return 补齐** |
| 14 | rpa-view-platforms zhihu | editor/publish btn/save btn/verify failed | warn | **4 处补齐** |
| 15 | rpa-view-platforms 配置缺失 | `no publish_url/publish_btn selector configured` | warn | 配置错误 |

### 3.2 登录态检测（account-manager.js）

| # | 日志点 | 级别 |
|---|---|---|
| 16 | 选择器超时降级 URL 检查：`selector timeout ... 降级 URL 检查` | info |
| 17 | dashboard 域名兜底：`dashboard-host fallback valid currentHost= dashboardHost= selectorMatched=false` | info |
| 18 | **假阳性盲区兜底**：`fallback valid (no selector match, no login URL marker, no dashboard host) url= selectorMatched=` | warn |
| 19 | restoreCookies 单条失败：`cookie set failed name= err=` + 聚合 `n/m failed` | warn |

### 3.3 Electron IPC 层

| # | 范围 | 日志点 |
|---|---|---|
| 20 | ipc-handlers/ 18 文件 111 处裸 catch | `log.warn('[ipc:<模块名]', msg)` — **保留原返回值不变** |
| 21 | webview-manager 20 处 IPC catch | `log.warn('WebviewManager', 'ipc handler error: ...')` |
| 22 | webview-manager 导航失败 | `nav failed url= err=`（3 处 loadURL catch） |
| 23 | webview-manager cookie 恢复 | 单条 + 聚合失败数 |
| 24 | webview-manager 凭证读取失败 | `loadSavedCredentials failed platform:accountId err=` |

### 3.4 packages 引擎

| # | 包/文件 | 日志点 |
|---|---|---|
| 25 | api-publish-engine base-adapter.execute catch | `logger.error('adapter:NAME','execute failed',{error,code,stack})` |
| 26 | api-publish-engine api-router | API 失败→fallback warn、fallback 触发 info、RPA fallback 失败 error、批量单平台失败 error |
| 27 | api-publish-engine scheduled-publish | 状态迁移 info（pending→publishing→success）、失败 error、存储加载失败 warn、非法 scheduledAt error |
| 28 | rewrite-engine LLM 调用失败 | `error('rewrite-engine','LLM call failed',{strategyId,mode,error})` |
| 29 | rewrite-engine 敏感词检测 fail-open | `error('sensitive check failed, fail-open',{stage,error})` |
| 30 | ai-writer 三方法降级 | `warn('generateTitles/Summary/enhanceContent failed, returning ...',{error})` |
| 31 | collection-engine audit-logger 无 dir | 构造 warn + 丢弃计数（第 1 条和每 100 条） |
| 32 | collection-engine 策略加载 | 损坏时 error + 回退默认（此前直接崩） |

### 3.5 Python/桥接层

| # | 位置 | 日志点 |
|---|---|---|
| 33 | base_tool.py run_command（**根因**） | CalledProcessError 抛出前 `logger.error(tool, cmd, exit, stderr_tail)` — 一次性覆盖所有子命令调用方 |
| 34 | video_compose.py execute | `execute failed: operation= elapsed= error= stderr_tail=` |
| 35 | base-python-bridge._post | 非 JSON 响应 warn（含原始 body 前 300 字符）；请求 error/timeout error |
| 36 | python-bridge._requestBackendOnce | 同上 |
| 37 | render-engine.js render | 失败时 `render failed exitCode= stderr_tail=`（收集 stderr 尾 20 行） |
| 38 | asset-generator edge-tts | stdio ignore→pipe；失败 `exitCode= stderr_tail=`；空文件 warn |
| 39 | prompt-bridge CLI fallback | 失败 warn 附 stderr 前 500 字符 |

---

## 4. 交互逻辑与显示项

### 4.1 用户可见行为变化

**无。** 本 PR 只加日志，所有函数返回值、IPC 响应结构、UI 展示完全不变。唯一可感知差异：

- 日志文件（`userData/logs/app-YYYY-MM-DD.log`）内容变多。
- 控制台输出变多（开发模式）。

### 4.2 日志查看入口（既有功能，不变）

- 设置 → 日志：`logs:get-info` / `logs:clear`（IPC）。
- 日志文件按天滚动，单文件 500MB 上限自动清理。
- 采集审计独立 JSONL：`collection-audit-YYYY-MM-DD.jsonl`。

### 4.3 提示文字

无新增用户提示文字。日志消息本身为开发者面向，格式统一：

```
[RpaView] publish failed platform=wechat_mp error=微信公众号登录超时，请重新登录 url=https://mp.weixin.qq.com/...
[ipc:story2video] story2video 导出失败
[collection-strategy] strategy file load failed, falling back to defaults
```

---

## 5. 测试与验收

### 5.1 回归保护测试（新增）

`apps/desktop/electron/services/rpa-view-manager.test.js` 新增 describe「logging-coverage-audit：失败分支日志合同」：

1. **RPA publish 返回 success:false 时必须记 warn**——断言 `log.warn` 收到含 `publish failed`、`platform=wechat_mp`、`登录超时` 的调用。
2. **API publish 返回 success:false 时必须记日志**——断言 `API publish returned failure` warn 存在。

测试模式：`__registerMock('./logger', mock)` 拦截（`vi.resetModules` 后仍生效），mock `_publish_wechat_mp` 返回失败结构体。

### 5.2 已跑验证

| 套件 | 结果 |
|---|---|
| Electron ipc-handlers + 受影响 services（48 文件） | 732 passed |
| collection-engine | 91 passed |
| rewrite-engine | 67 passed |
| ai-writer | 16 passed |
| api-publish-engine | passed（node test） |
| rpa-view-manager（含新测试） | 7 passed |
| 全部修改文件 `node --check` / `ast.parse` | 通过 |

### 5.3 验收标准

- [x] 每个「高」严重度缺口至少一条日志
- [x] 根因级汇聚点（publish 出口、run_command、_waitForElement、audit-logger）全覆盖
- [x] 返回值/控制流零变化（diff 审查确认）
- [x] 日志含定位字段（platform/url/selector/error）
- [x] 脱敏规则不破坏（不新增 cookie/密钥输出）
- [x] 回归测试保护日志合同

---

## 6. 边界与不做清单

- **不改 UI**——纯主进程/后端日志。
- **不加 debug 级高频日志**——避免刷屏，预留后续。
- **不改 logger 基础设施**——现有 logger/audit-logger 架构保留。
- **探子报告中「低」严重度点未全部铺**——按根因优先原则取舍（约 60 点「低」留后续）。
- **Python publisher 侧（douyin.py 等）部分裸 except 未全改**——base_tool 根因已堵住主要路径，平台级 check_auth 留后续 PR。

---

## 7. 数据流图

```
用户操作 → renderer → IPC invoke
                        ↓
              ipc-handlers/*.js          ← [ipc:模块] warn（新增 1
31 处）
                        ↓
              services（webview/rpa）     ← nav/cookie/waitForElement warn（新增）
                        ↓
              RpaViewManager.publish()    ← start/done/failed（根因出口，新增）
                        ↓
              _publish_* 平台函数         ← not logged in 等分支（新增）
                        ↓
              子进程（python/ffmpeg）
                 ├─ JS 桥接 _post         ← non-JSON/error/timeout（新增）
                 ├─ base_tool.run_command ← stderr_tail error（根因，新增）
                 └─ render/edge-tts       ← stderr 收集（新增）
                        ↓
              日志文件 app-YYYY-MM-DD.log（脱敏后落盘）
```
