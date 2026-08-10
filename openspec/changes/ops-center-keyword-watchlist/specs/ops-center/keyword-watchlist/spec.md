## Purpose
运营后台维护关键词监测目录，随运行时 bootstrap 下发，桌面端同步后按目录监测热度与飙升告警。

## ADDED Requirements

### Requirement: 关键词监测目录管理
`keyword_watchlist` 表 + `GET/POST /api/v1/keyword-watchlist`、`PUT/DELETE /api/v1/keyword-watchlist/{id}`（admin）。校验：keyword 2-100 字（唯一）、category ≤40、threshold ≥1、interval_minutes 10-10080 整数、enabled 布尔。POST 重复 → 400；PUT/DELETE 不存在 → 404；DELETE 软删（不复活，可重建）。

#### Scenario: 校验与 CRUD
- **WHEN** 非法 keyword/threshold/interval
- **THEN** 400 且提示字段
- **WHEN** POST 重复 keyword / PUT·DELETE 不存在 id
- **THEN** 400 / 404
- **WHEN** 非 admin 写
- **THEN** 403

### Requirement: 运行时下发
`GET /api/v1/runtime/bootstrap` 返回 `keyword_watchlist`（enabled=1 未软删，按 sort_order 排序，含 keyword/category/threshold/interval_minutes）。

#### Scenario: 下发
- **WHEN** 条目 enabled=1
- **THEN** bootstrap 返回其配置；enabled=0 / 软删不返回

### Requirement: 桌面端应用
`KeywordMonitor.applyRemoteWatchlist(entries)`：按 keyword upsert（远程条目设置 interval/threshold 并标记 source=remote）；缺席即停止远程监测；用户/恢复条目保留；上限 skip+warn。`OpsCenterSync` 注入 keywordMonitor 时应用（异常仅 warn）。

#### Scenario: 合并语义
- **WHEN** 远程含关键词
- **THEN** 新增/更新并按配置轮询；缺席的远程词停止监测
- **WHEN** 未注入 keywordMonitor
- **THEN** 跳过应用不影响其他策略
