## Context

- ops-center model_presets 已含 rate_per_minute/limit_per_5h/models/default_model/capabilities/capability_models/base_url；GET 需登录用户 token（桌面端无法登录）。
- 桌面端 model_providers 本地表：config 存 capabilities/rate_per_minute/limit_per_5h 等；governor 预算读 config → 静态表 → 默认；settings 有 getSetting/setSetting；crypto 提供 safeStorage 加密。
- 桌面端适配器用 fetch；主进程可发起 HTTP。

## Goals / Non-Goals

**Goals:**
- 运营后台填的限流/模型/能力自动下发桌面端并生效（governor 预算、能力路由）。
- 桌面端前端限流字段去除（只读），模型列表在已同步时只读。
- 失败安全：未配置/网络失败不阻塞应用，提示明确。

**Non-Goals:**
- 不做反向同步（桌面端 → 运营后台）。
- 不做多租户/多环境目录选择（单目录）。
- 不做自动定时轮询（本次为手动 + 启动时一次；定时为后续项）。

## Decisions

1. 目录端点鉴权：`X-Catalog-Key` 头 + `OPS_CATALOG_API_KEY`（hmac.compare_digest 常量时间比较）；未配置 → 404（不暴露端点存在性）；错误 key → 401；返回 is_visible=1 目录。
2. 返回字段：id/name/category/base_url/models/default_model/rate_per_minute/limit_per_5h/capabilities/capability_models/updated_at（不含任何敏感项）。
3. 桌面端凭据存储：settings key `opsCenterSync` = { url, apiKeyEnc(base64, safeStorage), autoSync, lastSyncedAt }；apiKey 加密存储，不落明文。
4. applyCatalog 冲突语义：覆盖 config 的 rate_per_minute/limit_per_5h/capabilities/capability_models/default_model 与 models 列；**不覆盖** api_key/api_key_enc/enabled/is_default/base_url/name；目录缺失的本地预设行**不清除**（只增不删，删除由运营下架 is_visible=0 + 手工处理）。
5. 同步后重应用 governor（_applyGovernorLimits）与能力回填（_syncPresetCapabilities 等效逻辑）。
6. 网络安全：URL 必须 http(s)（非本机回环强制 https）、follow_redirects=false、超时 10s、响应 ≤1MB、JSON 结构校验（缺字段 fail-closed）。
7. 前端：限流字段只读展示（同步值或「未配置（默认限流）」）；模型列表在 `lastSyncedAt` 存在时 disabled；同步区域提供 URL/API Key/立即同步/上次同步时间/错误提示。

## Risks / Trade-offs

- API Key 静态共享：限制为只读目录端点 + 常量时间比较 + 文档提示定期轮换；不做滚动密钥（后续项）。
- 目录覆盖 models 可能覆盖用户自定义模型：以运营目录为权威（符合需求），文档注明；未启用同步时仍可手编。
- 启动自动同步失败仅日志（不阻塞启动）。
- 多 worker/多实例桌面端各自同步（单机场景）。
