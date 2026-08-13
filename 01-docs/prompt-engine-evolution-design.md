# 图片/视频提示词引擎自进化系统设计（Prompt Engine Evolution）

> **版本**: v2（2026-08-13）
> **状态**: 设计已定稿（经 Claude + Codex 双模型架构审查修订）
> **范围**: 为图片/视频提示词引擎建立「采集 → 评估 → 记忆 → 优化 → 治理」自进化闭环；不改变既有生成契约
> **关联文档**: `ARCH-PROMPT-EVAL-SYSTEM-2026-08-11.md`（复用其评估器）、`VIDEO-PROMPT-OPTIMIZE-ENGINE-DESIGN-2026-08-11.md`（视频提示词统一引擎）、`PROMPT-TEXT-SPEC.md`
> **审查记录**: 双模型审查合并报告见本次交付上下文（Claude + Codex，结论「需修改后通过」已全部修订）

---

## 1. 概述与目标

把提示词引擎从「静态模板 + 每次从零生成」升级为「数据驱动的自适应系统」——每次生成、每次用户操作、每次发布都沉淀为下一次生成的知识。

与既有能力的关系：

| 既有能力 | 位置 | 本设计的关系 |
|---|---|---|
| PromptEval 评估器（图片 LLM 打分 + 持久化） | `apps/desktop/electron/services/prompt-eval/` | **复用/扩展**为 Evaluator 的 llm 评分通道，不重复实现 |
| 外部 prompt-engine（图片/视频领域化优化） | `D:\Data\projects\prompt-engine`（8013） | 保持契约不变，作为 `optimizedBy=prompt-engine` 来源 |
| StoryboardPrompt 模板生成器 | `packages/story2video-engine/src/storyboard-prompt.ts` | 保持纯同步签名；仅新增确定性 `ruleScore()` 出口 |
| 平台创作者数据 | `apps/desktop/electron/services/analytics-providers.js` | 扩展 per-note 契约 + 发布归因 |

设计原则：

- **P1 反馈闭环优先**：先建管道让数据流动；没有日志就没有进化。
- **P2 图片激进、视频保守**：图片低成本可高频探索；视频人工确认 + 低风险优化。
- **P3 模板可版本化可回滚**：进化写入带版本和来源，性能下滑自动回退。
- **P4 门禁是进化边界**：自动模板必须过结构/合规/长度/注入检测。
- **P5 本地优先、隐私脱敏**：日志本地存储，上报前脱敏；不引入重型外部依赖。
- **P6 向后兼容**：`generateCandidates`/`composeStoryboardPrompt`/`PromptBridge` 契约不变（纯同步签名）。

---

## 2. 总体架构

五层外挂式设计，不侵入生成主路径；所有异步/LLM 操作在 Optimizer 编排层，不进入同步纯函数：

```
① SignalCollector → generation-log.jsonl（append-only 主记录）
                   + feedback-log.jsonl + score-log.jsonl（按 eventId join 的回填流）
② Evaluator → 规则评分(同步) + CLIP(可选) + LLM 评分(复用 PromptEval, 带 model+version)
             + 用户信号 + 平台三态信号
③ PromptMemory → prompt-library/ 版本化模板：full + fragment
                （仅 composition/action/object/creativeLevel 四类可控参数）
④ Optimizer → evaluateCandidates() 异步重排 / Self-Refine / A-B(确定性分桶)
⑤ Governance → 门禁 6 规则 / 版本状态机 / 成本配额 / 滑窗退化检测回滚
```

---

## 3. 数据模型

### 3.1 GenerationEvent（主记录，generation-log.jsonl，append-only，月轮转）

| 分组 | 字段 | 约束 |
|---|---|---|
| 标识 | id, schemaVersion, ts, engine(image\|video), mode(story2video\|standalone\|storyboard) | 必填；engine/mode 枚举单一来源 |
| context | tenantId, userHash(加盐 HMAC), sessionId, appVersion | userHash 脱敏 |
| input | concept, creativeLevel(1..10), stylePreset, enrichment{era,dynasty,sentiment} | 概念文本按不可信输入处理 |
| prompt | raw, optimized, optimizedBy(prompt-engine\|local-fallback\|self-refine\|learnt-template\|none), **templateVersion(必填,buildin 用 sentinel)**, **librarySource(builtin\|learnt\|full\|fragment)**, **experimentId/armId(可选,A-B 必填)**, structured(按 mode 定义必填集合) | 溯源字段必填，回滚/A-B 依赖 |
| provider | name, model, params | — |
| result | status(success\|failure\|partial), errorCode, outputRefs, durationMs, costEstimate | costEstimate 来源定义于配置价格表 |

**不写 feedback 字段**——反馈与评分走独立日志，保持主记录 append-only 纯净。

### 3.2 FeedbackEvent（feedback-log.jsonl，append-only，按 eventId join）

- `eventId, ts, type(accepted|regenerated|edited|downloaded|deleted|published)`
- `detail: { accepted, regenerated, editedFields[], downloaded, publishedTo[{platform, noteId}] }`
- **发布归因**：发布侧记录 `generationId→publishId→platform+noteId` 映射（独立映射表，P2 落地）

### 3.3 EvaluationScore（score-log.jsonl，append-only，按 eventId + templateVersion join）

- `eventId, templateVersion, engine, scoredAt, evaluatorVersion`
- `scores: { rule(0-1), aesthetic(可选, clip-aesthetic-v2), llm(0-10, 4维, 记录 model+version), user(映射函数), platform(三态) }`
- **平台三态**：`no_data`(不回填/不参与) / `valid_positive` / `valid_negative`；no_data 参与时权重重分配而非补零
- `composite: { score, weights, 首次值/回填重算值双版本 }`——记忆库门槛以回填后完整分为准，缺维度标 `partial`

### 3.4 PromptTemplate（prompt-library/library.json + templates/<id>@<version>.json）

- `id, engine, type(composition|style|keyword|metaphor|full), version`
- `content`：结构化；learnt fragment 仅允许落在 compositionType/action/object/creativeLevel 可表达参数空间
- `source(builtin|learnt|manual), provenance{learnedFrom,acceptedEvents}`
- `stats{uses,acceptRate(滑窗),avgScore,avgCost,lastUsedAt}`
- `state(draft|active|deprecated|disabled), createdAt/updatedAt/confirmedBy`
- `guard{checksum,validatedAt,gateRules,evaluatorVersion}`

---

## 4. 模块详细设计

### 4.1 信号采集器 SignalCollector

- **信号源**：生成执行(主进程埋点,失败不阻断) + 用户行为(渲染进程经 `generation:feedback` 上报,必须携带 eventId) + 平台回灌(analytics-providers 扩展 per-note) + 会话关联
- **IPC**（沿用 `code+data+message` + `core/error-codes.js` 的 `EC` 常量）：
  - `generation:log`（主进程内部；若暴露须明确边界防双写）
  - `generation:feedback`（渲染→主，eventId 必传）
  - `prompt-library:list` / `prompt-library:get` / `prompt-library:activate`
- **写入契约**：纯 JSON；`appendFileSync` 单 writer；写失败 catch+warn 不阻断生成主路径；测试写 `os.tmpdir()` 唯一路径；读取容忍尾部残缺行
- **采集开关**：config 三态（全开/停写/停上报），已写日志本地保留

### 4.2 评估器 Evaluator

| 评分通道 | 实现 | 状态 |
|---|---|---|
| 规则评分 | 同步纯函数 `ruleScore(prompt)`，无 LLM 依赖 | V0 必做 |
| CLIP/aesthetic | 可选接口；无本地模型时跳过并重归一权重 | V0.5 可选 |
| LLM 4 维评分 | 复用 PromptEval evaluator；记录 model+version 防漂移 | V1 flag 开关 |
| 用户信号 | FeedbackEvent 映射函数 | P0 即有 |
| 平台信号 | 三态回填；no_data 不参与 | P2 |

- **融合**：`composite = 可用维度加权`，缺维重归一；user/platform 异步回填，no_data 不补零
- 评分/反思用异构模型（避免同族自我偏好）或规则+用户信号校验
- 视频 V0 **不自动 LLM 评分生成内容**，仅生成成功率+用户采纳+平台三态

### 4.3 记忆库 PromptMemory

- 两级：full 模板 + fragment（**仅 composition/action/object/creativeLevel 四类**，与生成器可控参数一一映射；color/keywords/metaphor 类 fragment 列为 P3 契约扩展，不在 P0-P1 范围）
- V0 检索：type+engine+标签+主题关键词；**检索加探索概率 ε(默认 0.1) 防马太效应**；阈值可配
- 入库门槛：图片 `llm >= 7.0`(0-10 标度, 缺维 partial 不参与) 或 `user.accepted` 累计≥3 次(可配)；视频人工确认或平台 `valid_positive` 且≥5 条；全部过门禁
- V1：本地 embedding 语义检索（默认关闭）

### 4.4 优化器 Optimizer（唯一承载异步/LLM 的编排层）

- **回路 A 候选重排**：`generateCandidates` **保持纯同步签名不变**（删除 v1 的可选参数设计）；Optimizer 调新导出 `evaluateCandidates(candidates): Promise<Ranked[]>{prompt,score,reason}`，超时预算内同步等待或后台异步回填（P1 采用同步+超时预算，超时降级返回原候选）
- **回路 B Self-Refine**：失败/低分→反思(定界+指令隔离, 1 轮上限)→门禁→重试；`optimizedBy:"self-refine"`
- **回路 C A-B**：`seed=hash(eventId+variant)` 确定性分配；随机化单元=一次任务/一个概念；记录 `experimentId/armId`；胜者统计需样本量阈值
- **provider 路由学习**：从 P2 移除，挪至 P3（需补 provider 性能数据表+选择策略+回退设计）

### 4.5 治理层 Governance

- **状态机**：builtin/manual→active→deprecated→disabled；learnt: 门禁→draft→(人工或数据确认)→active
- **门禁 6 规则**：
  1. `structure`：按 engine/mode 分档字段完整
  2. `compliance`：合规词表
  3. `length`：按 engine 分档（storyboard 中文 50..2000 字符；英文 prompt 50..200 词）
  4. `noSecrets`：含疑似指令注入模式
  5. `dedup`：checksum，含近重复聚类淘汰策略
  6. `evaluatorVersion` 记录
- **回滚**：滑窗指标（acceptRate 连续 N 期<阈值 或 avgScore 下滑）→ 自动 deprecated → 回退上一版本；冷却期防抖；全部指标化可测
- **成本配额**：config 按引擎 dailyBudget；视频默认零自动评分

---

## 5. 集成点与改动边界

| 现有文件 | 改动 | 级别 |
|---|---|---|
| `packages/story2video-engine/src/storyboard-prompt.ts` | **仅新增确定性导出 `ruleScore(prompt): number`**（同步纯函数，无 LLM 依赖）；可选 P3 扩展 color/keywords 注入参数(带兼容测试) | 小，向后兼容 |
| `packages/story2video-engine/src/history-prompt.ts` | `generateImagePromptsSmart` 增加 `onEvent` 回调参数 | 小 |
| `apps/desktop/electron/ipc-handlers/` | 新增 `generation-feedback.js` | 新文件 |
| `apps/desktop/electron/services/` | 新增 `prompt-evolution/`：`signal-collector.js` `evaluator.js` `prompt-memory.js` `optimizer.js` `governance.js` | 新模块 |
| `apps/desktop/electron/services/prompt-eval/` | 复用 evaluator 接口；补 `evaluateCandidates` 批处理适配 | 扩展 |
| `apps/desktop/electron/services/analytics-providers.js` | 扩展 per-note 契约 `{noteId,publishedAt,metrics{views,playRate,...}}` | 中 |
| `apps/desktop/electron/core/container.setup.js` | feature flag 注册 | 小 |
| `packages/python-backend/src/multi_publish/prompts/*.py` | V0 不动 | 无 |

**不改变**：`generateCandidates` 同步签名、`composeStoryboardPrompt`、`PromptBridge` 契约、`IMAGE_STYLE_PRESETS`、`COMPOSITION_PATTERNS` 内置池（新增条目走推荐映射进池，防随机分布漂移，加分布回归测试）。

---

## 6. 分阶段实施计划

### P0 反馈管道（1-2 周）
- [ ] GenerationEvent/FeedbackEvent schema + 双日志写入 + 轮转
- [ ] IPC：`generation:feedback`（eventId 必传）
- [ ] 前端埋点：采纳候选 / 重新生成 / 编辑字段 / 下载
- [ ] 基础统计：acceptRate / regenerateRate / 平均耗时
- [ ] 契约测试：append-only 校验 / eventId join / 失败不阻断 / tmpdir 隔离

**完成标志**：一次任务完整产生 generation-log + (操作后)feedback-log 且 eventId 正确 join；写失败时生成流程无感知。

### P1a 评估 + 重排（1-2 周）
- [ ] 规则评分 + `ruleScore()` 导出
- [ ] `evaluateCandidates()` 编排（同步+超时预算）
- [ ] `generateCandidates` 兼容回归

**完成标志**：ruleScore 同步纯函数通过单元测试；evaluateCandidates 超时降级返回原候选。

### P1b 记忆 + 治理（1-2 周）
- [ ] 记忆库 V0（四类 fragment + 探索概率）
- [ ] 门禁 6 规则
- [ ] 状态机 + 滑窗回滚 + 配额

**完成标志**：learnt 模板经门禁进入 draft；滑窗指标触发回滚的自动化测试通过。

### P2 视频保守进化 + 平台回灌（2-3 周）
- [ ] 视频模板人工确认 UI
- [ ] A-B（确定性分桶 + 样本量阈值）
- [ ] per-note 平台回灌 + 三态
- [ ] 发布归因映射（generationId→publishId→noteId）

**完成标志**：一次真实发布后 platform 分按三态回填且 no_data 不参与评分。

### P3 完整飞轮（按需）
- [ ] embedding 语义检索
- [ ] 遗传式探索（门禁内）
- [ ] 分群策略
- [ ] color/keywords 契约扩展
- [ ] provider 路由学习（补规格）

---

## 7. 测试与验收策略

| 层 | 用例 |
|---|---|
| 单元 | schema 校验(含枚举单一来源)、双日志 join、评分归一化/重归一、门禁 6 规则、状态机+滑窗回滚+冷却、A-B 显著性门槛、no_data 三态、CLIP 缺失回退 |
| 契约 | IPC 纯 JSON + EC 常量、`generation:feedback` eventId 必传校验、checksum 去重+近重复聚类 |
| 兼容 | `generateCandidates` 未接入 rerank 时行为与旧版结构一致（含随机性容忍） |
| 集成 | 真实 PromptBridge + 本机临时 HTTP 服务（校验每项非空，沿用 OPTIMIZE_BATCH 教训） |
| 端到端 | generationId→publishId→noteId 关联、发布归因正确性、A-B 分桶完整性 |
| 手动 | 生成→采纳→评分回填→再次生成命中记忆库 |

---

## 8. 护栏与风险清单

| 风险 | 对策 |
|---|---|
| 模板污染 | 门禁 6 规则 + draft + 双确认 + 版本回滚 + 近重复淘汰 |
| 性能退化 | 滑窗监控(acceptRate/avgScore) + 冷却防抖 + 自动 deprecated 回退 builtin |
| 成本失控 | 按引擎 dailyBudget；视频默认零自动评分；evaluateCandidates 超时预算 |
| 隐私 | 本地存储；userHash 加盐 HMAC；config 三态开关；P3 单用户删除/导出 |
| Prompt 注入 | 概念文本定界/截断/指令隔离；门禁疑似注入检测；learnt 内容按不可信输入处理 |
| 自我偏好 | 评分/反思异构模型或规则+用户信号校验 |
| 外部模型不可用 | 进化层全失败 → 生成主路径不变（沿用 `generateImagePromptsSmart` 本地回退模式） |
| 可观测性 | 事件数/门禁拒绝率/模板激活率/配额使用率指标 |

---

## 9. 参考与衔接

- `ARCH-PROMPT-EVAL-SYSTEM-2026-08-11.md`：PromptEval 评估器（本设计 Evaluator.llm 通道的既有实现，v1 仅 image，video 预留）
- `VIDEO-PROMPT-OPTIMIZE-ENGINE-DESIGN-2026-08-11.md`：外部 prompt-engine 升级 video 领域（本设计 `optimizedBy=prompt-engine` 来源）
- `PROMPT-TEXT-SPEC.md`：提示词文本契约
- 审查记录：本次双模型（Claude + Codex）架构审查合并报告（CRITICAL×6 已全部修订，MAJOR 已纳入或明确降级到 P3）
