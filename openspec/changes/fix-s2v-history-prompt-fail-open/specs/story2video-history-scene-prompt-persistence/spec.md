# story2video-history-scene-prompt-persistence Delta

## ADDED Requirements

### Requirement: 重新生成优化词失败必须 fail-closed

历史记录场景「重新生成图片/视频优化词」SHALL 在 prompt-engine 返回错误（含「error（或与流水线 kernel 一致的 detail）字段 + 回显原文」的失败兜底形态，含跨层：error 在顶层、回显在内层 results）时判定为失败：不得把回显原文写入分段，分段 SHALL 保持原有 prompt/videoPrompt 并将 `status` 置为 `failed`，真实失败原因随响应透出。

#### Scenario: 引擎 402 回显原文
- **WHEN** 用户点击「重新生成图片优化词」且 prompt-engine 返回 `{ optimized_prompt: <原文>, error: "402 insufficient_balance" }`
- **THEN** 分段 prompt 保持不变、`status=failed`，失败原因包含引擎错误信息，不得显示「优化词已重新生成」

#### Scenario: 引擎 error 但无文本
- **WHEN** 引擎返回 `{ error: "service unavailable" }` 且无有效文本
- **THEN** 同样 fail-closed：分段不变、回写 failed

#### Scenario: 视频域错误回显
- **WHEN** 重新生成视频优化词且引擎返回 error + 回显
- **THEN** `videoPrompt` 不被改写，分段回写 failed

### Requirement: 重新生成请求上下文与流水线同源

历史记录重新生成图片优化词的请求 SHALL 携带与流水线「无 scene_context 回退路径」同源的 `context`（`full_text` 全场景文案、自动 `scene_type`、继承持久化文本配置的 `context.synopsis`），并仅透传 prompt-engine 契约键（platform/style/creative_level/negative_prompt/num_candidates/auto_detect_style/quality_baseline），`max_length` 保持显式 2000。

#### Scenario: 请求携带全场景上下文
- **WHEN** 用户点击重新生成图片优化词且项目含多个场景文案
- **THEN** 发送给 prompt-engine 的请求包含 `context.full_text`（拼接全部场景文案）且 `max_length` 为契约上限 2000

#### Scenario: 存量项目无文本配置
- **WHEN** 项目缺少 `story2videoTextConfig`
- **THEN** 请求仍携带基于 segments 构造的 context，不因缺配置而失败

## Test Mapping

- `apps/desktop/electron/services/story2video-project-service.test.js`：402 形态 fail-closed（image/video）、error 无文本 fail-closed、context 同源断言。
