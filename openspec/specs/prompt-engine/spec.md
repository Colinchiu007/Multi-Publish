# prompt-engine Specification

## Purpose
定义图片/视频提示词契约层的共享内核边界：领域中立逻辑（风格归一、敏感凭据守卫、中立 limits、fail-closed 校验核心）集中单一来源，领域能力边界（平台枚举、请求构造、字段收敛、max_length 范围）归属各自契约，消除「视频借用图片语义」的结构性耦合与 fail-closed 校验重复。
## Requirements
### Requirement: 共享内核模块

系统 SHALL 提供 `prompt-engine-kernel` 模块，集中导出领域中立逻辑：`PROMPT_ENGINE_STYLES`/`PROMPT_ENGINE_STYLE_ALIASES`/`DEFAULT_PROMPT_ENGINE_STYLE`/`normalizePromptEngineStyle`、`SENSITIVE_CONTEXT_KEYS`/`assertNoSensitiveContext`、`PROMPT_ENGINE_LIMITS`（JSDoc 标注 `maxLength` 为图片/8013 兼容语义，视频 SHALL 使用自有能力范围）、`clampNumber`、`extractOptimizedBase`。`extractOptimizedBase` SHALL 与现有两份实现的 fail-closed 语义一致：非对象拒绝 → error 优先 → detail 422 拒绝 → optimized_prompt 缺失/空串拒绝 → maxLength 截断（warn 回调）→ 基础 meta（platform/style/model_used/key_source）。`extractOptimizedBase` SHALL 支持可选 `opts.engineLabel`（领域名，默认空串）：仅用于失败文案 `prompt-engine {engineLabel}优化失败`，默认空串保持图片契约既有文案，视频契约传 `'视频'` 保留既有「prompt-engine 视频优化失败」文案。

#### Scenario: 共享内核导出完整
- **WHEN** 加载 `prompt-engine-kernel`
- **THEN** 上述导出全部存在且类型正确，`PROMPT_ENGINE_LIMITS` 键与既有图片契约一致

#### Scenario: extractOptimizedBase 核心语义
- **WHEN** 传入 error 响应 / detail 422 响应 / 空 prompt / 超长 prompt（含 warn 回调）
- **THEN** 分别返回对应失败结果；超长时 prompt 截断至 maxLength 且 truncated=true、warn 被调用

### Requirement: 图片契约公共 API 零变化

`prompt-engine-contract` SHALL 保持既有 13 项公共导出与行为不变（kernel 导出 ∪ 图片专属：平台枚举/别名/归一、`buildPromptEngineOptimizeRequest`、`extractOptimizedPrompt`）。`extractOptimizedPrompt` SHALL 基于 `extractOptimizedBase`，并在成功时合并 `detected_categories`/`candidates` 到 meta。

#### Scenario: 图片契约行为保持
- **WHEN** 运行既有 `prompt-engine-contract.test.js` 全量
- **THEN** 全部用例通过（零修改）

#### Scenario: 消费方 import 清单不变
- **WHEN** 检查 PromptBridge/story2video-text-config/story2video-stages/stage-executor 的 import 语句
- **THEN** 均仍从 `prompt-engine-contract` 引入，无改动

### Requirement: 视频契约内核依赖与 base 复用

`video-prompt-engine-contract` SHALL 改从 `prompt-engine-kernel` 引入共享项（import 清单不变），并 SHALL 用 `extractOptimizedBase` 替代本地 `_extractVideoBase`；`max_length` SHALL 不得借用 `PROMPT_ENGINE_LIMITS.maxLength` 语义，必须使用 `VIDEO_ENGINE_LIMITS.videoMaxLengthRanges`。

#### Scenario: 视频既有行为保持
- **WHEN** 运行 `video-prompt-engine-contract.test.js` 中既有用例（Higgsfield 新用例除外）
- **THEN** 全部通过（零修改）

