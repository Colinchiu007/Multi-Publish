# Tasks

> 状态：实现与门禁已完成（2026-08-16），待双模型审查 → PR 合并后归档。

## - [x] 主进程：stageDef 默认 max_length 500→2000
  - [x] `pipeline-engine.js` STORY2VIDEO stageDefs optimize.options.max_length → 2000
  - [x] `resolveRuntimeStageOptions` optimize 分支新增 `set('max_length', input.story2videoTextConfig?.optimize?.maxLength)`
  - 测试：`pipeline-story2video-contract.test.js` stageDef 恒含断言 + 请求 max_length 2000；resolveRuntimeStageOptions 透传用例（通用执行器 tiered 默认 500 保持，视频 8020 不动）

## - [x] 历史记录重生成路径（用户实际编辑/重生成入口）
  - [x] `story2video-project-service.js` regenerateScenePrompt（kind=image）改经 `buildPromptEngineOptimizeRequest` 显式携带 `max_length=2000` + 2000 防御性本地截断
  - 测试：`story2video-project-service.test.js` 断言 max_length=2000 透传 + 超长 2000 截断

## - [x] 文本配置契约默认值
  - [x] `story2video-text-config.js` optimize.maxLength 默认 500→2000（区间 [50,2000] 不变）
  - 测试：`story2video-text-config.test.js` 默认/区间断言

## - [x] 渲染层设置 + 透传
  - [x] `CreateView.vue` s2vConfig 新增 `maxPromptLength: 2000`
  - [x] 「外观」折叠区新增「提示词最大长度」select（200/300/400/500/700/1000/1500/2000），文案走 translateWithLocaleFallback('create.story2video.maxPromptLength')
  - [x] `buildStory2VideoTextConfig` optimize 块新增 `maxLength: config.maxPromptLength`
  - 测试：`CreateView.test.js` 设置渲染 + 透传用例

## - [x] 文案 zh/en 成对
  - [x] `locales/zh.js` + `locales/en.js` 新增 `create.story2video.maxPromptLength`
  - 测试：`node scripts/check-locale-sync.js` 通过

## - [x] 门禁与文档
  - [x] 运行受影响的 Vitest 用例
  - [x] `apps/desktop` 构建（vue build）通过
  - [x] `01-docs/CHANGELOG.md` 记录
  - [x] openspec validate 通过
