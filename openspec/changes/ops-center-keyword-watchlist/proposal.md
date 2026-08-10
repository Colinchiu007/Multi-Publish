## Why

桌面端 `KeywordMonitor` 的关键词/阈值/轮询间隔目前只能由用户本地配置，运营无法统一布控热点词。P1-5：运营后台维护关键词监测目录，随 runtime/bootstrap 下发，桌面端同步后按目录监测（异常飙升触发通知）。

## What Changes

- ops-center：`keyword_watchlist` 表（id 代理主键 + keyword 唯一）+ CRUD（admin；keyword 2-100 字 / threshold ≥1 / interval_minutes 10-10080 / enabled / sort_order；POST 重复 400、PUT 404、DELETE 软删）+ `runtime/bootstrap` 增加 `keyword_watchlist`（enabled=1 未软删，含 keyword/category/threshold/interval_minutes）。
- ops-center 前端：「关键词监测」页（列表/状态筛选/新增/编辑/删除/启用停用）。
- 桌面端：`KeywordMonitor.applyRemoteWatchlist(entries)`（按 keyword upsert、设置 interval/threshold、标记 source=remote；缺席即停止远程监测；用户/恢复条目保留；MAX_KEYWORDS 上限 skip+warn）；`OpsCenterSync.setKeywordMonitor` + applyRuntime 应用；phase1 接线。
- 修复 main 上 3 个文件的冲突残留标记（01-docs/PRD.md、CHANGELOG.md、ops-center-sync.js 头注释）。

## Capabilities

### New Capabilities
- `ops-center/keyword-watchlist`: 关键词监测目录管理 + 运行时下发。

### Modified Capabilities
- `desktop/keyword-monitor`: 支持运营目录运行时同步（远程源跟踪/缺席停止）。
- `desktop/ops-center-sync`: 运行时策略扩展 keyword_watchlist 应用。

## Impact

- ops-center/backend：models.py、services/keyword_watchlist_service.py（新）、routers/keyword_watchlist.py（新）、runtime bootstrap、main.py、tests
- ops-center/frontend：views/KeywordWatchlist.vue（新）、api/keywordWatchlist.js（新）、router、侧边栏
- apps/desktop/electron：services/keyword-monitor.js、services/ops-center-sync.js、bootstrap/phase1-context.js
- 文档：01-docs/PRD.md、ops-center/docs/PRD.md、CHANGELOG
