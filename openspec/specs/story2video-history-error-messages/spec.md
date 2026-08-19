# story2video-history-error-messages Specification
## Purpose
为 Story2Video 历史记录、结果页和失败对话框定义稳定、自然、可行动且不泄漏内部实现细节的错误提示合同，并明确具体模型账号的显示粒度。
## Requirements
### Requirement: 用户可见失败提示必须脱离技术参数

系统 SHALL 只使用稳定消息键和经过白名单校验的自然语言参数渲染失败提示，不得把内部模板名、provider 原始对象、HTTP 状态码、堆栈、请求 ID、token 或 prompt-engine 前缀直接显示给用户。

#### Scenario: 内部场景占位符不得泄漏
- **WHEN** 原始错误包含 {sceneText} 或旧通知参数包含 sceneText
- **THEN** 历史卡片、结果页和失败对话框显示自然语言 context 或通用安全提示，且最终文案不包含 {sceneText}

#### Scenario: 未知技术错误安全回退
- **WHEN** 原始错误无法匹配已知分类或包含技术标记
- **THEN** 系统显示本地化的通用失败提示，不显示原始错误全文

### Requirement: 失败提示必须指出具体模型账号

系统 SHALL 在可识别 provider ID 时显示对应的具体模型账号名称；无法识别时 SHALL 显示自然语言回退名称，不得显示泛化技术词。

#### Scenario: 已知 MiniMax provider
- **WHEN** 原始错误包含 minimax-multimodal、minimax-image 或等价 MiniMax provider ID
- **THEN** 中文提示包含“MiniMax模型账号”，英文提示包含“MiniMax model account”

#### Scenario: 未知 provider
- **WHEN** 原始错误只包含 provider account、account、数字或无法识别的 provider 值
- **THEN** 中文提示使用“当前模型账号”，英文提示使用“current model account”，且不显示原始泛化 token

### Requirement: 有限上下文必须自然化

系统 SHALL 将场景号、素材生成比例和生成类型转换为自然语言 context；context 缺失时不得插入未解析的占位符。

#### Scenario: 单场景限流或额度错误
- **WHEN** 错误包含 scene 22 或 场景 22
- **THEN** 提示显示（场景 22）或 (scene 22)，并保留模型账号和重试/检查建议

#### Scenario: 素材比例与生成类型
- **WHEN** 素材错误包含 0/51 scenes 和图片或旁白失败标记
- **THEN** 提示显示场景比例及“图片生成”“旁白生成”或等价英文自然语言，不显示原始错误片段

### Requirement: zh/en 文案必须成对且可操作

每个受影响消息键 SHALL 在 zh/en locale 中同时存在，并包含明确下一步：等待重试、检查对应模型账号额度/Key/网络、调整场景文案或从断点继续。

#### Scenario: API Key 失败
- **WHEN** 已识别 provider 的 API Key 缺失、失效或过期
- **THEN** 提示指出具体模型账号，并引导用户到模型设置更新该账号的 API Key

#### Scenario: 历史失败恢复
- **WHEN** 用户在历史记录查看失败卡片
- **THEN** 卡片显示失败环节和自然语言失败原因，恢复/重试动作继续沿既有断点和场景编辑门控，不因文案改造改变任务生命周期

### Requirement: 回归测试覆盖双入口

实现 SHALL 覆盖流水线 formatter 和 renderer 通知归一化两条入口，并验证最终消息而非只验证消息键。

#### Scenario: formatter 输出安全参数
- **WHEN** formatter 处理 provider、场景号、限流、额度、空结果或素材生成错误
- **THEN** 输出只包含安全参数，且测试断言 provider、context 和 locale 结果

#### Scenario: renderer 二次格式化
- **WHEN** 历史卡片把 message key 与 messageParams 交给对话框二次格式化
- **THEN** context/provider 被保留，最终 zh/en 文案不含技术占位符
