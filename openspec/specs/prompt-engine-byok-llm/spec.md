# prompt-engine-byok-llm Specification

## Purpose
桌面版调用 8013 提示词引擎时未携带用户在「模型设置」中配置的 LLM，引擎按自身 config.yaml 兜底（实测 MiniMax）返回优化词，用户实际期望使用自己配置的 SenseNova 文字推理模型。目标契约：哪个产品调用引擎，就用哪个产品自己配置的 LLM（BYOK）。

## Requirements
### Requirement: PromptBridge 统一注入 llm 绑定

桌面 `PromptBridge` 的 `optimize` / `optimizeBatch` / `optimizeVideo`（legacy-8013 回退）/ `optimizeVideosBatch`（legacy-8013 回退）SHALL 从 `ModelProviderManager` 解析默认 LLM，构造 `{provider, model, base_url, api_key}` 注入请求并携带 `caller=multi-publish-desktop`；provider 映射：sensenova-llm→sensenova、deepseek→deepseek、其余→openai_compat。历史图片或视频提示词重生成 SHALL 与普通优化调用使用同一默认 LLM 解析结果；当绑定无法解析或外部请求失败时，桥接层 SHALL 保留结构化错误并禁止把服务端原文回显当作成功优化词。

#### Scenario: 默认 LLM 为 SenseNova
- **WHEN** 桌面默认 LLM 为 sensenova-llm（base_url https://token.sensenova.cn/v1，model deepseek-v4-flash）
- **THEN** 请求携带 `llm={provider:sensenova, model:deepseek-v4-flash, base_url:..., api_key:...}` 与 `caller=multi-publish-desktop`

#### Scenario: 历史重生成使用默认 LLM
- **WHEN** 桌面默认 LLM 已配置，用户从历史详情重新生成图片或视频提示词
- **THEN** Prompt Engine 请求携带对应的 provider/model/base_url/api_key 和 caller，历史服务收到可验证的成功执行元数据

#### Scenario: HTTP 业务错误不触发兼容回退
- **WHEN** Prompt Engine 已收到请求并返回 HTTP 4xx/5xx，或返回带 error/detail 与原文回显的业务响应
- **THEN** PromptBridge 保留结构化失败语义，不触发 CLI 或 legacy-8013 传输兜底，调用方不得写入回显文本

### Requirement: 无绑定 fail-closed

无 `modelProviderManager`、未配置默认文字推理模型、默认 LLM 缺 API Key 或缺可用模型时，桌面 SHALL 抛出中文可操作错误并停止发送请求；api_key MUST 在主进程边界读取密文并解密，不出渲染层、不落日志。

#### Scenario: 未配置默认 LLM
- **WHEN** 管理器 getDefault('llm') 为空
- **THEN** 抛「未配置默认文字推理模型：请在「模型设置」中选择并配置 LLM 后重试」
