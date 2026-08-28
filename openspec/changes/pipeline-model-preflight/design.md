## Context

现状：启动链路（CreateView.handleStartPipeline → startOrchestratedPipeline/startExplainerPipeline/startMediaPipeline → pipeline:startOrchestrated → PipelineEngine.startOrchestrated）只校验登录、文本与流水线可用性；模型缺失的失败发生在阶段执行器中（videogen-stages「默认 LLM 不可用」/「未配置可用的视频供应商」、story2video-stages ai-judged LLM 失败、prompt-bridge resolveLlmBind 抛错），前端统一归一化为 story2video.model_configuration_required。

ModelProviderManager 已提供与运行时解析一致的语义：getDefault(category) 返回类别/多模态默认可用 provider；isConfigured(category) 判断类别行可用；IPC 已暴露 model-provider:is-configured / get-default（本次无需新增 IPC）。Story2Video 参数契约已归一化（story2video-text-config.js）：story2videoTextConfig.video.mode（off/fixed/ai-judged，默认 off）、video.provider/model、voice.provider（空=Edge TTS）、image.provider、creation.mode，兼容扁平参数 videoMode/videoProvider/voiceProvider/imageProvider。

目标基线：origin/main，已合入的既有前置校验（登录门、文本长度、并发预算）与 stage 内 fail-closed 均保留。

## Goals / Non-Goals

**Goals:**
- 单一闸口：新 run 创建前统一执行能力前置校验（手动、批量共用）。
- 映射与运行时一致：静态映射 + story2video 动态规则；校验语义复用 getDefault/explicit-provider 凭据检查。
- Fail-open 边界：模型管理器不可用时保持既有行为。
- 用户可操作提示：缺失能力清单 + 去模型设置跳转；zh/en 成对文案。

**Non-Goals:**
- 不改模型设置页/能力默认配置（model-multimodal 语义不变）。
- 不做 renderer 侧轮询式预检查（避免双数据源）；不改 resume 语义。
- 不校验 prompt-engine（8013 外部服务）可用性——该服务缺失已有独立归一化（optimize_service_unavailable）。
- 不拦截纯本地流水线（talking-head/cinematic/clip-factory/framework-smoke）。

## Decisions

**D1 闸口位置：PipelineEngine.startOrchestrated 内、normalize 之后、start() 之前。**
备选：IPC handler 层（pipeline.js）→ 只覆盖 UI 手动启动，批量队列（直接调用 engine）漏掉；各 renderer 启动函数 → 多入口重复且可绕过。选 engine 内统一闸口，批量/未来调用方自动覆盖。resumeOrchestration 不调用闸口（保持恢复语义）。

**D2 校验语义：默认用 getDefault(capability)，显式用 getProviderWithKey 凭据检查。**
getDefault 已封装多模态能力默认与 capability_enabled.video 规则，与阶段执行器 resolveCurrentCapabilityConfig 同源，避免预检查与实际路由不一致；显式 provider 检查复用运行时 callAdapter 的凭据判定（可解密 Key 或本地免 Key），不做 enabled 强校验（与 callAdapter 一致）。

**D3 能力映射与参数解析：独立 services/pipeline-model-preflight.js，入参用归一化后的 params。**
startOrchestrated 内 story2video 参数已 normalize（story2videoTextConfig 生成 video/voice/image/creation 段），映射函数从 params.story2videoTextConfig（回退扁平 videoMode/voiceProvider/imageProvider）取值；静态映射按流水线名声明，覆盖 PIPELINES 注册表全部已实现编排流水线。新流水线未登记时 fail-open（不误伤未来流水线），并 log.warn 提示补映射。

**D4 错误契约：success=false, errorCode=PIPELINE_MODEL_REQUIREMENTS_MISSING, errorParams.missing=能力数组, error=可读中文摘要。**
renderer 通知归一化把 errorCode 映射为 story2video.models_required，缺失能力 id 经 locales 标签表（modelCapabilityLabels）转中文/英文，避免主进程携带用户文案（i18n-content-sync）。批量队列项复用该契约标记失败。

**D5 模型管理器 fail-open。**
管理器未注册/未初始化（如纯引擎单测环境）时跳过校验并 log.warn，防止把环境问题误报为用户模型缺失；生产 container.setup 恒注册管理器。

**D6 TTS/LLM/图像边界。**
tts：内置 Edge TTS 免配置（asset-generator 默认），仅显式非空 voiceProvider 时校验；llm：story2video 仅 ai-judged 必需（split 本地、scene_context 规则、optimize 走 prompt-engine 外部服务）；image：generate_assets 恒生成图，恒必需；speech_recognition：podcast-repurpose 无 transcript 时必需。

## Risks / Trade-offs

- 映射与阶段实现漂移：阶段执行器后续增删模型调用而映射未同步 → 映射表与各 *-stages.js 的实际 resolve 点互注注释，用单测逐流水线断言映射快照；改动 stage 的 PR 需同步映射表（写入 PRD/规格提醒）。
- fail-open 掩盖真实缺失：管理器未 ready 时跳过校验 → 仅日志告警 + 生产路径恒注册，风险低；不把该分支用于用户可见行为。
- 显式 provider 未 enabled 的例外：callAdapter 允许 enabled=0 的 provider 带 Key 调用 → 前置校验保持与 callAdapter 一致，不额外拦截（避免预检与运行不一致）。
- Edge TTS 依赖 Python edge-tts 运行时：打包环境无 Python 时 TTS 仍可能失败 → 不改动该既有能力边界，前置校验只保证配置层面不缺失。

## Migration Plan

无数据迁移。发布后行为变化：模型缺失时启动提前拦截；本地/已配置流水线无感知。若出现误拦截，回退方案为移除 startOrchestrated 中的闸口调用（单点），映射与文案保留不影响运行。

## Open Questions

无。
