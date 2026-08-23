## Why

run_1787423931138_9cak 中克隆音色失效后，几十个并发 TTS 任务各自重克隆；MiniMax 随即返回余额不足/Token Plan 用量上限，图片、LLM 与视频队列仍继续领取并消耗额度。

## What Changes

- 新增运行级 `ProviderRunContext`，按 provider ID 熔断，作用域为一次 PipelineEngine run 的内存 context。
- `ModelProviderManager.callAdapter` 支持可选的 `{ providerRunContext }` 第四参；quota 类错误自动打开该 provider breaker，已打开时直接返回结构化断开错误。
- 统一 `classifyProviderFailure` 识别 Token Plan、usage limit、用量上限、余额不足和嵌套 `error/context/data/base_resp` 结构；quota 不再进入限流重试。
- AIGenerator/AssetGenerator/PromptBridge/Story2Video/videogen 的 LLM、TTS、图片、视频、cloneVoice 调用共享同一运行 context。
- `_mapWithConcurrency` 支持 `shouldStart`；breaker 打开后未启动的剩余队列返回失败，不调用上游。
- 同一 run 内同一 `(providerId, voiceId)` 音色重克隆只执行一次：并发共享 Promise；成功 ID 可序列化落盘供恢复复用；失败后不再重复 clone。

## Capabilities

### New Capabilities

- provider-run-circuit-breaker
- story2video-voice-recovery

### Modified Capabilities

（无）

## Impact

- apps/desktop/electron/services/provider-run-context.js（新增）
- apps/desktop/electron/services/adapters/_base/provider-error.js
- apps/desktop/electron/services/model-provider-manager.js
- apps/desktop/electron/services/ai-generator.js
- apps/desktop/electron/services/asset-generator.js
- apps/desktop/electron/services/prompt-bridge.js / service-bus.js
- apps/desktop/electron/services/story2video-stages.js / videogen-stages.js
- 相应 Vitest、PRD、learnings、quality gates
