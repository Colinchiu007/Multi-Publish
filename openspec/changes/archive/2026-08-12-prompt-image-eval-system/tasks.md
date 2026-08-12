# Tasks — prompt-image-eval-system

> 进度单一来源：以本文件 checkbox 为准。实现前先写/改测试（TDD）。

## 审计与前置

- [x] 基线审计：prompt-engine 8013 契约（prompt-bridge.js optimize/optimizeBatch）、image-prompt-engine spec、ModelProviderManager.callAdapter('chatCompletion')、IPC 注册中心/preload access-control、路由/导航/i18n 结构、story2video-stages.js 为其他任务脏文件（不得触碰）
- [x] OpenSpec change 创建：proposal → design → specs → tasks（本文件）并 `openspec validate` 通过

## 实现（codex/prompt-image-eval-system 分支）

### 任务 1：维度注册表 dimensions.js（TDD）
- [x] dimensions.test.js 先写：权重归一化（1/2/3+ 图）、等级边界（84/85、69/70、49/50）、白名单校验、非法值拒绝
- [x] dimensions.js 实现：IMAGE_DIMENSIONS、resolveDimensionWeights、GRADES、PROBLEM_CATEGORIES、PROMPT_PART、OPTIMIZATION_POINT_TYPES、SEVERITIES、断言函数、VIDEO_DIMENSIONS 占位
- 测试目标：`apps/desktop/electron/services/prompt-eval/dimensions.test.js`

### 任务 2：提示词构造 prompt-builder.js（TDD）
- [x] prompt-builder.test.js 先写：单图/多图分支、context 对象化、裁剪标记、视频拒绝、JSON 契约段存在
- [x] prompt-builder.js 实现：buildImageEvaluationPrompt / buildVideoEvaluationPrompt（拒绝）
- 测试目标：`apps/desktop/electron/services/prompt-eval/prompt-builder.test.js`

### 任务 3：LLM 解析校验 llm.js（TDD）
- [x] llm.test.js 先写：合法 JSON、代码块包裹、非法 JSON、缺维度/重复维度、分数越界、evidence 空、白名单外 severity/category/promptPart/type → 全部 fail closed
- [x] llm.js 实现：stripCodeFence + parseAndValidate + 错误 details
- 测试目标：`apps/desktop/electron/services/prompt-eval/llm.test.js`

### 任务 4：引擎 engine.js（TDD）
- [x] engine.test.js 先写：输入校验矩阵（每个 EVAL_*）、单图/多图、mock evaluator 成功/失败、瞬时错误重试 ≤2、store 写入、总体分与加权偏差标记
- [x] engine.js 实现：validateRequest、readImages、编排、report 组装
- 测试目标：`apps/desktop/electron/services/prompt-eval/engine.test.js`

### 任务 5：持久化 store.js（TDD）
- [x] store.test.js 先写：唯一临时目录、原子写、索引自愈、删除/不存在、Windows 锁错误有界重试（fs mock）
- [x] store.js 实现：save/list/get/delete + writeFileAtomic
- 测试目标：`apps/desktop/electron/services/prompt-eval/store.test.js`

### 任务 6：报告 report.js（TDD）
- [x] report.test.js 先写：记录结构、Markdown 内容、aggregate 统计（均值/分布/优化点汇总/推荐）
- [x] report.js 实现：buildRecord/toMarkdown/aggregate
- 测试目标：`apps/desktop/electron/services/prompt-eval/report.test.js`

### 任务 7：CLI cli.js
- [x] cli.js 实现：--image/--batch/--source-text/--context/--optimized-prompt/--negative-prompt/--evaluator/--out/--json；退出码 0/2；evaluator 模块加载契约
- [x] cli 冒烟测试（node 直接跑，合法输入 mock evaluator）
- 测试目标：`apps/desktop/electron/services/prompt-eval/cli.test.js`

### 任务 8：IPC + preload + service 门面
- [x] ipc-handlers/prompt-eval.test.js 先写：通道注册、sender 校验、run 参数/路径校验、CRUD、错误码透传
- [x] ipc-handlers/prompt-eval.js + index.js 注册 + preload/prompt-eval.js + preload/index.js + access-control.js 白名单
- 测试目标：`apps/desktop/electron/ipc-handlers/prompt-eval.test.js`、`apps/desktop/electron/preload/prompt-eval.test.js`

### 任务 9：Vue 评估视图
- [x] PromptEvalView.vue：3 Tab（运行/历史/聚合分析）+ 结果展示 + i18n；路由 /prompt-eval；AppNavbar 入口；zh.js 文案
- [x] composable 数据路径测试（IPC 非空数据 → 响应式状态）
- 测试目标：`apps/desktop/src/views/PromptEvalView.test.js`（或 composable 测试）

### 任务 10：文档与门禁
- [x] 01-docs/PRD.md 增补章节；CHANGELOG.md；.quality-gates.md 执行记录
- [x] 聚焦回归 + 质量门禁自检（156 聚焦 + CI 18/18 全绿）；Claude 审查已修复（antigravity 地区不可用已记录）；PR #559 已合并



