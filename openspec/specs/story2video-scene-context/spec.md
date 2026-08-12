# story2video-scene-context Specification

## Purpose
定义 Story2Video 在「分句引擎输出场景」与「图片提示词优化引擎」之间新增的故事背景上下文中间层：全局故事上下文提取、逐场景上下文融合、一致性/负面锚点注入、上下文对象契约与校验、配置边界与降级语义，保证提示词生成的图片/视频在故事背景上的准确性、一致性与连贯性。
## Requirements
### Requirement: 中间层阶段接入流水线
Story2Video 流水线 SHALL 在 domain_enrich 之后、optimize 之前提供 `scene_context` 阶段，读取完整文案与分句场景，输出全局故事上下文与增强后的场景数组，并让 optimize 阶段优先消费该输出。

#### Scenario: 新阶段默认接入
- **WHEN** Story2Video 文案流水线运行且 scene_context 未显式禁用
- **THEN** 流水线按 `split → domain_enrich → scene_context → optimize` 顺序执行，optimize 消费 context.scene_context 的场景数组

#### Scenario: 场景数组为空
- **WHEN** scene_context 阶段的输入场景数组为空或非数组
- **THEN** 阶段 fail closed 返回失败，不产出伪造场景

### Requirement: 全局故事上下文提取
scene_context SHALL 基于完整文案（而非单场景文字）提取结构化全局故事上下文，至少包含题材、时代/朝代、文化地域、场景设定、角色、时代道具、视觉风格、叙事语气、一句话梗概、一致性锚点与负面锚点；提取基于可测试的规则表，命中时携带证据与置信度。

#### Scenario: 唐朝全文 + 无锚点场景（用户示例）
- **WHEN** 完整文案包含「唐代」「长安」等时代/地域关键词，而某场景文字仅为「一个老妇人在做饭」
- **THEN** 全局上下文识别朝代=唐朝、文化=中国、地域含长安；该场景的上下文块包含唐代/中国/土灶/柴火等锚点，且负面锚点包含电烤箱与西式现代厨房

#### Scenario: 无关键词文案
- **WHEN** 完整文案不含任何时代/文化/题材关键词
- **THEN** 全局上下文标记为 general/mixed 且不编造具体时代或地域，场景上下文块仅基于场景文字生成

#### Scenario: 多文化/多题材
- **WHEN** 完整文案同时命中多类关键词（如日本与欧洲、武侠与科幻）
- **THEN** 全局上下文按证据数量排序保留多候选并标记置信度，不静默丢弃

### Requirement: 逐场景上下文融合
scene_context SHALL 为每个场景生成上下文块（contextBlock）与一致性锚点、负面锚点，并支持将时代负面锚点合并进提示词优化的 negative_prompt。

#### Scenario: 上下文块注入优化请求
- **WHEN** optimize 阶段为某场景构造 prompt-engine 请求
- **THEN** 请求 context 使用场景上下文块映射到 prompt-engine 已知键（setting/synopsis/full_text/narrative_intent/scene_type/character_list/character），不引入服务端未知键

#### Scenario: 时代负面锚点
- **WHEN** 全局上下文 era=ancient 且场景文本涉及做饭/烹饪
- **THEN** 该场景 negative_prompt 合并电烤箱、微波炉、西式现代厨房等现代器具负面项，且合并结果不超过契约上限

### Requirement: 配置契约与数据校验
scene_context SHALL 提供归一化配置（enabled/maxSummaryLength/maxAnchors/includeNegativeAnchors/contextBlockMaxChars），对输入输出做边界收敛，上下文对象只输出白名单键并在发送外部服务前做敏感凭据键拦截。

#### Scenario: 配置边界收敛
- **WHEN** 上层传入越界值（如 maxSummaryLength=99999 或 maxAnchors=-1）
- **THEN** 配置归一化层（story2video-text-config）对越界/非数值拒绝（fail closed，与 optimize.maxLength 契约一致）；引擎层（story-context-engine.normalizeSceneContextOptions）将越界值收敛到边界（50..1000 / 1..20），非法类型回退默认值

#### Scenario: 敏感键拦截
- **WHEN** 场景/文案内容含 token/secret 等敏感键名或上下文构造过程意外引入敏感字段
- **THEN** 发送 prompt-engine 前 assertNoSensitiveContext 拒绝或剥离，不把敏感内容外发

### Requirement: 降级与失败语义
scene_context SHALL 在规则引擎异常时降级为透传（标记 degraded 与 fallbackReason）而不阻断流水线；但输入缺失/非法场景数组时 fail closed。

#### Scenario: 规则异常降级
- **WHEN** 上下文提取过程抛出异常
- **THEN** 输出 metadata.degraded=true 并携带 fallbackReason，场景原样透传，optimize 继续按原文优化

### Requirement: 测试映射
scene_context SHALL 对每个场景提供自动化测试：用户示例（唐朝+做饭）、无关键词、多文化、配置边界、敏感键、降级、上下文块注入请求体。

#### Scenario: 场景有测试引用
- **WHEN** 实现完成
- **THEN** tasks.md 对应任务标注测试文件/用例，归档前可追踪

