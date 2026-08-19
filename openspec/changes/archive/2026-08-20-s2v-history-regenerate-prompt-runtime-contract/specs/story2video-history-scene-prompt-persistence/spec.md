## MODIFIED Requirements

### Requirement: 重新生成优化词失败必须 fail-closed

历史记录场景重新生成图片或视频优化词 SHALL 对 Prompt Engine 的 HTTP、业务和跨层响应统一判定：只有响应未声明错误、包含非空优化词并满足对应执行元数据时才算成功；当响应包含错误字段、HTTP 非成功、缺少必要执行元数据，或以原文回显作为错误兜底时，系统 SHALL 判定失败。失败时不得把回显原文写入分段，图片分段 SHALL 保持原有 prompt，视频分段 SHALL 保持原有 videoPrompt，并将 status 置为 failed，真实失败原因继续交给既有错误归一化流程。

#### Scenario: 成功响应满足执行元数据
- **WHEN** 用户重新生成图片或视频优化词，Prompt Engine 返回非空优化词且包含对应成功执行元数据、无错误字段
- **THEN** 新优化词写入对应分段字段，分段状态不被错误置为 failed，并持久化成功结果

#### Scenario: HTTP 或业务错误回显原文
- **WHEN** Prompt Engine 返回 HTTP 非成功，或返回包含 error/detail 与原文回显的业务响应
- **THEN** 保持原有 prompt/videoPrompt 不变，分段回写 status=failed，且不显示优化成功提示

#### Scenario: 引擎 402 回显原文
- **WHEN** 用户重新生成图片优化词且引擎返回 optimized_prompt 为原文、error 为 402 余额错误
- **THEN** prompt 保持不变、status=failed，失败原因包含引擎错误信息

#### Scenario: 引擎 error 但无文本
- **WHEN** 引擎返回 error 或 detail 且没有有效优化词
- **THEN** 同样 fail-closed，分段提示词保持不变并回写 failed

#### Scenario: 视频域错误回显
- **WHEN** 重新生成视频优化词且引擎返回 error/detail 与回显文本
- **THEN** videoPrompt 保持不变，分段回写 failed

#### Scenario: 缺失执行元数据
- **WHEN** 响应含非空优化词但缺少或错误的策略、调用方、缓存旁路等必要执行元数据
- **THEN** 系统按失败处理，保持原提示词并持久化 failed，不得仅凭文本内容判定成功

#### Scenario: 图片 HTTP 200 业务错误回显
- **WHEN** 图片优化接口返回 HTTP 200，同时包含非空 optimized_prompt 与 error/detail
- **THEN** 系统仍按失败处理，不触发 CLI 兜底，不覆盖旧 prompt，并持久化 failed

#### Scenario: 失败原因可诊断但不泄漏敏感信息
- **WHEN** 模型账号缺失、网络请求失败或 Prompt Engine 返回可识别错误
- **THEN** 主进程保留结构化错误供既有消息归一化层处理，renderer 显示稳定、可操作的本地化提示，不显示 token、完整请求体、堆栈或内部凭据

### Requirement: 重新生成请求上下文与流水线同源

历史记录重新生成图片优化词的请求 SHALL 通过桌面默认 LLM 绑定调用 Prompt Engine，携带 caller=multi-publish-desktop，并继续携带与流水线同源的 context、optimization_strategy=llm、bypass_cache=true、max_length=2000 及 Prompt Engine 契约允许的字段；内部 scene index 等非契约字段不得进入请求。

#### Scenario: 已配置 LLM 被实际使用
- **WHEN** 用户已在模型设置中配置默认文字推理模型并点击重新生成图片优化词
- **THEN** 实际发送的 Prompt Engine 请求包含对应的 provider/model/base_url/api_key 绑定和 caller=multi-publish-desktop，而不是使用引擎自身兜底账号

#### Scenario: 请求包含全场景上下文且不含内部字段
- **WHEN** 项目包含多个场景并触发历史图片提示词重生成
- **THEN** 请求包含完整 context.full_text、max_length=2000 和所需策略字段，不包含内部 scene index 或其他未在 Prompt Engine 契约中声明的字段

#### Scenario: 请求携带全场景上下文
- **WHEN** 用户点击重新生成图片优化词且项目包含多个场景文案
- **THEN** 发送给 Prompt Engine 的请求包含由全部场景文案拼接得到的 context.full_text，且 max_length 为 2000

#### Scenario: 存量项目无文本配置
- **WHEN** 历史项目缺少 story2videoTextConfig
- **THEN** 仍基于 segments 构造 context 并发送请求，不因缺少该配置而失败

#### Scenario: 缺少默认 LLM 时停止发送
- **WHEN** 没有可用的默认文字推理模型、API Key 或模型绑定
- **THEN** 主进程在发送 HTTP 请求前返回可操作配置错误，历史分段保持原提示词并进入失败状态
