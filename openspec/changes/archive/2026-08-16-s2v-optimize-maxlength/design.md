## Context

现状链路：`CreateView.buildStory2VideoTextConfig` → `pipeline:startOrchestrated` params.story2videoTextConfig → `PipelineEngine._executeStage` stage options 合并（stageDef.options + run.stage.options + resolveRuntimeStageOptions）→ 执行器 `buildPromptEngineOptimizeRequest(prompt, options)` → 8013 契约收敛 [50,2000] → `extractOptimizedPrompt` 以 `request.max_length` 硬截。

方案：把默认值放到 stageDef（2000），并把渲染层配置经 resolveRuntimeStageOptions 透传到 stage options。

## Selected Approach

1. `pipeline-engine.js` STORY2VIDEO stageDefs optimize.options.max_length 500 → 2000（单一默认来源）。
2. `resolveRuntimeStageOptions` optimize 分支新增 `set('max_length', ...)`，取值优先级：`input.story2videoTextConfig?.optimize?.maxLength`（渲染层显式提交）→ 不提交则保留 stageDef 默认 2000。
3. `CreateView`：
   - `s2vConfig` 默认新增 `maxPromptLength: 2000`；
   - 「外观」折叠区新增「提示词最大长度」select（200/300/400/500/700/1000/1500/2000），文案走 locale 键；
   - `buildStory2VideoTextConfig` optimize 块新增 `maxLength: config.maxPromptLength`。
4. `story2video-text-config.js`：optimize.maxLength 校验区间保持 [50,2000]（后端契约），default 语义改为 2000 并与渲染层一致；参数越界仍收敛、不抛错（既有 numberValue 行为）。
5. 安全性：执行器 `buildPromptEngineOptimizeRequest` 的契约收敛是最终防线（4013 拒绝 >2000 ⇒ 请求构造必须 clamp 到 2000，已由契约测试覆盖），渲染层传 2000 以内不会被拒绝；传 NaN/空由 numberValue 回落。

## Alternatives Considered

- **仅改 stageDef 默认（不加 UI）**：改动最小，但用户无法按成本/模型能力调低，且「上限放开」无显式表达；否决——保留 UI 让长/短提示词可配置。
- **把上限放开到 20000（对齐视频域）**：8013 图片引擎 le=2000，超限会被 422 拒绝，放开到 20000 无实际意义且违反后端契约；否决。
- **截断改句子边界**：与本次「上限放开」正交，且会改变既有 truncate 语义（meta.truncated 标记依赖硬截行为）；单列为后续候选，不在本 change 范围。

## Risks

- 默认 500→2000 可能小幅增加图片生成 token 消耗与耗时；通过 UI 可调低，且实际输出长度由优化引擎自决（上限放开≠必然写满）。
- 旧 last-options 存储无 maxPromptLength：读取时 fallback 默认，无迁移负担。
