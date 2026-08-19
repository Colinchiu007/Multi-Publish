## Why

在视频创作历史记录的任务详情中，用户点击场景的重新生成提示词时，生产链路会把模型账号或提示词引擎的失败响应传到历史服务；当前跨层响应契约没有被真实组合测试锁住，导致正常配置和失败兜底形态之间出现误判，最终只显示通用失败提示。现在需要把这条用户可操作路径的成功、错误和持久化行为统一起来，并解释测试为何没有覆盖到真实故障。

## What Changes

- 统一历史场景图片/视频提示词重生成对 Prompt Engine 响应的成功判定与失败传播，保留错误回显原文时的 fail-closed 保护。
- 确保历史重生成请求使用已配置的默认 LLM 绑定、绕过优化缓存，并只发送 Prompt Engine 支持的请求字段。
- 增加跨 ServiceBus、PromptBridge、HTTP 响应和历史项目服务的组合回归测试，覆盖成功、HTTP/业务错误、错误回显原文及持久化结果。
- 补充结果页图片/视频入口的行为测试，确保用户点击、dirty 保存门控和失败提示不会被单元 mock 掩盖。
- 在 CCG 复盘中记录本次根因、测试逃逸链、系统性漏洞和预防措施。

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- story2video-history-scene-prompt-persistence: 修改历史场景提示词重生成的运行时响应契约、失败状态和回写行为。
- prompt-engine-byok-llm: 固化历史重生成通过桌面默认 LLM 绑定调用 Prompt Engine 的组合契约。

## Impact

- 主要代码：apps/desktop/electron/services/story2video-project-service.js、apps/desktop/electron/services/service-bus.js、apps/desktop/electron/services/prompt-bridge.js，必要时调整对应 IPC/renderer 接线。
- 主要测试：story2video-project-service.test.js、prompt-bridge.test.js、ServiceBus 契约测试、ResultView.test.js。
- 不新增依赖、不改变历史数据格式；失败时继续保留原提示词并写入 failed 状态，真实错误只按现有错误消息规范向上层传播。
