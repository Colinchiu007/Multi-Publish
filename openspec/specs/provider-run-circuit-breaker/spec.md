# provider-run-circuit-breaker Specification

## Purpose
把 quota/token-plan 失败按 provider 维度熔断到当前流水线运行，使图片、TTS、LLM、音频、视频和音色重克隆共享同一控制边界，并保持断点恢复语义。
## Requirements
### Requirement: Provider 运行级熔断

系统 SHALL 在 ProviderRunContext 内按 provider ID 维护本次流水线运行的状态；quota/token-plan 错误 SHALL 立即打开对应 provider breaker；breaker 打开后 SHALL 拒绝该 provider 后续未启动的 image/tts/llm/video/audio/cloneVoice 调用并返回结构化错误；limit rate/transient 错误 SHALL 允许现有短暂重试；其他错误 SHALL 不打开 breaker。熔断状态 SHALL 只存活于当前内存运行，不得写入 checkpoint JSON。

#### Scenario: 额度错误立即熔断
- **WHEN** 任意 provider 调用返回余额不足、Token Plan、usage limit、用量上限或等价嵌套错误
- **THEN** 该 provider 的 breaker 立即打开，后续未启动请求返回 `PROVIDER_CIRCUIT_OPEN`，不调用上游

#### Scenario: 限流仍可重试
- **WHEN** provider 返回 429 / rate limit
- **THEN** 不打开 breaker，按现有 rate 退避重试

#### Scenario: 运行结束不持久化熔断
- **WHEN** 断点恢复读取 checkpoint 并重建内存 context
- **THEN** breaker 为全新状态，不沿用上一次运行的熔断

### Requirement: callAdapter 统一熔断边界

ModelProviderManager.callAdapter SHALL 支持可选的 `{ providerRunContext }` 第四参数；旧三参数调用 SHALL 保持兼容；runtime 控制对象 SHALL 不进入 adapter params、日志载荷或 Python payload；adapter 抛出的 quota 错误 SHALL 自动打开 provider breaker。

#### Scenario: 四参数熔断生效
- **WHEN** 调用 `callAdapter(providerId, method, params, { providerRunContext })` 且 breaker 已打开
- **THEN** 返回 `{ code: -1, errorCode: 'PROVIDER_CIRCUIT_OPEN' }`，adapter 不被调用

#### Scenario: 旧三参数不变
- **WHEN** 调用方沿用三参数调用
- **THEN** 行为与现状一致，不接收 runtime 熔断

#### Scenario: quota 错误自动打开
- **WHEN** adapter 抛出的错误被分类为 quota
- **THEN** `ProviderRunContext` 立即打开该 provider breaker

### Requirement: 队列领取前检查熔断

并发资产队列 SHALL 在 worker 领取每一项前检查 provider breaker；breaker 已打开时 SHALL 返回失败的 skipped 结果且不执行上游调用；已在途请求 SHALL 允许自然完成。

#### Scenario: 熔断后剩余队列停止
- **WHEN** 图片/TTS/视频并发队列正在领取剩余项且对应 provider 熔断
- **THEN** 剩余项返回 `{ success: false, skipped: true }`，上游调用次数不增加

#### Scenario: 已启动项不撤销
- **WHEN** 某请求已经进入 adapter
- **THEN** 该请求继续完成或被其现有错误处理收尾

### Requirement: LLM 优化链路熔断

PromptBridge/ServiceBus 的图片与视频提示词优化 SHALL 抽取 `providerRunContext` 控制字段；默认 LLM 的 quota 错误 SHALL 打开 breaker 并禁止 CLI fallback/legacy 回退再次调用同一 provider。

#### Scenario: prompt-engine quota 不兜底
- **WHEN** 默认 LLM 返回或透传 quota/token-plan 错误
- **THEN** 打开默认 LLM provider breaker，跳过 CLI/legacy fallback，返回可失败结果

#### Scenario: 非额度 HTTP 失败保持现状
- **WHEN** prompt-engine 网络/HTTP 失败且无 quota 信号
- **THEN** 保留现有 CLI/legacy fallback 语义

