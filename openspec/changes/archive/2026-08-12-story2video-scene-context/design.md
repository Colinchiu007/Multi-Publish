# Design — story2video-scene-context

> 技术逻辑架构与实现方案。关联文档：01-docs/ARCH-STORY2VIDEO-SCENE-CONTEXT-2026-08-11.md（完整版）、PRD-STORY2VIDEO-SCENE-CONTEXT-2026-08-11.md（产品需求）。

## 1. 现状与缺口（基线审计，2026-08-11）

- 流水线 `story2video-compose`：`split → domain_enrich → optimize → select_video_scenes → generate_assets → compose → publish`（pipeline-engine.js:482）。
- `domain_enrich`（story2video-stages.js:786-803）仅在 `contentType === 'history'` 时执行，且 `enrichScene` 只读**单场景文字**做时代/朝代识别（story2video-domain.js:41-60）；场景文字缺关键词时 era=mixed/ancient 泛化，无全文锚点。
- `optimize`（story2video-stages.js:937+，origin/main）构造请求用 `buildPromptEngineOptimizeRequest(promptSeed, stage.options)`，context 仅来自 `stage.options.context`（text-config 的 optimize.context 字符串）；无结构化故事背景注入。
- prompt-engine 服务端 `build_context_section`（prompt_engine/prompt_builder.py:68-90）已支持 `setting / character / character_list / synopsis / narrative_intent / scene_type / full_text` 键；未知键被忽略 → 注入必须使用这些键。
- PR #524（codex/ui）未合并，含 `buildOptimizeContext`（full_text + scene_type + synopsis）——本 change 实现更完整的版本，合并冲突按「本 change 为准」解决。

## 2. 目标架构

```
params.text（完整文案）
   │
   ▼
split（8002/本地场景分句）───────────────► scenes[{index,text,subtitleBlocks,...}]
   │
   ▼
domain_enrich（保留：history 时代/朝代 per-scene 增强）
   │
   ▼
scene_context（新增中间层：本 change 核心）
   │  输入：全文 + scenes + stage.options
   │  处理：
   │    1) extractStoryContext(全文) → 全局故事上下文 story
   │    2) enrichSceneWithContext(每个场景, story) → 逐场景 storyContext/contextBlock/anchors/negativeAnchors
   │    3) 契约校验 + 敏感键拦截 + 边界收敛
   │  输出：context.scene_context = { story, scenes:[增强后场景], metadata }
   ▼
optimize（prompt-engine 8013）
   │  请求 context = { synopsis, full_text, setting, narrative_intent, scene_type,
   │                  character_list, character(当前场景) }
   │  negative_prompt = merge(用户 negative_prompt, 场景 negativeAnchors)
   ▼
select_video_scenes → generate_assets → compose → publish
```

## 3. 模块设计

### 3.1 新增 `apps/desktop/electron/services/story-context-engine.js`（纯规则、无 IO、可测）

导出：
- `extractStoryContext(fullText, options)` → 全局故事上下文（对象）
- `enrichSceneWithContext(scene, story, options)` → 增强场景
- `buildSceneContextResult(scenes, fullText, options)` → `{ story, scenes, metadata }`
- `normalizeSceneContextOptions(options)` → 收敛后选项
- `buildSceneContextBlock(scene, story, options)` → `{ contextBlock, anchors, negativeAnchors }`
- 常量表：`GENRE_RULES / DYNASTY_RULES / CULTURE_RULES / SETTING_RULES / PROP_RULES / VISUAL_STYLE_RULES / CHARACTER_RULES / TIME_RULES / NEGATIVE_ANCHOR_RULES / CONTEXT_KEY_WHITELIST`

数据结构（story）：
```js
{
  genre: '历史', era: 'ancient', dynasty: { name: '唐朝', period: '唐朝（618-907）', confidence: 0.95, evidence: ['唐代','长安'] },
  culture: '中国', region: '长安', setting: ['民居厨房','市井'],
  time: { timeOfDay: '黄昏', season: '秋' },  // 可缺省
  characters: [{ name: '老妇人', descriptor: '老妇人', appearances: 3 }],
  props: { ancient: ['土灶','柴火','陶罐','襦裙'], modern: [] },
  visualStyle: '唐代写实、金红色盛唐光线',
  tone: '平和',
  summary: '一句话梗概（≤maxSummaryLength）',
  anchors: ['唐代','中国','长安城','土灶'],   // 一致性锚点（全局）
  negativeAnchors: ['电烤箱','微波炉','西式现代厨房','西方服饰'],  // 时代负面锚点
  confidence: 0.9, method: 'rule-based', evidence: { dynasty: [...], culture: [...] }
}
```

### 3.2 检测规则（数据驱动，单测覆盖）

- `DYNASTY_RULES`：商/周/春秋战国/秦/汉/三国/晋/南北朝/隋/唐/五代/宋/元/明/清/民国，各带 keywords/period/visualStyle（在现有 story2video-domain 8 条基础上扩展，并允许从 story2video-domain 复用）。
- `CULTURE_RULES`：中国（长安/洛阳/北京/故宫/汉服/科举/长城/瓷器/皇帝/太监…）、日本（京都/武士/和服/樱花/神社/寿司/榻榻米…）、欧洲（伦敦/巴黎/城堡/骑士/教堂/壁炉/女皇…）、美国/阿拉伯/埃及/印度/韩国等；命中即 culture + region。
- `GENRE_RULES`：历史/武侠/仙侠/科幻/奇幻/现代都市/童话/悬疑/战争/宫廷/日常（关键词表）。
- `SETTING_RULES`：厨房/宫殿/市井/书房/庭院/战场/学堂/码头/森林/雪山等（关键词→地点短语）。
- `PROP_RULES`：古代道具（土灶/柴火/陶罐/油灯/烛台/马车/襦裙/长袍…）与现代道具（电烤箱/微波炉/冰箱/燃气灶/手机/电脑/汽车…）；按 era 双向约束。
- `CHARACTER_RULES`：人物词表（老妇人/将军/书生/少女/农夫/皇帝/刺客/僧人/商贩…）+ 修饰语前窗提取（≤4 字，如「白发/慈祥/身着…」）。
- `TIME_RULES`：清晨/白天/黄昏/夜晚/春/夏/秋/冬。
- `VISUAL_STYLE_RULES`：水墨/国画/写实/油画/动漫/3D/电影感/复古胶片/赛博朋克…
- `NEGATIVE_ANCHOR_RULES`：era=ancient → 现代电器/现代服饰/西方厨房/汽车；era=modern → 古代道具/油灯/马车；culture=中国 → 西方面孔/西式建筑（仅作为负面提示，不在正向强断言种族）。

### 3.3 逐场景融合（核心算法）

`buildSceneContextBlock(scene, story)`：
1. 场景文本 `sceneText`（优先 imagePromptSeed/prompt/text）。
2. 提取场景内角色（scene 文本命中 CHARACTER_RULES）。
3. 组装 setting：`[culture] + [dynasty.period 或 era 描述] + [region/setting 中与场景最相关项]`（若场景文本命中 SETTING_RULES 则优先场景内 setting，否则用全局第一个 setting）。
4. 组装正向块：`storyContext = 「{culture}{dynasty}时期，{region}{setting}中，{sceneText}；视觉{visualStyle}；光线{tone}」`（≤ contextBlockMaxChars，默认 400）。
5. 负面锚点：`negativeAnchors = story.negativeAnchors 命中场景语境者 + 场景内道具冲突项`（如场景有「做饭」且 era=ancient → 追加 电烤箱/微波炉/西式厨房）。
6. 返回 `{ contextBlock, anchors, negativeAnchors, character }`。

用户例子断言（回归测试）：
- 全文含「唐代/长安」→ story.dynasty.name='唐朝'、culture='中国'、region 含'长安'。
- 场景「一个老妇人在做饭」→ contextBlock 含「唐代」「中国」「土灶」「柴火」且 negativeAnchors 含「电烤箱」「西式现代厨房」。

### 3.4 optimize 阶段上下文注入（story2video-stages.js）

- `getOptimizationScenes` 优先 `context.scene_context`，回退 `domain_enrich → split → sentences`。
- 每场景构造请求：
  ```js
  context: {
    synopsis: story.summary,                       // ≤200 由服务端截断
    full_text: 全文（≤500 由服务端截断）,
    setting: scene.storyContext,                   // 场景上下文块（≤400）
    narrative_intent: story.tone || '叙事',
    scene_type: scene.sceneType || 推断,
    character_list: story.characters.slice(0,10).map(c => ({ name: c.name, ... })),
    character: scene.character || null,
  }
  ```
- `negative_prompt = mergeNegativePrompt(stage.options.negative_prompt, scene.negativeAnchors)`（≤500 截断）。
- 保留并发/重试/断点续传/进度/输出校验语义不变。

### 3.5 配置契约（story2video-text-config.js）

```js
scene_context: {
  enabled: true,            // boolean，默认开启
  maxSummaryLength: 300,    // 50..1000，默认 300
  maxAnchors: 8,            // 1..20，默认 8
  includeNegativeAnchors: true,  // boolean
  contextBlockMaxChars: 400 // 50..1000，默认 400
}
```
- stageOptions.scene_context 输出 snake_case 映射（enabled/max_summary_length/max_anchors/include_negative_anchors/context_block_max_chars）。
- 渲染层默认值与该表一致（无 UI 变更时以默认值生效；UI 新增项见 PRD）。

### 3.6 降级与 fail-closed

- 规则引擎整体 try-catch：异常 → 透传原 scenes + `metadata.degraded=true + fallbackReason`，不阻断流水线（上下文增强是增强，不因增强失败杀死视频生成）。
- `buildSceneContextResult` 输入 scenes 非数组/空 → throw（阶段 fail closed）。
- 发送前 context 对象过 `assertNoSensitiveContext`（白名单键 + 敏感键拦截，防 api_key/token 外发）。
- 上下文键白名单 `CONTEXT_KEY_WHITELIST`：只允许 `synopsis/full_text/setting/narrative_intent/scene_type/character_list/character` 七键，防字段漂移。

## 4. 变更文件清单

| 文件 | 变更 |
|---|---|
| apps/desktop/electron/services/story-context-engine.js | 新增 |
| apps/desktop/electron/services/story-context-engine.test.js | 新增 |
| apps/desktop/electron/services/story2video-stages.js | scene_context 阶段 + optimize 注入 + getOptimizationScenes 优先 |
| apps/desktop/electron/services/story2video-stages.test.js | 新增/更新用例 |
| apps/desktop/electron/services/story2video-text-config.js | scene_context 配置归一 + stageOptions |
| apps/desktop/electron/services/story2video-text-config.test.js | 更新 |
| apps/desktop/electron/services/pipeline-engine.js | stageDefs 增加 scene_context |
| apps/desktop/electron/tests/pipeline-story2video-contract.test.js | 流水线契约断言 |
| 01-docs/*（PRD/方案/CHANGELOG/learnings/.quality-gates） | 文档 |

## 5. 外部边界

- prompt-engine（D:\Data\projects\prompt-engine）不改：仅消费现有 context 键。
- 真实图片/视频生成结果（西方老太太问题是否彻底消失）依赖服务端 LLM 行为，属外部验收边界；本 change 通过注入锚点提高概率，不做端到端视觉断言。
- LLM 抽取（可选增强）：留接口位（method: 'rule-based' → 未来可 'llm'），本期不引入新依赖。
