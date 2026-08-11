## Purpose
桌面端脱敏聚合模型调用用量上报到运营后台，并落地用量看板（调用量/成功率/429/耗时/成本）。

## ADDED Requirements

### Requirement: 用量上报端点
`POST /api/v1/usage/ingest`：`X-Catalog-Key` 鉴权（同目录端点；未配置→404、错→401）。body `{ items: [...], synced_at }`，items 含 usage_date/client_id/provider_id/category/action/calls/ok_count/fail_count/ratelimit_count/latency_ms/tokens_in/tokens_out/cost/latency_buckets。校验：usage_date YYYY-MM-DD、数值非负整数、provider_id/action 非空、单次 ≤500 条；按 (usage_date, client_id, provider_id, action) upsert 累加（幂等）。

#### Scenario: 鉴权
- **WHEN** 未带/带错 X-Catalog-Key（或未配置）
- **THEN** 401（或 404）

#### Scenario: 幂等累加
- **WHEN** 同桶数据分两次上报
- **THEN** 计数累加不重复行；再次重放同 payload 计数不翻倍（聚合后 upsert）

#### Scenario: 非法输入
- **WHEN** usage_date 非 YYYY-MM-DD / 负数 / 缺 provider_id / 超过 500 条
- **THEN** 400 且提示字段

### Requirement: 用量汇总查询
`GET /api/v1/usage/summary?days=N`（admin，默认 30，上限 90）：返回 totals（总调用/成功率/429/平均耗时/成本/活跃 provider）、by_date（每日调用与失败）、by_provider、by_action。

#### Scenario: 汇总正确性
- **WHEN** 存在多日多 provider 数据
- **THEN** totals 等于各桶之和；按日期/ provider/ action 分组正确

#### Scenario: 权限
- **WHEN** 非 admin 查询汇总
- **THEN** 403

### Requirement: 桌面端用量上报
`UsageReporter`：从 model_provider_logs 读 `id > lastId` 记录，按上报日期+provider+category+action 聚合（calls/ok/fail/ratelimit/总耗时/tokens/cost/耗时分布桶），POST ingest，成功后水印推进（settings `opsCenterUsageReport.lastId`），失败保留重试；启动 5s 首报 + 30min 周期；无 url/key 静默跳过；不上报 error_message 等敏感内容。`addProviderLog` INSERT 补 created_at=datetime('now')。

#### Scenario: 水印推进与重试
- **WHEN** 上报成功后新产生日志
- **THEN** 水印=已上报最大 id，下次仅报新增
- **WHEN** 上报失败
- **THEN** 水印不变，下次重试不丢数据

#### Scenario: 未配置静默
- **WHEN** 未配置 ops-center URL/Key
- **THEN** reportPending 直接跳过，不抛错不影响主流程
