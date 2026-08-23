## 决策

### 方案：适配器尊重调用方 `response_format`，b64_json 直出（选定）

- Why：调用方 `asset-generator` 已按阶段契约传 `response_format:'b64_json'`（`asset-generator.js:584`），适配器只需执行该契约；Base64 直出省去二次 URL 下载，彻底绕开本机 DNS fake-ip + SSRF 守卫的环境耦合。
- 与 imagen / grok-image 适配器契约对齐：返回 `{ images: [{ b64_json }], format: 'b64_json' }`。

### 备选（未选）

- 为 `storage.googleapis.com` 放行 SSRF 白名单：引入对第三方域名/代理环境的信任，治理面扩大；且用户代理环境下 URL 仍可能被 DNS 污染，不是通用修复。
- 改 `asset-generator` 不再请求 b64_json：调用方契约已被 imagen/grok 等多适配器依赖，回改风险大。

## 风险与回退

- agnes 网关对 `extra_body` 的透传依赖 OpenAI 兼容层：以官方文档 + 本机 2935→2937→2938 三次真实调用为据（url 失败 → b64_json 成功）。
- 回退：将请求体恢复为顶层 `response_format:'url'` + URL 下载即回到旧行为（本 PR 可整体 revert）。
