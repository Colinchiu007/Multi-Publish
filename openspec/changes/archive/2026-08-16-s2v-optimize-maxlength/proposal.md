## Why

「视频创作-全能创作」启动流水线时，图片提示词优化阶段（story2video_optimize）的 `max_length` 硬编码为 500（pipeline-engine.js STORY2VIDEO stageDefs），执行器对优化器输出的图片提示词在 500 字符处按字符硬切（stage-executor.js extractOptimizedPrompt + slice）。实际案例：图片提示词被切断在 "The fortress city of Wunü Mo" 单词中间，历史记录编辑里看到的即残缺内容。后端 prompt-engine（8013）契约上限为 2000（PROMPT_ENGINE_LIMITS.maxLength.max=2000），当前默认 500 远未用满；渲染层也没有任何配置入口可以放宽。

目标：把图片提示词 `optimize.max_length` 默认上限从 500 放开到引擎契约上限 2000，并在创作页提供「提示词最大长度」设置（200–2000，默认 2000），让用户可按需控制提示词长度与成本，避免长文案被 500 字符硬截。

## What Changes

- **默认上限放开**：`pipeline-engine.js` STORY2VIDEO `optimize` stageDef `max_length: 500 → 2000`（图片/8013 契约上限，`PROMPT_ENGINE_LIMITS.maxLength.max`）；执行器契约收敛保持不变（[50, 2000]），超界值仍 fail-safe 收敛，不因放开默认而放宽校验。
- **渲染层可配置**：`CreateView` 的 s2vConfig 新增 `maxPromptLength`（默认 2000，选项 200/300/400/500/700/1000/1500/2000），置于「外观」折叠区；`buildStory2VideoTextConfig` 透传 `optimize.maxLength`；`PipelineEngine.resolveRuntimeStageOptions` optimize 分支新增 `max_length` 映射（读取 `story2videoTextConfig.optimize.maxLength`），执行器契约仍做最终收敛。
- **文本配置契约**：`story2video-text-config.js` optimize.maxLength 校验区间保持 [50, 2000] 不变（与 8013 后端 ge=50/le=2000 对齐），默认值语义 sync 为 2000。共享内核 `PROMPT_ENGINE_LIMITS.maxLength.default` 保持 500 不动（视频 8020 legacy 路径复用该常量，改动会跨域影响视频契约），Story2Video 各入口一律显式携带 `max_length=2000`。
- **历史记录重生成路径**：`story2video-project-service.regenerateScenePrompt`（kind=image）此前直接调 `serviceBus.optimizePrompt(seed, { index })`，`max_length` 被 bridge 剥离后走 8013 后端默认 500 截断（用户实际编辑/重生成入口）；改为经 `buildPromptEngineOptimizeRequest(seed, { max_length: max })` 显式携带 2000 并做相同 2000 防御性本地截断。
- **文案/兼容**：新增用户可见文案 `create.story2video.maxPromptLength`（zh/en 成对，CI Gate 7）；旧版本已保存的 last-options 无该字段时回落默认 2000，不破坏既有存储。
- **测试**：服务层（stageDef 默认收敛、resolveRuntimeStageOptions 透传、text-config clamp）、渲染层（设置项渲染与 buildStory2VideoTextConfig 透传）、locale 成对。

## Capabilities

### New Capabilities
- `story2video-optimize-maxlength`: 图片提示词优化长度上限契约——默认 2000、渲染层可配置区间 [200, 2000]、执行器契约收敛不可绕过。

### Modified Capabilities
- 无（既有 video-prompt-optimize-engine 面向视频 8020 域，独立于本次图片 8013 域改动）。

## Impact

- **代码**：`apps/desktop/electron/services/pipeline-engine.js`、`apps/desktop/electron/services/story2video-text-config.js`、`apps/desktop/src/views/CreateView.vue`、`apps/desktop/src/locales/zh.js`、`apps/desktop/src/locales/en.js`。
- **测试**：`stage-executor.test.js`、`story2video-text-config.test.js`、`CreateView.test.js`、`pipeline-engine` 相关断言、`check-locale-sync` CI、CJK 硬编码基线。
- **文档**：`01-docs/CHANGELOG.md`、本 change 的 specs/design/tasks。
- **不涉及**：视频提示词（8020 videoMaxLengthRanges）、生成执行器逻辑、IPC/preload 通道、数据库、第三方服务契约（8013 上限本就 2000）。
