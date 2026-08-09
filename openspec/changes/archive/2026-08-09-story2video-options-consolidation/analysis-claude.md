# 分析：图片轮播参数治理——前端死字段移除（voicePitch / creativeLevel / splitBaseWordsPerSecond）

## 当前状态

工作树 **已包含该方案的绝大部分实施**（非空起步审查）：`CreateView.vue`、`CreateView.test.js`、`story2video-ue-contract.test.js`、`story2video-text-config.test.js` 均已修改；`git diff` 确认 s2vConfig 默认值与提交构造已移除三字段（保留注释），normalizer 兜底测试（text-config.test.js:86-103）与 UE 契约字段不存在断言已就位。**未落地部分**：PRD 7.1.20、CHANGELOG、learnings（tasks.md 第 4 项全部未勾选），以及门禁/双模型审查（第 5 项）。

> 环境提示：审查期间工作树状态在多次工具调用间发生变化（首次 Read 与 git diff 结果不一致、git status 文件列表两次不同）——疑似有并行代理/进程正在同一 worktree 上应用变更。**提交前须重新核对磁盘状态。**

---

## 一、行为等价性确认（重点审查 1、2）

### 结论：移除 voicePitch / creativeLevel 后行为**确实等价**，无隐藏消费点依赖 s2vConfig 显式值

关键事实：pipeline 的 `run.params` 在 `startOrchestrated` 处先经 `normalizeStory2VideoTextParams`（pipeline-engine.js:1052）归一化，**normalizer 输出的顶层别名 `voicePitch` / `creativeLevel` 始终为 0 / 5**。所有下游消费点读的都是归一化后的值，而非渲染层原始 s2vConfig：

| 消费点 | 读取来源 | 等价性 |
|---|---|---|
| story2video-stages.js:731,742（TTS `pitch`） | `params.voicePitch`（归一化顶层 = 0）→ 兜底 stage.options（stageDef 默认 0） | ✅ 恒 0 |
| resolveRuntimeStageOptions(pipeline-engine.js:1670) `creative_level` | `input.creativeLevel`（归一化顶层 = 5） | ✅ 恒 5 |
| prompt-engine-contract.js:143 + normalizeCreativeLevel:172 | `options.creative_level ?? creativeLevel`，非法/缺省回退 5 | ✅ 恒 5 |
| pipeline-engine.js:553,1682（stageDef/透传） | stageDef 默认 0 + 归一化顶层 | ✅ 恒 0 |
| story2video-project-service.js `_safeOptions`(:440) | 归一化顶层 `params.voicePitch` | ✅ 恒 0（残留引用，见 Warning 5） |
| collectStory2VideoTtsSamples（story2video-tts-samples.js:39） | 只读 `split.language` + `voice.speed` | ✅ 不依赖 |
| UI 估算（CreateView.vue:1118-1125, voice-estimate.js） | `getLanguageBaseWordsPerSecond(language) × speed` | ✅ 语言表驱动，不读旧字段 |
| applyS2VTemplate(:1744) | 不触 voicePitch/creativeLevel | ✅ |

### splitBaseWordsPerSecond：无路径读到前端旧字段

- 提交构造**保留**语言表下发（CreateView.vue:1652 `getLanguageBaseWordsPerSecond(config.splitLanguage)`，与 design D1「split 段保留」一致）。
- normalizer :293 `firstDefined(own(splitInput,'baseWordsPerSecond'), 语言表)`——渲染层值恒等于语言表值，双路径同源。
- 全仓已无任何代码读取 `s2vConfig.splitBaseWordsPerSecond`（CreateView.vue 内仅剩注释文本）。
- 旧快照恢复：`_applyS2VSnapshot`（:1534-1550）按 `Object.keys(target)` 白名单应用，已移除键自动忽略，且 :1569 的 `applyS2VTargetChars` 自愈按语言表重算 splitTargetSeconds——验证通过。

### 额外发现（Info）：`split.speechRate` 为又一个潜在死提交字段
提交仍显式下发 `speechRate: config.splitSpeechRate`（:1653），但 normalizer :355 硬覆盖 `split.speechRate = voice.speed`。渲染层值恒被忽略。不在本任务范围，建议记入下一轮清理候选。

---

## 二、方案评价（分级）

### Critical：无

行为等价、快照兼容、无契约破坏均已验证。三个字段的移除无功能性断裂点。

### Warning

1. **OpenSpec 内部矛盾：spec vs design/实现 对 `split.baseWordsPerSecond` 处置不一致**
   - spec.md Requirement（:8）：「提交构造 SHALL 不显式提交**这三项**」（含 split.baseWordsPerSecond）；
   - design.md D1：「split 段**保留** baseWordsPerSecond（语言表，不变）」；实现（:1652）保留。
   - 行为上两种做法等价（normalizer 语言表兜底 = 显式下发值），但**契约文档自相矛盾**，会造成验收口径混乱。→ 建议改 spec 措辞为「voicePitch/creativeLevel 不提交；split.baseWordsPerSecond 可省略、由语言表兜底，前端当前仍按语言表显式下发」。

2. **PRD 7.1.20 参数治理合同尚未落地**（tasks.md 第 4 项全部未完成）
   - 方案的一半价值在「成文合同」；当前 PRD 只有 7.1.12-7.1.16，无 7.1.20；CHANGELOG 顶部仍是最新子进度条条目；learnings 无本主题。→ 交付前必须补齐。

3. **隐藏默认清单的「等」字覆盖不全（文档编写时易遗漏）**
   - spec/design 仅点名 voicePitch/creativeLevel/concurrency/splitBaseWordsPerSecond/autoAdvance/splitEnforceSentenceBoundary。经全量核查，**完整清单还含**：`splitOverflowToNext`、`splitSpeechRate`（派生）、`splitMinWords/MaxWords`、`splitSubtitleMinChars/MaxChars/Timing`、`checkpointPolicy:'none'`、`background:true`、`sceneDurationMode/minSceneDuration`（经 computed 代理暴露）、`watermarkConfig` 内部项（fontSize/opacity/color，模板持有）。→ PRD 7.1.20 需以「s2vConfig 全键 × 是否 UI 暴露 × 是否提交 × 默认值/边界」矩阵列出，避免未来「开放 UI」决策漏项。

4. **快照恢复兼容场景缺测试**：spec 有 Scenario「旧快照含已移除键 → 忽略」，但现有 restore 测试（CreateView.test.js:308-347）快照 fixture **不含**已移除键，未真正覆盖该场景。→ 低成本补齐：在 :315 fixture 中加入 `voicePitch/creativeLevel/splitBaseWordsPerSecond` 并断言 `s2vConfig` 不含这三键。

5. **project-service `_safeOptions` 白名单仍保留 `voicePitch`（残留引用）**：项目保存仍持久化归一化的 `voicePitch:0`。读的是归一化 params 而非 s2vConfig，无功能影响；但若治理目标是「系统管理参数不落项目文件」，属残留。→ 可选清理或在 PRD 中说明其保留原因（回读安全）。

### Info

- **其余引用三字段的测试均无需改动**（验证非遗漏）：
  - `story2video-stages.test.js:393`（`params.voicePitch:2 → pitch:2`）：测归一化顶层透传路径，不受前端移除影响；
  - `pipeline-story2video-contract.test.js:461`（`optimize.creativeLevel:8 → creative_level:8`）：测 normalizer **显式输入仍被接受**，契约不变；
  - `story2video-text-config.test.js:46,139,184`：normalizer 常规断言，有效；
  - `story2video-engine.test.ts:112-164`（引擎 `baseWordsPerSecond:3.3`）：引擎级默认，独立于前端；
  - `stage-executor.test.js:523`（config 无 baseWordsPerSecond）：`collectStory2VideoTtsSamples` 不依赖该键，有效。
- **Python 后端 yaml 默认值**（story2video-compose.yaml:37 `baseWordsPerSecond:3.3` / :49 `creativeLevel:5` / :247 `voicePitch:0`）与 JS 契约同值；但后端 3.3 **非语言感知**——仅影响绕过 JS 语言表的直接 Python 调用（既有行为，非本任务引入）。
- **文档应写明**：`split.baseWordsPerSecond` 虽然「前端不暴露 UI」，但**仍随提交下发**（语言表派生），与 voicePitch/creativeLevel（完全不提交）性质不同——这正是 Warning 1 措辞矛盾的根源。

---

## 三、遗漏清单汇总

**消费点**：已全量排查（stages / resolveRuntimeStageOptions / prompt-engine-contract / pipeline-engine / project-service / tts-samples / voice-estimate / applyS2VTemplate / _applyS2VSnapshot），**无遗漏消费点**。

**测试**：
1. ☐ 快照恢复含已移除键场景（spec 已有 Scenario，无测试落地）——补。
2. ✅ 其余引用字段的测试均为有效覆盖或已修改，无需额外处理。

**文档**：
1. ☐ PRD 7.1.20（未开始）——含隐藏默认完整矩阵 + fps/splitMaxSentenceLength/negativePrompt 边界 + watermark/subtitle 双源说明。
2. ☐ CHANGELOG 条目（未开始）。
3. ☐ learnings（未开始）。
4. ☐ spec.md Requirement 措辞与 design/实现对齐（Warning 1）。

---

## 四、推荐确认

**同意按 D1/D2/D3 方案推进**，并补以下修正后合入：

1. **改 spec 措辞**：三项并非同等对待——voicePitch/creativeLevel「不提交」，split.baseWordsPerSecond「不暴露 UI、值由语言表派生、当前显式下发、normalizer 兜底等价」。
2. **补快照恢复测试**：fixture 加已移除键并断言忽略。
3. **PRD 7.1.20 按完整清单编写**（见 Warning 3 矩阵），CHANGELOG/learnings 同步。
4. （可选）清理 project-service `_safeOptions` 中 `voicePitch` 或文档化其保留。
5. 提交前重跑受影响套件 + 全量 vitest（本审查期间工作树在被并发修改，先 `git status` / `git diff` 复核），再走双模型审查与合并。

**预估风险**：低。唯一需人工裁决的是 Warning 1 的 spec 措辞归属（建议保留显式下发以维持估算/校准单源清晰性，文档优先于改码）。

---
SESSION_ID: d83b32b7-a1b0-4f4c-80ea-cfdb64726ef9
