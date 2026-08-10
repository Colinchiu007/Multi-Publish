## 设计

### 数据模型
`keyword_watchlist`：id（代理主键）/ keyword（唯一，2-100 字）/ category（≤40）/ threshold（≥1，飙升倍数）/ interval_minutes（10-10080，轮询间隔）/ enabled / sort_order / deleted_at（软删，不复活）/ updated_at / updated_by。

### 端点（admin；GET 登录可读）
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/v1/keyword-watchlist | 列表 |
| POST | /api/v1/keyword-watchlist | 新增（重复 400；软删后可重建） |
| PUT | /api/v1/keyword-watchlist/{id} | 更新（404 兜底，部分更新） |
| DELETE | /api/v1/keyword-watchlist/{id} | 软删（404 兜底） |

### 运行时下发
`runtime/bootstrap` 增加 `keyword_watchlist`（enabled=1 未软删，按 sort_order 排序，含 keyword/category/threshold/interval_minutes）。

### 桌面端
`KeywordMonitor.applyRemoteWatchlist(entries)`：
- 按 keyword upsert：已存在 → 更新 interval/threshold 并标记 source=remote（重建定时器）；不存在 → 新增（source=remote，立即首查 + 定时轮询）。
- 缺席即停止：本次下发未包含的 source=remote 条目停止监测；用户（source=user）/恢复（source=restored）条目保留。
- MAX_KEYWORDS（20）上限：远程新增被拒时 warn 跳过。
- `OpsCenterSync.setKeywordMonitor` 注入（phase1 接线）；applyRuntime 在 payload.keyword_watchlist 为数组且已注入时应用，异常仅 warn。
