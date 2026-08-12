# ops-center-rate-limit-verifier Proposal

## Why
模型 API 并发/排队机制（桌面端 `ApiUsageGovernor` + `model-call-scheduler`）的预算由运营后台 `rate_per_minute`/`limit_per_5h` 下发，但运营无法验证「配置是否合理、机制是否按契约工作」：配置错误、真实限流抖动、排队参数漂移只能等用户报障。需要一个运营后台闭环的验证能力，覆盖「配置契约校验 → 参数模拟 → 真实机制观测 → 远程自检对拍」四个层面。

## What Changes
- **P0 调度模拟器 + 契约校验（ops-center）**：
  - 新增 `scheduler_simulator.py`：与桌面端 governor 同契约的确定性调度模拟器（RPM 时间槽、并发信号量、429 冷却、5h 额度预检、429 自适应），支持注入 429 / 5h 超限场景；产出请求时间线 + 指标 + 断言 PASS/FAIL。
  - 新增验证接口 `POST /api/v1/scheduler/verify`（跑模拟+断言+落库）、`GET /api/v1/scheduler/verify`（历史）、`GET /api/v1/scheduler/contract`（预设契约校验清单）；新增表 `scheduler_verification_runs`。
  - 新增前端页面「限流与调度验证」`/rate-limit-verifier`（参数表单 + 时间线/指标/断言结果 + 历史记录）。
- **P1 真实机制观测（桌面端上报扩展 + 用量健康度）**：
  - governor 记录每请求排队/冷却等待（`queued_ms`/`cooldown_ms`）写入 `model_provider_logs`；`usage-reporter` 聚合 `queued_count`/`cooldown_count`/`queue_wait_ms`/`cooldown_wait_ms` 上报；ingest 与 `model_usage_daily` 增加可空字段（旧客户端兼容）。
  - 运营后台用量看板新增「调度健康度」：429 率、预算利用率、排队/冷却事件趋势。
- **P2 远程/本机真实自检（桌面端自检 + 对拍）**：
  - 桌面端新增 `rate-limit-self-check`：用真实 `ApiUsageGovernor` + 本地假 adapter 构造 N 个并发请求（不发起网络），产出与模拟器同构的时间线/指标；结果本地展示并可上报 `POST /api/v1/scheduler/verify`（`simulated=0`）。
  - 对拍契约：同输入下 Python 模拟器与桌面端真实 governor 关键指标一致（脚本 + 测试）。
- 全部 admin-only；不引入真实 provider 调用（除用户自选的自检假 adapter，零额度）。

## Capabilities
- **New Capabilities**:
  - `ops-center/rate-limit-verifier` — 运营后台限流/调度验证（模拟器、契约校验、验证记录、用量健康度呈现入口）。
  - `desktop/model-call-observability` — 桌面端调度可观测性与自检（governor 排队/冷却记录、usage 上报扩展、真实 governor 自检与对拍）。
- **Modified Capabilities**:
  - 无（`story2video/model-call-scheduler` 的机制参数保持不变，本 change 只新增观测/验证层，不改调度行为）。

## Impact
- 代码：ops-center `routers/`、`services/`（新增 scheduler_simulator/verification service）、`models.py`（新表）、`main.py`（迁移注册）、前端 `router/index.js`/`App.vue`（菜单+路由）、`views/RateLimitVerifier.vue`、`views/UsageDashboard.vue`（健康度区块）；桌面端 `api-usage-governor.js`（调度指标采集）、`model-provider-manager.js`/`store`（日志列）、`usage-reporter.js`（聚合扩展）、`services/rate-limit-self-check.js`、`ipc-handlers/rate-limit.js`、`preload`、`phase1-context.js`（接线）。
- 数据：`model_provider_logs` 加 `queued_ms`/`cooldown_ms`（可空默认 0）；`model_usage_daily` 加可空聚合列；新增 `scheduler_verification_runs`。
- 接口：新增 `/api/v1/scheduler/*`（admin）；`/api/v1/usage/ingest` 与 `usage/summary` 响应增加可空字段（向后兼容）。
- 依赖：无新增第三方；模拟器纯标准库。
- 风险：模拟器与 governor 契约漂移（用对拍测试门禁）；上报字段向后兼容（可空）。
