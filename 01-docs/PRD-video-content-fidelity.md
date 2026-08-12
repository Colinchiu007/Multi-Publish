# PRD — 视频内容保真：分镜-文案对齐（video-content-fidelity）

> 版本：v1.0 ｜ 日期：2026-08-12 ｜ 状态：待评审
> 关联 OpenSpec change：`video-content-fidelity` ｜ 关联流水线：animation / avatar-spokesperson / character-animation / hybrid

## 1. 背景与问题

动画流水线（`concept → storyboard → generate`）在真实 E2E 中出现**画面与文案内容不匹配**：

| 证据 | 说明 |
|---|---|
| Run #2 分镜 | 733 字《三国志·关羽》文案产出 12 个"赛博侦探档案室"场景，开篇即脱离文案设定 |
| 核心事件缺失 | 白马之战、襄樊之战、水淹七军、威震华夏等高潮事件**无独立场景** |
| 事实矛盾 | 场景 8 臆造"从通缉犯到万人敌只用了一年"，与原文"长达十几年"矛盾 |
| 机制根因 | CONCEPT 把长文案压缩成一句 `visual_style`；STORYBOARD 只拿到该句，原文事实全部丢失 |

本 PRD 定义**双模式分镜 + 内容对齐门禁**，在保留"一句话 → LLM 完成整个视频创意"能力的同时，让"长文案 → 按原文实现视频"可保真、可验证。

## 2. 目标与非目标

### 2.1 目标
- P0：分镜双模式（creative / fidelity / hybrid / auto），长短输入各得其所。
- P0：fidelity/hybrid 下关键人物/事件必须有对应场景，且不得与原文事实矛盾。
- P0：内容对齐可测：实体覆盖度门禁 + 自动重试 + fail closed。
- P1：优化层事实保真：videogen → prompt-engine 全链路 context 注入。
- P1：对齐评估报告可观测（run 上下文 + 日志）。
- P2：视觉层一致性评估接口预留（本期不实现真实视觉评分）。

### 2.2 非目标
- 不改变 Story2Video 图片流水线现有 `scene_context` 行为。
- 不做视频生成后的画面内容自动纠错（依赖 provider，另行立项）。
- 不引入新外部依赖；视觉 VLM 评分标注为未来工作。

## 3. 分镜双模式机制

### 3.1 模式定义

| 模式 | 语义 | 适用输入 |
|---|---|---|
| `creative` | LLM 自由拓展创意（原始机制）：角色/风格/钩子全由 LLM 完成 | 一句话/短创意（"输入一两句话就能一整个视频"） |
| `fidelity` | 按原文保真：人物/事件/时代/核心论点不得改变，关键事件必须有场景 | 完整文案/脚本（≥300 字或 ≥8 句或 ≥3 段） |
| `hybrid` | 保真主旨 + 允许可视化演绎（补充镜头/氛围，不改事实） | 中间态（81..299 字且 3..7 句） |
| `auto` | 按输入特征自动判定（默认） | 任意 |

### 3.2 auto 判定规则（多维判据）

**判定顺序**（按优先级）：

1. 显式参数 `storyboardMode` 非 auto → 直接采用（非法值归一化为 auto）。
2. 段落数 ≥ 3 或 字符数 ≥ 300 或 句数 ≥ 8 → `fidelity`
3. 字符数 ≤ 80 且 句数 ≤ 2 → `creative`
4. 其余 → `hybrid`

**判据口径**：
- 字符数：`String(text).trim()` 的中文字符长度。
- 句数：按 `。！？!?；;` 切分后的非空片段数。
- 段落数：按空行 / 换行切分的非空块数。

**设计理由**：中文一句话约 30-50 字，80 字 ≈ 1-2 句，对应"一句话创意"原始场景；300 字 ≈ 一段完整论述；段落/句数维度可避免"长单句无标点"被误判为创意输入。

### 3.3 各模式行为差异

| 环节 | creative | fidelity | hybrid |
|---|---|---|---|
| 段落化 | 跳过 | 启用 | 启用 |
| CONCEPT 输出 | role_design/visual_style/hook（现状） | + key_facts/entities/mode | + key_facts/entities/mode |
| CONCEPT 保真约束 | 无 | 硬约束（见 3.4） | 硬约束 + 允许演绎 |
| STORYBOARD 输入 | visual_style | 分段文案全文 + key_facts/entities | 同 fidelity |
| STORYBOARD 输出 | {prompt,text,duration} | + source_paras | + source_paras |
| 对齐门禁 | 不启用 | 启用（阈值 0.8） | 启用 |
| context 注入 | 不注入 | 注入 | 注入 |

### 3.4 fidelity/hybrid 保真约束（prompt 硬约束，写入 system prompt）

1. **忠实原文**：不得虚构或篡改与原文矛盾的情节、人物、事件。
2. **身份/时代不变**：不得改变人物身份、时代背景、文化地域。
3. **关键事件必有场景**：entities 中事件类实体（如"水淹七军""白马之战"）在文案有描述时，必须有对应场景。
4. **核心论点保留**：不得改变原文核心论点与叙事基调。
5. **场景绑定段落**：每个场景输出 `source_paras`（对应段落索引），可追溯。

**提示文字示例（CONCEPT fidelity system prompt）**：

```
你是资深{kind}策划。用户提供了完整文案，你需要按原文内容设计视频概念。
硬性要求：
1. 忠实原文——不得虚构或篡改与原文矛盾的情节、人物、事件；
2. 不得改变人物身份、时代背景、文化地域与核心论点；
3. 提取原文关键事实（key_facts）与关键实体（entities：人物/事件/地点）；
4. 视觉风格应服务于原文基调，不得整体偏离。
只输出 JSON：{"role_design":"...","visual_style":"...","hook":"...","key_facts":["..."],"entities":["..."],"mode":"fidelity"}，不要多余文字。
```

**提示文字示例（STORYBOARD fidelity user 消息）**：

```
创意概念与视觉风格：{visual_style}
原文分段（共 N 段）：
[1] {段落1}
[2] {段落2}
...
关键事实：{key_facts 列表}
关键实体：{entities 列表}
要求：每个场景标注 source_paras（对应段落索引数组）；文案描述的关键事件必须有专属场景；不得虚构与原文矛盾的情节。
```

## 4. 文案段落化（S2）

### 4.1 切分规则
1. 空行切分（\n\n / 连续换行）为"段"；
2. 段内按句号（。！？!?；;）切分为"句"；
3. 输出 `[{index, text, sentences[]}]`。

### 4.2 边界与校验
| 场景 | 行为 |
|---|---|
| 空输入 / 全空白 | 段落化为空数组 → CONCEPT/STORYBOARD 按无输入处理（流水线报"需要非空主题"） |
| 无空行且句数 ≤ 7 | 退化单段 `[{index:0, text: 全文}]` |
| 全文 > 6000 字 | 截断至 6000 并标记 `truncated: true`，记录截断段落索引 |
| 段数 > 20 | 取前 20 段并标记截断（防 prompt 过长） |

### 4.3 显示项
- 分镜检查页（如有）：显示"模式：fidelity｜段落数：N｜是否截断：否"，供用户确认分镜依据。

## 5. 内容对齐门禁（S3）

### 5.1 流程
```
storyboard 产出
   │
   ├─ 场景数组为空/非数组 → fail closed（返回失败，不进入 generate）
   │
   ├─ extractKeyEntities(文案) → entities[]
   │     ├─ 内置词典命中（首期：历史/三国/科技/生活通用高频实体）
   │     └─ 词典命中 < 阈值(默认 5) 且 llmExtractFallback=true → LLM 兜底抽取
   │
   ├─ checkSceneAlignment(scenes, entities, minCoverage=0.8)
   │     ├─ coverage = 场景prompt文本命中实体数 / 实体总数
   │     ├─ pass & retries < maxRetries(默认2) → 带 missing 清单重试 storyboard
   │     └─ 重试后仍不达标 → fail closed（返回失败 + missing 清单）
   │
   └─ 通过 → 进入 GENERATE，alignmentReport 写入 run 上下文/日志
```

### 5.2 数据校验（输入/输出）
| 字段 | 校验 |
|---|---|
| enabled | 布尔，默认 true |
| minCoverage | 数值 0..1，越界 fail closed（拒绝），默认 0.8 |
| maxRetries | 整数 0..5，越界 fail closed（拒绝），默认 2 |
| llmExtractFallback | 布尔，默认 true |
| maxFullTextChars | 整数 500..6000，越界 fail closed（拒绝），默认 6000 |

### 5.3 对齐报告结构（写入 run 上下文 `context.videoContentFidelity`）
```json
{
  "mode": "fidelity",
  "enabled": true,
  "coverage": 0.92,
  "matched": ["关羽", "水淹七军", "曹操"],
  "missing": ["春秋笔法"],
  "retries": 0,
  "truncated": false,
  "paragraphCount": 8,
  "entityCount": 12,
  "assessVisual": { "status": "not_implemented" }
}
```

### 5.4 交互逻辑与提示文字
- 分镜生成中：状态文案"正在按原文生成分镜（保真模式）…"；重试时"部分关键内容未覆盖，正在补充分镜（第 N 次）…"。
- 失败时（fail closed）：错误信息返回 `视频分镜未覆盖文案关键内容：{missing 列表}（已重试 N 次）`，错误码 `STORYBOARD_ALIGNMENT_FAILED`。
- 空场景失败：沿用现有 `storyboard 无法解析场景 JSON` / 新增 `STORYBOARD_EMPTY_SCENES`。

## 6. 优化层事实保真（S4）

### 6.1 context 注入（videogen → prompt-engine）
- 白名单键：`synopsis / character / setting / character_list / full_text`（与 prompt-engine `OptimizeRequest.context` 已知键一致，不引入未知键）。
- 来源映射：
  - `full_text`：分段文案摘要（≤ maxFullTextChars/3 字，默认 ≤2000）
  - `synopsis`：CONCEPT hook + key_facts 摘要
  - `character / character_list`：CONCEPT entities 中人物类
  - `setting`：CONCEPT visual_style / 时代信息（词典提取）
- 校验：context 各键长度收敛（见 7.2）；含 `token/secret/api_key` 等敏感键名 → 拒绝/剥离，不外发。

### 6.2 prompt-engine 事实保真指令
- `generic_video` 策略 system prompt 增加：
  - "不得改变输入主体身份、时代背景与事件事实；"
  - "若请求提供 context.synopsis/full_text，画面要素必须与事实锚点一致。"
- 服务端：context 白名单外键忽略 + 记录 warning，不改变优化行为。

## 7. 非功能要求

### 7.1 性能
- 门禁校验为纯本地计算（词典命中），单次 < 50ms；LLM 兜底抽取仅词典命中 < 5 时启用。
- 重试默认 ≤ 2 次；creative 模式零开销。

### 7.2 安全
- context 发送前敏感键拦截（与 story2video-scene-context 一致）。
- 不把用户文案全文外发到非 prompt-engine 服务（仅本机 prompt-engine）。

### 7.3 兼容性
- 现有 creative 短输入行为不变（默认 auto 下短输入仍走 creative）。
- prompt-engine 批量契约（上限 20、有界并发 8、结果顺序一致）不变。

## 8. 验收标准

| # | 验收项 | 判定 |
|---|---|---|
| A1 | 一句话输入（≤80 字） | 走 creative，行为与现状一致（无保真约束/无门禁） |
| A2 | 长文案输入（≥300 字） | 走 fidelity，storyboard 含 source_paras，实体覆盖 ≥ 0.8 或带缺失重试 |
| A3 | 中间态输入 | 走 hybrid，主旨不变、允许演绎 |
| A4 | 显式 storyboardMode=fidelity 覆盖短输入 | 按 fidelity 执行 |
| A5 | 场景空数组 | fail closed，错误码 STORYBOARD_EMPTY_SCENES |
| A6 | 覆盖不足且重试耗尽 | fail closed，错误码 STORYBOARD_ALIGNMENT_FAILED + missing 清单 |
| A7 | 批量优化请求 | 每项携带 context 且键在契约白名单、full_text ≤ 2000 |
| A8 | context 含敏感键 | 拒绝/剥离，不外发 |
| A9 | prompt-engine 优化中文历史事件 | 输出保留主体/事件/时代，不改变事实 |
| A10 | 对齐报告 | run 上下文含 videoContentFidelity，日志含覆盖度摘要 |
| A11 | 视觉评估接口 | 返回 {status:'not_implemented'}，不阻断流水线 |

## 9. 提示文字汇总（供 UI/日志复用）

| 场景 | 文案 |
|---|---|
| 分镜生成中（fidelity） | 正在按原文生成分镜（保真模式）… |
| 分镜生成中（creative） | 正在创意生成分镜… |
| 分镜重试 | 部分关键内容未覆盖，正在补充分镜（第 N 次）… |
| 分镜失败（未覆盖） | 视频分镜未覆盖文案关键内容：{missing}（已重试 {N} 次） |
| 分镜失败（空场景） | 分镜未生成任何场景，请检查文案或稍后重试 |
| 对齐报告（日志） | [ContentFidelity] mode={mode} coverage={coverage} matched={n}/{m} retries={r} truncated={t} |

## 10. 版本历史
- v1.0（2026-08-12）：初版，覆盖 S1-S5 全部范围。
