## Why

图片/视频提示词契约层的共享逻辑目前以「图片契约为底座」形式单向依赖：`video-prompt-engine-contract.js` 从 `prompt-engine-contract.js` 借用 `PROMPT_ENGINE_LIMITS`/`normalizePromptEngineStyle`/`assertNoSensitiveContext`。该结构有两个问题：

1. **能力边界错借**：`PROMPT_ENGINE_LIMITS.maxLength`（min 50/max 2000/default 500）是图片与 8013 兼容语义，视频契约直接借用，导致 Higgsfield 精修层预算（5000/20000）与 8013 模型边界（le=2000）冲突（video-prompt-higgsfield-mechanics 实现前双模型评审 C1）。共享底座没有区分「领域中立内核」与「领域能力边界」。
2. **fail-closed 校验重复**：`extractOptimizedPrompt`（图片）与 `_extractVideoBase`（视频）的 error→detail→空串→截断→基础 meta 核心几乎逐行重复（prompt-engine-contract.js L199-259 vs video-prompt-engine-contract.js L401-455），两处漂移风险。

## What Changes

- **新增 `prompt-engine-kernel.js`（共享内核）**：只放领域中立逻辑——风格枚举/别名归一（`PROMPT_ENGINE_STYLES`/`normalizePromptEngineStyle`）、敏感凭据守卫（`SENSITIVE_CONTEXT_KEYS`/`assertNoSensitiveContext`）、中立 limits（`PROMPT_ENGINE_LIMITS`，含 JSDoc 标注 `maxLength` 为图片/8013 兼容语义，视频禁止借用）、`clampNumber`、以及共享 fail-closed 核心 `extractOptimizedBase`（与现有两份实现逐字节对齐：非对象 → error → detail → 空串 → maxLength 截断 → 基础 meta platform/style/model_used/key_source）。
- **`prompt-engine-contract.js`（图片契约）**：改为从 kernel 引入并 re-export（公共 API 完全不变），保留图片专属：平台枚举/别名/归一、`buildPromptEngineOptimizeRequest`、`extractOptimizedPrompt`（kernel base + `detected_categories`/`candidates` meta 合并）。
- **`video-prompt-engine-contract.js`（视频契约）**：改从 kernel 引入（import 清单不变），`_extractVideoBase` 删除并替换为 `extractOptimizedBase`（通过 `opts.engineLabel='视频'` 保留既有「prompt-engine 视频优化失败」文案），视频在 base 之上做 video 字段收敛 + 结构完整性校验；`max_length` 不再借用图片语义（已由本 change 配套的 `videoMaxLengthRanges` 承担）。
- **新增 `prompt-engine-kernel.test.js`**：kernel 导出完整性 + extractOptimizedBase fail-closed 核心用例。
- **消费方零改动**：PromptBridge/story2video-text-config/story2video-stages/stage-executor 的 import 清单全部保持不变。

## Capabilities

### Modified Capabilities
- `prompt-engine`: 内部结构重构（共享内核提取），对外行为与公共 API 零变化。
- `video-prompt-engine`: 内核依赖变更（`prompt-engine-contract` → `prompt-engine-kernel`），行为零变化。

## Impact

- 运行时代码：新增 `apps/desktop/electron/services/prompt-engine-kernel.js`；修改 `prompt-engine-contract.js`、`video-prompt-engine-contract.js`（仅 import 与 base 替换，行为不变）；新增 `prompt-engine-kernel.test.js`。
- 测试：`prompt-engine-contract.test.js` 全量 + `video-prompt-engine-contract.test.js` 既有用例全绿为重构正确性门槛（行为保持证明）。
- 文档：CHANGELOG.md、01-docs/learnings.md（共享内核与领域能力边界原则）。
- 交付：与 video-prompt-higgsfield-mechanics 同分支同 PR 落地（同文件交集），openspec 双 change 分别归档。
