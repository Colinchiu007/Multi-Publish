# Design: 合并 domain_enrich 到 scene_context

## Context

现状（证据见上一轮分析归档 `.ccg/tasks/archive/2026-08/analyze-domain-enrich-value/`）：
- `story2video-stages.js:1212-1227` 注册 `DOMAIN_ENRICH` 执行器，仅 `contentType==='history'` 时调用 `enrichHistoryScenes`，否则透传。
- `story-context-engine.js` 已是 era/dynasty/visualStyle 检测的超集（规则表 16 朝代、strong 信号防误判、支持外部覆盖），且 `enrichSceneWithContext` 用 `{...base}` 保留原场景字段（`:710-718`），证明数据流天然可合并。
- `imagePromptSeed` 是 domain 唯一生产输出：`getScenePromptSeed`（stages:1081-1086）→ optimize 每场景 seed（:1457）→ `buildPromptEngineOptimizeRequest`（:1524）。

## Goals / Non-Goals

Goals：
- 单一规则源（story-context-rules.json），行为可观测等价（history 场景的 imagePromptSeed 模板不变）。
- `contentType` 开关语义不变：history → 生成 seed；general → 不生成（透传语义）。
- 删除 domain_enrich 独立阶段与 story2video-domain.js 死代码。

Non-Goals：
- 不改 prompt-engine 服务端契约（8013）。
- 不改 UI 可见文案语义（「内容增强」标签仍显示，仅归属阶段变化）。
- 不引入 LLM 做时代/朝代检测（保持确定性规则，见 proposal 方案对照 B 否决理由）。

## Decisions

### D1: seed 生成放在 scene_context 执行器内，独立于 enabled
- **选择**：SCENE_CONTEXT 执行器在 `buildSceneContextResult` 之后，若 `contentType==='history'` 对每场景挂 `imagePromptSeed`/`prompt`；`enabled=false` 只跳过上下文融合，不跳过 seed。
- **理由**：保持 domain_enrich 原有「独立于 scene_context 开关」语义；避免引入新的 enabled 耦合（审查 I1 语义：禁用=透传）。
- **替代**：把 seed 生成并入 `buildSceneContextResult` 内部 → 被 `enabled=false` 短路，破坏原语义，否决。

### D2: 情感→光线判定独立移植为小函数，不并入 tone
- **选择**：在 story-context-engine.js 新增 `detectSentiment(sceneText)`（positive/negative/peaceful 三元词表，词表从 story2video-domain.js:45-47 原样迁移），供 seed 模板光线分支使用。
- **理由**：scene_context 的 `detectTone` 是四元（悲壮/欢快/紧张/平和）且消费路径不同（contextBlock 光线 + narrative_intent），与 domain 的三元情感不同构；直接复用会改变 seed 输出（行为回归）。
- **替代**：tone 映射 sentiment → 语义不一致，否决。

### D3: seed 模板函数 `buildDomainSeed(sceneText, story)` 放 story-context-engine.js
- **选择**：era/dynasty/visualStyle 取自 `extractStoryContext` 的规则表结果（16 朝代超集，修复 domain 的 8 朝代子集 + 民国漏判缺陷）；模板拼接保持原文：`文本；视觉风格；光线；无文字、主体明确`（story2video-domain.js:51 原样）。
- **注意**：domain 原实现的 visualStyle 优先 `dynasty?.visualStyle`，回退 era 风格，再回退叙事风格——scene_context 的 story 对象 visualStyle 是「朝代风格+文本风格合并」，直接用 story.visualStyle 会多出文本风格词。**决定**：seed 用 `dynasty?.visualStyle || era 回退`（同原语义），文本显式风格仍由 scene_context 的 context 块独立传递，避免 seed 变长改变 optimize 输入分布。
- **替代**：用 story.visualStyle（合并版）→ 改变 seed 内容，行为回归，否决。

### D4: 配置键迁移
- `story2video-text-config.js:550` 的 `domain_enrich:{contentType}` 移除，`scene_context:{..., contentType}` 增加；normalizer 同步。`generate_assets.contentType`（:586 从未被读）保留不动（本次不扩范围）。
- UI 恢复白名单 `S2V_RESTORE_ENUM_OPTIONS.contentType` 不变（枚举仍在）。

### D5: 阶段删除与回退清理
- `pipeline-engine.js`：删 domain_enrich stageDef（:513-522 区域）、`:2106-2107` 特判；`getOptimizationScenes`（stages:1074）删 `context.domain_enrich`；`select_video_scenes`（:1296）与 `generate_assets`（:1661）的 `context.domain_enrich` 回退改为 `context.split`。
- 历史持久化：旧 run 的 `context.domain_enrich` 字段在读取路径中保留兼容（回退链已删，但旧分段 JSON 的 domain 字段只读展示不受影响——分段对象是快照，不含 stage 引用）。

## Risks / Trade-offs

- [history 场景 seed 内容微变] → D3 保证 era/dynasty/visualStyle 取规则表且模板一致；唯一可感知差异是 8→16 朝代覆盖（民国 era=modern 正确化）与 strong 防误判，属质量提升方向；用 golden 测试锁定模板输出。
- [阶段数 8→7 破坏 E2E/诊断断言] → 同步更新 4 个 E2E 顺序断言 + taxonomy/root-cause-map；CI 全量门禁兜底。
- [scene_context enabled=false + history 组合回归] → 专项测试：enabled=false + contentType=history 仍产出 seed；enabled=false + general 不产出。
- [seed visualStyle 由逐场景判定改为全文全局判定] → 旧 domain 对每场景文本做 era/dynasty 判定，新 buildDomainSeed 用 extractStoryContext 的全文全局 story；场景文本无朝代关键词时 seed 的 visualStyle 从「中性叙事风格」变为全文朝代风格。属用户可见 prompt 输出变化（全局锚点一致性更合理），用 golden 测试锁定：场景无朝代关键词 + 全文含朝代 → seed 用朝代风格。
- [并发会话在 main 上的 .ccg 归档与本次分支冲突] → 本 change 全部在独立 worktree/分支完成，PR 合入前 rebase origin/main。

## Migration Plan

1. 本分支开发，TDD：先改/加测试（golden seed、阶段顺序、enabled 解耦），再实现。
2. 门禁：`vitest run`（story2video-stages/stage-executor/pipeline-story2video-contract）+ CreateView.test + E2E 顺序断言 + locale sync check。
3. 手动验证：本地跑一次 story2video-compose history 流水线 smoke（seed 产出、阶段清单 7 项）。
4. PR 合入 origin/main 后按归档三同步提交（openspec archive + .ccg 归档 + learnings 同 commit）。

## Open Questions

无（D1-D5 已覆盖全部规格语义歧义）。
