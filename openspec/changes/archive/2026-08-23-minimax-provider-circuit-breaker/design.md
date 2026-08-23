# 设计

## 运行作用域

PipelineEngine 在 `_executeStage` 中把同一个 `run.context` 对象传给各阶段执行器。`getProviderRunContext(context)` 用模块级 WeakMap 绑定该对象，因此：

- 一次内存运行内所有阶段共享同一 breaker 与 voice coordinator；
- checkpoint 的 `JSON.parse(JSON.stringify(context))` 不会序列化 WeakMap 或 Promise；
- 断点恢复会从快照构造新 context 对象，自动建立新的运行级 breaker，不把熔断变成永久状态。

## 统一边界

`ModelProviderManager.callAdapter(providerId, method, params, { providerRunContext })`：

- 旧三参调用完全兼容；
- 调用前检查 breaker，已打开返回结构化 `PROVIDER_CIRCUIT_OPEN` 结果；
- adapter 抛错时用 `classifyProviderFailure` 判断 quota，命中立即 `open(providerId)`；
- runtime 控制对象绝不进入 adapter params 或 Python payload。

## 音色重克隆去重

`ProviderRunContext.cloneVoiceOnce({ providerId, voiceId, fn })`：

- 同 key 并发调用共享同一个 Promise；
- 成功后保存 `succeeded` 并写 `context.voice_recovery[providerId][voiceId]`；
- 失败后保存 `failed`，本运行不再重克隆；
- `tryReCloneVoice` 优先复用已恢复的新 voice id，新 run 断点恢复优先读可序列化字段。

## 队列停止

`_mapWithConcurrency(items, concurrency, fn, { shouldStart, skippedResult })`：

- worker 领取下一项前先执行 `shouldStart`；
- 已熔断则返回 `{ success: false, skipped: true, error }`，不执行 fn；
- 阶段仍按失败汇总，已成功的在途请求保留。

## 各调用链

- LLM 直调：AIGenerator.generateWithDefault → generate → callAdapter runtime options。
- PromptBridge：ServiceBus/PromptBridge 抽取 `providerRunContext` 控制字段；quota 错误禁止 CLI/legacy fallback。
- 图片/TTS：AssetGenerator options 透传 runtimeOptions，不进 params。
- 视频：story2video generateSceneVideo 与 videogen generateVideo/getVideoStatus 均带 runtime options。
- cloneVoice：tryReCloneVoice 经 manager.callAdapter 第四个参数接入。

## 测试

- provider-run-context.test.js
- provider-error quota 变体测试
- model-provider-manager callAdapter 四参数/旧三参/熔断测试
- story2video-stages queue skipped、voice 去重、resume 回归
- videogen / prompt-bridge / service-bus 定向回归
