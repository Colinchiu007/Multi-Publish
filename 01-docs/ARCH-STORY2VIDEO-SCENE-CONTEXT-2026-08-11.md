# ARCH — Story2Video 场景上下文增强中间层（技术逻辑架构与实现方案）

> 版本：2026-08-11 · 关联：PRD-STORY2VIDEO-SCENE-CONTEXT-2026-08-11.md（产品需求）、openspec/changes/story2video-scene-context（规格工件）

## 1. 背景

Story2Video 流水线 `split → domain_enrich → optimize → …` 中，分句结果（场景）与提示词优化之间无故事背景传递：场景文字孤立、无全文锚点，导致背景漂移（如唐代全文 + 「一个老妇人在做饭」→ 西方老太太现代厨房）。本方案在两者之间新增**场景上下文增强中间层** `scene_context`，负责「读全文 → 提取全局故事上下文 → 融合进每个场景 → 注入提示词优化」。

## 2. 现状分析（基线审计）

| 组件 | 现状 | 文件 |
|---|---|---|
| 分句 | 8002 smart-sentence-splitter / 本地 TS 回退，产出 `{scenes:[{index,text,subtitleBlocks}], sentences}` | story2video-segmentation.js |
| domain_enrich | 仅 `contentType=history`；per-scene 朝代/时代识别，不读全文 | story2video-domain.js:41-60 |
| optimize | 逐场景调 prompt-engine（8013）；origin/main 无结构化故事上下文注入（context 仅 options.context 透传） | story2video-stages.js:937+ |
| prompt-engine 服务端 | `build_context_section` 已支持 setting/character/character_list/synopsis/narrative_intent/scene_type/full_text 七键，未知键忽略 | prompt_engine/prompt_builder.py:68-90 |
| 流水线定义 | stages 数组 + stageDefs | pipeline-engine.js:482-536 |

## 3. 总体架构

```
                      ┌────────────────────────────────────────────────┐
   params.text ──────►│  scene_context 中间层（新增）                    │
                      │  story-context-engine.js（纯规则、无 IO、可测）  │
                      │                                                │
                      │  ① extractStoryContext(全文)                   │
                      │     → story{genre,era,dynasty,culture,region,  │
                      │        setting,time,characters,props,          │
                      │        visualStyle,tone,summary,anchors,       │
                      │        negativeAnchors,confidence,evidence}    │
                      │  ② enrichSceneWithContext(scene, story)        │
                      │     → scene{storyContext,contextBlock,anchors, │
                      │        negativeAnchors,character}              │
                      │  ③ 白名单键 + assertNoSensitiveContext + 边界   │
                      └───────────────┬────────────────────────────────┘
                                      ▼
                      context.scene_context = { story, scenes, metadata }
                                      ▼
   optimize：request.context = { synopsis, full_text, setting: 场景上下文块,
                                 narrative_intent, scene_type, character_list,
                                 character } ; negative_prompt += 负面锚点
```

## 4. 模块设计

### 4.1 story-context-engine.js（新增，唯一新模块）

**导出 API**（全部纯函数）：

| API | 签名 | 说明 |
|---|---|---|
| `extractStoryContext` | `(fullText, options) => story` | 全局故事上下文提取 |
| `enrichSceneWithContext` | `(scene, story, options) => scene` | 单场景融合 |
| `buildSceneContextResult` | `(scenes, fullText, options) => {story, scenes, metadata}` | 阶段主入口 |
| `buildSceneContextBlock` | `(scene, story, options) => {contextBlock, anchors, negativeAnchors, character}` | 上下文块组装 |
| `normalizeSceneContextOptions` | `(options) => options` | 边界收敛 |
| `mergeNegativePrompt` | `(base, negativeAnchors, maxLen=500) => string` | 负面提示合并 |

**规则表**（常量导出，可扩展）：
- `DYNASTY_RULES`：商/周/春秋战国/秦/汉/三国/晋/南北朝/隋/唐/五代/宋/元/明/清/民国（keywords/period/visualStyle），唐朝包含 `['唐朝','唐代','大唐','李世民','武则天','唐玄宗','长安','安史之乱']` 等。
- `CULTURE_RULES`：中国/日本/欧洲/美国/阿拉伯/埃及/印度/韩国（关键词→culture+region）。
- `GENRE_RULES`、`SETTING_RULES`、`PROP_RULES`（ancient/modern 双向）、`CHARACTER_RULES`（人物词+修饰前窗）、`TIME_RULES`、`VISUAL_STYLE_RULES`、`NEGATIVE_ANCHOR_RULES`。
- `CONTEXT_KEY_WHITELIST`：`['synopsis','full_text','setting','narrative_intent','scene_type','character_list','character']`。

**检测算法**：
- 朝代/文化/题材/设定/时间/风格：关键词计数，命中带 evidence 与置信度（`0.7 + 0.06*n`，上限 0.98；单命中 0.8；多候选按证据数排序）。
- 角色：`CHARACTER_RULES` 词表命中 + 前窗修饰（取角色词前 ≤4 个非标点字符作为 descriptor）。
- 时代互斥：ancient 只输出古代道具；modern 只输出现代道具；mixed/general 空。
- summary：优先 `{题材}{时代/朝代}{文化}的故事：` + 全文去空白前 N 字（N=maxSummaryLength），再截断。

**逐场景融合**：
- setting：场景文本命中 SETTING_RULES → 用场景内项；否则用全局第一个 setting。
- contextBlock：`{culture}{dynasty.period||era}时期，{region}{setting}中，{sceneText}；视觉{visualStyle}；光线{tone}`（≤contextBlockMaxChars，超长按强断句点截断）。
- negativeAnchors：全局负面锚点 + 场景语境触发项（做饭/烹饪 × ancient → 电烤箱/微波炉/西式现代厨房；× modern → 土灶/柴火/油灯）。

### 4.2 流水线接入（story2video-stages.js / pipeline-engine.js）

- `STORY2VIDEO_STAGE_TYPES.SCENE_CONTEXT = 'story2video_scene_context'`。
- 阶段执行器：输入 = `params.text`（全文，缺省从 `context.split` 各场景 text 拼接）+ `context.domain_enrich || context.split` 场景；输出写 `context.scene_context`。
- `getOptimizationScenes(context)`：优先 `context.scene_context`，回退 `domain_enrich → split → sentences`（向后兼容旧 run/断点续跑）。
- optimize 每场景：`request.context = buildPromptEngineSceneContext(scene, story, options)`（七键白名单）；`request.negative_prompt = mergeNegativePrompt(stage.options.negative_prompt, scene.negativeAnchors)`；发送前 `assertNoSensitiveContext`。
- pipeline-engine.js：`stages: ['split','domain_enrich','scene_context','optimize',…]` + stageDefs 增加 `{name:'scene_context', type:'story2video_scene_context', inputFrom:'domain_enrich', options:{enabled:true,...}}`。

### 4.3 配置契约（story2video-text-config.js）

```
scene_context: { enabled: true, maxSummaryLength: 300, maxAnchors: 8,
                 includeNegativeAnchors: true, contextBlockMaxChars: 400 }
stageOptions.scene_context: { enabled, max_summary_length, max_anchors,
                              include_negative_anchors, context_block_max_chars }
```
- 校验：enabled/includeNegativeAnchors 为 boolean（非法回退默认）；数值 integerInRange 收敛；与渲染层默认值一致（无 UI 变更时默认生效）。

## 5. 关键决策与权衡

| 决策 | 选项 | 选择 | 理由 |
|---|---|---|---|
| 上下文来源 | 规则 vs LLM | 规则（rule-based） | 本地可测、无新依赖、确定性；LLM 抽取留扩展位 |
| 阶段位置 | 独立新阶段 vs 改 domain_enrich | 独立新阶段 | domain_enrich 保留 history 语义；新阶段通用化；向后兼容 |
| context 键 | 服务端未知键 vs 已知七键 | 已知七键 | prompt-engine build_context_section 只读已知键，避免静默丢弃 |
| 负面锚点 | 仅 context 文本 vs 合并 negative_prompt | 合并 negative_prompt | 负面提示是图片模型原生约束，比文本更可靠 |
| 失败语义 | 失败阻断 vs 降级透传 | 降级透传 | 上下文增强是增强项，不因增强失败杀死视频生成；输入缺失仍 fail closed |

## 6. 测试策略

| 层 | 文件 | 覆盖 |
|---|---|---|
| 单元 | story-context-engine.test.js（新增） | 用户示例（唐朝+做饭）、无关键词、多文化、时代互斥道具、配置边界、敏感键、空场景 fail-closed、降级、白名单键、summary/锚点截断 |
| 集成 | story2video-stages.test.js | scene_context 阶段注册/执行/降级；optimize 请求体 context 七键 + negative_prompt 合并断言（mock PromptBridge） |
| 契约 | story2video-text-config.test.js | scene_context 配置归一/越界/默认 |
| 契约 | pipeline-story2video-contract.test.js | 流水线阶段顺序含 scene_context；stageDefs 选项 |
| E2E | 不依赖真实 8013；mock/stub 覆盖请求契约（沿用现有模式） | |

## 7. 变更文件清单

| 文件 | 变更类型 |
|---|---|
| apps/desktop/electron/services/story-context-engine.js | 新增 |
| apps/desktop/electron/services/story-context-engine.test.js | 新增 |
| apps/desktop/electron/services/story2video-stages.js | 修改（新阶段 + optimize 注入） |
| apps/desktop/electron/services/story2video-stages.test.js | 修改 |
| apps/desktop/electron/services/story2video-text-config.js | 修改（scene_context 配置） |
| apps/desktop/electron/services/story2video-text-config.test.js | 修改 |
| apps/desktop/electron/services/pipeline-engine.js | 修改（stageDefs） |
| apps/desktop/electron/tests/pipeline-story2video-contract.test.js | 修改 |
| 01-docs/PRD-STORY2VIDEO-SCENE-CONTEXT-2026-08-11.md | 新增 |
| 01-docs/ARCH-STORY2VIDEO-SCENE-CONTEXT-2026-08-11.md | 新增 |
| 01-docs/PRD.md / CHANGELOG.md / learnings.md / .quality-gates.md | 修改 |

## 8. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 关键词误判（如「长安」品牌名） | 多证据加权 + confidence + mixed 兜底；不编造 |
| 场景上下文块过长 | contextBlockMaxChars 收敛 + 强断句点截断 |
| 与 PR #524（buildOptimizeContext）合并冲突 | 本 change 为超集实现；冲突时以本 change 为准并保留 synopsis/full_text/scene_type 兼容 |
| 性能 | 规则引擎 O(关键词×文本)，毫秒级；无新增网络调用 |
| 外部服务未知键 | 白名单七键 + 契约测试断言请求体 |
