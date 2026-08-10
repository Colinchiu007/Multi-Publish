## Why

桌面端发布历史（publish-history JSONL）与效果追踪目前只存在本地，运营无法看到各平台产粮/失败情况。P1-3：桌面端把发布指标脱敏聚合上报运营后台，落地「发布数据」看板（发布总数/成功/失败/成功率/平台排行/每日趋势）。

## What Changes

- ops-center：`publish_metrics_daily` 表（日期+客户端+平台唯一，upsert 累加）+ `POST /api/v1/publish/ingest`（X-Catalog-Key 鉴权，校验日期格式/平台字符集/非负/发布数≥ok+fail）+ `GET /api/v1/publish/summary`（admin，totals/by_date/by_platform）。
- ops-center 前端：「发布数据」看板页（7/30/90 天切换、汇总卡片、按平台表、每日趋势 CSS 柱状图、空态提示）。
- 桌面端：`PublishReporter`（聚合 publish-history 记录按 日期+平台 分桶，成功/失败分类，监控状态不计数避免重复；水印推进/失败重试/启动 5s+30min 周期/未配置静默；仅计数不含标题正文账号）。

## Capabilities

### New Capabilities
- `ops-center/publish-metrics`: 发布指标上报与看板。

### Modified Capabilities
- `desktop/publish-reporter`: 发布指标脱敏上报（新服务）。

## Impact

- ops-center/backend：models.py、services/publish_metric_service.py（新）、routers/publish_metrics.py（新）、main.py、tests
- ops-center/frontend：views/PublishDashboard.vue（新）、api/publishMetrics.js（新）、router、侧边栏
- apps/desktop/electron：services/publish-reporter.js（新）、bootstrap/phase1-context.js
- 文档：01-docs/PRD.md、ops-center/docs/PRD.md、CHANGELOG
