## Why

用户对已成功生成过的提示词再次点击【重试图片】持续失败，仅看到「当前操作未能完成，请稍后再试。」。经排查，用户保存的 MiniMax API Key 已过期。MiniMax 对业务错误（如 `Invalid api key`、额度耗尽）返回 **HTTP 200 + `base_resp.status_code != 0`**；`minimax-image.js` 适配器缺失该解析（视频 `minimax.js`、语音 `minimax-tts.js` 已有先例），把业务错误体当成「HTTP 200 无图空结果」→ `emptyResult=true` → 进入空结果内容策略重试圈（同提示词重试→第 3 次起改写→5 次后 checkpoint `empty_result`）→ `asset-generator.js` 硬编码 `requires user input after content-policy review` → 渲染层归一化未映射该类别 → 通用失败文案。真实原因（过期 Key）全程被掩盖成「内容安全审查」。

## What Changes

- 适配器：`minimax-image.js` 在读取 `image_urls` 前解析 `base_resp.status_code != 0` 业务错误，按 `status_msg` 分类为 `CONTENT_POLICY` / `AUTH_FAILED`（api key invalid/expired、鉴权失败） / `QUOTA_EXCEEDED` / `PROVIDER_ERROR`，带 `statusCode` context 立即上抛。
- 资产层：`asset-generator.js` `needs_user_input` 分支按 `checkpoint.reason` 区分 `content_policy` 与 `empty_result`，消息不再一律硬编码 content-policy review。
- 渲染层：`story2video-notifications.js` 新增 `CONTENT_POLICY` / `API_KEY_INVALID` 类别与模式匹配（`api_key_invalid` 置于 `model_api_key` 之后避免缺失类被抢），`content_policy` 支持场景号插值；locales zh/en 成对新增两条文案。
- 回归测试：适配器 200+业务错误用例、重试圈不进圈断言、资产层 empty_result 消息断言、渲染归一化两类映射用例。

## Capabilities

### Modified Capabilities

- `story2video-retry-error-transparency`：新增 Requirement「供应商业务错误如实映射」——HTTP 200 但业务体非 0 错误码必须按语义分类立即失败，禁止进入空结果内容策略重试圈并最终误报为内容安全审查；API Key 无效/过期、内容安全审查两类渲染文案必须独立映射并支持场景号插值。

## Impact

- `apps/desktop/electron/services/adapters/minimax-image.js`：新增业务错误解析分支。
- `apps/desktop/electron/services/asset-generator.js`：`_tryProviderImage` 按 reason 区分消息。
- `apps/desktop/src/story2video/story2video-notifications.js`：新增两类归一化。
- `apps/desktop/src/locales/zh.js`、`en.js`：成对新增 `content_policy` / `api_key_invalid`。
- 测试：`minimax-image.test.js` / `story2video-image-retry.test.js` / `asset-generator-provider.test.js` / `notifications.test.js` / `story2video-notifications.test.js` / `ResultView.test.js`。
