# story2video-scene-context Specification（delta）

## MODIFIED Requirements
### Requirement: 中间层阶段接入流水线
Story2Video 流水线 SHALL 紧随 split 之后提供 `scene_context` 阶段（独立 domain_enrich 阶段不再存在），读取完整文案与分句场景，输出全局故事上下文与增强后的场景数组，并让 optimize 阶段优先消费该输出。

#### Scenario: 新阶段默认接入
- **WHEN** Story2Video 文案流水线运行且 scene_context 未显式禁用
- **THEN** 流水线按 `split → scene_context → optimize` 顺序执行，optimize 消费 context.scene_context 的场景数组，阶段清单不包含 domain_enrich

#### Scenario: 场景数组为空
- **WHEN** scene_context 阶段的输入场景数组为空或非数组
- **THEN** 阶段 fail closed 返回失败，不产出伪造场景

#### Scenario: 历史 run 阶段清单
- **WHEN** 读取合并前创建的持久化分段/历史 run
- **THEN** 其 domain_enrich 相关字段仅作只读兼容展示，不参与新流水线执行，且不报错

## ADDED Requirements
### Requirement: 历史内容增强（imagePromptSeed 种子契约）
当内容类型为 `history` 时，scene_context SHALL 为每个场景生成 `imagePromptSeed` 与 `prompt` 字段：内容为「场景文本；视觉风格；光线描述；无文字、主体明确」模板；视觉风格/时代/朝代一律取自全局故事上下文规则表结果；情感倾向（positive/negative/peaceful）判定独立于 tone，负面情感使用「阴影与冷色氛围」光线分支，否则使用「自然层次与叙事光线」；该种子生成不得受 scene_context 禁用开关影响。

#### Scenario: history 内容类型生成种子
- **WHEN** contentType=history 且场景文本为历史题材（如含「唐朝」「长安」）
- **THEN** 每个场景输出 imagePromptSeed 与 prompt，包含规则表对应的朝代视觉风格与「无文字、主体明确」提示卫生，且 era/visualStyle 与全局故事上下文一致

#### Scenario: general 内容类型不生成种子
- **WHEN** contentType=general
- **THEN** scene_context 不生成 imagePromptSeed/prompt 字段（与合并前 domain_enrich 透传语义等价），场景原字段透传

#### Scenario: scene_context 禁用仍生成种子
- **WHEN** contentType=history 且 scene_context.enabled=false
- **THEN** 全局上下文融合被跳过，但每个场景仍生成 imagePromptSeed/prompt（保持合并前 domain_enrich 独立于 scene_context 开关的语义）

### Requirement: 上下文契约不变
scene_context 发送 prompt-engine 的 context SHALL 继续仅输出 CONTEXT_KEY_WHITELIST 白名单键；seed 模板内容属于本地场景字段，不改变优化请求契约字段集合。

#### Scenario: 白名单保持
- **WHEN** contentType=history 且 scene_context 生成种子后发送优化请求
- **THEN** 发送给 prompt-engine 的 context 仍只含白名单键，imagePromptSeed 仅作为优化请求的 prompt 输入（非 context 键）
