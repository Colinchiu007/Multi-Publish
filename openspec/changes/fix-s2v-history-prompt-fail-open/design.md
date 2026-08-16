# fix-s2v-history-prompt-fail-open — Design

## 技术方案

### R1: 本地提取器 error-first（fail-closed）

`story2video-project-service.js` 的 `extractOptimizedPrompt(result)`（第 127 行）改为与 `prompt-engine-contract.js:185`（`extractOptimizedPrompt` → kernel `extractOptimizedBase`）同语义的校验顺序：

1. `string` 直返不变。
2. **顶层对象先判错**（对齐 `prompt-engine-kernel.extractOptimizedBase` 的 `error → detail` 顺序）：先查 `source.error`/`source.detail`，有即抛错（`detail` 兼容 422 拒绝形态）；再处理 `results[0]` 包装：对象项同样 **先查 `item.error`/`item.detail`，有即抛错**；无错误再取 `optimized_prompt || prompt || optimized` 非空文本。
3. 错误优先于文本：无论错误与回显文本同层还是跨层（error 在顶层、回显在内层 `results`），一律按失败处理，回显原文不得写入。
4. 其余返回 `''`（调用方 `if (!optimizedText || !optimizedText.trim()) throw` 兜底）。

关键语义：引擎错误兜底响应形态 `{ optimized_prompt: <原文>, error: <真实错误> }` 必须被识别为失败，不得写入分段。image/video 两条重生成共用该提取器，一处修复双域生效。

### R4: 请求上下文与流水线同源

`regenerateScenePrompt` 的图片分支请求构造改为：

```js
const optimizeConfig = project.story2videoTextConfig?.config?.optimize
const optimizeStageOptions = safeOptimizeStageOptions(optimizeConfig)
const optimizeContext = buildOptimizeContext(
  project.segments.map(segment => ({ text: segment.text })),
  {
    ...(project.options || {}),
    ...(optimizeConfig && optimizeConfig.context ? { context: optimizeConfig.context } : {}),
  },
)
const imageOptimizeRequest = buildPromptEngineOptimizeRequest(seed, {
  ...optimizeStageOptions,
  max_length: PROMPT_ENGINE_LIMITS.maxLength.max,
  context: optimizeContext,
})
```

- `safeOptimizeStageOptions`：仅透传契约键 `platform/style/creative_level/creativeLevel/negative_prompt/negativePrompt/num_candidates/numCandidates/auto_detect_style/autoDetectStyle/quality_baseline`（context 由下方单独构造，max_length 显式覆盖 2000），其余 ignore——避免把 `maxRetries/concurrency/uiLocale` 等 stage 元键透传；context 构造仅发生在 `kind === 'image'` 分支，不波及 video 路径。
- `buildOptimizeContext`（story2video-stages.js:1383）与流水线「无 scene_context 回退路径」同一函数：产出 `full_text`（全场景文案）、自动 `scene_type`、继承 `options.context`（synopsis）。
- 白名单/敏感键过滤由 `buildPromptEngineOptimizeRequest` 内部完成（7 键白名单 + `assertNoSensitiveContext`），与流水线一致。
- 无 `story2videoTextConfig` 的存量项目（旧结构）降级为 `{}`，仅传 context，行为向后兼容。

### R2: 回归保护测试（story2video-project-service.test.js）

- 用例 1：`optimizePrompt` 返回 `{ results: [{ optimized_prompt: <原文> , error: '402 ...' }] }` → `rejects`，分段保持旧 prompt、`status=failed`、`error` 含 402 信息。
- 用例 2（video 域）：`optimizeVideoPrompt` 返回 `{ optimized_prompt: <原文>, error: 'xxx' }` → 同上，`videoPrompt` 不被改写。
- 用例 3（R4）：mock 返回成功，断言 `optimizePrompt` 收到含 `context` 的请求，且 `context.full_text` 包含全场景文案、`max_length=2000`。

## 不做的事

- 不改引擎仓库（`D:\Data\projects\prompt-engine` 切 main / 额度恢复属运维，交付时给出操作步骤）。
- 不改 UI 文案/错误提示层（现有通用失败提示已足够，失败原因经 error 透出）。
- 不引入 scene_context 重建（项目未持久化该中间层数据，`buildOptimizeContext` 回退路径即为可达成的最强同源）。
