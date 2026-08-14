# Tasks: merge-domain-enrich-into-scene-context

## 1. 测试先行（TDD 红）

- [ ] 1.1 在 `story2video-stages.test.js` 新增/改写断言：contentType=history 时 scene_context 输出场景含 `imagePromptSeed`/`prompt`（golden 模板：文本；视觉风格；光线；无文字、主体明确）；general 时不产出；enabled=false + history 仍产出 seed（映射场景：历史内容增强/禁用仍生成种子）
- [ ] 1.2 更新 `story2video-stages.test.js` 中 7 处 domain_enrich/enrichHistory 断言为 scene_context 等价断言（映射场景：新阶段默认接入）
- [ ] 1.3 更新 `stage-executor.test.js` 阶段顺序断言（stageDefs 不再含 domain_enrich，映射场景：新阶段默认接入）
- [ ] 1.4 更新 `pipeline-story2video-contract.test.js`（domainEnriched 断言移除/改写）
- [ ] 1.5 更新 E2E 阶段顺序断言：`e2e-full-pipeline.test.js`、`e2e-pipeline-orchestrator.test.js`、`tests/e2e/helpers/ipc-mock.js`（映射场景：新阶段默认接入/历史 run 阶段清单）
- [ ] 1.6 新增 story-context-engine 单测：`detectSentiment` 三元判定 + `buildDomainSeed` golden 输出（含 dynasty 命中/era 回退/负面光线分支）

## 2. 实现：story-context-engine.js

- [ ] 2.1 新增 `detectSentiment(sceneText)`：positive/negative/peaceful 三元词表（迁移 story2video-domain.js:45-47 原词表）
- [ ] 2.2 新增 `buildDomainSeed(sceneText, story)`：visualStyle 取 `story.dynasty?.visualStyle || era 回退`（同原语义，不用合并版 story.visualStyle，见 design D3），模板拼接与原实现逐字一致
- [ ] 2.3 新增导出：`detectSentiment`、`buildDomainSeed`

## 3. 实现：story2video-stages.js

- [ ] 3.1 删除 `DOMAIN_ENRICH` 执行器注册（原 :1212-1227）与 `story2video-domain.js` require
- [ ] 3.2 SCENE_CONTEXT 执行器：`contentType==='history'` 时对每场景挂 `imagePromptSeed`/`prompt`（enabled=false 也执行，仅跳过融合）；general 不挂
- [ ] 3.3 `getOptimizationScenes` 移除 `context.domain_enrich` 回退；`select_video_scenes`、`generate_assets` 的 domain_enrich 回退改为 split

## 4. 实现：pipeline-engine.js 与配置

- [ ] 4.1 删除 domain_enrich stageDef 与特判（:513-522 区域、:2106-2107）；scene_context inputFrom 改 'split'；stageOptions 增 contentType
- [ ] 4.2 `story2video-text-config.js`：移除 `domain_enrich:{contentType}`，`scene_context` 增 contentType；normalizer 同步（:550 区域）

## 5. 删除与 UI/诊断同步

- [ ] 5.1 删除 `story2video-domain.js` 及所有引用
- [ ] 5.2 UI：`pipeline-labels.js`、`create-view-utils.js` 阶段清单去 domain_enrich、「内容增强」标签挂 scene_context；`locales/zh.js` + `locales/en.js` 成对更新（CI Gate 7）
- [ ] 5.3 诊断：`taxonomy.js`、`root-cause-map.js` 的 domain_enrich 引用更新
- [ ] 5.4 `CreateView.test.js` 受影响断言同步（阶段清单/文案）

## 6. 回归验证

- [ ] 6.1 运行 `npx vitest run electron/services/story2video-stages.test.js electron/services/story-context-engine.test.js electron/tests/stage-executor.test.js electron/tests/pipeline-story2video-contract.test.js` 全绿
- [ ] 6.2 运行 `CreateView.test.js`、locale sync check（`.github/scripts/check-locale-sync.js`）全绿
- [ ] 6.3 E2E 阶段顺序相关测试全绿；`openspec validate` 通过
- [ ] 6.4 双模型审查（Claude + 主代理抽查）Critical=0；review.md 落盘
