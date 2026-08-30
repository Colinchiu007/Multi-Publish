# 敏感改写策略（Story2Video 图片内容安全）

> **状态**：已实现
> **日期**：2026-08-30
> **范围**：Story2Video 流水线 `generate_assets` 阶段图片生成的内容安全（Content Policy）改写策略
> **关联**：`ARCH-STORY2VIDEO-IMAGE-CONTENT-POLICY-2026-08-30.md`（方案设计）、PRD §7.1.5（图片内容政策恢复与审计边界）、PR #1228（MiniMax `input new_sensitive` 信号识别）

---

## 一、核心问题

视频创作流水线中，通过提示词引擎优化后的图片提示词，经常因包含敏感内容被图片模型拒绝生成。程序需要**自动改写提示词并重新生成**，而不是把失败抛给用户。

**关键约束**：改写必须由程序/LLM 自动完成，尽量不打断用户（2026-08-30 用户决策：程序/LLM 自动解决，而非「重度敏感直接交用户」）。

---

## 二、改写职责归属（架构决策）

### 2.1 敏感改写 ≠ 提示词优化

| 环节 | 职责 | 是否做敏感改写 |
|------|------|--------------|
| 传给 prompt-engine **之前** | 预过滤/预改写（第一道防线，可选） | 建议做 |
| prompt-engine 优化时 | 风格/创意优化（提升质量） | **不做**敏感改写 |
| 图片模型**拒绝后** | 敏感改写 + 重试（核心兜底） | **必须做** |

**结论**：敏感改写与提示词优化是两件不同的事，**不合并**。优化是提升质量，改写是规避安全策略。敏感判定只能以图片模型返回的错误为准（不同供应商标准不同且动态变化），所以改写必须在「收到拒绝之后」做，无法完全前置。

### 2.2 改写在哪里实现

**敏感改写完全在桌面应用内实现**，不依赖提示词引擎（prompt-engine）：

- **模板改写**（`buildContentPolicySafePrompt`）：纯规则拼接，按敏感类型选择安全改写指令，不调 LLM。
- **LLM 改写**（`aiGenerator.generateWithDefault('llm')`）：模板改写无效时，用应用自己的默认 LLM 真正替换敏感内容、保留原意。

**「注入」澄清**：`runContentPolicyImageRetry` 是领域中立的通用重试引擎，通过 `rewriteWithLLM` **回调参数**调用 LLM 改写。这个回调是**应用内实现**（`asset-generator.js` 构造），**不是注入提示词引擎**，也不调用任何外部服务。

```
runContentPolicyImageRetry（通用重试引擎）
   │  只负责：检测敏感拒绝 → 改写 → 重试 → 兜底
   │
   └─ rewriteWithLLM 回调（应用内注入）
        └─ aiGenerator.generateWithDefault('llm', ...)   ← 应用自己的 LLM
```

---

## 三、分层改写策略

```
┌─────────────────────────────────────────────────────────────┐
│ 1. 信号识别层：识别敏感拒绝 + 分类敏感类型                    │
│    供应商信号 → hasStrictContentPolicySignal →               │
│    classifyContentPolicyType → violence/sexual/portrait/     │
│    political/minor/selfharm/unknown                          │
├─────────────────────────────────────────────────────────────┤
│ 2. 改写策略层：模板改写 → LLM 改写升级                        │
│    敏感类型 + scene_context 锚点 → 差异化改写                 │
│    模板改写自检失败（含高危词）→ 升级 LLM 改写                 │
├─────────────────────────────────────────────────────────────┤
│ 3. 验证闭环层：改写后安全校验                                 │
│    validateRewriteSafety 扫描高危敏感词                       │
│    仍含高危词 → 不发送，升级或交用户                          │
├─────────────────────────────────────────────────────────────┤
│ 4. 审计层：结构化敏感事件日志                                 │
│    createContentPolicyAudit（只存哈希，严禁明文）             │
└─────────────────────────────────────────────────────────────┘
```

---

## 四、详细算法与逻辑

### 4.1 信号识别与敏感类型分类

**文件**：`apps/desktop/electron/services/adapters/_base/provider-error.js`

- `hasStrictContentPolicySignal(signal)`：严格识别供应商内容安全信号（`content_policy`、`moderation_flagged`、MiniMax `input new_sensitive` 等）。**排除** 401/403/429/超时/网络/配置错误——这些即使文案提到安全也绝不改写重试。
- `classifyContentPolicyType(signal)`：把信号归为 7 类敏感类型。
- `CONTENT_POLICY_SEVERITY`：标注严重度（`political/minor/selfharm` 为 severe，其余 mild）。**仅作改写指令强度参考，不用于「直接交用户」决策**。

### 4.2 模板改写（第一层）

**文件**：`apps/desktop/electron/services/story2video-image-retry.js` → `buildContentPolicySafePrompt`

按敏感类型选择差异化改写指令，并注入 `scene_context` 锚点保留原文背景：

| 敏感类型 | 改写指令要点 |
|---------|------------|
| violence | 冲突氛围，无血腥/伤口/武器 |
| sexual | 含蓄、非露骨、适龄，无裸露/性内容 |
| portrait | 仅虚构、非特定身份角色 |
| political | 无政治人物/符号/指涉 |
| minor | 仅成人角色 |
| selfharm | 平静、充满希望，无自伤/受伤/痛苦 |
| unknown | 用象征性、非特定身份替代 |

**scene_context 锚点**：改写时注入 `contextBlock`（时代/地域/角色/视觉风格）与 `anchors`（一致性锚点），使改写「在正确背景下替换敏感元素」，避免背景漂移。auto 路径与 manual 分镜路径统一经 `resolveSceneContextForRewrite` 提取。

### 4.3 改写自检与 LLM 升级（第二层）

**文件**：`story2video-image-retry.js` → `runContentPolicyImageRetry`

```
内容政策拒绝
  → 提取敏感类型
  → 改写前自检原文 validateRewriteSafety(originalPrompt)
      ├─ 原文不含高危词 → 模板改写（buildContentPolicySafePrompt）→ 重试
      └─ 原文含高危词（模板改写版拼入原文必然仍含）
          ├─ 有 rewriteWithLLM → LLM 改写（真正替换敏感内容）→ 重试
          └─ 无 rewriteWithLLM → 交用户兜底
  → 重试耗尽仍失败 → needs_user_input（含敏感类型）
```

**LLM 改写**（`asset-generator.js` 构造默认实现）：

```
system: 你是图片提示词安全改写助手。替换敏感人物/动作/细节为象征性、
        非特定身份的替代，保留场景背景、时代、地域、角色与视觉风格等非敏感信息。
        只输出改写后的提示词本身。
user:   敏感类型：<type>
        场景背景（保留）：<contextBlock>
        一致性锚点（保留）：<anchors>
        原始提示词：<prompt>
```

LLM 改写结果仍需 `validateRewriteSafety` 校验，仍含高危词则不发送、交用户。

### 4.4 验证闭环

- `validateRewriteSafety(prompt)`：扫描高危敏感词（child/minor/underage/self-harm/suicide/gore/nudity/porn 等）。
- `estimateSemanticRetention(original, rewritten)`：估算改写前后语义保留度，过低提示改写可能偏离。

### 4.5 结构化审计

- `createContentPolicyAudit(opts)`：记录敏感类型/尝试次数/provider/model/结果，改写前后 prompt 只存 SHA-256 哈希，**严禁明文**（遵循 PRD §7.1.5 审计边界合同）。
- 在 asset-generator 的 `needs_user_input` 分支记录。

---

## 五、重试流程（完整）

```
第 1 次：原提示词
  ↓ 内容政策拒绝
第 2 次起：模板改写（按敏感类型 + scene_context 锚点）
  ↓ 模板改写自检失败（原文含高危词）
  → 升级 LLM 改写
  ↓ 仍失败
最多 5 次总尝试 → needs_user_input（含敏感类型 + 改写建议）
```

**有界重试**：最多 `MAX_IMAGE_GENERATION_ATTEMPTS = 5` 次，避免无限重试烧额度。达到上限仍失败 → `needs_user_input` 检查点，交用户人工处理（不静默降级成劣质图）。

---

## 五·补、实际改写效果示例（用真实代码验证，2026-08-30）

> 以下效果用真实代码 `buildContentPolicySafePrompt` / `validateRewriteSafety` 运行验证。
> **重要**：`validateRewriteSafety` 只用于「原文」和「LLM 改写结果」，**不用于模板改写版**——模板改写版含否定句高危词（`Do not depict graphic violence...`）是指令而非内容，生产代码不经过自检。

### 5.1 模板改写效果（按敏感类型 + 保留背景/锚点）

以场景「唐代，中国，老妇人，厨房，油灯」（contextBlock + anchors）为例：

| 敏感类型 | 改写指令（英文） | 保留背景/锚点 | 拼入原文 |
|---------|----------------|--------------|---------|
| violence | Depict the scene as a tense conflict atmosphere with no blood, wounds, weapons, or graphic detail. | 唐代，中国，老妇人，厨房，油灯 / 唐代、油灯 | 两人激烈搏斗，血流满地，手持利刃 |
| sexual | Depict the scene in a modest, non-explicit, age-appropriate way with no nudity or sexual content. | 同上 | 一名女子穿着暴露，姿态挑逗 |
| portrait | Depict only a fictional, non-identifying character; do not reproduce any real person likeness. | 同上 | 酷似某知名明星的年轻男子 |
| political | Depict the scene without any political figures, symbols, or references. | 同上 | 广场上聚集人群，挥舞旗帜，背景是政府大楼 |
| minor | Depict only adult characters; do not depict any minors or child-like figures. | 同上 | a child in a classroom |
| selfharm | Depict a calm, hopeful scene with no self-harm, injury, or distress. | 同上 | 一个人独自在房间，手臂上有伤痕，神情绝望 |
| unknown | Replace sensitive people, actions, and details with symbolic, non-identifying alternatives. | 同上 | 诡异的场景，无法描述的内容 |

**模板改写完整结构**（以 violence 为例）：

```
Generate a policy-compliant, age-appropriate visual interpretation for scene 3.
Depict the scene as a tense conflict atmosphere with no blood, wounds, weapons, or graphic detail.
Do not depict graphic violence, nudity, sexual content, minors, self-harm, illegal activity, hate symbols, real-person likenesses, or readable text.
Preserve this scene background: 唐代，中国，老妇人，厨房，油灯.
Keep these visual anchors: 唐代, 油灯.
Scene source to adapt:
两人激烈搏斗，血流满地，手持利刃
```

### 5.2 改写前自检（针对原文）

`validateRewriteSafety(原文)` 决定是否升级 LLM：

| 原文 | 自检结果 | 决策 |
|------|---------|------|
| a child in a classroom | ⚠️ 含 child | 升级 LLM 改写 |
| self-harm scene | ⚠️ 含 self-harm | 升级 LLM 改写 |
| 两人激烈搏斗，血流满地（中文） | ✅ 安全（英文正则不命中中文） | 走模板改写 |
| 一位老妇人在厨房里点油灯 | ✅ 安全 | 走模板改写 |

### 5.3 LLM 改写结果自检（针对 LLM 输出）

`validateRewriteSafety(LLM输出)` 决定是否发送给图片模型：

| LLM 输出 | 自检结果 | 决策 |
|---------|---------|------|
| a young student in a classroom | ✅ 安全 | 发送 |
| a child playing in a classroom | ⚠️ 仍含 child | 不发送，交用户 |
| 两人紧张对峙（中文） | ✅ 安全 | 发送 |
| a calm scene but self-harm implied | ⚠️ 仍含 self-harm | 不发送，交用户 |

### 5.4 LLM 改写效果示例（应用内 `aiGenerator.generateWithDefault('llm')`）

输入：敏感类型 + 场景背景/锚点 + 原始提示词；输出：替换敏感元素、保留背景的安全提示词。

| 原始提示词 | LLM 改写结果 |
|-----------|-------------|
| a child in a classroom | a young student in a classroom |
| 两人激烈搏斗，血流满地 | 两人紧张对峙，气氛凝重 |
| 手臂上有伤痕，神情绝望 | 安静地坐在窗边，神情平静 |
| 穿着暴露，姿态挑逗 | 穿着得体，姿态端庄 |

**改写目标文字**：保留场景背景和视觉风格，把敏感元素替换为象征性、非特定身份、适龄、无血腥/裸露/政治/儿童/自伤的安全描述。

---

## 六、涉及文件

| 文件 | 职责 |
|------|------|
| `apps/desktop/electron/services/story2video-image-retry.js` | 改写重试引擎、分级、自检、LLM 升级 |
| `apps/desktop/electron/services/adapters/_base/provider-error.js` | 信号识别、敏感类型分类 |
| `apps/desktop/electron/services/asset-generator.js` | 图片生成入口、LLM 改写回调构造、审计记录 |
| `apps/desktop/electron/services/story2video-stages.js` | 阶段编排、sceneContext 提取透传 |
| `apps/desktop/electron/services/adapters/minimax-image.js` | MiniMax 图片适配器（空结果/敏感信号抛错） |

---

## 七、测试覆盖

- `story2video-image-retry.test.js`：分级、模板改写、LLM 升级、自检、审计
- `provider-error.test.js`：信号识别、敏感类型分类
- `minimax-image.test.js`：空结果/敏感信号抛错
- `story2video-stages.test.js`：auto 路径 sceneContext 透传、进度上报

---

## 八、待优化方向

1. **前置预过滤**：传给 prompt-engine 前用敏感词表粗过滤，减少拒绝概率（不能作为唯一手段，供应商策略动态）。
2. **改写质量验证**：`estimateSemanticRetention` 接入重试循环，改写后语义保留度过低时提示。
3. **数据驱动优化**：定期统计各供应商敏感拒绝分布、各敏感类型占比、改写成功率，反哺信号词库和改写模板。
4. **LLM 改写降级**：LLM 改写失败时，可尝试多轮改写（不同改写指令）后再交用户。