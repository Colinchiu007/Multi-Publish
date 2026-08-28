## Purpose

定义编排流水线在启动前按「流水线 → 所需模型能力」映射做模型配置前置校验的契约：缺失时在创建运行之前拦截并返回结构化错误，避免启动后才在模型阶段失败；同时定义能力需求的静态映射与 story2video-compose 按模式动态判断规则。

## ADDED Requirements

### Requirement: 编排流水线启动前置校验

编排流水线启动（PipelineEngine.startOrchestrated 创建新 run）时，系统 SHALL 在创建 run 与触发任何阶段执行之前，按该流水线所需模型能力集合校验模型配置；任一必需能力缺失时 MUST 返回 errorCode=PIPELINE_MODEL_REQUIREMENTS_MISSING 且携带 errorParams.missing（缺失能力标识数组），不得创建 run、不得消耗阶段资源。批量创作队列项复用同一启动入口，SHALL 遵守同一契约（该项标记失败并携带同一错误码）。断点续跑（resumeOrchestration）SHALL 不做前置拦截。

#### Scenario: 缺失能力启动被拦截
- **WHEN** 用户启动需要 llm+video 能力的流水线，且模型管理器中 video 能力无可用的默认 provider
- **THEN** 启动返回 success=false 与 PIPELINE_MODEL_REQUIREMENTS_MISSING，missing 数组包含 video，运行记录不创建

#### Scenario: 批量项同样被拦截
- **WHEN** 批量创作队列的某一项启动时缺失必需能力
- **THEN** 该项标记失败并携带 PIPELINE_MODEL_REQUIREMENTS_MISSING，不进入运行

#### Scenario: 断点续跑不受影响
- **WHEN** 用户对历史失败/暂停运行执行断点续跑且当前模型配置不完整
- **THEN** 不触发前置校验，按既有 resume 语义继续

### Requirement: 流水线所需能力映射

系统 SHALL 维护已实现编排流水线的所需能力映射：animated-explainer → llm+image；animation / avatar-spokesperson / character-animation / hybrid → llm+video；documentary-montage → llm+image；localization-dub → llm（显式选择非空语音 provider 时额外要求 tts，内置 Edge TTS 免配置）；podcast-repurpose → image（在无文案输入时额外要求 speech_recognition）；talking-head / cinematic / clip-factory / framework-smoke → 无（纯本地）；film-engineering → 无（启用了 LLM 增强开关时额外要求 llm）；story2video-compose → 按动态规则（见下条）。映射变更时 MUST 同步更新校验与测试，避免与阶段执行器实际能力使用漂移。

#### Scenario: 本地流水线免校验
- **WHEN** 启动 talking-head 且未配置任何模型能力
- **THEN** 前置校验通过，流水线按本地流程执行

#### Scenario: 视频类流水线要求视频模型
- **WHEN** 启动 animation 且 LLM 已配置、视频模型未配置
- **THEN** 启动被拦截，missing 数组包含 video

### Requirement: story2video-compose 按模式动态判断

story2video-compose SHALL 依据 story2videoTextConfig（含兼容的扁平参数 videoMode/videoProvider/voiceProvider/imageProvider）动态解析需求：image 恒为必需（generate_assets 必生成图片素材）；video 仅在 video.mode（或 videoMode）为 fixed 或 ai-judged 时必需，off 或其他模式不要求视频模型；llm 仅在 video.mode=ai-judged 时必需（AI 智能选择场景评估）；tts 仅当显式选择非空且非 Edge 语音的 voiceProvider 时要求校验该 provider。video.mode 缺失按 off 处理。

#### Scenario: 纯图片轮播不要求视频模型
- **WHEN** story2videoTextConfig.video.mode=off 且未配置任何视频模型
- **THEN** 前置校验不因 video 缺失拦截，流水线可按图片轮播启动

#### Scenario: 固定比例要求视频模型
- **WHEN** video.mode=fixed 且未配置视频模型
- **THEN** 启动被拦截，missing 数组包含 video

#### Scenario: AI 智能选择要求视频模型与 LLM
- **WHEN** video.mode=ai-judged 且 LLM 与视频模型均未配置
- **THEN** 启动被拦截，missing 数组包含 llm 与 video

### Requirement: 能力校验语义

前置校验 SHALL 与运行时模型解析语义一致：能力未显式指定 provider 时，以 ModelProviderManager.getDefault(capability) 返回可用 provider（含多模态能力默认与 capability_enabled.video 规则，见 model-multimodal 规格）为已配置；用户显式指定 provider 时，校验该 provider 存在且凭据可用（可解密 API Key 或本地免 Key provider，如 piper/本地扩散）。内置 Edge TTS（免费、无需 API Key）不作为 tts 能力配置要求。模型管理器不可用（未初始化/未注册）时 SHALL fail-open 跳过前置校验并记录日志，保持既有启动行为。

#### Scenario: 默认解析通过
- **WHEN** 流水线要求 image，未显式指定 provider，且 getDefault('image') 返回可用的多模态或类别 provider
- **THEN** 前置校验通过

#### Scenario: 显式 provider 无凭据被拦截
- **WHEN** story2video 显式指定 video.provider=某未配置 API Key 的 provider
- **THEN** 启动被拦截，missing 数组包含 video 且附该 provider 标识

#### Scenario: Edge TTS 免配置
- **WHEN** story2video 未显式选择语音 provider（走内置 Edge TTS）且未配置任何 tts provider
- **THEN** 前置校验不因 tts 拦截

### Requirement: 模型缺失用户提示

启动被前置校验拦截时，Renderer SHALL 展示可操作的本地化提示：列出缺失能力（使用用户语言的模型能力标签）并说明需在「模型设置」中补齐，同时 SHALL 提供直达模型设置页面（/model-providers）的入口；提示文案 SHALL 来自 locales（zh/en 成对），经既有通知归一化链路渲染，不得把原始错误文本直接暴露给用户。

#### Scenario: 缺失清单弹窗
- **WHEN** 启动返回 PIPELINE_MODEL_REQUIREMENTS_MISSING 且 missing=[llm, video]
- **THEN** 弹窗正文列出「推理模型、视频模型」两条缺失能力标签并显示去模型设置按钮

#### Scenario: 英文界面文案
- **WHEN** UI 语言为英文且同一错误发生
- **THEN** 弹窗展示英文能力标签与英文引导文案
