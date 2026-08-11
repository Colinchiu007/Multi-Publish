## Why

P0-1 官方内置 Key 池目前只有「存储 + CRUD」（OfficialKey 表 + Secrets 页），缺**配额、告警阈值、成本核算、池概览**；P1-6 许可证（桌面端 Pro）签发/吊销无运营后台管理面，当前桌面端是纯本地激活（license.json），运营无法签发/吊销/统计。

第三批交付**运营后台侧完整管理面**：官方 Key 池增强 + 许可证管理。桌面端消费（官方 Key 回退路由、许可证服务端验签）涉及计费/entitlement 合同，需商业模式确认后另行接入，本 change 不触碰桌面端 entitlement 现有合同。

## What Changes

### A. 官方 Key 池增强（P0-1 管理面）
- OfficialKey 表新增列：`rate_per_minute`（每分钟配额，可空）、`daily_limit`（每日调用上限，可空）、`alert_threshold_cost`（成本告警阈值 ¥，可空）、`note`。
- key_service：新字段校验（正整数/非负浮点）；`pool_summary()`（活跃/到期/近告警 Key + 按 provider 成本估算（复用 model_usage_daily）+ 配额达标率）。
- routers/secrets：upsert 接受新字段；新增 `GET /api/v1/secrets/summary`（admin）。
- 前端 Secrets.vue：新增 配额/每日上限/告警阈值/备注 字段 + 成本/状态列 + 池概览卡片。

### B. 许可证管理（P1-6 管理面）
- 新增 `licenses` 表：license_key（唯一，自动生成 `MP-XXXX-...`）/ plan / device_limit / expires_at / status(active|disabled|expired) / note / 时间戳。
- license_service：生成/签发/列表/禁用/删除 + 校验（plan 非空、device_limit ≥1、expires_at 可选、key 唯一）。
- routers/licenses.py：`GET/POST /api/v1/licenses`、`PUT/DELETE /api/v1/licenses/{id}`（admin）。
- 前端 Licenses.vue：签发表单 + 列表 + 禁用/删除。

## Capabilities

### New Capabilities
- `ops-center/keypool-license`: 官方 Key 池配额/成本概览 + 许可证管理。

### Modified Capabilities
- `ops-center/secrets`: 官方 Key 支持配额/告警/备注与池概览。

## Impact

- ops-center/backend：models.py（OfficialKey 新列 + License 表）、services/key_service.py、services/license_service.py（新）、routers/secrets.py、routers/licenses.py（新）、main.py、tests
- ops-center/frontend：views/Secrets.vue（增强）、views/Licenses.vue（新）、api/secrets.js、api/licenses.js（新）、router、侧边栏
- 文档：ops-center/docs/PRD.md、01-docs/PRD.md、CHANGELOG
