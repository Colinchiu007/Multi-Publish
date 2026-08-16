# prompt-engine-byok-llm — Tasks

1. prompt-bridge.js：构造函数注入 modelProviderManager + resolveLlmBind + 4 个方法注入 llm/caller + fail-closed
2. phase1-context.js：`promptBridge.modelProviderManager = modelProviderManager`
3. prompt-bridge.test.js：llm 注入（sensenova 映射/解密 key/透传 body）与 fail-closed 用例
4. 既有链路测试回归（service-bus、story2video-stages、story2video-project-service、container）
5. QM-1 打包验证 + 桌面 vitest
6. 文档：PRD.md / CHANGELOG.md + openspec 归档
