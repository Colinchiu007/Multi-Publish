# Story2Video 图片敏感内容处理机制优化方案

> **状态**：方案设计（待评审）
> **日期**：2026-08-30
> **范围**：Story2Video 流水线 generate_assets 阶段图片生成的内容安全（Content Policy）处理机制
> **关联**：PR #1228（MiniMax `input new_sensitive` 信号识别）、PRD §7.1.5「图片内容政策恢复与审计边界」

---

## 一、现状机制梳理

当前链路（PR #1228 之后）：

```
供应商返回错误 → hasStrictContentPolicySignal 识别信号词（黑名单式）
    → classifyProviderFailure 归为 'content_policy'
    → runContentPolicyImageRetry 最多 5 次尝试
        ├─ 第 1 次：原提示词
        ├─ 第 2 次起：buildContentPolicySafePrompt 固定英文模板改写
        └─ 5 次仍失败 → needs_user_input checkpoint（提示用户改文案）
    → 改写时进度切换 + toast 提示（PR #1228）
```

涉及文件：
- `apps/desktop/electron/services/adapters/_base/provider-error.js` — 信号识别与错误分类
- `apps/desktop/electron/services/story2video-image-retry.js` — 改写重试循环
- `apps/desktop/electron/services/asset-generator.js` — 图片生成入口
- `apps/desktop/electron/services/story2video-stages.js` — 阶段编排与进度
- `apps/desktop/electron/services/adapters/minimax-image.js` — MiniMax 图片适配器

---

## 二、现状问题（根因分析）

### 问题 1：改写是"一刀切"固定模板，丢失语义与上下文

`buildContentPolicySafePrompt` 是一个固定英文模板：

```
"Generate a policy-compliant, age-appropriate visual interpretation for scene N.
 Preserve only neutral setting, time, lighting, and composition. Replace sensitive
 people, actions, and details with symbolic, non-identifying alternatives..."
```

- **不区分敏感类型**（暴力 / 色情 / 肖像 / 政治 / 未成年人 / 自伤等）
- **完全没用上 scene_context 已提取的上下文块**（时代/地域/角色/负面锚点），改写后可能引入新的背景漂移
- 改写结果可能与原文意图严重偏离（如"一个老妇人在做饭"被改成抽象符号）

### 问题 2：信号识别是"黑名单"式，必然漏判

`hasStrictContentPolicySignal` 靠枚举 + 正则匹配已知信号词。每次遇到新供应商专有信号（如 MiniMax `input new_sensitive`）都要打补丁，**永远追不上**。

### 问题 3：不区分敏感类型，策略单一

所有内容安全拒绝走同一套改写。但不同敏感类型应差异化处理：
- **轻度敏感**（如"人物肖像""轻微暴力"）→ 改写重试
- **重度敏感**（如"未成年人""自伤""政治敏感"）→ 直接交用户，不浪费改写次数

### 问题 4：改写质量无验证闭环

改写后的 prompt 是否真的规避了敏感、是否保留原意，**没有验证**。可能改写后仍被拒（浪费次数），或改写后语义漂移（用户不满意）。

### 问题 5：审计不完整，无法复盘优化

只记录 `attempt/promptStrategy/outcome/category`，不记录：
- 命中的敏感信号类型
- 改写前后 prompt 的差异度
- 各供应商/模型的敏感拒绝分布

无法用真实数据驱动优化。

---

## 三、优化方案（分层设计）

### 方案总览

```
┌─────────────────────────────────────────────────────────┐
│ 1. 信号识别层：从"黑名单"升级为"白名单 + 分级"            │
│    供应商信号 → 归一化 → 敏感类型分类（violence/sexual/    │
│    portrait/political/minor/selfharm/unknown）            │
├─────────────────────────────────────────────────────────┤
│ 2. 改写策略层：从"固定模板"升级为"场景上下文感知改写"       │
│    敏感类型 + scene_context 锚点 → 差异化改写策略          │
│    （轻度→改写重试；重度→直接交用户）                      │
├─────────────────────────────────────────────────────────┤
│ 3. 验证闭环层：改写后质量验证                              │
│    改写 prompt 自检（敏感词扫描 + 语义保留度）             │
│    改写后仍被拒 → 升级策略或交用户                        │
├─────────────────────────────────────────────────────────┤
│ 4. 审计层：结构化敏感事件日志                              │
│    记录敏感类型/改写前后/供应商分布 → 驱动规则持续优化      │
└─────────────────────────────────────────────────────────┘
```

### 层 1：信号识别与敏感类型分级

**目标**：把"是否敏感"升级为"什么类型、什么程度"，并减少漏判。

- **信号归一化**：新增 `normalizeContentPolicySignal(signal)`，把供应商原始信号（`input new_sensitive`、`content_policy_violation`、`moderation_flagged` 等）归一化为统一枚举。
- **敏感类型分类**：新增 `classifyContentPolicyType(signal)`，输出 `violence / sexual / portrait / political / minor / selfharm / unknown`。
- **分级决策**：新增 `CONTENT_POLICY_SEVERITY` 表，`minor/selfharm/political` 标记为 `severe`（直接交用户），其余为 `mild`（改写重试）。
- **白名单兜底**：对无法分类的 `unknown`，默认走改写重试（保守策略，避免漏判导致整线失败）。

### 层 2：场景上下文感知改写

**目标**：改写保留原文意图，避免背景漂移。

- **复用 scene_context**：改写时传入该场景的 `contextBlock`（时代/地域/角色/视觉风格）和 `negativeAnchors`，让改写"在正确背景下替换敏感元素"。
- **差异化改写模板**：按敏感类型选择改写策略：
  - `portrait`（肖像）→ 替换为"非特定身份的象征性人物"
  - `violence`（暴力）→ 弱化为"冲突氛围，无血腥细节"
  - `sexual`（色情）→ 替换为"含蓄、非露骨的场景"
  - `unknown` → 通用安全改写
- **保留语义锚点**：改写时把 scene_context 的 `anchors`（时代道具/角色/视觉风格）注入改写指令，确保改写后仍是"唐代老妇人在厨房做饭"，只是去掉敏感细节。

### 层 3：改写质量验证闭环

**目标**：避免改写无效浪费次数，保证改写后可用。

- **改写后自检**：改写 prompt 后，用敏感词库 + 语义保留度做快速自检：
  - 敏感词扫描：改写后仍含高危敏感词 → 直接升级策略或交用户
  - 语义保留度：改写前后 prompt 的相似度（如 Jaccard / 关键词重叠）过低 → 提示改写可能偏离
- **改写后仍被拒**：若改写后连续 N 次仍被拒，不再无限改写，升级为"交用户 + 给出具体敏感类型建议"。

### 层 4：结构化审计

**目标**：用数据驱动规则持续优化。

- 新增 `contentPolicyAudit` 记录：敏感类型、改写前后 prompt 哈希、供应商/模型、尝试次数、最终结果。
- 定期统计：各供应商敏感拒绝分布、各敏感类型占比、改写成功率 → 反哺信号词库和改写模板。

---

## 四、落地建议（分阶段）

| 阶段 | 内容 | 风险 |
|------|------|------|
| **P0（立即可做）** | 信号归一化 + 敏感类型分类 + 分级决策（severe 直接交用户） | 低，纯增量 |
| **P1** | 改写接入 scene_context 锚点 + 差异化改写模板 | 中，需回归测试 |
| **P2** | 改写质量验证闭环（敏感词扫描 + 语义保留度） | 中 |
| **P3** | 结构化审计 + 数据驱动规则优化 | 低 |

---

## 五、待确认决策点

1. **分级策略**：是否同意"重度敏感（未成年人/自伤/政治）直接交用户，不浪费改写次数"？
2. **改写是否接入 scene_context**：改写时是否复用已提取的场景上下文锚点（能显著减少背景漂移，但改动较大）？
3. **落地范围**：先做 P0（信号分级）还是直接做完整方案？

---

## 六、回归保护（遵循 QM-5）

- 新增 `provider-error.test.js`：`normalizeContentPolicySignal` / `classifyContentPolicyType` / 分级决策用例
- 新增 `story2video-image-retry.test.js`：差异化改写模板、severe 直接交用户、改写后自检用例
- 保持现有 510 个受影响测试全绿
- 遵循 PRD §7.1.5 合同：审计只保存场景序号/尝试次数/provider/model/提示词版本哈希/非敏感摘要，严禁保存原始 prompt

---

## 七、检查点交互 UX 修复（2026-08-30 已实现）

> 本小节记录针对「内容政策检查点交互不合理」的已落地修复，与上文 P0-P3 优化方案相互独立、可并行。

### 问题

1. **底部操作条只有【✕ 取消】**：内容政策检查点暂停时，用户可能误以为取消会丢弃任务，缺少「修改受影响场景文案后继续」的直接入口。
2. **进度弹窗右上角关闭按钮被禁用**：`pipelineProgressCloseDisabled` 对人工检查点一律返回 true，用户无法关闭弹窗；而内容政策任务不能后台化（否则静默卡在 `needs_user_input`），导致关闭语义不明确。

### 方案

- **底部操作条新增【编辑场景】按钮**（`isContentPolicyCheckpoint === true` 时显示，`data-testid="s2v-edit-scenes-trigger"`）：点击 `editContentPolicyScenes()` → 先 `pipelineCancel()` 取消主进程 run（内容政策任务不能断点续跑，必须改文案后重新生成）→ `resetPipelineUiState()` 复位前端跟踪态 → 跳转 `/create/result?project=<projectId>&focusScenes=<受影响场景号>`，结果页自动定位并高亮受影响场景。
- **进度弹窗右上角关闭按钮对内容政策可点击**：`pipelineProgressCloseDisabled` 对 `isContentPolicyCheckpoint` 返回 false；关闭走 `handlePipelineProgressClose()` → `cancelContentPolicyTask()`（调用 `pipelineCancel` 取消任务并关闭弹窗，作为已取消/失败处理），**不是**后台化。关闭按钮可访问名称改为「关闭并取消该任务」（`progressContentPolicyCloseLabel`）。
- **其他人工检查点不变**：`scene_asset_selection`、`waiting_approval`、非内容政策的 `needs_user_input` 仍禁用关闭、不显示后台运行。

### 数据来源与校验

- `projectId`：来自 `getRunSnapshot` 透传的 `run.projectId`（`pipelineRunStatus.projectId`）。若为空（run-only 记录或项目未落盘），不跳转编辑页，仅 toast 提示「当前任务缺少可编辑项目，请在历史记录中查看并处理」。
- 受影响场景号：来自 checkpoint 的 `scenes[].sceneNumber`（1-based）或 `sceneNumber` / `sceneIndex+1`，升序去重后拼成 `focusScenes` 逗号分隔串。
- 取消失败（`pipelineCancel` 返回非 0 或抛错）：保留当前运行态并显示错误，不跳转，避免静默失败。

### 涉及文件

- `apps/desktop/src/views/CreateView.vue` — `isContentPolicyCheckpoint` / `contentPolicySceneNumbers` / `contentPolicyProjectId` 计算属性；`handlePipelineProgressClose` / `cancelContentPolicyTask` / `editContentPolicyScenes` 方法；模板新增编辑按钮与关闭接线。
- `apps/desktop/src/locales/zh.js` / `en.js` — 新增 `editScenes` / `progressContentPolicyCloseLabel` / `contentPolicyNoProjectToast`（成对维护）。
- `apps/desktop/src/views/CreateView.test.js` — 新增内容政策检查点交互回归用例。

### 验收

- 内容政策检查点：底部显示【编辑场景】，关闭按钮可点击（关闭=取消任务）。
- 点击【编辑场景】：取消任务并跳转结果页，`focusScenes` 携带受影响场景号，结果页定位高亮。
- 缺少可编辑项目：不跳转，仅提示到历史记录。
- 取消失败：保留运行态并提示，不跳转。