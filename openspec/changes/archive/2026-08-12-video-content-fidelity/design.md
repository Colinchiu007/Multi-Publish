# Design — video-content-fidelity

## Context

现状（证据见 proposal.md - Why）：videogen 链路 `concept → storyboard → generate` 中，CONCEPT（videogen-stages.js L157-163）把长文案压缩为 `{role_design, visual_style, hook}`；STORYBOARD（L165-171）的 user 消息只注入 `visual_style` 一句话，原文与角色设定丢失。`story2video-scene-context` 引擎（story-context-engine.js）已实现"全局故事上下文 → prompt-engine context 注入"，但只被 Story2Video 图片流水线消费。prompt-engine `generic_video` 策略是镜头语言优化器，无事实保真约束。

## Goals / Non-Goals

**Goals**
- 双模式分镜：短创意输入（一句话）保留 LLM 自由拓展；长文案输入按原文保真，关键人物/事件必须有对应场景。
- 分镜阶段获得完整文案事实（段落化 + key_facts/entities + source_paras 绑定）。
- 内容对齐可测：实体覆盖度门禁 + 自动重试，不达标 fail closed。
- 优化层事实保真：videogen → prompt-engine 全链路 context 透传（复用既有契约键）。
- 对齐结果可观测：覆盖度报告进 run 上下文与日志。

**Non-Goals**
- 不改变 Story2Video 图片流水线现有 scene_context 行为（只做 videogen 链路复用）。
- 不引入新外部依赖；S5 视觉层 VLM 评分仅预留接口与文档，不实现真实视觉评分（避免冒充未实现能力）。
- 不做视频生成后的画面内容自动纠错（依赖 provider，超出本 change）。

## Decisions

### D1: 双模式判定规则（auto）

以「字符数 / 句数 / 段落数」多维判据，而非单一字数，避免把"一段长句"误判为创意输入：

| 判据 | creative | hybrid | fidelity |
|---|---|---|---|
| 字符数（trim 后） | ≤ 80 | 81..299 | ≥ 300 |
| 句数（按 。！？；切分） | ≤ 2 | 3..7 | ≥ 8 |
| 段落数（空行/换行） | = 1 | 2 | ≥ 3 |

判定顺序：显式参数 `storyboardMode`（creative/fidelity/hybrid/auto）优先；auto 下，先看段落数 ≥3 或字符 ≥300 或句数 ≥8 → fidelity；再看字符 ≤80 且句数 ≤2 → creative；其余 → hybrid。

理由：中文一句话约 30-50 字，80 字 ≈ 1-2 句（"输入一两句话就能一整个视频"的原始场景）；300 字 ≈ 一段完整论述（关羽文案 733 字远高于阈值）；hybrid 覆盖"有明确主题但未成完整脚本"的中间态——保真主旨、允许合理可视化演绎。替代方案（单一字数阈值）被否：长单句（200 字无标点）会被误判为创意输入。

### D2: 模式对 CONCEPT/STORYBOARD 的影响

- `creative`：完全保留现有 system prompt（资深策划自由创意），仅输出加 `mode: "creative"`。
- `fidelity`：CONCEPT system prompt 加硬保真约束（忠实原文、不得虚构与原文矛盾的情节/人物/事件、不得改变人物身份/时代/核心论点），输出增加 `key_facts: string[]`（原文事实要点）与 `entities: string[]`（关键人物/事件/地点）。
- `hybrid`：同 fidelity 约束，但允许"合理可视化演绎"（补充镜头语言/氛围，不改变主旨）。
- STORYBOARD：fidelity/hybrid 下 user 消息注入「分段文案全文 + key_facts/entities」，system 要求每场景输出 `source_paras: number[]`（绑定段落索引）、关键事件（entities 中事件类）必须有专属场景；creative 下维持现状。

### D3: 段落化（S2）

新增纯函数模块（同 videogen-stages 同目录或独立 `video-script-segmentation.js`）：按空行 → 句号（。！？；）两级切分，输出 `{ paragraphs: [{ index, text, sentences[] }] }`；段落数 ≤ 1 时退化为"整段 = 单段落"。fidelity/hybrid 模式才启用；creative 模式跳过。段落文本随 STORYBOARD user 消息注入（截断上限 6000 字，超限取前 N 段并标记截断）。

### D4: 内容对齐门禁（S3）

新模块 `video-content-alignment.js`：
- `extractKeyEntities(text)`：内置词典（按主题类别，首期覆盖历史/三国/科技/生活通用高频实体）+ LLM 兜底抽取（fidelity/hybrid 且词典命中 < 阈值时）。
- `checkSceneAlignment(scenes, entities, minCoverage=0.8)`：统计场景 prompt 文本中命中实体数/实体总数；返回 `{ coverage, matched, missing[], pass }`。scene 为空数组 → fail closed。
- STORYBOARD 后置校验：`pass=false` 时带 `missing` 清单重试（最多 2 次），重试 prompt 明确要求补场景；仍不达标 → 返回失败（fail closed），不进入 generate。
- 可配置项：`enabled=true / minCoverage=0.8 / maxRetries=2 / llmExtractFallback=true`，走 story2video-text-config 归一化（与现有配置契约一致，越界收敛）。

### D5: context 透传（S4）

- `video-prompt-engine-contract.js` 的 `buildVideoOptimizeRequest` 增加 `context` 透传：白名单键 `synopsis/character/setting/character_list/full_text`（复用 prompt-engine `OptimizeRequest.context` 已知键，不引入未知键）。
- videogen GENERATE 阶段构造批量优化请求时，为每个 chunk 附 `context`：`full_text`=分段文案摘要（≤2000 字）、`synopsis`=CONCEPT 的 hook/key_facts 摘要、`character`/`character_list`=CONCEPT entities（人物类）。
- prompt-engine `generic_video` 策略：system prompt 增加事实保真段落（"不得改变主体身份/时代/事件；若 context 提供 synopsis/full_text，画面必须与事实一致"），并使用 context.synopsis 做背景锚点。

### D6: 对齐评估输出（S5 本期）

- GENERATE 完成后把 `alignmentReport`（mode、coverage、matched、missing、retries、段落化摘要）写入 run 上下文 `context.videoContentFidelity` 与日志。
- 预留视觉评分接口：`video-content-alignment.js` 导出 `assessVisualConsistency(videoPaths, scenes)` 桩（返回 `{ status: 'not_implemented' }`），文档标注为未来工作，禁止冒充已实现。

## Risks / Trade-offs

- [词典实体覆盖有限，长尾主题漏检] → LLM 兜底抽取 + minCoverage 可配置 + 重试机制；门禁只拦截明显缺失，不追求完美。
- [保真模式可能抑制创意、画面单调] → hybrid 中间态允许可视化演绎；fidelity 仅约束"事实/主旨"，镜头语言仍自由。
- [重试增加 LLM 成本与延迟] → maxRetries 默认 2、单次重试仅注入缺失清单；creative 模式不启用门禁。
- [prompt-engine 英文输出可能漂移中文事实] → 事实保真指令明确"主体/时代/事件不变"；context.synopsis 提供原文事实锚点。
- [S5 视觉评估未实现被误认为已实现] → 接口显式返回 not_implemented，文档与 PRD 均标注"本期文本层对齐，视觉评分未来工作"。

## Migration Plan

- 灰度语义：`videoContentFidelity` 配置默认 `enabled=true`，`mode=auto`；新逻辑只影响 videogen 链路 storyboard 上游，generate/渲染路径不变，可独立回滚（回退 CONCEPT/STORYBOARD prompt 与门禁开关）。
- prompt-engine 策略指令为增量文本，可独立发布（prompt-engine 独立仓库独立 PR）。

## Open Questions

无（双模式判定规则、门禁阈值均已在 D1-D6 定案，若产品侧要调整阈值仅改配置默认值）。
