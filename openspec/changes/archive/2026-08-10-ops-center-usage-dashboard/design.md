## 设计

### 数据模型
`model_usage_daily`：usage_date(YYYY-MM-DD) / client_id(设备稳定哈希，可空) / provider_id / category / action / calls / ok_count / fail_count / ratelimit_count / latency_ms(总) / tokens_in / tokens_out / cost / latency_buckets(JSON: lt1s/1to3s/3to10s/gt10s) / updated_at。唯一键 (usage_date, client_id, provider_id, action)，upsert 累加。

### 上报契约
`POST /api/v1/usage/ingest`（X-Catalog-Key 同目录端点鉴权，未配置 404/错 401）：
- body `{ items: [{ usage_date, client_id, provider_id, category, action, calls, ok_count, fail_count, ratelimit_count, latency_ms, tokens_in, tokens_out, cost, latency_buckets }], synced_at }`
- 校验：usage_date 格式、数值非负、provider_id/action 非空；单次 ≤500 条、body ≤512KB
- 语义：按唯一键 upsert 累加（幂等，重试不重复计数——桌面端聚合后上报，服务端累加）

### 汇总查询
`GET /api/v1/usage/summary?days=30`（admin）返回：
- totals：总调用/成功率/429 次数/平均耗时/估算成本/活跃 provider 数
- by_date：每日调用量与失败数（趋势图）
- by_provider：provider 级调用/失败/429/成本排行
- by_action：action 级汇总

### 桌面端上报
- `UsageReporter({ store, log, getOpsCenterAuth })`：`getOpsCenterAuth()` 由 phase1 注入（返回 {url, apiKey}，无配置时跳过）
- `reportPending()`：SELECT id/… FROM model_provider_logs WHERE id > lastId → 内存聚合（上报日期=当天）→ POST → 成功后 setSetting 水印 = max(id)；失败保留
- `start()`：5s 首报 + setInterval 30min；`stop()` 清理
- 脱敏：不上报 error_message、model 原始内容；只报聚合计数
- 无 url/key/未配置 → 静默跳过（不影响主流程）

### 前端看板
- 汇总卡片（总调用/成功率/429/平均耗时/成本）+ 每日趋势 CSS 柱状图 + provider 排行表 + action 表
- 时间范围选择（7/30/90 天）；无数据空态提示「尚未收到用量上报」
