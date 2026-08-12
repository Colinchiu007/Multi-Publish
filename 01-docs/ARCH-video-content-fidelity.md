# ARCH — 视频内容保真：分镜-文案对齐架构设计

> 版本：v1.0 ｜ 日期：2026-08-12 ｜ 关联 OpenSpec change：`video-content-fidelity`
> 关联 PRD：`01-docs/PRD-video-content-fidelity.md`

## 1. 架构总览

```
输入文案 (params.text)
   │
   ▼
[resolveStoryboardMode]  ──auto 规则 / 显式 storyboardMode──▶ mode ∈ {creative, fidelity, hybrid}
   │
   ├─ creative ──────────────────────────────────────────────▶ CONCEPT(现状) → STORYBOARD(现状) → GENERATE(现状)
   │
   └─ fidelity / hybrid
        │
        ▼
[video-script-segmentation] ──▶ { paragraphs[], truncated }
        │
        ▼
[CONCEPT(fidelity)] ──▶ { role_design, visual_style, hook, key_facts[], entities[], mode }
        │
        ▼
[STORYBOARD(fidelity)] ──注入分段全文+key_facts/entities──▶ scenes[{prompt,text,duration,source_paras[]}]
        │
        ▼
[video-content-alignment] ──extractKeyEntities→checkSceneAlignment(minCoverage=0.8)──▶ pass?
        │  ├─ fail & retries<2 ──▶ 带 missing 重试 STORYBOARD
        │  └─ fail & 重试耗尽 ──▶ fail closed (STORYBOARD_ALIGNMENT_FAILED)
        ▼ pass
[GENERATE] ──optimizeVideoPromptsBatch(prompts, {platform, context})──▶ prompt-engine /v1/optimize/batch
        │                          context: {synopsis, character, character_list, setting, full_text}
        ▼
[视频生成 + 对齐报告写入 run 上下文/日志]
```

## 2. 模块设计

### 2.1 `video-script-segmentation.js`（新，纯函数）
- `segmentScript(text, { maxFullTextChars=6000, maxParagraphs=20 }) → { paragraphs: [{index, text, sentences[]}], truncated, truncatedAt[] }`
- 切分：空行 → 段；句号（。！？!?；;）→ 句。
- 无依赖，可单测。

### 2.2 `videogen-stages.js`（改）
- 新增 `resolveStoryboardMode(text, explicitMode)`：返回 `{ mode, reason }`，reason 记录判定依据（便于日志/报告）。
- `buildConceptPrompt(topic, kind, mode)`：按模式生成 system prompt（见 PRD §3.4）。
- `buildStoryboardPrompt(concept, kind, { mode, paragraphs, keyFacts, entities })`：fidelity/hybrid 注入分段全文与事实清单。
- CONCEPT executor：解析 `key_facts/entities/mode`；fidelity/hybrid 缺失时重试一次。
- STORYBOARD executor：fidelity/hybrid 先分段，场景保留 `source_paras`；调用对齐门禁；不达标重试（maxRetries=2）；产出 alignmentReport。
- GENERATE executor：批量优化请求附 context（构造自分段摘要 + key_facts/entities）。

### 2.3 `video-content-alignment.js`（新）
- `extractKeyEntities(text, { llmExtractFallback=true }) → { entities: string[], source: 'dict'|'llm'|'mixed' }`
  - 内置词典：按主题类别组织（history/three-kingdoms/tech/life），首期覆盖高频实体；命中支持子串匹配。
  - LLM 兜底：词典命中 < 5 且启用时，调用默认 LLM 抽取；失败降级用词典结果（标记 degraded）。
- `checkSceneAlignment(scenes, entities, minCoverage=0.8) → { coverage, matched[], missing[], pass }`
  - 匹配：场景 `prompt` 文本包含实体子串即命中；实体长度为 1 的忽略（防噪音）。
  - 空 entities → pass（无实体可校验，记录 warning）。
- `assessVisualConsistency(videoPaths, scenes) → { status: 'not_implemented' }`（S5 桩）。

### 2.4 `video-prompt-engine-contract.js`（改）
- `buildVideoOptimizeRequest` 增加 `context` 白名单透传：`CONTEXT_KEYS = ['synopsis','character','setting','character_list','full_text']`。
- 校验：键不在白名单 → 丢弃；值超长 → 按键上限截断（synopsis/character/setting 各 500，full_text 2000，character_list 数组 ≤ 10 项）；值含敏感键名 → 拒绝该项（throw）或剥离（配置决定，默认剥离）。

### 2.5 `service-bus.js` / `prompt-bridge.js`（改）
- `optimizeVideoPromptsBatch(prompts, options)` 已透传 options；补 `context` 由 videogen 调用方经 options.context 传入，bridge 层透传，不在 bridge 层做业务裁剪。

### 2.6 prompt-engine `strategies/video/generic.py`（改，独立仓库）
- `build_system_prompt` 增加事实保真段落 + context.synopsis 锚点引用。
- `optimize()` 读取 `context`（白名单键），未知键忽略 + warning。

### 2.7 `story2video-text-config.js`（改）
- 新增配置项归一化：`videoContentFidelity: { enabled, minCoverage, maxRetries, llmExtractFallback, maxFullTextChars }`，越界 fail closed（拒绝）（见 PRD §5.2）。

## 3. 数据契约

### 3.1 CONCEPT 输出（fidelity/hybrid）
```json
{
  "role_design": "string",
  "visual_style": "string",
  "hook": "string",
  "key_facts": ["string"],
  "entities": ["string"],
  "mode": "fidelity|hybrid"
}
```

### 3.2 STORYBOARD 场景（fidelity/hybrid）
```json
{
  "index": 0,
  "prompt": "画面提示词（供视频生成模型直接使用）",
  "text": "解说文案",
  "duration": 6,
  "source_paras": [0, 1]
}
```

### 3.3 对齐报告
```json
{
  "mode": "fidelity",
  "enabled": true,
  "coverage": 0.92,
  "matched": ["关羽", "水淹七军"],
  "missing": ["春秋笔法"],
  "retries": 0,
  "truncated": false,
  "paragraphCount": 8,
  "entityCount": 12,
  "assessVisual": { "status": "not_implemented" }
}
```

### 3.4 优化请求（GENERATE → prompt-engine）
```json
{
  "requests": [{
    "prompt": "scene prompt",
    "domain": "video",
    "platform": "agnes",
    "creative_level": 5,
    "max_length": 500,
    "num_candidates": 1,
    "context": {
      "synopsis": "摘要（≤500）",
      "character": "关羽（≤500）",
      "character_list": ["关羽","曹操","陈寿"],
      "setting": "东汉末年（≤500）",
      "full_text": "分段文案摘要（≤2000）"
    }
  }]
}
```

## 4. 错误码

| 错误码 | 触发 | 语义 |
|---|---|---|
| `STORYBOARD_EMPTY_SCENES` | 场景数组为空/非数组 | fail closed，不进入 generate |
| `STORYBOARD_ALIGNMENT_FAILED` | 覆盖不足且重试耗尽 | 返回失败 + missing 清单 |
| `CONCEPT_FACTS_MISSING` | fidelity/hybrid 且 key_facts/entities 缺失（重试一次后仍缺） | fail closed |
| `CONTEXT_SENSITIVE_KEY` | context 含敏感键且策略为拒绝 | 请求失败，不外发 |

## 5. 测试策略

| 模块 | 用例 |
|---|---|
| video-script-segmentation | 多段/单段退化/超长截断/空输入/段数上限 |
| videogen-stages（模式判定） | 四档判定、显式覆盖、非法归一化、reason 记录 |
| videogen-stages（prompt） | fidelity 注入保真约束与分段全文；creative 无约束 |
| videogen-stages（门禁流程） | 达标/不足重试/重试耗尽 fail closed/空场景 |
| video-content-alignment | coverage 计算、missing、词典+LLM 降级、视觉桩 |
| video-prompt-engine-contract | context 透传/白名单/截断/敏感键剥离 |
| story2video-text-config | videoContentFidelity 越界 fail closed（拒绝） |
| prompt-engine test_video_optimize | 中文历史事实保留、context 锚点、未知键忽略 |

## 6. 部署与回滚
- 配置 `videoContentFidelity.enabled` 可整体关闭新逻辑（回到现状 creative 路径）；独立于 generate/渲染路径。
- prompt-engine 事实保真指令为增量文本，prompt-engine 独立 PR 独立回滚。
- 灰度建议：先 fidelity 模式 E2E 验证覆盖度报告，再放开默认 auto。

## 7. 风险与缓解
- 词典覆盖有限 → LLM 兜底 + minCoverage 可配 + 重试。
- 保真抑制创意 → hybrid 中间态；fidelity 仅约束事实/主旨。
- 重试成本 → maxRetries=2、creative 零开销。
- 视觉评估冒充实现 → assessVisual 显式 not_implemented，PRD/文档双标注。
