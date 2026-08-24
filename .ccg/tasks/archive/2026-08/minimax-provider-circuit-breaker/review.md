# 双模型审查记录

## 审查方式

- Claude（codeagent-wrapper --backend claude）：完成有效审查，报告见下。
- OpenCode（codeagent-wrapper --backend opencode）：两次仅返回通用“请提供代码”，未给出有效 agent message，按仓库惯例记录为降级（不能取得双模型有效交叉验证）。

## Claude 审查结论（合并后修复状态）

- C1（原 Critical）：story2video 自动视频路径 generateSceneVideo 漏传 providerRunContext → 已修复，auto/manual 两条路径对齐。
- W1：AIGenerator `_generateViaPythonBridge` 前置缺 assertAvailable → 已修复。
- W2：legacy Python image/TTS 链路未门控 → 已在 story2video 两个 legacy 分支调用前断言 provider breaker。
- W3：shouldStart 会误 skip 已断点完成的 resume/partial 产物 → 已放行 resume.completed / partialTts 可复用项。
- W4：HTTP 429 + 额度消息先判 rate → classifyProviderFailure 先命中 QUOTA_MESSAGE_PATTERN 再降 rate。
- W5：PromptBridge 对非 LLM 策略也断言 breaker → 断言移到 requiresLlm 为真之后，batch 同样按需断言。

## 验证

- 初始修复后定向 Vitest：story2video-stages + manual + videogen + provider-run-context + prompt-bridge = 248 passed。
- CI 首轮发现 `ServiceBus.optimizePrompt/optimizePromptsBatch` 在无运行 context 时多传 `{ providerRunContext: undefined }`，破坏旧三参调用兼容；已在 `service-bus.js` 仅对真实 context 追加内部参数，并补 2 条透传回归。该文件当前 29 passed，合并聚焦套件 274 passed。
- 本轮外部审查：Claude CLI 不在 PATH；OpenCode 因提示词目录权限被拒且未产出 agent message，均按降级记录。主代理逐行复核 service-bus 兼容性、providerRunContext 透传和既有熔断覆盖，未发现 Critical/Warning。
- QM-1 完整 build:win 成功；打包版 8 秒存活且 stderr 为空。
