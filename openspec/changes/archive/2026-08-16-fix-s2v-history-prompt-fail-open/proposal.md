# fix-s2v-history-prompt-fail-open — Proposal

## Why

「视频创作-历史记录 → 编辑场景 → 重新生成图片优化词」在 prompt-engine 调用失败时（实测为 MiniMax Token Plan 额度 402 `insufficient_balance_error`），引擎会把输入原文连同 `error` 一并返回；桌面历史重生成路径的本地结果提取器只认文本、忽略 `error`，把「回显原文」当作成功写进分段并提示成功。用户因此看到「文案 + Photoreal…基线后缀」的假优化词。同时该路径的请求构造缺少流水线同源的 `context`（synopsis/scene_type/full_text），即使引擎正常，输出也缺乏全篇上下文感知。

## 差异审计（基线 vs 现状，2026-08-16）

- R1 fail-open 提取器：`apps/desktop/electron/services/story2video-project-service.js:127` `extractOptimizedPrompt` 现状为「文本非空即返回，error 被忽略」——未交付，待办。
- R2 回归保护：`story2video-project-service.test.js:1919` 仅覆盖 promise reject，未覆盖「error + 回显文本」响应形态——未交付，待办。
- R4 context 同源：历史重生成请求仅传 `max_length`，缺 `context`——未交付，待办。
- 运行侧（引擎仓库 `D:\Data\projects\prompt-engine` 落后 main、Token 额度 402）属运维事项，不在本 change 代码范围，交付时附操作说明。

## What Changes

- **R1（修复）**：`story2video-project-service.js` 本地 `extractOptimizedPrompt` 改为 error/message 优先 fail-closed——存在 `error`/`message` 即抛错，禁止把回显原文当成功写入（对齐 `prompt-engine-contract.js` 的 `extractOptimizedPrompt`/kernel `extractOptimizedBase` 语义）。
- **R2（回归保护）**：`story2video-project-service.test.js` 新增用例：引擎返回「error + 回显原文」（402 形态）→ 分段保持旧 prompt、`status=failed`、错误透出；video 域同形态覆盖。
- **R4（同源对齐）**：`regenerateScenePrompt` 图片请求构造补传与流水线同源的 `context`（`buildOptimizeContext` 以当前 segments 文本为场景源，继承持久化文本配置 `optimize.context`），并按契约键白名单透传持久化 optimize 选项（platform/style/creative_level/negative_prompt/num_candidates/auto_detect_style/quality_baseline），`max_length=2000` 显式覆盖保持不变。
- 文档：`01-docs/learnings.md` 追加 `token-plan-402` 与 `error-echo-fail-open` 复盘条目。

## Capabilities

- **Modified**: `story2video-history-scene-prompt-persistence` — 新增 Requirement：重新生成优化词必须 fail-closed（error 优先）+ 请求上下文与流水线同源。

## Impact

- `apps/desktop/electron/services/story2video-project-service.js`（提取器 + regenerateScenePrompt）
- `apps/desktop/electron/services/story2video-project-service.test.js`（回归用例）
- `apps/desktop/electron/services/story2video-stages.js` 中 `buildOptimizeContext` 被复用（无改动）
- `01-docs/learnings.md`（复盘）
- 行为影响：历史记录重新生成优化词在引擎错误时不再静默写入假结果；请求参数更接近流水线。
