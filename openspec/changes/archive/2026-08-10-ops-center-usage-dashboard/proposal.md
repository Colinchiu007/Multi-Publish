## Why

桌面端每次模型调用已写入 `model_provider_logs`（provider/category/action/status/latency/tokens/cost），但数据**留在每台桌面端本地**，运营看不到任何模型用量、失败率或成本，无法支撑限流/采购/容量决策。P0 第二批：把脱敏聚合用量上报到运营后台并落地用量看板。

## What Changes

- ops-center：新增 `model_usage_daily` 聚合表 + 上报端点 + 管理端汇总看板
  - `POST /api/v1/usage/ingest`（X-Catalog-Key 鉴权，桌面端脱敏聚合批量上报）
  - `GET /api/v1/usage/summary?days=N`（admin）返回每日趋势/按 provider/按 action 汇总
  - 前端「模型用量」页：汇总卡片 + 每日趋势柱状图（CSS）+ 明细表
- 桌面端：新增 `usage-reporter.js`（独立服务）
  - 从 `model_provider_logs` 读取自上次水印（settings `opsCenterUsageReport.lastId`）以来的记录
  - 按「上报日期 + provider + category + action」聚合（calls/ok/fail/ratelimit/latency 总耗时/tokens/cost/耗时分布桶）
  - POST ingest（复用 OpsCenterSync 的 URL/Key），成功后推进水印；失败保留下次重试（best-effort）
  - 启动 5s 首报 + 每 30 分钟周期上报
- 修复：`addProviderLog` INSERT 补 `created_at=datetime('now')`（现有行为 created_at 恒为空串）

## Capabilities

### New Capabilities
- `ops-center/model-usage`: 模型用量上报端点 + 汇总查询 + 看板。
- `desktop/usage-reporter`: 模型调用日志脱敏聚合上报（水印推进、周期调度）。

## Impact

- ops-center/backend：models.py、services/usage_service.py（新）、routers/usage.py（新）、main.py、tests
- ops-center/frontend：views/UsageDashboard.vue（新）、api/usage.js（新）、router、侧边栏
- apps/desktop/electron：services/usage-reporter.js（新）、services/store/model-log-store.js（created_at 修复）、bootstrap/phase1-context.js
- 文档：01-docs/PRD.md、ops-center/docs/PRD.md、CHANGELOG
