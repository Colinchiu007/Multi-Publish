# prompt-engine-byok-llm Specification

## Purpose
桌面版调用 8013 提示词引擎时未携带用户在「模型设置」中配置的 LLM，引擎按自身 config.yaml 兜底（实测 MiniMax）返回优化词，用户实际期望使用自己配置的 SenseNova 文字推理模型。目标契约：哪个产品调用引擎，就用哪个产品自己配置的 LLM（BYOK）。

## Requirements
### Requirement: PromptBridge 统一注入 llm 绑定

桌面 `PromptBridge` 的 `optimize` / `optimizeBatch` / `optimizeVideo`（legacy-8013 回退）/ `optimizeVideosBatch`（legacy-8013 回退）SHALL 从 `ModelProviderManager` 解析默认 LLM，构造 `{provider, model, base_url, api_key}` 注入请求并携带 `caller=multi-publish-desktop`；provider 映射：sensenova-llm→sensenova、deepseek→deepseek、其余→openai_compat。

#### Scenario: 默认 LLM 为 SenseNova
- **WHEN** 桌面默认 LLM 为 sensenova-llm（base_url https://token.sensenova.cn/v1，model deepseek-v4-flash）
- **THEN** 请求携带 `llm={provider:sensenova, model:deepseek-v4-flash, base_url:..., api_key:...}` 与 `caller=multi-publish-desktop`

### Requirement: 无绑定 fail-closed

无 `modelProviderManager`、未配置默认文字推理模型、默认 LLM 缺 API Key 或缺可用模型时，桌面 SHALL 抛出中文可操作错误并停止发送请求；api_key MUST 在主进程边界读取密文并解密，不出渲染层、不落日志。

#### Scenario: 未配置默认 LLM
- **WHEN** 管理器 getDefault('llm') 为空
- **THEN** 抛「未配置默认文字推理模型：请在「模型设置」中选择并配置 LLM 后重试」
