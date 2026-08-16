# Design — MiniMax 200 业务错误如实映射（不再误报内容安全审查）

## 现状与错误链

用户场景：已成功生成的提示词再次【重试图片】失败，错误链如下：

1. `minimax-image.js`（`generateImage`）请求 MiniMax 返回 **HTTP 200**，业务体 `base_resp.status_code != 0`（过期 Key → `Invalid api key` 类）。
2. 适配器只读取 `data.image_urls`（`data?.data?.image_urls || data?.image_urls || []`），业务错误体未被检查 → 返回 `{ code: 0, data: { imageUrls: [] } }`，上层按「空结果」处理。
3. `story2video-image-retry.js` `runContentPolicyImageRetry` 以 `emptyResult=true` 进入重试圈：同提示词重试 → 第 3 次起改写提示词 → 5 次后 checkpoint `empty_result`，`status: 'needs_user_input'`。
4. `asset-generator.js` `_tryProviderImage`（L616-619）对 `needs_user_input` 硬编码 `Image generation requires user input after content-policy review`，与 `checkpoint.reason` 无关。
5. 日志实证：`D:\tmp\Multi-Publish-debug-profile\logs\app-2026-08-16.log` 6822/6810/5591 等多条 `Image provider minimax-multimodal requires user input after content-policy retries`。
6. 渲染层 `story2video-notifications.js` 归一化未映射 content-policy / 无效 Key 类别 → 回退 `operation_failed`（「当前操作未能完成，请稍后再试。」）。

## 方案

### a) 适配器：业务错误码先于产物读取（与 minimax.js / minimax-tts.js 对齐）

在读取 `image_urls` 之前：

```js
const baseResp = data?.base_resp
if (baseResp && Number.isFinite(Number(baseResp.status_code)) && Number(baseResp.status_code) !== 0) {
  const statusMsg = baseResp.status_msg || `MiniMax 图片生成失败（status_code=${baseResp.status_code}）`
  const isContentPolicy = hasStrictContentPolicySignal(statusMsg)
  const isAuth = /api[ _-]?key|...|鉴权失败|认证失败|密钥(?:无效|错误|过期)|expired|unauthorized|invalid key/i.test(statusMsg)
  const isQuota = /额度|用量|token|quota|balance|exhausted|insufficient|超过|上限|升级/i.test(statusMsg)
  throw new ProviderError(isContentPolicy ? CONTENT_POLICY : isAuth ? AUTH_FAILED : isQuota ? QUOTA_EXCEEDED : PROVIDER_ERROR, statusMsg, { providerId, statusCode })
}
```

分类优先级：content_policy（严格语义信号）→ auth（key 无效/过期/鉴权失败）→ quota（额度/余额/用量/token）→ provider_error 兜底。分类后直接失败，业务错误不再进入空结果重试圈。

### b) 资产层：按 checkpoint.reason 区分消息

`_tryProviderImage` 的 `needs_user_input` 分支：

```js
const isContentPolicy = checkpoint?.reason === 'content_policy'
message = isContentPolicy
  ? 'Image generation requires user input after content-policy review'
  : 'Image generation repeatedly returned no result (content-policy, service fluctuation, or account issue); adjust the scene prompt and retry, or check the provider account'
```

`empty_result`（含内容策略拒绝、服务波动、账号问题的任何可能）不再一律称 content-policy review。

### c) 渲染层：新增两类归一化

- `STORY2VIDEO_NOTIFICATION_KEYS.CONTENT_POLICY`（`story2video.content_policy`）：命中 `content[ _-]?policy|content_policy_violation|safety_filter`，支持场景号插值（与 rate_limited/quota 同一 normalizeParams 分支）。
- `STORY2VIDEO_NOTIFICATION_KEYS.API_KEY_INVALID`（`story2video.api_key_invalid`）：命中 key invalid/expired、鉴权失败、密钥无效/过期。**顺序在 `MODEL_API_KEY_REQUIRED` 之后**——缺失类（未找到/未配置/未设置）先匹配，无效/过期类不被缺失模式误抢。
- locales zh/en 成对新增两条文案；场景号插值仅 `content_policy` 需要（`api_key_invalid` 与场景无关）。

### d) 测试

- `minimax-image.test.js` +2：HTTP 200 + `base_resp` AUTH_FAILED（`Invalid api key`）与 QUOTA_EXCEEDED。
- `story2video-image-retry.test.js` +1：AUTH_FAILED 立即失败、不进重试圈、`category=auth`。
- `asset-generator-provider.test.js`：empty_result 用例断言消息不再含 content-policy review。
- `notifications.test.js` / `story2video-notifications.test.js` / `ResultView.test.js`：content_policy / api_key_invalid 归一化与渲染映射（zh/en）。
