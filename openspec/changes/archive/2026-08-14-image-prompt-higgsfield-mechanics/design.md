## Context

见 proposal.md Why。现状：桌面契约层已拆分「共享内核（prompt-engine-kernel.js，领域中立）+ 领域契约（图片 prompt-engine-contract.js / 视频 video-prompt-engine-contract.js）」；视频侧已验证 15 项 Higgsfield 机制（镜头纪律/双向约束/精修层/评估择优等）；图片契约（157 行）尚无 Director-workflow 字段，多候选择优用「最长」（disturb_and_optimize 的 best 判据 len()）。外部引擎 8013 的 OptimizeResult 无正向约束字段。

## Goals / Non-Goals

**Goals**：
- kernel 回收视频侧已验证的 3 项领域中立机制（plausible-only 负面过滤、层级 max_length、正向约束收敛），图片/视频共用
- 图片契约扩展：context 白名单 + positive_constraints meta 透传 + IMAGE_QUALITY_BASELINE 技术底座
- 图片多候选规则评估择优（替代 len() 判据）

**Non-Goals**：
- 不改外部 prompt-engine 仓库（8013 图片策略的 system prompt 增强 → P1 另行排期）
- 不做图片结构化 JSON 输出（图片 6 要素 JSON → P1，先做 meta 透传层）
- 不做图片 zh 语言路由（默认 en 保持，机制预留）
- 不新增图片学习/记忆机制（prompt-engine-evolution 已有独立设计）

## Decisions

**D1：kernel 回收范围 = 3 项领域中立机制，能力边界仍留领域契约**
- 视频契约的 `_resolveVideoMaxLength` 泛化为 kernel 的 `resolveTieredMaxLength(explicit, creativeLevel, range, batchDefault)`——签名带 range 参数，能力边界（图片 [50,2000] / 视频 8013 [50,2000] / 8020 [200,5000]）仍由各领域契约传入
- 备选：直接在图片契约复制视频实现 → 否决（两处漂移，违反 kernel 单一来源）
- 备选：kernel 内置全部 range → 否决（kernel 不该知道领域能力）

**D2：plausible-only 负面词过滤 = 白名单类别 + 绝对否定词清理**
- 新增 `filterPlausibleNegativePrompt(userNegative)`：只保留真实失败类别关键词（identity drift/duplicate characters/anatomy/extra limbs/text artifacts/style drift/watermark...），并清理「绝对否定词堆砌」模式（不要/不要出现/never/absolutely no 等无类别后缀的裸否定）
- 内置 no-text 负面词保留合并行为（图片侧沿用现有 BUILT_IN no-text 逻辑；视频侧已有 BUILT_IN_VIDEO_NO_TEXT_NEGATIVE 不动）
- 备选：只过滤不重写 → 否决（plausible-only 语义要求类别收敛，单过滤不够）

**D3：正向约束 meta = 可选字段，缺省零拒绝**
- `extractOptimizedPrompt` 增加 `positive_constraints`（数组透传/字符串拆分/上限 10/非字符串元素丢弃——与视频 `normalizeVideoMeta` 同防御模式）
- 图片 8013 当前不输出该字段 → 缺省时 meta 无该键，行为与现状完全一致
- 备选：图片也输出结构化 JSON → 否决（8013 图片策略无 JSON 输出，P1 对齐后再启用）

**D4：IMAGE_QUALITY_BASELINE = builtin 只读常量，不进 learnt 池**
- 从 Higgsfield 语料实证（12 行技术底座标记出现率 90%+）提炼为图片基线片段常量：Photoreal. + 摄影/灯光/色彩 60:30:10/皮肤细节/物理/禁文字段
- 注入时机：请求构造时作为 context 附加（或 prompt 后置拼接），由图片契约层控制开关（默认开，可显式关闭零回归）
- 备选：作为 system prompt 指令 → 否决（契约层无 system prompt 控制权，system prompt 在外部引擎）

**D5：多候选规则评估择优 = kernel 新增 `scorePrompt`（领域中立 6 要素 + 长度 + 保真）**
- 复用视频 evaluate() 的四维结构：长度（100-400 词英文/中文长度档）、六要素（subject/action/environment/lighting/color/style）、保真（source 实体命中）、构图（替代镜头字段：composition keywords）
- 接入点：`prompt-engine-contract.js` 新增 `selectBestCandidate(candidates, sourcePrompt)`，供 disturb/多候选路径调用；现有「选最长」仅作为 tie-break 兜底
- 备选：外部引擎改 → 否决（本 change 不动外部仓库）

## Risks / Trade-offs

- [图片 8013 无正向约束字段，meta 透传长期为空] → 字段缺省兼容 + P1 外部引擎对齐后自动生效（契约先行模式，与视频 lens discipline 相同）
- [plausible-only 过滤误删有效负面词] → 类别白名单保守（只清理明确无效的裸否定词），保留未命中类别原样；测试覆盖典型场景
- [技术底座基线注入改变输出长度/风格] → 默认开但可显式关闭（options.quality_baseline=false）；基线片段 ≤200 字符，受 maxLength 截断保护
- [评估择优改变既有行为（用户习惯最长候选）] → 评分含长度分量（20%），长度仍是重要因子；tie-break 保留原最长逻辑

## Migration Plan

1. kernel 回收（D1/D2/D3 的领域中立函数）→ 单测 + 视频契约改引用（零行为变化验证）
2. 图片契约扩展（D3 meta 透传 + D4 基线 + D5 择优）→ 契约测试 + 零回归套件
3. PR → CI 全绿 → 合并 → 三同步归档
4. 外部引擎 P1 对齐（另行 change）：8013 图片策略 system prompt + 结构化输出

## Open Questions

无（P1 外部引擎对齐范围已明确排期）。
