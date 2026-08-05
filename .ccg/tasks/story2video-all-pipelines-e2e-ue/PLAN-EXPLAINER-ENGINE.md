# animated-explainer（AI 讲解视频）真实引擎实施计划（2026-08-06）

## 目标
让 animated-explainer 从"state_machine 占位"变成真实编排流水线：纯文本主题 → LLM 规划（研究/方案/文案/分镜）→ 图片+旁白生成 → FFmpeg 合成 → 发布（可选）。复用 story2video 已打通的 合成引擎 / 资源生成 / 内容政策重试。

## 复用点（已核实）
- `PipelineEngine.startOrchestrated(name, {autoAdvance})` 已通用（仅 story2video 有参数归一化；animated-explainer 直接透传 params.text）。
- `StageExecutor.registerStageExecutor(type, fn)` + stageDefs（pipeline-engine.js:128-250 模式）。
- `aiGenerator.generateWithDefault('llm', {messages})` → 默认 LLM（当前=agnes-llm，已配置）。
- 内置 `compose`（stage-executor.js:349，`_resolveInput` 支持 `inputFrom`）→ ServiceBus.composeVideo → story2video ffmpeg 引擎。
- 内置 `publish`（stage-executor.js:369，未选平台=跳过）。
- story2video_generate_assets 执行器（story2video-stages.js:305）→ 通过嵌套 dispatch 复用，context 适配 optimize/split。

## 新模块
- `apps/desktop/electron/services/explainer-stages.js`：注册 6 个自定义阶段类型：
  research / proposal / script / scenes（LLM 链）+ generate_assets（适配+复用）+ editing（校验透传）。
- `pipeline-engine.js`：animated-explainer 条目补 stageDefs（8 阶段，compose/publish 用内置类型）。
- `container.setup.js`：`registerExplainerStages(engine)`。

## 测试
- explainer-stages.test.js：LLM 各阶段（mock aiGenerator）、scenes JSON 解析、generate_assets 适配复用、缺 LLM 报错。
- pipeline-engine 编排测试：animated-explainer startOrchestrated 自动跑完 8 阶段（mock 执行器）。
- 真实 E2E（下轮）：UI 输入主题 → 启动 → 8 阶段 → video.mp4 + ffprobe。

## 前端（下轮）
- CreateView.isOrchestratedPipeline 纳入 animated-explainer；表单用文本输入 + 输出设置；启动走 startOrchestratedPipeline。
