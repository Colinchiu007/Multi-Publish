## 1. 流程与基线

- [x] 1.1 完成基线差异审计：确认严格响应校验、BYOK 注入和现有 UI/IPC 测试的实际覆盖边界
- [x] 1.2 运行受影响测试记录旧代码基线，并用真实 ServiceBus/PromptBridge/HTTP 回归测试复现缺陷

## 2. 跨层响应契约（TDD）

- [x] 2.1 在 PromptBridge/ServiceBus 边界补成功、HTTP 非成功、业务 error+原文回显、缺失执行元数据测试，断言 BYOK 请求和错误语义
- [x] 2.2 在 Story2Video 项目服务补图片/视频重生成的成功落库与失败保留旧值、status=failed 测试
- [x] 2.3 实施最小生产修复：统一响应解包/错误传播，保留严格 fail-closed 校验，不放宽为有文本即成功

## 3. Renderer 与组合回归

- [x] 3.1 补 ResultView 图片/视频按钮真实点击、dirty 先保存及失败通知回归测试
- [x] 3.2 补 IPC 到项目服务的参数/错误传播断言，确认请求不带内部 index 等非契约字段

## 4. 验证与复盘

- [x] 4.1 运行定向 Vitest、变更文件 lint、Vue build、locale/CJK、依赖解析和 git diff --check
- [x] 4.2 运行 Electron QM-1：win-unpacked 构建、ASAR 清单、真实 require 链、8 秒启动并检查 stderr
- [x] 4.3 完成独立审查和 .ccg/tasks/fix-s2v-regenerate-prompt/review.md，记录 Critical/Warning/Info、根因、逃逸链和预防措施
- [x] 4.4 更新 tasks.md、OpenSpec validate 结果、远程 PR/merge 状态；完成 OpenSpec 与 CCG task 归档
