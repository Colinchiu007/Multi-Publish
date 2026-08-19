## Context

历史结果页的按钮经 ResultView、publisher API、preload、Story2Video IPC 进入 story2video-project-service。图片路径构造 optimization_strategy=llm、bypass_cache=true、max_length=2000 和全场景 context，再经 ServiceBus 进入 PromptBridge；启动阶段把 ModelProviderManager 注入 PromptBridge，因此模型设置属于生产链路的一部分。

现有历史服务对图片响应要求 strategy_used=llm、key_source=caller、cache_hit=false 且优化词非空。这些保护不能删除：Prompt Engine 在错误时可能返回带 error 的原文回显，放宽校验会把失败误写成成功。当前测试直接 mock serviceBus.optimizePrompt 返回理想对象，没有覆盖真实 HTTP 响应、BYOK 解析、ServiceBus 转发和错误传播的组合。

## Goals / Non-Goals

**Goals:**

- 让历史图片/视频提示词重生成在真实 PromptBridge 响应契约下正确识别成功与失败。
- 错误响应、HTTP 非成功、缺失执行元数据和原文回显均 fail-closed：保持原 prompt/videoPrompt，持久化 failed，并保留可诊断的上层错误。
- 成功响应只在有效非空优化词和要求的执行元数据同时满足时落库。
- 用本机临时 HTTP 服务或真实 HTTP 边界构造跨层回归测试，不把最终 service mock 当成集成覆盖。

**Non-Goals:**

- 不删除或放宽历史服务的执行元数据校验。
- 不改变 Prompt Engine 的服务端 API、模型账号配置 UI、缓存语义或历史数据结构。
- 不把模型账号或网络失败转换成伪成功，也不在 renderer 中绕过主进程模型绑定。

## Decisions

### 1. 在现有边界归一化响应，不新增第二套优化协议

沿用 PromptBridge 的现有请求和响应形态，在进入历史项目服务的边界保证单项结果可被稳定消费；历史服务继续执行最终 fail-closed 校验。选择此方案是因为它修复跨层契约而不改变 Prompt Engine API。

备选方案是直接删除 extractImageOptimizedPrompt 的元数据要求，实施简单但会把 optimized_prompt=原文、error=... 当作成功，违反既有错误合同，因此不采用。

### 2. 成功与失败分别由结构化证据决定

成功必须同时有非空优化词和 Prompt Engine 的有效执行元数据；响应中出现错误字段、HTTP 非成功或缺失必要元数据时走失败分支。失败分支不得用原文回显覆盖业务字段，并由历史服务统一保留旧值和写回 failed。

### 3. 组合测试从真实 ServiceBus/PromptBridge 边界开始

测试使用真实 ServiceBus 和 PromptBridge，只替换外部 HTTP 服务为本机临时 server 或最小可控 transport；同时断言请求中的 BYOK llm、caller、optimization_strategy、bypass_cache、max_length、context 和不允许的内部字段。这样可区分请求构造错误、HTTP/业务错误和历史持久化错误。

### 4. UI 测试补真实点击语义但不复制主进程逻辑

ResultView 只补 DOM 点击到 regenerateScenePrompt、dirty 保存门控和失败通知的回归断言；模型响应判定由主进程组合测试负责。这样测试职责清晰，避免 renderer mock 再次掩盖跨层问题。

## Risks / Trade-offs

- [Prompt Engine 响应版本差异] -> 在归一化层接受当前成功契约的必要字段，并对未知或不完整响应 fail-closed；保留原始错误供既有错误归一化层处理。
- [组合测试运行较慢或受本机端口影响] -> 使用随机端口和可关闭的临时 server，测试结束无残留；服务级单元测试继续保留。
- [历史服务已有失败基线] -> 先运行受影响测试记录基线，再只修改本任务涉及断言和行为，不重写无关素材 URL/结果页测试。

## Migration Plan

1. 先添加旧代码应失败的真实链路回归测试，确认测试确实能复现当前缺陷。
2. 实施最小响应契约修复，运行服务、桥接、IPC 和 renderer 定向测试。
3. 执行 Electron renderer build、依赖解析门禁和 QM-1 打包/ASAR/启动验证。
4. 失败时可回滚本分支代码；不需要数据迁移，历史失败记录保持兼容。
