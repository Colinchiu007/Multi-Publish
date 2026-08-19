# Review: fix-s2v-regenerate-prompt

## Verdict

- Critical: 0
- Major: 0
- Minor: 0
- Info: 2

实现、定向回归和 Electron 打包门禁均通过。本报告同时记录本次 Bug 的 QM-5 根因、测试逃逸链和剩余验证边界。

## Root Cause

1. 4536b024 为 PromptBridge.optimize() / optimizeBatch() 增加 CLI fallback 时，把所有 _post() 异常统一解释成「HTTP 引擎不可用」。当 Prompt Engine 已经收到请求并返回 HTTP 422/429/502 时，BasePythonBridge._post() 当时只抛普通 Error，因此业务错误继续进入 CLI fallback。
2. 10442f9d 为 _post() 增加了 HTTP detail 和详细日志，但没有改变上述 catch 分流。于是模型账号、余额、供应商参数等业务失败仍可能被兜底路径覆盖，调用方最终只能看到稳定但缺乏诊断信息的失败提示。
3. 历史视频分支还使用通用文本提取，没有复用视频域的 extractOptimizedVideoPrompt()。即使 HTTP 传播修好，视频响应的 error/detail、执行元数据、结构和长度保护也可能与流水线不一致。

## Changes Reviewed

- base-python-bridge.js 为 HTTP 非成功、超时和 transport 错误建立结构化标记；lazy-start 失败只有明确 transport 证据才可被标记为兜底候选。
- prompt-bridge.js 仅对明确的连接拒绝、重置、超时、网络不可达等 transport 错误触发 CLI/legacy-8013 fallback；HTTP 业务错误原样保留，8020 视频引擎同样遵守该规则。
- story2video-project-service.js 的视频历史重生成改用视频契约提取器，并在失败时保留原 prompt/videoPrompt、写回 status=failed 和可诊断错误。
- preload/index.bundle.js 重新由现有 preload 源码构建，实际暴露 story2videoRegenerateScenePrompt IPC；同时同步了生成 bundle 中原先缺失的同源 API。
- 测试新增真实本机 HTTP、真实 ServiceBus -> PromptBridge -> HTTP 组合链路、BYOK 请求断言、HTTP 状态矩阵、HTTP 200 + error/detail 回显、8020 视频链路、IPC 参数/错误封装和 ResultView 失败通知。

## QM-5 Escape Analysis

### 1. 单元测试

旧的 Story2VideoProjectService 测试直接 mock serviceBus.optimizePrompt / optimizeVideoPrompt，所以它可以验证「服务层收到一个错误对象后保持旧值」，但无法验证真实 PromptBridge 是否把 HTTP 业务错误误送进 CLI fallback。旧的 PromptBridge fallback 测试只用 new Error('ECONNREFUSED') 验证正向 fallback，没有 HTTP 422/429/502 的反向保护。

### 2. 集成测试

旧测试没有把真实 ServiceBus、PromptBridge 和本机 HTTP 服务组合起来，也没有覆盖 8013 与 8020 的 transport/business error 对照，因此错误类型在 bridge 边界丢失的问题没有被发现。

### 3. E2E / Electron 窗口

ResultView 和 IPC 测试主要 mock publisher API 或 handler 依赖，覆盖按钮参数、失败通知和 busy 状态，但没有完整贯穿 ResultView -> preload -> IPC -> Story2VideoProjectService -> ServiceBus -> PromptBridge -> HTTP 的真实窗口级用例。

### 4. 视觉回归

本 Bug 的错误发生在主进程响应分类和持久化之前，既有视觉回归即使执行了点击也不会检查 HTTP 错误类型、fallback 次数或旧提示词是否保留，因此没有拦截能力。

### 5. 代码审查

此前审查聚焦「HTTP detail 是否保留」和「历史提取器是否 error-first」，没有把 CLI fallback 当作一个需要错误类型矩阵的控制流。系统性漏洞归类为：测试场景缺失 + 跨层组合覆盖不足 + fallback 错误分类审查盲区。

## Prevention

- 所有 bridge fallback 变更必须成对增加：明确 transport 错误可 fallback；HTTP 4xx/5xx、HTTP 2xx 业务 error/detail 不 fallback。
- 采用结构化错误属性（statusCode、isHttpError、isTransportError、isTimeout），禁止以错误 message 文本推断传输类别。
- 历史图片/视频重生成测试必须至少有一条真实本机 HTTP 组合链路；视频路径必须覆盖独立 8020 与 legacy 8013 的成功、HTTP 业务失败和 transport fallback。
- ResultView/IPC 测试继续负责用户可见失败语义；窗口级 E2E 仍应作为后续补强，验证 preload 生成物和真实 IPC 接线不漂移。
- Prompt Engine 响应提取必须复用领域契约，禁止历史路径重新实现「有文本即成功」的通用解析。

## Verification

- OpenSpec：openspec validate s2v-history-regenerate-prompt-runtime-contract --strict passed。
- Electron focused suite：6 files, 322 passed。
- ResultView regenerate tests：11 passed。
- ESLint：变更文件 passed。
- Preload sandbox：sandbox=true / sandbox=false passed。
- Locale/CJK、worktree dependency resolution、git diff --check：passed。
- QM-1：electron-builder --win --dir --publish never、ASAR 清单、真实 @multi-publish/rpa-engine require 链、8 秒启动 stderr smoke：passed。

## External Review Availability

按项目 CCG 流程尝试了双模型外部审查：Antigravity 因 account/location eligibility 不可用；Claude wrapper 长时间无 agent message 后停止。这里不声称双模型审查通过；本报告的结论来自主代理复核、真实测试和已关闭的独立只读审查。独立审查未发现 Critical/Major；提出的窗口级 E2E 缺口已记录为 Info。

## Remaining Info

- Info 1：尚未补完整 Electron 窗口级全链路 E2E；当前已有真实主进程 HTTP 组合测试和 renderer/IPC 定向测试，风险已显著收窄但 preload 到真实窗口的组合仍是后续补强项。
- Info 2：8020 返回 HTTP 2xx 但非法 JSON 时按 fail-closed 处理且不 fallback，这是有意保守行为，当前未把它扩展成另一条 CLI 兜底路径。
