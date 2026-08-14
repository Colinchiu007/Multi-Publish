## Why

视频引擎已落地 Higgsfield《Hell Grind》方法论（镜头纪律/正向约束/事实保真/精修层/评估择优），但图片引擎（桌面契约层 + 外部 8013 引擎）尚未吸收这些机制：图片多候选择优仍用「选最长」而非规则评分，负面词无 plausible-only 纪律，context 仅透传 synopsis，无正向约束结构化字段。分析报告（01-docs/ANALYSIS-VIDEO-TO-IMAGE-PROMPT-ENGINE-2026-08-14.md）逐项评估了 10 项完全可迁移 / 4 项部分可迁移机制，图片侧直接受益于其中大部分（主体漂移/多余角色/图文一致性是图片生成的核心翻车点）。

## What Changes

- **共享内核回收**（prompt-engine-kernel.js）：把视频侧已验证的领域中立机制回收为图片/视频共用——plausible-only 负面词过滤（类别白名单 + 绝对否定词清理）、精修层 max_length 层级语义（泛化 `resolveTieredMaxLength`）、正向约束数组收敛（上限 + 元素过滤）。行为零回归（默认值/未显式传路径不变）。
- **图片契约扩展**（prompt-engine-contract.js）：context 白名单扩展（synopsis/character/setting/character_list）、`extractOptimizedPrompt` 透传 `positive_constraints` 结构化 meta、内置技术底座基线片段（IMAGE_QUALITY_BASELINE，builtin 注入，不进 learnt 池）。
- **图片多候选规则评估择优**：现有多候选/扰动路径从「最长即最优」升级为规则评分择优（复用视频 evaluate 的四维结构：长度/六要素/保真，构图维度替代镜头字段）。
- **外部引擎对齐**（prompt-engine 仓库，P1 另行排期，本 change 不做）：图片 8013 策略 system prompt 增加事实保真/正负向分块/EXACT N 角色。

不改变：`buildPromptEngineOptimizeRequest` 请求契约、`generateCandidates`/`PromptBridge` 同步签名、图片平台/风格枚举、默认 en 输出语言（zh 路由仅作可选参数预留）。

## Capabilities

### New Capabilities

（无——所有新机制均属既有 image-prompt-engine 能力的行为变化，归入 Modified）

### Modified Capabilities
- `image-prompt-engine`: context 白名单扩展（character/setting/character_list 新增键）、extractOptimizedPrompt 正向约束 meta 透传、技术底座基线注入、plausible-only 负面词纪律、精修层长度层级、规则评分择优；共享内核（prompt-engine-kernel.js）新增领域中立函数由本 delta 覆盖

## Impact

- `apps/desktop/electron/services/prompt-engine-kernel.js`（+plausible-only 过滤、+resolveTieredMaxLength、+正向约束收敛）
- `apps/desktop/electron/services/prompt-engine-contract.js`（context 白名单、IMAGE_QUALITY_BASELINE、extractOptimizedPrompt meta）
- `apps/desktop/electron/services/prompt-engine-contract.test.js` + `prompt-engine-kernel.test.js`（新用例 + 零回归）
- 调用方（PromptBridge/story2video-stages/stage-executor）：公共 API 零变化，仅 meta 增加可选字段
- 外部 prompt-engine 仓库：本 change 不动（P1 对齐另行排期）

