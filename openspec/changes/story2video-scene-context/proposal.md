## Why

Story2Video 的「文案→分句（8002/本地）→ 图片提示词优化（prompt-engine 8013）」串行流程缺少一个中间层：分句结果只携带场景自身文字，提示词优化阶段得不到「全文故事背景」的结构化上下文。场景文字缺乏时代/地域/道具锚点时（如全文讲中国唐代，单场景仅写「一个老妇人在做饭」），prompt-engine 容易生成西方老太太在现代西式厨房用电烤箱做饭的画面，破坏故事背景的准确性、一致性与连贯性。现有 domain_enrich 只在 contentType=history 时按单场景文字做朝代识别，不读全文、不产出全局故事上下文、不对普通内容生效。

## What Changes

- **新增「场景上下文增强」中间层阶段 `scene_context`**：插入在 domain_enrich 与 optimize 之间，读取完整文案 + 分句结果，产出结构化「全局故事上下文」与「逐场景上下文块」。
- **全局故事上下文提取**（规则驱动、无外部依赖、可测）：从全文提取 题材（genre）/时代·朝代（era/dynasty）/文化地域（culture/region）/场景设定（setting）/昼夜·季节（time）/角色（characters）/时代道具（props）/视觉风格（visualStyle）/叙事语气（tone）/一句话梗概（summary）/一致性锚点（anchors）/负面锚点（negativeAnchors）。
- **逐场景上下文融合**：把全局锚点合并进每个场景，生成自然语言上下文块（如「唐代中国老妇人在长安民居土灶厨房用柴火做饭，身着唐代襦裙；禁止出现电烤箱、西式厨房、西方服饰」），并自动追加时代负面锚点到 negative_prompt。
- **提示词优化注入**：optimize 阶段请求 context 使用场景上下文块（setting/synopsis/full_text/narrative_intent/scene_type/character/character_list），对齐 prompt-engine 的 build_context_section 已知键，不新增服务端契约。
- **配置契约扩展**：story2video-text-config 新增 scene_context 配置（enabled/maxSummaryLength/maxAnchors/includeNegativeAnchors），渲染层→normalizer→pipeline 边界一致。
- **数据校验与 fail-closed**：上下文对象只输出白名单键、发送前过 assertNoSensitiveContext；规则引擎异常时降级透传并标记 degraded，空场景数组 fail closed。
- **测试与文档**：story-context-engine 单测、stages/text-config/pipeline 契约测试；PRD、产品需求文档、技术方案文档、CHANGELOG、learnings、.quality-gates 执行记录同步。

## Capabilities

### New Capabilities
- `story2video-scene-context`: Story2Video 分句与提示词优化之间的故事背景上下文中间层契约（全局故事上下文提取、逐场景上下文融合、一致性/负面锚点注入、上下文对象契约与校验、配置边界、降级语义、测试映射）。

### Modified Capabilities
<!-- 无；openspec-integration 为流程契约，不受本变更影响 -->

## Impact

- 运行时代码：`apps/desktop/electron/services/story-context-engine.js`（新增）、`story2video-stages.js`（scene_context 阶段 + optimize 上下文注入）、`pipeline-engine.js`（stageDefs）、`story2video-text-config.js`（配置契约）、`story2video-domain.js`（复用/对齐，如必要）。
- 测试：story-context-engine.test.js（新增）、story2video-stages.test.js、story2video-text-config.test.js、pipeline-story2video-contract.test.js。
- 文档：01-docs/PRD.md、PRD-STORY2VIDEO-SCENE-CONTEXT-2026-08-11.md、ARCH-STORY2VIDEO-SCENE-CONTEXT-2026-08-11.md、CHANGELOG.md、learnings.md、.quality-gates.md。
- 外部边界：prompt-engine（8013）仅消费现有 context 键，不修改外部服务；真实图片/视频生成质量验收为外部边界。
- 交付：codex/ 分支 + PR 合并；聚焦/全量测试；双模型审查。
