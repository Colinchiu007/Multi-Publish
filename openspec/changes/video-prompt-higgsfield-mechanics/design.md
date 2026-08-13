## Context

见 proposal.md（Why）与 `01-docs/HELL-GRIND-OPENSOURCE-ANALYSIS-DEEP-2026-08-14.md`（语料实证）。约束与现状：

- 契约层 `apps/desktop/electron/services/video-prompt-engine-contract.js`：`normalizeVideoMeta`（L375-406）已收敛 8 个结构化字段（shot/camera/motion_intensity/scene_transition/continuity_token/duration_hint/positive_constraints/final_frame）；`VIDEO_ENGINE_LIMITS`（L61-73）定义上限；`_extractVideoBase`（L414-468）做 fail-closed 基础校验与 maxLength 截断；`extractOptimizedVideoPrompt`（L478-485）合并 video meta；`buildVideoOptimizeRequest`（L174-176）默认 `max_length=500`。
- 消费方：`story2video-stages.js` 经 PromptBridge 调用；测试 `video-prompt-engine-contract.test.js` 已覆盖现有字段收敛与 fail-closed。
- 外部引擎：prompt-engine（`D:\Data\projects\prompt-engine`，8020/8013 双后端）负责提示词生成；`evaluator.py` 长度判据 100-400 词与精修模板冲突属引擎侧问题，本 change 不规格化跨仓库代码，只声明联调验收。

## Goals / Non-Goals

**Goals:**
- Multi-Publish 契约层能安全接收/校验 Higgsfield 式导演级视频提示词的结构化元数据（双向约束、多切时间块）。
- 精修层（creative_level ≥ 7）默认路径的 max_length 预算与导演级输出匹配。
- 提供可选收尾参数行能力（默认零回归）。
- 为 prompt-engine 引擎侧改动（evaluator 层级长度、新字段输出）提供验收联调口径。

**Non-Goals:**
- 不修改 prompt-engine 仓库代码（另建 change）。
- 不强制所有视频优化请求启用新字段（可选能力，向后兼容）。
- 不做提示词语义级"质量评分"（FAIL CHECK 判据的完整规则引擎超出本 change，仅做结构完整性校验）。
- 不定义新字段到视频生成模型侧的透传（消费方接线另行决策；story2video-stages 目前只取 `validated.prompt`）。

## Decisions

### D1: 新字段在契约层收敛，而非引擎侧后处理
引擎响应可能来自 8020 或 8013 双后端，字段形态不一致（字符串/数组/缺失）。收敛逻辑放在 `normalizeVideoMeta` 单一出口，消费方（story2video-stages）无需感知后端差异。
**备选**：在 prompt-engine `models.py` 强类型化——跨仓库、阻塞本 change、且 8013 兼容后端仍要兜底。**采纳 D1**。

### D2: 收尾参数行 = 纯函数 + 可选启用
`appendVideoTrailer` 不改 `_extractVideoBase` 主路径；调用方（后续引擎侧输出新字段后）显式启用。幂等（已含 NON-IP 不重复追加）保证重放安全。
**备选**：在 `extractOptimizedVideoPrompt` 强制注入——改变所有现有输出，违反"无新字段零回归"场景。**采纳 D2**。

### D3: 完整性校验用宽松标记集（`<<<` 或 `[ABSENT]`），基于截断前文本
不要求精确 UUID 格式（模型输出漂移会导致误杀），只验证"声明了缺席排除的响应，正文确实有引用协议痕迹"。校验必须基于**截断前**的原始 `optimized_prompt`，否则 maxLength 截断会削掉尾部 `[ABSENT]` 标记导致合法响应误报（fail-closed 反噬）。
**备选 A**：严格匹配 `<<<[0-9a-f-]{36}>>>`——语料显示引擎输出格式可能为 `[ABSENT] 角色名` 或 `<<<image_N>>>`，严格匹配误报率高。**备选 B**：校验基于截断后文本——存在误杀窗口。**采纳 D3**。

### D4: duration 默认 15s 只作用于 trailer 与画像，不改 duration_hint 语义
`normalizeVideoMeta` 现有 `duration_hint` 仅在有值时透传（L392-393）。保持该语义，避免影响现有调用方对 duration_hint 的判断。
**备选**：缺失时填充 15——改变现有行为，需要消费方审计。**采纳 D4**（后续引擎侧输出 duration_hint 后自然对齐）。

### D5: color_ratio 默认值归属引擎侧，契约层缺失不填充
v2.0 报告与早期 proposal 草案写"color_ratio 默认 60:30:10"，与 spec 的"缺失不填充"冲突（评审 C1）。裁决：**默认值落在引擎侧**（prompt-engine generic_video.py 在精修层输出 60:30:10），契约层只做格式校验与透传——保持"无新字段零回归"承诺（旧响应不会凭空多出 color_ratio 键），且契约层不承担内容决策。
**备选**：契约层填充默认——违反零回归，旧响应多键。**采纳 D5**。

### D6: 精修层 max_length 由契约层按 creative_level 上浮默认
请求侧默认 `max_length=500`（字符）会从源头压制导演级输出（评审 W1）。`creative_level ≥ 7` 且调用方未显式传值时默认 5000（上限 20000）；`< 7` 保持 500 零回归。显式传值始终优先。
**备选 A**：契约层不处理、只记录缺口——导演级输出在默认路径仍不可达，change 核心价值打折。**备选 B**：全部层级统一上浮默认——改变现有行为，回归面大。**采纳 D6**（仅精修层，范围最小）。

### D7: trailer 模板不包含 `No {text}.` 段
语料样本参数行含 `NO words, NO music` 等，但契约模板只保留 `NON-IP/{aspect}/{duration}/{audio}` 四段：no-text 约束已由既有 `BUILT_IN_VIDEO_NO_TEXT_NEGATIVE` 负面提示词（契约层 L129+）统一承载，模板重复会与用户自定义负面词竞争。
**备选**：模板含 `No {text}.` 段——与负面词机制职责重叠。**采纳 D7**（若引擎侧输出模板需要，由引擎 change 自行决定）。

## Risks / Trade-offs

- [新字段被下游忽略] → 新字段均为可选，未消费方零影响；`shots[]` 等结构在契约层完成收敛，未来消费方直接可用。
- [完整性校验误杀（引擎输出合法但无标记）] → 宽松标记集 + 仅在声明字段非空时触发 + 基于截断前文本；若线上出现误报，标记集可扩展（常量区配置）。
- [跨仓库联调延迟（引擎侧 evaluator/输出字段未同步）] → 本 change 的契约层测试用本地构造响应（stub）覆盖，不依赖真实引擎；引擎侧 change 就绪后补真实联调（tasks 记录验收项）。
- [maxLength 截断与收尾参数行冲突] → `appendVideoTrailer` 在截断后追加；超限时按模板段从尾部截断但保留 NON-IP 段（spec R3 场景 3 已固化）。
- [精修层 max_length 上浮放大下游成本] → 仅 creative_level ≥ 7 且未显式传值时生效；显式传值优先，调用方（videogen/story2video）可自行收紧。

## Migration Plan

1. 契约层新增常量与字段收敛 + 测试（纯增量，可独立合入 codex/ 分支）。
2. `appendVideoTrailer` + 画像常量（默认未启用，零行为变化）。
3. 完整性校验接入 `extractOptimizedVideoPrompt`（仅新字段触发，基于截断前文本）。
4. `buildVideoOptimizeRequest` 增加 creative_level ≥ 7 的 max_length 上浮（< 7 零回归）。
5. prompt-engine 仓库另建 change 输出新字段（含 color_ratio 60:30:10 默认）与 evaluator 层级长度+规则违规扣分；联调：真实 8020 返回含新字段 → 契约层通过；evaluator 精修层长模板得分不再因长度硬扣、违规项正确扣分。
6. 回滚：契约层改动为纯增量，移除新字段收敛与 max_length 上浮即可回滚；trailer 未启用无回滚面。

## Open Questions

- 无（引擎侧 change 归属、验收口径已在 Migration 明确；消费方是否启用 trailer 由 videogen/story2video 需求决定，可在实现时按需接线，不影响本契约）。
