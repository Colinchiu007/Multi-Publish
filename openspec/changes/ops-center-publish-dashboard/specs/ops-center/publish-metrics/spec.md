## Purpose
桌面端把发布指标脱敏聚合上报运营后台，运营看板展示各平台产粮/失败情况。

## ADDED Requirements

### Requirement: 发布指标上报
`publish_metrics_daily` 表（usage_date+client_id+platform 唯一，upsert 累加）+ `POST /api/v1/publish/ingest`（X-Catalog-Key）。校验：date YYYY-MM-DD、platform 字符集、非负整数、publish_count ≥ ok+fail、items ≤500。

#### Scenario: 校验与累加
- **WHEN** 非法日期/平台/负数/publish<ok+fail
- **THEN** 400 且提示字段
- **WHEN** 同桶重复上报
- **THEN** 计数累加（客户端水印防重）

### Requirement: 运营看板
`GET /api/v1/publish/summary?days=N`（admin，默认 30，上限 90）：totals（发布/成功/失败/成功率/平台数/设备数）+ by_date + by_platform。

#### Scenario: 权限与聚合
- **WHEN** 非 admin 请求
- **THEN** 403
- **WHEN** 有上报数据
- **THEN** 按日期/平台正确聚合，成功率 = ok/publish

### Requirement: 桌面端上报
`PublishReporter`：聚合 publish-history 记录按 日期+平台 分桶（success → ok；fail/error → fail；监控状态不计数）；水印推进/失败重试/启动 5s+30min 周期/未配置静默；仅计数不上报敏感内容。

#### Scenario: 上报语义
- **WHEN** 配置了运营后台
- **THEN** 每 30 分钟上报新记录聚合；成功后推进水印
- **WHEN** 未配置 / 上报失败
- **THEN** 静默跳过 / 保留水印下次重试
