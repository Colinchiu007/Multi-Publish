# 需求与范围

## 需求（用户原话）
整体 E2E 测试视频创作（CreateView）除「图片轮播」（story2video-compose）以外的其他流水线。

## 范围
- 不改业务代码；仅扩展桌面端 E2E 测试设施（apps/desktop/tests/e2e/helpers/）。
- 覆盖对象：真实 pipeline-engine 内置 14 条流水线中，除 story2video-compose 外的 13 条：
  - 自动编排（text 输入 → pipelineStartOrchestrated）：animated-explainer、framework-smoke、documentary-montage、animation、avatar-spokesperson、character-animation、hybrid
  - 媒体流水线（video 素材 + 口播文案 → pipelineStartOrchestrated）：clip-factory、cinematic、talking-head、localization-dub
  - 状态机流水线（text → pipelineStart）：podcast-repurpose
  - 不可用流水线（screen-demo，available=false）：详情可进入、不可用提示、启动禁用、不触发启动 IPC
- 每条约 3 个断言：详情渲染 / 标题渲染 / 启动携带正确流水线名（IPC method + args[0]）。

## 变更文件
- apps/desktop/tests/e2e/helpers/ipc-mock.js：pipelineList 与 pipeline-engine.js 对齐（14 条 + available 标记）；
  pipelineStart/pipelineStartOrchestrated 记录流水线名；新增 getPathForFile / story2videoImportMedia / story2videoImportMediaPath mock。
- apps/desktop/tests/e2e/helpers/route-functional-suite.js：exerciseCreate 逐条覆盖 13 条非图片轮播流水线 + screen-demo 不可用路径。

## 验收
- create 路由 E2E ≥ 全绿（58/58）。
- 全量 E2E（18 路由 + 6 集成流）全绿。
- 引擎级 vitest（pipeline-engine / stage-executor / resume-orchestration 等）+ 契约测试全绿。
- eslint 0 warning。
