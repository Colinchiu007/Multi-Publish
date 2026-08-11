## ADDED Requirements

### Requirement: 视频提示词统一经 prompt-engine 优化
所有视频提示词优化路径（videogen 流水线 videogen_generate 前、Story2Video 混合模式 select_video_scenes→generateSceneVideo 前）SHALL 统一调用 prompt-engine 服务（POST /v1/optimize 或 /v1/optimize/batch，请求携带 domain=video），执行视频提示词改写与输出校验；不得绕过 prompt-engine 直接把未经优化的提示词提交视频 provider，也不得把图片优化提示词原样复用为视频提示词。

#### Scenario: videogen generate 前优化
- **WHEN** videogen 流水线执行 videogen_generate 阶段且场景提示词数组非空
- **THEN** 每个场景提示词经 PromptBridge 以 domain=video 提交 prompt-engine 优化，校验通过后的 optimized_prompt 才传入 callAdapter('generateVideo')

#### Scenario: 混合模式视频场景优化
- **WHEN** Story2Video 混合模式选中 useVideo 场景且其提示词来自图片优化结果
- **THEN** 该提示词先经视频优化引擎（domain=video）改写，再提交 generateSceneVideo；不得直接复用图片 optimized_prompt

#### Scenario: 服务不可用明确失败
- **WHEN** prompt-engine（8013）未运行或 /v1/optimize 网络失败
- **THEN** 视频优化阶段返回明确错误（如「prompt-engine 未运行，无法优化视频提示词」），不静默回退到默认 LLM，也不把原 prompt 当作优化结果继续

### Requirement: 领域与视频平台契约
视频优化请求 SHALL 携带 `domain` 字段（缺省 image，显式 video 进入视频领域）；视频平台采用 VideoPlatformType 枚举（sora/kling/veo/runway/wan/seedance/minimax/hunyuan/cogvideo/ltx/higgsfield/grok/agnes/generic_video），风格沿用 StyleType 枚举与 auto_detect_style 语义；别名（sora-v2、kling-pro、veo3 等）发送前归一，非法值回退 generic_video。

#### Scenario: domain 缺省兼容
- **WHEN** 请求不传 domain（现有图片调用方）
- **THEN** 行为与图片契约完全一致，不进入视频领域，零回归

#### Scenario: 视频平台别名归一
- **WHEN** 输入使用非规范别名（如 sora-v2、kling-pro、veo-3、runway-gen4）
- **THEN** 归一为契约枚举（sora、kling、veo、runway）后提交；非法平台回退 generic_video

### Requirement: 结构化视频输出
视频优化结果 SHALL 返回结构化 `video` 对象（shot 景别、camera 机位/运动、motion_intensity 1-10、scene_transition 转场、continuity_token 一致性令牌、duration_hint 秒），并渲染单串 `optimized_prompt`（可直接喂视频 provider）；上层编排读结构化字段，provider 直用渲染单串。

#### Scenario: 结构化字段可选回退
- **WHEN** 某视频优化结果缺少可选 video 字段（如 scene_transition）
- **THEN** 结构化校验以 optimized_prompt 非空为准，缺失的可选字段以默认值填充，不拒绝整条结果

### Requirement: 输出校验 fail closed
视频优化结果 SHALL 经过输出校验：optimized_prompt 非空字符串且不超过 max_length；error 非空视为失败；批量结果数量与输入一致；任一项无效立即失败。视频字段越界（motion_intensity 非 1-10 等）收敛到边界或置默认。

#### Scenario: 空/超长/error 结果失败
- **WHEN** 某视频场景 optimized_prompt 为空、超长或响应 error 非空
- **THEN** 视频优化阶段失败并输出含场景序号的可解释错误，不进入视频生成

#### Scenario: 批量数量不匹配失败
- **WHEN** optimize/batch 返回结果数量与输入场景数不一致
- **THEN** 阶段失败并报告 expected/got 数量

### Requirement: 上下文与一致性
视频优化请求 SHALL 支持视频上下文（full_text 完整文案、scene_type 场景类型、narration 旁白、prev_scene/next_scene 前后场景、duration_hint、aspect_ratio、continuity_token 一致性令牌）；context 发送前 SHALL 复用敏感凭据键拦截（api_key/token/secret/password 等），命中即拒绝。

#### Scenario: 敏感键拦截
- **WHEN** context 对象含 api_key/token/secret 等敏感键（任意层级）
- **THEN** 请求被拒绝并给出可解释错误，不发送外部服务

#### Scenario: 一致性令牌透传
- **WHEN** 上层提供 continuity_token（如角色/场景/风格令牌）
- **THEN** 令牌随 context 透传，优化结果保留同一令牌供跨场景一致性消费

### Requirement: 配置契约边界
视频优化配置 SHALL 对齐 prompt-engine 参数边界并做输入校验：domain 枚举（image/video）、视频平台枚举、creativeLevel 1-10（默认 5）、maxLength 50-2000（默认 500）、numCandidates 1-5（默认 1）、negativePrompt ≤500、autoDetectStyle boolean（默认 true）；越界输入拒绝或按边界收敛。

#### Scenario: 配置范围校验
- **WHEN** 用户传入越界 creativeLevel/maxLength/numCandidates 或非法 video platform
- **THEN** 配置归一化拒绝越界值或收敛到边界并给出可解释错误

### Requirement: 场景-测试映射
本能力每个 WHEN/THEN 场景 SHALL 在实现中映射到对应测试（单元/集成），标注于 change tasks.md；不依赖真实 8013 服务，使用 mock PromptBridge 或本地 HTTP stub 覆盖契约。

#### Scenario: 契约测试不依赖真实服务
- **WHEN** 运行视频优化相关测试
- **THEN** 通过 mock/本地 stub 验证请求体（domain/platform/motion 相关字段）与响应校验（空/超长/error/数量不匹配/结构化字段），真实 8013 与 LLM key 只作为外部验收边界
