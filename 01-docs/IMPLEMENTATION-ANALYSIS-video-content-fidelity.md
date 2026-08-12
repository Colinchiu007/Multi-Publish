# 功能实现分析 — 视频内容保真：分镜-文案对齐（video-content-fidelity）

> 版本：v1.0 ｜ 日期：2026-08-12 ｜ 状态：待评审
> 关联：PRD-video-content-fidelity.md（产品层）、ARCH-video-content-fidelity.md（架构层）
> 本文档聚焦**功能实现层面**：每个模块的输入/输出、分支逻辑、数据校验、错误处理、状态流转、交互与显示项、提示文字。

---

## 1. 变更范围与模块清单

| 文件 | 变更 | 承载功能 |
|---|---|---|
| apps/desktop/electron/services/videogen-stages.js | 改 | S1 双模式 CONCEPT/STORYBOARD；S3 门禁接入；S4 context 注入；S5 报告 |
| apps/desktop/electron/services/video-script-segmentation.js | 新增 | S2 长文段落化 |
| apps/desktop/electron/services/video-content-alignment.js | 新增 | S3 实体抽取 + 对齐校验 + S5 视觉桩 |
| apps/desktop/electron/services/video-prompt-engine-contract.js | 改 | S4 context 白名单/长度收敛 |
| apps/desktop/electron/services/story2video-text-config.js | 改 | 配置归一化 videoContentFidelity |
| prompt-engine strategies/video/generic.py | 改 | S4b 事实保真指令 |
| prompt-engine optimizer.py | 改 | S4b context 未知键 warning |

---

## 2. CONCEPT 双模式（S1）实现分析

### 2.1 判定函数 resolveStoryboardMode(text, explicitMode)

**输入**：text（用户输入文案）、explicitMode（params.storyboardMode 或 stage.options.storyboardMode，可选）

**输出**：{ mode: 'creative'|'fidelity'|'hybrid', reason: string, requested?: string }

**判定流程（优先级从高到低）**：

1. explicitMode ∈ {creative, fidelity, hybrid}（非 auto）→ 直接采用，reason='explicit:<mode>'
2. paragraphCount ≥ 3 或 charCount ≥ 300 或 sentenceCount ≥ 8 → fidelity
3. charCount ≤ 80 且 sentenceCount ≤ 2 → creative
4. 其余 → hybrid

**数据校验表**：

| 输入 | 校验规则 | 越界/非法处理 |
|---|---|---|
| explicitMode | 字符串，trim+lowercase | 不在四档内 → 忽略，走 auto 规则 |
| charCount | Array.from(text).length（Unicode 码点） | 空文本 → 0 |
| sentenceCount | 按 。！？!?；; 切分非空片段数 | 无句号 → 1 |
| paragraphCount | 按空行/换行切分非空块数 | 无换行 → 1 |

**设计依据**：中文一句话约 30-50 字，80 字 ≈ 1-2 句（保留"一句话→整个视频创意"原始能力）；300 字 ≈ 一段完整论述；段落/句数维度防止"长单句无标点"误判。

### 2.2 Prompt 构造 buildConceptPrompt(topic, kind, mode)

| 模式 | system prompt 要点 | 输出 JSON |
|---|---|---|
| creative | 原样：资深策划，创意概念 | {role_design, visual_style, hook} |
| fidelity | + 硬保真约束 4 条（忠实原文/身份时代不变/提取关键事实与实体/风格服务基调） | {role_design, visual_style, hook, key_facts[], entities[], mode} |
| hybrid | = fidelity + 第 5 条"允许合理可视化演绎" | 同上 |

**提示文字（完整原文写入 prompt）**：

```
你是资深{kind}策划。用户提供了完整文案，你需要按原文内容设计视频概念。
硬性要求：
1. 忠实原文——不得虚构或篡改与原文矛盾的情节、人物、事件；
2. 不得改变人物身份、时代背景、文化地域与核心论点；
3. 提取原文关键事实（key_facts）与关键实体（entities：人物/事件/地点/作品等）；
4. 视觉风格应服务于原文基调，不得整体偏离。
[hybrid 追加：5. 允许合理可视化演绎：可补充镜头语言/氛围，但不得改变事实与主旨。]
只输出 JSON 对象 {"role_design": "...", "visual_style": "...", "hook": "...", "key_facts": ["..."], "entities": ["..."], "mode": "..."}，不要多余文字。
```

### 2.3 CONCEPT executor 功能逻辑

```
输入 params.text
  ├─ text 为空 → 失败"该流水线需要非空主题（params.text）"
  ├─ resolveStoryboardMode → modeInfo
  ├─ buildConceptPrompt(topic, kind, mode)
  ├─ callDefaultLlm → raw
  ├─ creative：concept = parseJsonArray(raw)?.[0] || raw（保持现状字符串兼容）
  ├─ fidelity/hybrid：
  │    ├─ parseJsonObject(raw) → concept
  │    ├─ concept 缺 key_facts 或 entities → 重试一次
  │    ├─ 重试后仍缺 → fail closed（errorCode=CONCEPT_FACTS_MISSING）
  │    └─ 补齐 concept.mode
  └─ 输出 { concept, topic, storyboardMode, modeReason } → context.concept
```

**数据校验**：fidelity/hybrid 强制 key_facts/entities 为数组；解析用 parseJsonObject（支持 markdown 围栏、对象内嵌提取），失败返回 null。

### 2.4 交互逻辑
- 前端视频创作页（CreateView.vue）「常规流水线高级配置」区新增「分镜模式」下拉（自动/创意拓展/按原文保真/混合，默认自动，data-testid=storyboard-mode-select，对 animation/avatar/character-animation/hybrid 等 videogen 流水线可见）；透传 params.storyboardMode 到流水线；与 checkpointPolicy 一致采用会话内记忆（不做 lastOptions 持久化）。

---

## 3. STORYBOARD 保真分镜（S1/S2/S3 交汇）实现分析

### 3.1 输入解析

| 来源 | 取值 |
|---|---|
| mode | context.concept.storyboardMode（CONCEPT 写入），非 fidelity/hybrid → creative |
| keyFacts/entities | context.concept.key_facts / context.concept.entities |
| 原文 fullText | 优先 context.params.text，其次 context.concept.topic，均无 → 空串 |
| 段落 | mode=creative → []；否则 segmentScript(fullText).paragraphs |
| 门禁配置 | context.config.videoContentFidelity（缺省用常量默认值） |

### 3.2 重试状态机（核心）

```
attempt = 0
maxAttempts = enabled ? 1 + maxRetries : 1
loop:
  attempt++
  buildStoryboardPrompt(concept, kind, {mode, paragraphs, keyFacts, entities, retryHint})
  raw = callDefaultLlm()
  parsed = parseJsonArray(raw)
  ├─ 非数组/空 → lastError='storyboard 无法解析场景 JSON'；break
  ├─ normalized = 场景数组（保留 source_paras）
  ├─ enabled=false → scenes=normalized；break
  ├─ extraction = extractKeyEntities(fullText, {llmExtractFallback, extractLlm})
  ├─ check = checkSceneAlignment(normalized, extraction.entities, minCoverage)
  ├─ check.pass → scenes=normalized；break
  ├─ attempt < maxAttempts 且 missing 非空 → retryHint='上次分镜未覆盖…'+missing；log；continue
  └─ 否则 → lastError='视频分镜未覆盖文案关键内容：missing（已重试 N 次）'；break

输出：
  scenes 为空 → fail closed（errorCode 按 lastError 判 STORYBOARD_EMPTY_SCENES / STORYBOARD_ALIGNMENT_FAILED）
  scenes 非空 → output=scenes；context.videoContentFidelity = 对齐报告
```

### 3.3 场景归一化

```
{ index, prompt, text, duration, ...(source_paras 若存在) }
- prompt：s.prompt || s.text || ''（字符串场景直接取）
- duration：≥4 用原值，否则 DEFAULT_SCENE_SECONDS(5)
- 截断：slice(0, MAX_SCENES=12)
```

### 3.4 错误码

| errorCode | 触发 | 提示文字 |
|---|---|---|
| STORYBOARD_EMPTY_SCENES | 场景数组为空/非数组 | 分镜未生成任何场景，请检查文案或稍后重试 |
| STORYBOARD_ALIGNMENT_FAILED | 覆盖不足且重试耗尽 | 视频分镜未覆盖文案关键内容：{missing}（已重试 {N} 次） |

---

## 4. 内容对齐门禁（S3）实现分析

### 4.1 extractKeyEntities(text, {llmExtractFallback, extractLlm})

```
1. 词典抽取：KEY_ENTITY_DICT（首期 27 个三国/历史高频实体，name+type）
   - 规则：子串包含，实体名长度 ≥ 2
   - 输出：{entities: string[], source: 'dict', degraded: false}
2. LLM 兜底条件：llmExtractFallback=true 且 extractLlm 可调用 且 词典命中 < 5
   - prompt：'你是文本实体抽取器。…只输出 JSON 字符串数组…'
   - 解析失败/异常 → 降级用词典结果，degraded=true（不阻断）
   - 合并：词典 ∪ LLM 去重，source='mixed'/'dict'
3. 空输入 → {entities: [], source: 'dict', degraded: false}
```

### 4.2 checkSceneAlignment(scenes, entities, minCoverage)

```
- scenes 非数组/空 → {isValid:false, pass:false, coverage:0, …}
- entities 过滤（字符串、trim、长度≥2）后为空 → {isValid:true, pass:true, coverage:1, warning:'无实体可校验…'}
- 命中规则：场景 prompt 文本子串包含实体名
- coverage = matched.length / entities.length（四舍五入 2 位）
- pass = coverage ≥ minCoverage（minCoverage 收敛到 0..1）
```

### 4.3 配置校验矩阵（story2video-text-config）

| 配置键 | 类型 | 默认 | 边界（越界 fail closed（拒绝）） |
|---|---|---|---|
| enabled | boolean | true | — |
| minCoverage | number | 0.8 | 0..1 |
| maxRetries | int | 2 | 0..5 |
| llmExtractFallback | boolean | true | — |
| maxFullTextChars | int | 6000 | 500..20000 |

---

## 5. GENERATE context 注入（S4）实现分析

### 5.1 buildVideoOptimizeContext(concept, paragraphs)

| context 键 | 来源 | 长度上限 | 缺省 |
|---|---|---|---|
| synopsis | hook + key_facts 前 3 条（'；' 连接） | 500 | 无内容则不输出该键 |
| character | role_design | 500 | 同上 |
| character_list | entities 前 10 | 10 项 | 同上 |
| setting | visual_style | 500 | 同上 |
| full_text | 段落全文 join('\n') | 2000 | 同上 |

返回：键非空对象；全部为空 → undefined（调用方不附加 context）。

### 5.2 调用链注入点（videogen GENERATE）

```
optimizeVideoPromptsBatch(chunk, {
  platform: videoProvider.providerId,
  context: optimizeContext,          // 新增
  ...stage.options.optimize,          // 用户显式覆盖仍优先
})
```

### 5.3 contract 层校验（video-prompt-engine-contract）

- 白名单键：synopsis/character/setting/character_list/full_text；白名单外键丢弃。
- 长度收敛：各键按上表截断。
- 敏感键：复用 assertNoSensitiveContext（token/secret/api_key 等），命中剥离/拒绝，不外发。
- 批量契约不变：单批 ≤20、服务端有界并发 8、结果顺序一致、逐条非空 fail closed。

---

## 6. prompt-engine 事实保真（S4b）实现分析

### 6.1 generic.py 指令增量（追加到 system prompt）

```
## Fact-Fidelity (MANDATORY)
- Do NOT change the subject's identity, era/setting, or event facts from the input.
- If context provides synopsis/full_text, visual elements MUST stay consistent with those facts.
- Do NOT add plot details that contradict the input.
```

### 6.2 optimizer.py context 白名单

- 已知键：synopsis/character/character_list/setting/narrative_intent/scene_type/full_text（build_context_section 渲染）。
- 未知键：忽略 + logging.warning('unknown context key: %s')；不改变优化行为。
- 既有批量契约（max_length=20、并发 8）不变。

---

## 7. 对齐评估报告（S5）实现分析

**写入点**：STORYBOARD 完成后写 context.videoContentFidelity；GENERATE 完成后补 assessVisual 桩。

**字段表**：

| 字段 | 类型 | 说明 |
|---|---|---|
| mode | string | creative/fidelity/hybrid |
| enabled | boolean | 门禁是否启用 |
| coverage | number | 0..1 |
| matched | string[] | 命中的实体 |
| missing | string[] | 缺失的实体 |
| retries | int | 实际重试次数 |
| truncated | boolean | 段落是否截断 |
| paragraphCount | int | 段落数 |
| entityCount | int | 实体总数 |
| assessVisual | object | {status:'not_implemented'}（S5 桩，不冒充实现） |

**日志格式**：[ContentFidelity] mode={mode} coverage={coverage} matched={n}/{m} retries={r} truncated={t}

---

## 8. 交互逻辑、显示项与提示文字汇总

### 8.1 可暴露的交互项（本次透传支持，UI 落地列为后续）

| 交互项 | 控件 | 默认 | 说明 |
|---|---|---|---|
| 分镜模式 | 下拉（自动/创意拓展/按原文保真/混合） | 自动 | 透传 params.storyboardMode |
| 对齐覆盖率 | 高级设置数字框 0..1 | 0.8 | 透传 config.videoContentFidelity.minCoverage |

### 8.2 状态提示文字

| 场景 | 文案 |
|---|---|
| 分镜生成中（fidelity） | 正在按原文生成分镜（保真模式）… |
| 分镜生成中（creative） | 正在创意生成分镜… |
| 分镜重试 | 部分关键内容未覆盖，正在补充分镜（第 {N} 次）… |
| 概念提取重试 | 正在重新提取关键事实与实体… |

### 8.3 错误提示文字

| errorCode | 展示文案 |
|---|---|
| CONCEPT_FACTS_MISSING | 概念阶段未能提取关键事实/实体，请调整文案后重试 |
| STORYBOARD_EMPTY_SCENES | 分镜未生成任何场景，请检查文案或稍后重试 |
| STORYBOARD_ALIGNMENT_FAILED | 视频分镜未覆盖文案关键内容：{missing}（已重试 {N} 次） |
| CONTEXT_SENSITIVE_KEY | 文案包含敏感信息，已停止外发，请处理后重试 |

---

## 9. 测试计划（用例矩阵）

| 模块 | 用例 | 断言 |
|---|---|---|
| resolveStoryboardMode | 短句/长文/中间态/显式覆盖/非法值 | mode + reason |
| buildConceptPrompt | creative 无约束 / fidelity 含约束 / hybrid 含演绎 | system 文本 |
| buildStoryboardPrompt | fidelity 注入分段+实体 / creative 无 / retryHint | user/system 文本 |
| CONCEPT executor | fidelity 解析成功 / 缺 key_facts 重试 / 两次失败 fail closed / creative 兼容 | output + errorCode |
| STORYBOARD executor | source_paras 保留 / 覆盖不足重试通过 / 重试耗尽 fail closed / 空场景 / 报告写入 | output + errorCode + context |
| video-content-alignment | 覆盖度计算 / 空场景 / 空实体 / 视觉桩 | 返回值 |
| video-script-segmentation | 多段/单段/截断/空输入 | paragraphs/truncated |
| contract context | 白名单透传 / 越界 fail closed（拒绝） / 敏感键剥离 | 请求体 |
| text-config | videoContentFidelity 越界 fail closed（拒绝） | 归一化结果 |
| prompt-engine | 中文历史事实保留 / context 锚点 / 未知键忽略 | 优化结果 |

---

## 10. 兼容性与复用

- creative 模式：与原行为完全一致（prompt/输出/无门禁），默认 auto 下短输入不受影响。
- 复用：story2video-text-config 归一化模式、prompt-engine-contract.assertNoSensitiveContext、prompt-engine build_context_section（已支持 context 渲染）。
- 不改：Story2Video 图片流水线 scene_context；prompt-engine 批量契约。
- 回滚：videoContentFidelity.enabled=false 一键回到原 creative 路径。
