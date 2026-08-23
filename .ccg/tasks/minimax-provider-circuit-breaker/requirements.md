# 需求：Provider 级额度熔断与音色重克隆去重

## 背景

run_1787423931138_9cak 中失效 voice_id 触发每个 TTS 任务独立重克隆，随后 MiniMax 返回余额/Token Plan 额度错误；并发队列仍继续领取剩余图片、TTS 和文字推理任务，导致无效请求继续消耗上游额度。

## 目标

1. 同一次流水线运行内，同一个 `(providerId, voiceId)` 失效音色最多重克隆一次；并发 TTS 共享同一 Promise/结果。
2. provider 返回余额不足、Token Plan、套餐额度、usage limit、用量上限等错误后，立即按 provider 维度打开运行级熔断。
3. 熔断同时阻止本运行内该 provider 的图片、TTS、文字推理/LLM、视频及音色重克隆等新请求；已在途请求自然收尾。
4. 队列 worker 在领取剩余任务前检查熔断，未启动任务返回结构化 skipped/失败，不再调用上游。
5. 不破坏 `resume.completed` / `finalize_assets.partialTts` 断点恢复；熔断状态不持久化为永久全局状态。
6. 逻辑对全部 provider/model 通用，不做 MiniMax 特判。

## 非目标

- 不修改 MiniMax 官方 API 合同、额度统计或计费。
- 不做跨流水线全局持久熔断；仅当前运行内生效。
- 不把音色 registry / 克隆样本的持久化策略纳入本次变更。

## 验收标准

- 同一 run 内 `cloneVoice` 对同一失效音色只执行一次；成功后所有 TTS 复用新 voice id，失败后不再重复克隆。
- 额度错误被 `classifyProviderFailure` 判为 `quota`，不进入限流重试，立即打开该 provider breaker。
- 图片、TTS、LLM、视频、cloneVoice 调用均通过统一 `callAdapter(..., { providerRunContext })` 边界获得熔断。
- `_mapWithConcurrency` 支持 `shouldStart`，熔断后剩余队列返回失败而不调用上游。
- 断点恢复继续复用已完成产物；新 voice id 以可序列化字段落盘供恢复复用。
- 运行级 breaker 不进入 checkpoint JSON。
