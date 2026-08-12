# ops-center-rate-limit-verifier Design

## 1. 目标与范围
在运营后台提供「限流与调度验证」闭环：契约校验（配置是否合法/合理）→ 参数模拟（同契约确定性模拟）→ 真实观测（用量上报排队/冷却指标）→ 真实自检（桌面端 governor 假 adapter 对拍）。不修改既有调度行为（`ApiUsageGovernor`/`model-call-scheduler` 参数不变），只增加观测与验证层。

## 2. 契约常量（模拟器与桌面端同源）
| 常量 | 值 | 出处（桌面端） |
|---|---|---|
| 窗口 | 60_000ms | api-usage-governor.js `WINDOW_MS` |
| 并发队列上限 | 30_000ms（`MAX_QUEUE_WAIT_MS`） | 同上 |
| RPM 时间槽上限 | 180_000ms（`MAX_PACE_WAIT_MS`） | 同上 |
| 冷却等待上限 | 45_000ms（`MAX_COOLDOWN_WAIT_MS`） | 同上 |
| 429 自适应 | rateFactor ×0.75（下限 0.2）；成功 +0.05 | 同上 `RATE_ADAPT_FACTOR`/`RATE_RECOVER_STEP` |
| 有效 RPM | max(2, round(rpm × rateFactor)) | 同上 `_effectiveRpm` |
| 并发换算 | clamp(round(rpm/10), 1, 4) | model-call-scheduler.js |
| 5h 窗口 | windowMs=5h, field=requests，预检即拒 `QUOTA_EXCEEDED` | model-provider-manager.js |

## 3. P0 — 调度模拟器（Python，确定性事件驱动）
文件：`ops-center/backend/services/scheduler_simulator.py`
- `simulate(params) -> SimulationResult`
  - params：`rpm`、`max_concurrent`（未传按 clamp 换算）、`limit_per_5h`（可空）、`request_count`、`request_duration_ms`、`arrival_interval_ms`（默认 0=同时到达）、`inject_429`（可空：第几个请求返回 429）、`exceed_5h`（bool）。
  - 事件循环按「全局时钟 + 最小堆」推进：每请求依次 `preflight_5h → acquire_semaphore(30s) → pace_slot(180s) → cooldown_check(45s) → execute(duration) → record → (若注入 429) set_cooldown + rateFactor×0.75`；成功 `rateFactor +0.05`。
  - 时间槽：`next_slot_by_rpm`（基于 `_effectiveRpm`），并发预约。
  - 输出：
    - `timeline`: [{req, arrived_at, queued_at, started_at, finished_at, state: queued|running|completed|rate_limited|quota_exceeded, queue_wait_ms, cooldown_wait_ms}]
    - `metrics`: {total_duration_ms, throughput_per_min, max_concurrent_observed, max_queue_wait_ms, rate_limited_count, cooldown_count, quota_exceeded_count, rate_factor_curve:[{t, factor}]}
    - `assertions`: [{name, pass, actual, expected, message}]
- 断言库（`_assertions`）：
  - `max_concurrent`：观测并发峰值 ≤ max_concurrent
  - `no_rate_limited`（未注入 429 时）：rate_limited_count == 0
  - `throughput`（rpm>0）：throughput_per_min ≤ rpm（窗口内实际放行 ≤ 预算）
  - `max_queue_wait`：max_queue_wait_ms < 180_000
  - `quota_at_limit_plus_1`（exceed_5h 且 limit 有值）：第 limit+1 个请求预检拒绝且 `started_at is None`
  - `fifo`（max_concurrent==1 时）：完成顺序 == 到达顺序
- 确定性：同参数同结果（事件驱动、无随机）；`429 注入` 使自适应路径可复现。

## 4. P0 — 接口与数据
- 表 `scheduler_verification_runs`：id INTEGER PK AUTOINCREMENT、preset_id TEXT NULL、rpm INTEGER、max_concurrent INTEGER、limit_per_5h INTEGER NULL、request_count INTEGER、request_duration_ms INTEGER、arrival_interval_ms INTEGER DEFAULT 0、inject_429 INTEGER NULL、exceed_5h INTEGER DEFAULT 0、simulated INTEGER DEFAULT 1、engine TEXT DEFAULT 'python-simulator'、metrics_json TEXT、assertions_json TEXT、status TEXT、created_at TEXT、created_by TEXT。
- 迁移：`main.py` 启动 ensure（仿 `ensure_model_preset_columns`）：`CREATE TABLE IF NOT EXISTS scheduler_verification_runs (...)`。
- 端点（`ops-center/backend/routers/scheduler.py`，prefix `/api/v1/scheduler`，全部 `require_admin`）：
  - `POST /verify`：body 参数校验（rpm ∈ [1,100000]、request_count ∈ [1,1000]、duration ∈ [0,60000]、inject_429 ∈ [1,request_count] 或空、exceed_5h bool、preset_id 可空）→ `simulate` → 落库 → 返回 `{code:0, run_id, metrics, assertions, timeline}`；参数非法 400 + 字段提示。
  - `GET /verify`：`preset_id`/`simulated`/分页（limit/offset），按 created_at 倒序，返回历史 run 摘要（不含 timeline 全文，提供 `GET /verify/{id}` 取详情）。
  - `GET /verify/{id}`：单条详情（含 metrics/assertions/timeline JSON）。
  - `GET /contract`：批量契约校验：对全部 `is_visible=1` 预设输出 `{preset_id, rpm, limit_per_5h, max_concurrent(换算), rules:[{rule, pass, actual, expected}]}`；规则：rpm 空或 ∈[1,100000]、limit5h 空或 ∈[1,10000000]、default_model 为空或 ∈ models、并发换算公式正确。
- 测试：`ops-center/backend/tests/test_scheduler_simulator.py`（确定性、并发上限、RPM 排队、冷却/自适应、5h 预检、断言库、参数校验 400）+ `test_scheduler_api.py`（admin 权限、落库、历史/详情、契约校验）。

## 5. P0 — 前端「限流与调度验证」页
- 路由 `/rate-limit-verifier`（`meta.requiresAuth`），App.vue el-menu 增「限流验证」。
- 页面 `views/RateLimitVerifier.vue`（Element Plus），三个 tab：
  1. **模拟验证**：预设下拉（调 `/api/v1/model-presets` 取列表，选后自动带出 rpm/limit5h/换算并发，可改）+ 请求数/单请求耗时/到达间隔/注入 429（第 N 个）/5h 超限开关 → 「运行验证」→ 结果区：
     - 指标卡（总耗时/吞吐/最大并发/最长排队/429/冷却/quota）
     - 时间线表（每请求 到达/排队/执行/完成 + 状态色）+ 可选简单 SVG/条状可视化
     - 断言表（PASS/FAIL 徽标 + 实际/期望）
     - rateFactor 曲线（文本序列或折线，简化用列表）
  2. **契约校验**：`GET /scheduler/contract` 表格（预设 × 规则 × PASS/FAIL），一键刷新。
  3. **自检/历史记录**：本地自检说明 + 历史 run 列表（来源：模拟 simulated=1 / 桌面端自检 simulated=0 + client_id）+ 详情抽屉。
- 交互约束：结果区说明「模拟结果 ≠ 真实 provider 限流；桌面端真实自检见 P2」。

## 6. P1 — 桌面端排队/冷却可观测性
- `model_provider_logs` 增加列：`queued_ms INTEGER NOT NULL DEFAULT 0`、`cooldown_ms INTEGER NOT NULL DEFAULT 0`（store 迁移：`ALTER TABLE ... ADD COLUMN` 幂等）。
- `api-usage-governor.js`：`run()` 内记录每请求 `queuedMs`（`_acquire`+`_pace` 实际等待）、`cooldownMs`（`_waitCooldown` 实际等待）、`rateLimited`（最终抛 RATE_LIMITED/QUOTA），以 `meta.observability = {queuedMs, cooldownMs}` 传给 task/日志；`classifyProviderFailure` 不变。注意：**不改调度行为**，仅计时采集；重入透传路径内层不计时（外层已计）。
- 日志写入点（model-provider-manager `callAdapter`/adapters 记录处）：读取 `meta.observability` 写入 queued_ms/cooldown_ms。
- `usage-reporter.js`：聚合新增 `queued_count`（queued_ms>0 条数）、`cooldown_count`（cooldown_ms>0）、`queue_wait_ms`（sum）、`cooldown_wait_ms`（sum）；items 输出同名字段（缺失按 0）。
- ops-center：`model_usage_daily` 增加可空列（queued_count/cooldown_count/queue_wait_ms/cooldown_wait_ms）；ingest 校验「可选、非负整数」；`usage_service` upsert 累加；`usage_summary` 增加聚合输出。
- 用量看板 `UsageDashboard.vue` 新增「调度健康度」区块：按 provider 表（调用量/429 率/排队次数/平均排队 ms/预算利用率 = 每分钟实测调用 ÷ rpm 预算），rpm 预算取自 model_presets 目录；429 率 >10% 或利用率 >90% 标 warning。
- 测试：desktop `usage-reporter.test.js`（+聚合字段）、`api-usage-governor.test.js`（+observability 计时断言：排队>0/冷却>0 场景）、store 迁移测试；ops-center `test_usage_api.py`（+可选字段兼容/累加/看板聚合）。

## 7. P2 — 桌面端真实自检与对拍
- `services/rate-limit-self-check.js`：
  - `runSelfCheck({rpm, maxConcurrent, limitPer5h, requestCount, requestDurationMs, arrivalIntervalMs, inject429At}) -> {engine:'real-governor', metrics, assertions, timeline}`：
    - 创建**独立** `ApiUsageGovernor`（同契约常量，不污染生产单例）；
    - 假 adapter 任务：`async () => { await sleep(requestDurationMs); if (i === inject429At) throw ProviderError(RATE_LIMITED,...); return {ok:true} }`（仅内存，无网络/无额度）；
    - 用 `mapWithModelBudget`/`governor.run` 并发驱动，采样并发峰值与时间线。
  - 断言复用与模拟器相同的 6 条规则（JS 实现 `_assertSelfCheck`）。
- IPC：`ipc-handlers/rate-limit.js`（`rate-limit:self-check`：参数 → runSelfCheck → 返回结果；`rate-limit:report`：把结果 POST 到 ops-center `/api/v1/scheduler/verify`（simulated=0, engine='real-governor', client_id），复用 ops-center-sync URL/Key；未配置 → `{code:-1,message:'未配置运营后台同步'}`）；preload 暴露 `rateLimitSelfCheck`/`rateLimitReport`；phase1-context 注册 handler。
- 用户入口（renderer）：模型设置页「运营后台同步」卡片旁新增「限流自检」按钮 → 弹窗表单（预设/请求数/429 注入）→ 运行 → 结果展示 + 「上报运营后台」按钮。
- 对拍脚本 `scripts/compare-scheduler-models.js`：对一组固定参数（rpm=6/并发1/8 请求；rpm=20/并发2/10 请求；注入 429 场景；5h 超限场景）分别调用 Python 模拟器（subprocess）与桌面端 runSelfCheck，比对 metrics 关键字段（max_concurrent_observed、rate_limited_count、quota_exceeded_count、total_duration_ms 容差、完成顺序）。测试：`rate-limit-self-check.test.js`（时间线/断言/无网络泄漏——假 adapter 不触发 fetch）+ 对拍测试 `test_scheduler_parity.js`（CI 或本地脚本，作为 spec 场景映射）。
- 安全：自检 IPC 需登录（authenticated，与模型写操作同级）；上报仅 X-Catalog-Key；自检不访问真实网络（假 adapter 断言 `fetch` 未被调用）。

## 8. 数据兼容与迁移
- `model_provider_logs`/`model_usage_daily` 新列全部可空/默认 0：旧桌面端上报不含新字段 → ingest 接受缺失；旧库自动迁移；新字段不影响既有 upsert 幂等键。
- `scheduler_verification_runs` 新表独立，无既有数据迁移。

## 9. 风险与对策
- 模拟器-governor 契约漂移：对拍脚本 + 两端的契约常量单测（常量值断言）。
- 计时采集污染生产路径：只读计时不改变调度语义；重入内层不计时；性能开销可忽略（数毫秒计数）。
- 自检状态污染：独立 governor 实例。
- 上报膨胀：新字段为聚合计数，不上报逐请求明细。
