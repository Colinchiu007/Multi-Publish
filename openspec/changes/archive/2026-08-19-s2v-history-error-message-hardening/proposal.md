## Why

Story2Video 历史记录的失败原因已经经过分类，但旧模板仍可能把内部占位符（例如 {sceneText}）带到用户界面；部分提示还只写“模型账号”或 provider account，用户无法判断应该检查哪个配置。需要把原始技术错误与用户可见文案彻底隔离，并让已识别的服务商以具体模型账号显示。

## What Changes

- 将失败消息参数合同从内部 sceneText/场景标签引用改为自然语言 context。
- 新增 provider ID 到模型账号显示名的集中映射，覆盖限流、额度、空结果、素材生成和 API Key 类错误。
- 对未知或不可信 provider 使用安全的“当前模型账号”回退，不展示 provider JSON、请求 ID、堆栈和内部服务名。
- 补充 zh/en 文案、历史记录/结果页回归测试、PRD 和质量复盘记录。

## Capabilities

### New Capabilities

- story2video-history-error-messages: 为历史记录和结果页提供无技术泄漏、按模型账号细分的失败提示。

### Modified Capabilities

- None.

## Impact

- 影响桌面端 renderer 的 Story2Video 通知归一化、流水线错误 formatter、locale 和测试。
- 不改变主进程持久化结构、IPC 参数结构、模型调用方式或断点恢复策略。
- 需要 zh/en locale 成对更新，并通过 locale/CJK 门禁。
