## Why

流水线页面点击「启动流水线」时不做模型配置前置校验：即使当前未配置该流水线所需的模型能力（如 LLM/生图/视频/语音），流水线也会直接启动，直到执行到需要模型的阶段才弹出「未找到模型」提示。此时用户已等待若干阶段、部分额度可能已消耗，且错误与流水线/模式的关联上下文丢失。需在启动前按「流水线 → 所需模型能力」映射校验并拦截，让用户带着明确的缺失清单去模型设置补齐。

## What Changes

- 新增主进程前置校验模块 pipeline-model-preflight：在 PipelineEngine.startOrchestrated 创建 run 之前，按流水线解析所需模型能力（llm/image/video/tts/speech_recognition），校验通过才允许启动；不通过返回统一错误契约 errorCode=PIPELINE_MODEL_REQUIREMENTS_MISSING + errorParams.missing（缺失能力列表），不创建 run、不触发阶段执行。
- 建立「流水线 → 所需模型能力」映射：逐条已实现编排流水线声明静态需求；story2video-compose（故事讲述）按模式动态判断——video.mode=off（纯图片轮播）不要求视频模型，fixed/ai-judged 要求视频模型，ai-judged 额外要求 LLM；TTS 仅在用户显式选择非 Edge 语音 provider 时要求（内置 Edge TTS 免配置）。
- 校验语义与运行时解析一致：未显式选择能力时用 ModelProviderManager.getDefault(capability)（含多模态能力默认/capability_enabled.video 规则）；用户显式选择 provider 时校验该 provider 是否有可用凭据（可解密 API Key 或本地免 Key provider）。
- 批量创作（story2video 批量队列）逐项复用同一启动入口，自动获得同一前置校验；断点续跑（resume）不做前置拦截，避免模型变更后已暂停/失败 run 无法恢复。
- Renderer 错误归一化新增 models_required 提示：弹窗列出缺失能力的中文/英文标签并提供「去模型设置」跳转（/model-providers）；文案写入 locales zh/en 成对，遵守 i18n-content-sync。
- 同步更新 PRD（01-docs/PRD-S2V-PIPELINE-PAGE-UX.md）与既有规格（story2video-video-carousel-blend 的视频生成器前置校验扩展到启动前）。

## Capabilities

### New Capabilities
- pipeline-model-preflight: 编排流水线启动前的模型能力前置校验契约（映射、动态规则、校验语义、错误契约与用户提示）。

### Modified Capabilities
- story2video-video-carousel-blend: 「视频生成器前置校验」从 select_video_scenes 阶段内扩展为启动前同样必须拦截（阶段内 fail-closed 保留），明确 video.mode=off 不要求视频模型、fixed/ai-judged 在启动前即要求视频模型/LLM。

## Impact

- 主进程：apps/desktop/electron/services/pipeline-engine.js（startOrchestrated 接入）、新增 services/pipeline-model-preflight.js 及对应测试。
- Renderer：apps/desktop/src/views/CreateView.vue（弹窗与跳转）、apps/desktop/src/story2video/story2video-notifications.js（归一化）、locales/zh.js + locales/en.js（成对文案）。
- 文档：01-docs/PRD-S2V-PIPELINE-PAGE-UX.md、openspec specs（pipeline-model-preflight 新增 + story2video-video-carousel-blend 修改）。
- 行为影响：模型缺失时启动被提前拦截（原为运行到模型阶段才失败）；resume/纯本地流水线行为不变。
