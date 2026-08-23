# Proposal: 合并 domain_enrich（内容增强）到 scene_context 阶段

## Why

`domain_enrich` 阶段的时代/朝代/视觉风格检测与 `scene_context`（story-context-engine.js）完全重复且是劣化版：硬编码 8 朝代 vs 规则表 16 朝代（共享朝代 visualStyle 逐字一致，双份拷贝必然漂移），`detectEra` 无 strong 信号防误判机制。其独特生产价值仅剩 `imagePromptSeed` 模板预生成（情感→光线 + 「无文字、主体明确」提示卫生），`domain.*`/`domainEnriched`/`eraCounts` 为生产死代码。合并可消除双源漂移、让 `contentType` 开关落到单一消费者，同时保留全部可观测行为。

## What Changes

- **删除独立 `DOMAIN_ENRICH` 阶段**（`story2video_domain_enrich`）：流水线阶段从 8 个变为 7 个（split → scene_context → optimize → select_video_scenes → generate_assets → finalize_assets → compose）。**BREAKING**：阶段清单、历史分段持久化结构变化（旧 domain 字段保留兼容读取）。
- **scene_context 吸收内容增强职责**：`contentType === 'history'` 时对每个场景生成 `imagePromptSeed`/`prompt`（移植原模板：文本；视觉风格；光线（负面→阴影与冷色氛围，否则自然层次与叙事光线）；无文字、主体明确），era/dynasty/visualStyle 一律取自规则表（16 朝代超集）；情感→光线判定作为独立小函数移植。
- **seed 生成独立于 scene_context enabled**：`contentType=history` 的 seed 生成不受 `scene_context.enabled=false` 影响（保持 domain_enrich 原有独立语义），enabled=false 仅跳过全局上下文融合。
- **删除 `story2video-domain.js` 及死导出**：`enrichHistoryScenes`/`passthroughScenes`/`detectEra`/`detectDynasty` 移除，`domainEnriched`/`eraCounts`/`scene.domain` 元数据不再产出。
- **流程定义与配置契约同步**：pipeline-engine.js 删除 domain_enrich stageDef、`getOptimizationScenes` 移除 `context.domain_enrich` 回退、`contentType` 开关迁入 scene_context stageOptions；story2video-text-config.js 的 `domain_enrich:{contentType}` 改为 `scene_context:{..., contentType}`。
- **UI/诊断同步**：阶段标签「内容增强」挂到 scene_context（pipeline-labels/locales zh+en 成对），create-view-utils 阶段清单、diagnostics taxonomy/root-cause-map 同步；E2E 阶段顺序断言更新。
- **测试同步**：domain 断言改写为 scene_context 在 `contentType:'history'` 下产出 `imagePromptSeed` 的等价断言；7 处阶段断言 + 4 个 E2E 顺序断言更新。

## Capabilities

- **New Capabilities**: 无
- **Modified Capabilities**:
  - `story2video-scene-context`：Requirement「中间层阶段接入流水线」从「在 domain_enrich 之后」改为「紧随 split 之后」；新增 Requirement「历史内容增强（imagePromptSeed 种子契约）」承载 contentType 开关、seed 模板与 enabled 解耦语义。

## Impact

- **代码**：`apps/desktop/electron/services/story2video-stages.js`（删执行器、改消费回退）、`story-context-engine.js`（新增 seed 生成）、`pipeline-engine.js`（stageDefs/特判）、`story2video-text-config.js`（配置键迁移）、`apps/desktop/src/views/CreateView.vue`（开关语义不变）、`pipeline-labels.js`/`create-view-utils.js`/`locales/zh.js`/`locales/en.js`（阶段标签）、`diagnostics/taxonomy.js`/`root-cause-map.js`
- **删除**：`story2video-domain.js`（含其测试引用）
- **测试**：`story2video-stages.test.js`、`pipeline-story2video-contract.test.js`、`stage-executor.test.js`、`e2e-full-pipeline.test.js`、`e2e-pipeline-orchestrator.test.js`、`CreateView.test.js`、`tests/e2e/helpers/ipc-mock.js`
- **契约**：`story2videoTextConfig` 的 `domain_enrich` 键移除、`scene_context` 增 `contentType`；历史分段持久化中 domain 字段只读兼容
- **不做**：不改变 prompt-engine 服务端（8013）、不改变 UI 可见文案语义（「内容增强/历史文章（自动识别时代与朝代）」保留）、不改变 generate_assets 的图片生成行为（仍消费 optimize 输出）
