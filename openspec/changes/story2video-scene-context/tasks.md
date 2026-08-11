# Tasks — story2video-scene-context

> 进度单一来源：以本文件 checkbox 为准。实现前先写/改测试（TDD），每个任务标注测试目标。

## 审计与前置

- [ ] 基线差异审计：核对 origin/main（b7819cee）已交付能力；现状确认：domain_enrich 仅 history + 单场景识别；optimize 无结构化故事上下文；PR #524 未合并（含 buildOptimizeContext）；prompt-engine build_context_section 已支持 setting/character/character_list/synopsis/narrative_intent/scene_type/full_text 键。证据：story2video-domain.js:41-60、story2video-stages.js:786-803/937+、pipeline-engine.js:482、prompt_engine/prompt_builder.py:68-90
- [ ] OpenSpec change 创建：proposal → design → specs → tasks（本文件）并 `openspec validate` 通过

## 实现（codex/story2video-scene-context-v2 分支（隔离 worktree，避免与并发会话共用分支））

### 任务 1：story-context-engine（新增模块，TDD）
- [ ] story-context-engine.test.js 先写：用户示例（唐朝全文+「一个老妇人在做饭」场景 → 朝代/文化/锚点/负面锚点断言）、无关键词、多文化、配置边界、敏感键、空场景 fail-closed、降级
- [ ] story-context-engine.js 实现：规则表（朝代/文化/题材/设定/道具/角色/时间/视觉风格/负面锚点）+ extractStoryContext/enrichSceneWithContext/buildSceneContextResult/buildSceneContextBlock/normalizeSceneContextOptions + 白名单键
- 测试目标：`apps/desktop/electron/services/story-context-engine.test.js`

### 任务 2：scene_context 阶段接入流水线
- [ ] story2video-stages.js：注册 STORY2VIDEO_STAGE_TYPES.SCENE_CONTEXT；输入=全文+context.domain_enrich/split；输出 context.scene_context；空场景 fail closed；规则异常降级透传
- [ ] pipeline-engine.js：story2video-compose stages 与 stageDefs 插入 scene_context（type=story2video_scene_context，inputFrom=domain_enrich，默认 options）
- [ ] getOptimizationScenes 优先 context.scene_context；optimize 阶段每场景注入 story 上下文（七键白名单）+ 时代负面锚点合并 negative_prompt
- 测试目标：`apps/desktop/electron/services/story2video-stages.test.js`、`apps/desktop/electron/tests/pipeline-story2video-contract.test.js`

### 任务 3：配置契约（story2video-text-config）
- [ ] scene_context 配置（enabled/maxSummaryLength/maxAnchors/includeNegativeAnchors/contextBlockMaxChars）归一化 + stageOptions.scene_context snake_case 输出 + 边界/类型收敛
- [ ] 测试：text-config.test.js 新增 scene_context 枚举/范围/默认/越界用例
- 测试目标：`apps/desktop/electron/services/story2video-text-config.test.js`

### 任务 4：文档与 PRD
- [ ] 01-docs/PRD-STORY2VIDEO-SCENE-CONTEXT-2026-08-11.md：产品需求（背景/目标/功能/数据校验/流程/功能逻辑/交互逻辑/显示项/提示文字/验收标准，详细）
- [ ] 01-docs/ARCH-STORY2VIDEO-SCENE-CONTEXT-2026-08-11.md：技术架构与实现方案（数据流/模块/规则表/契约/测试策略）
- [ ] 01-docs/PRD.md：新增 7.1.x 章节（摘要 + 引用完整 PRD 文档）
- [ ] CHANGELOG.md、01-docs/learnings.md、.quality-gates.md（执行记录）
- 测试目标：文档一致性

## 验证与交付

- [ ] 聚焦回归：story-context-engine / story2video-stages / story2video-text-config / pipeline-story2video-contract 相关测试通过（self-hosted Vitest 串行）
- [ ] 双模型分析/审查（antigravity + Claude；不可用时记录降级原因）
- [ ] 提交（codex/story2video-scene-context）→ push → PR → CI → 合并回 main
- [ ] OpenSpec archive + CCG task 归档 + 质量节拍复盘（三同步，一次 commit）
- [ ] 记忆更新（用户显式要求：ad_hoc note）

