# video-content-fidelity Specification

## Purpose
定义 videogen（animation/avatar-spokesperson/character-animation/hybrid 等）流水线在「长文案 → 分镜 → 视频提示词优化」链路上的内容保真机制：CONCEPT/STORYBOARD 双模式（creative/fidelity/hybrid/auto）、文案段落化、关键实体对齐门禁、优化 context 注入与对齐评估报告，保证视频画面与输入文案在人物、事件、时代、核心论点上的一致性与可验证性。
## Requirements
### Requirement: 双模式分镜判定

videogen CONCEPT 阶段 SHALL 支持四种分镜模式：`creative`（LLM 自由拓展创意）、`fidelity`（按原文保真）、`hybrid`（保真主旨 + 允许可视化演绎）、`auto`（按输入特征自动判定）；显式参数 `storyboardMode` 优先级高于自动判定。

#### Scenario: 一句话创意走 creative

- **WHEN** 用户输入 trim 后字符 ≤ 80 且句数 ≤ 2 且未显式指定模式

- **THEN** 流水线按 creative 模式执行：保留原始创意拓展机制，CONCEPT 自由生成角色/风格/钩子，storyboard 不注入原文事实约束

#### Scenario: 长文案走 fidelity

- **WHEN** 输入字符 ≥ 300，或句数 ≥ 8，或段落数 ≥ 3（任一命中）且未显式指定模式

- **THEN** 流水线按 fidelity 模式执行：CONCEPT 必须提取原文关键事实（key_facts）与实体（entities），storyboard 必须绑定段落并覆盖关键事件

#### Scenario: 中间态走 hybrid

- **WHEN** 输入不满足上述两档（81..299 字且 3..7 句）

- **THEN** 流水线按 hybrid 模式执行：事实与主旨不得改变，但允许补充镜头语言/氛围等可视化演绎

#### Scenario: 显式模式覆盖

- **WHEN** 调用方传入 `storyboardMode: 'creative' | 'fidelity' | 'hybrid'` 中任一非 auto 值

- **THEN** 自动判定被跳过，按显式值执行；非法值归一化为 auto 并记录

### Requirement: 文案段落化

fidelity/hybrid 模式 SHALL 在 storyboard 前把输入文案切分为有序段落（空行优先、句号次之），段落用于分镜的 source_paras 绑定与全文注入；creative 模式跳过段落化。

#### Scenario: 多段文案分段

- **WHEN** fidelity/hybrid 模式且文案含 ≥ 2 个自然段或 ≥ 8 句

- **THEN** 段落化输出 `[{index, text, sentences[]}]`，storyboard 每个场景标注 `source_paras`（对应段落索引数组）

#### Scenario: 超长截断

- **WHEN** 分段后全文超过注入上限（默认 6000 字）

- **THEN** 截断至上限并标记 `truncated: true`，截断段索引一并记录，不静默丢弃

#### Scenario: 退化单段

- **WHEN** 文案无空行且句数 ≤ 7

- **THEN** 段落化输出单段 `[{index:0, text: 全文}]`，不报错

### Requirement: 保真约束与事实注入

fidelity/hybrid 模式 SHALL 约束 CONCEPT 与 STORYBOARD 不得虚构与原文矛盾的情节、人物、事件，不得改变人物身份、时代背景与核心论点；STORYBOARD 输入必须包含分段文案全文与 CONCEPT 提取的 key_facts/entities。

#### Scenario: 关键事件必须有场景

- **WHEN** entities 中含事件类实体（如"水淹七军""白马之战"）且文案有相应描述

- **THEN** 至少存在一个场景的 prompt/source_paras 覆盖该事件；缺失时对齐门禁拦截

#### Scenario: 事实不得被改动

- **WHEN** fidelity 模式且原文陈述"长达十几年"

- **THEN** 任何场景不得输出与之矛盾的事实（如"只用了一年"）

#### Scenario: 概念输出契约

- **WHEN** fidelity/hybrid 模式

- **THEN** CONCEPT 输出对象必须含 `key_facts: string[]`、`entities: string[]` 与 `mode` 字段；缺失时按失败处理并重试一次

### Requirement: 内容对齐门禁

storyboard 产出后 SHALL 执行关键实体覆盖度校验：覆盖率 = 场景文本命中实体数 / 实体总数；低于阈值（默认 0.8）时携带缺失清单重试（默认最多 2 次）；重试后仍不达标或场景数组为空时 fail closed，不进入视频提示词优化与生成。

#### Scenario: 覆盖达标通过

- **WHEN** 场景文本命中实体 ≥ 阈值

- **THEN** 门禁通过，进入 GENERATE，对齐报告记录 coverage 与 matched

#### Scenario: 覆盖不足重试

- **WHEN** 覆盖率低于阈值且重试次数未达上限

- **THEN** 以缺失实体清单为追加指令重新生成 storyboard，并记录 retry 次数

#### Scenario: 空场景 fail closed

- **WHEN** storyboard 产出为空数组或非数组

- **THEN** 返回失败，不产出伪造场景，不进入 GENERATE

#### Scenario: 门禁可配置

- **WHEN** 配置 `enabled=false` 或 `minCoverage`/`maxRetries` 越界

- **THEN** 按归一化配置执行（越界 fail closed（拒绝）到 0..1 / 0..5），enabled=false 时跳过校验但仍记录报告

### Requirement: 优化请求 context 注入

videogen GENERATE 调用视频提示词批量优化 SHALL 为每个请求透传 context（白名单键：synopsis/character/setting/character_list/full_text），内容来自分段文案摘要与 CONCEPT 的 key_facts/entities；context 越界（超长/含敏感键）时按契约收敛或拒绝，不把敏感内容外发。

#### Scenario: context 透传

- **WHEN** fidelity/hybrid 模式进入 GENERATE 且 prompt-engine 服务可用

- **THEN** 批量优化请求体每项携带 context 且键全部在契约白名单内，full_text ≤ 2000 字

#### Scenario: 敏感键拦截

- **WHEN** context 构造过程出现 token/secret 等敏感键名

- **THEN** 发送前拒绝或剥离，不把敏感内容外发（与 story2video-scene-context 一致）

### Requirement: 对齐评估报告

流水线 SHALL 在对齐校验与 GENERATE 完成后输出对齐报告（mode、coverage、matched、missing、retries、truncated、段落化摘要）写入运行上下文与日志；视觉层一致性评估仅预留接口，未实现时返回 `status: not_implemented`，不得冒充已实现。

#### Scenario: 报告可观测

- **WHEN** fidelity/hybrid 流水线完成 storyboard→GENERATE

- **THEN** run 上下文含 `videoContentFidelity` 报告对象，日志含一行覆盖度摘要

#### Scenario: 视觉评估预留

- **WHEN** 调用视觉一致性评估接口且未接入真实 VLM

- **THEN** 返回 `{status:'not_implemented'}`，流水线不因视觉评估缺失而失败

