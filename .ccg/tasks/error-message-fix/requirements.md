# Story2Video 历史记录失败提示强化

## 用户需求

1. 历史记录的失败提示不得显示 {sceneText} 或其他内部模板占位符。
2. 全面检查同一提示链路，禁止 provider JSON、HTTP 状态码、堆栈、请求 ID、token 和内部服务前缀泄漏到用户界面。
3. 失败提示必须指出具体模型账号，例如 MiniMax模型账号；无法确认服务商时使用自然语言的 当前模型账号，不能显示 provider account 或“对应模型账号”。
4. 记录完整的数据校验、流程逻辑、交互逻辑、显示项和中英文提示文案。

## 范围

- Story2Video renderer 通知归一化、流水线错误 formatter、zh/en locale、回归测试。
- 历史卡片和结果页继续使用稳定 message key；原始错误只用于分类，不直接渲染。
- 不改变主进程持久化字段、模型调用协议或重试/断点恢复语义。

## 验收标准

- 已知 provider 能映射到具体模型账号名称；未知 provider 有安全回退。
- 场景号、素材比例、图片/旁白生成类型可展示为自然语言 context。
- 任何 message key 的最终渲染均不含 {sceneText}；zh/en 成对。
- 相关单测、构建、locale 同步和审查记录完成。
