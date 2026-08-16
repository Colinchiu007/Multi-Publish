## Purpose

Defines the failure-transparency contract for Story2Video segment retry (image/video) and scene image generation: real failure reasons must be preserved end-to-end, normalized into user-visible localized messages for known failure classes, and leave a log trail — never masked into a generic "operation failed" message. Provider business errors carried in an HTTP-200 body must be classified truthfully instead of being mislabeled as content-policy review.

## ADDED Requirements

### Requirement: 供应商业务错误如实映射（2026-08-16）

图片适配器 SHALL 在 HTTP 200 但业务体携带非 0 错误码（如 MiniMax `base_resp.status_code != 0`，典型：API Key 无效/过期、额度耗尽）时，按 `status_msg` 语义分类为 `AUTH_FAILED` / `QUOTA_EXCEEDED` / `CONTENT_POLICY` / `PROVIDER_ERROR` 并立即失败；该错误 SHALL 直接上抛，不得进入「空结果」内容策略重试圈，也不得最终报为内容安全审查。渲染层 SHALL 把 API Key 无效/过期映射为 `api_key_invalid` 类别文案、内容安全审查映射为 `content_policy` 类别文案（支持场景号插值），二者 SHALL 独立于「API Key 缺失」（`model_api_key`）类别。

#### Scenario: MiniMax 过期 Key 业务错误（HTTP 200 + base_resp 非 0）

- **WHEN** 图片生成请求返回 HTTP 200，`base_resp.status_code != 0` 且 `status_msg` 指示 API Key 无效/过期
- **THEN** 适配器立即失败且分类为 AUTH_FAILED，不进空结果重试圈；结果页显示「API Key 无效或已过期」文案，而非内容安全审查或通用失败文案

#### Scenario: MiniMax 额度耗尽业务错误

- **WHEN** `status_msg` 指示额度/余额/用量不足
- **THEN** 适配器失败分类为 QUOTA_EXCEEDED，结果页显示额度不足文案，不进内容策略重试圈

#### Scenario: 空结果与内容策略失败区分

- **WHEN** 多次重试后仍无图片产物（checkpoint.reason 为 empty_result，可能由内容策略、服务波动或账号问题导致）
- **THEN** 返回消息按 reason 区分 empty_result 与 content_policy，不再一律称「content-policy review」

#### Scenario: 空结果失败渲染为独立类别（复审补强，2026-08-16）

- **WHEN** 渲染层收到 empty_result 消息（如「Image generation repeatedly returned no result …」或中文「多次未返回结果」）
- **THEN** 归一化为 `empty_result` 独立类别（zh/en 成对文案、支持场景号插值），显示「多次未返回结果（服务波动或账号问题）」而非 `operation_failed` 通用文案，也绝不显示内容安全审查文案

#### Scenario: 历史页空结果失败不显示内容政策提示（复审补强，2026-08-16）

- **WHEN** 历史失败任务的错误文本为 empty_result 消息（含「repeatedly returned no result / 多次未返回结果」）
- **THEN** 恢复门控正则仍判定不可原样恢复，但「内容政策拦截」提示条与场景提取（`contentPolicyScenes`）不得命中该文本——场景提取与提示条 SHALL 使用不含 empty_result 短语的内容政策子集模式

#### Scenario: 含「API Key」的额度文案不误判为认证失败（复审补强，2026-08-16）

- **WHEN** 适配器 `status_msg` 同时含「API Key」与额度/升级措辞（如「您的 API Key 额度已用完，请升级套餐」）
- **THEN** 分类为 QUOTA_EXCEEDED 而非 AUTH_FAILED；适配器与渲染层 SHALL 识别 `Authentication failed` / `Invalid authentication credentials` / `token invalid` 等认证表述为 AUTH_FAILED / `api_key_invalid`
