## Why

ops-center 预设目录（rate_per_minute/limit_per_5h/models/default_model/capabilities）与桌面端此前为「种子手工对齐」，无运行时同步；运营后台填的值不会自动下发，桌面端前端反而暴露可编辑限流/模型字段。用户要求：运营后台填的限流/模型 ID 自动下发桌面端，桌面端前端字段去除（只读/不可编辑）。

## What Changes

- ops-center：新增只读目录同步端点 `GET /api/v1/model-presets/catalog`（`X-Catalog-Key` 头校验，`OPS_CATALOG_API_KEY` 配置；未配置 fail-closed），返回 is_visible=1 的完整目录（不含敏感字段）。
- 桌面端：新增 `ops-center-sync` 服务（主进程）——配置 URL+API Key（safeStorage 加密存 settings），拉取目录 → `ModelProviderManager.applyCatalog` 更新本地 config（限流/模型/能力，不覆盖 api_key/enabled/is_default/base_url）→ 重应用 governor 预算；启动时 best-effort 自动同步。
- 桌面端前端：模型设置新增「运营后台同步」区域（URL/API Key/同步按钮/上次同步时间/状态提示）；移除「每分钟连接次数/5小时限额次数」输入框改为只读展示；已同步时模型列表只读。
- 单仓库交付（ops-center 已 subtree 并入 Multi-Publish）。

## Capabilities

### New Capabilities
- `ops-center/model-catalog-sync`: 运营目录只读同步端点（API Key 鉴权、返回契约、fail-closed）。

### Modified Capabilities
- `story2video/model-call-scheduler`: 预算来源增加「运行时同步目录」层（运营后台 → 本地 config → governor）。

## Impact

- ops-center/backend：config.py、routers/model_presets.py、services/model_preset_service.py（catalog 序列化）、tests
- apps/desktop/electron/services/ops-center-sync.js（新）、model-provider-manager.js（applyCatalog）、ipc-handlers、bootstrap/phase1
- apps/desktop/src/views/ModelProviders.vue、composables、api
- 文档：01-docs/PRD.md 7.4.4、ops-center PRD 12A；CHANGELOG
