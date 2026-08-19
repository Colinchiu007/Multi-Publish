## MODIFIED Requirements

### Requirement: PromptBridge 统一注入 llm 绑定

桌面 PromptBridge 的历史图片或视频提示词重生成调用 SHALL 与普通优化调用使用同一默认 LLM 解析结果，构造 provider、model、base_url、api_key 注入请求并携带 caller=multi-publish-desktop。当该绑定无法解析或外部请求失败时，桥接层 SHALL 保留结构化错误并禁止把服务端原文回显当作成功优化词。

#### Scenario: 历史重生成使用默认 LLM
- **WHEN** 桌面默认 LLM 为 sensenova-llm 且配置了模型、地址和 API Key，用户从历史详情重生成提示词
- **THEN** Prompt Engine 请求携带 provider sensenova、对应 model/base_url/api_key 和 caller，历史服务收到可验证的成功执行元数据

#### Scenario: 默认 LLM 为 SenseNova
- **WHEN** 桌面默认 LLM 为 sensenova-llm，base_url 为 https://token.sensenova.cn/v1，模型为 deepseek-v4-flash 且配置 API Key
- **THEN** 请求携带 provider=sensenova、model=deepseek-v4-flash、对应 base_url/api_key 和 caller=multi-publish-desktop

#### Scenario: BYOK 配置缺失 fail-closed
- **WHEN** 默认 LLM 未配置、缺少 API Key 或没有可用模型
- **THEN** PromptBridge 不发出优化请求并抛出可操作配置错误，调用方保持旧提示词并记录失败状态

#### Scenario: HTTP 业务错误不触发兼容回退
- **WHEN** Prompt Engine 返回 HTTP 非成功或错误响应带原文回显
- **THEN** PromptBridge 和调用方保留失败语义，历史服务不写入回显原文且不报告成功
- **AND** 已收到响应的 HTTP 业务错误不得触发 CLI 或 legacy-8013 传输兜底
