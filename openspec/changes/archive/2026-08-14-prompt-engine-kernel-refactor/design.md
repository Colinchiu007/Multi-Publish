## Context

见 proposal.md。现状（已核实）：
- `prompt-engine-contract.js` 被 6 个消费方引用（PromptBridge/story2video-text-config/story2video-stages/stage-executor/video 契约/自身测试），公共导出 13 项。
- 视频契约仅借用 3 项：PROMPT_ENGINE_LIMITS、normalizePromptEngineStyle、assertNoSensitiveContext。
- 图片/视频的 fail-closed 核心（error→detail→空串→截断→base meta）两份实现逐行一致。

## Decisions

### D1: kernel 只收领域中立逻辑
风格归一、敏感键守卫、中立 limits、clamp、fail-closed base 属于两个领域共享的安全/枚举逻辑；平台枚举、请求构造、字段收敛、语言路由属于领域专属，留在各自契约文件。**采纳 D1**。

### D2: PROMPT_ENGINE_LIMITS 保留全部键但标注 maxLength 归属
`PROMPT_ENGINE_LIMITS` 整体移入 kernel（含 maxLength），JSDoc 明确：`maxLength` 为图片/8013 兼容语义（[50,2000]），视频禁止借用，必须使用 `VIDEO_ENGINE_LIMITS.videoMaxLengthRanges`（legacy [50,2000] / standalone [200,4000]）。
**备选**：把 maxLength 从 PROMPT_ENGINE_LIMITS 拆出单独常量——会改变图片契约公共 API 且无消费方收益。**采纳 D2**。

### D3: extractOptimizedBase 与两份现有实现逐字节对齐
kernel 的 `extractOptimizedBase(result, opts)` 语义 = 现 `_extractVideoBase` 的 error/detail/非对象/空串/截断/base meta 部分；图片在其上合并 `detected_categories`/`candidates`，视频在其上合并 video 字段收敛 + 完整性校验。回归以两份契约既有测试全绿为准（行为保持证明）。**采纳 D3**。

### D4: 公共 API 零变化
`prompt-engine-contract.js` 的 module.exports = kernel 导出 ∪ 图片专属导出（与现状 13 项一一对应）；视频契约 import 清单不变。消费方零改动，重构可独立验证、可整体回滚（git revert 单 commit）。**采纳 D4**。

## Risks / Trade-offs

- [kernel 与旧实现细微行为差异] → 双契约测试套件全绿为门槛；kernel 独立测试覆盖 fail-closed 核心。
- [共享内核被未来改动破坏图片行为] → kernel 属于共享层，改动需双契约回归；本 change 在 kernel JSDoc 中写明领域归属约定。
- [重构与 Higgsfield change 同文件] → 同分支同 PR，先合 kernel（行为保持）再叠加视频特性，commit 顺序可独立回滚。

## Migration Plan

1. 新增 `prompt-engine-kernel.js`（从图片契约提取中立部分 + extractOptimizedBase）。
2. `prompt-engine-contract.js` 改 kernel 引入 + re-export（公共 API 不变）；`extractOptimizedPrompt` 改为 kernel base + 图片 meta。
3. `video-prompt-engine-contract.js` 改 kernel 引入；`_extractVideoBase` 替换为 `extractOptimizedBase`。
4. 新增 `prompt-engine-kernel.test.js`；运行图片 + 视频契约全量套件（全绿 = 行为保持）。
5. 与 video-prompt-higgsfield-mechanics 同 PR 合并；openspec apply 双 change；learnings 沉淀。
