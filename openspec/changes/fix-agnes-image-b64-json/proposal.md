## Why

PR #897（a1ff8c7b）修复历史任务图片重试/重生按当前「多模态优先」设置重新解析 provider 后，真实 App 端到端验证（2026-08-16，debug profile + 真实 agnes-image 调用）暴露出 agnes-image 适配器的第二个问题：

1. 适配器把 `response_format` 放在请求体**顶层**；按 agnes-image-2.1-flash 官方文档，顶层 `response_format` 会被 litellm 网关以 UnsupportedParamsError 拒绝（历史 103 次真实调用样本全部失败），必须放在 `extra_body.response_format`；
2. 适配器固定请求 `url` 输出，而调用方（`asset-generator.js:584`）始终传 `response_format: 'b64_json'`——URL 模式下应用需二次下载图片 URL，在本机 DNS/代理环境（`storage.googleapis.com` → 198.18.1.194 Clash fake-ip）被 `asset-generator` 的 SSRF 守卫拦截（`asset-generator.js:322/723`），【重试图片】链路中断。

## What Changes

- `agnes-image` 适配器 `generateImage` 尊重调用方 `params.response_format`：
  - `response_format: 'b64_json'` → 请求体 `extra_body.response_format='b64_json'`，响应 `data[0].b64_json` 缺失时抛 ProviderError（fail closed），返回 `{ images: [{ b64_json }], model, format: 'b64_json' }`，完全绕开 URL 二次下载与 SSRF 环境问题（与 imagen/grok 契约一致）；
  - 默认 `url` → 请求体 `extra_body.response_format='url'`，返回 `{ urls, format: 'url' }`（既有契约不变）。
- 请求体顶层不再携带 `response_format` 字段。
- 回归测试：`agnes-image.test.js` +4 用例（extra_body 契约 / b64_json 请求体与返回形状 / b64_json 缺失 fail closed / url 默认契约），全文件 28 用例通过。

## Capabilities

### New Capabilities

（无新增能力）

### Modified Capabilities

- `agnes-image-b64-json`：agnes-image 适配器输出格式契约——`response_format` 必须经 `extra_body` 传递（顶层被网关拒绝），`b64_json` 模式 Base64 直出避免二次 URL 下载。

## Impact

- `apps/desktop/electron/services/adapters/agnes-image.js`
- `apps/desktop/electron/services/adapters/agnes-image.test.js`
- 不涉及 IPC 契约、数据库结构、locale；`asset-generator.js:584` 已默认传 `b64_json`，本变更使既有调用契约被适配器正确执行。
