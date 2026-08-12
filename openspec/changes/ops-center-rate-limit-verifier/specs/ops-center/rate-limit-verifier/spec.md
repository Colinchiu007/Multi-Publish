# ops-center/rate-limit-verifier Specification

## Purpose
运营后台提供限流/调度验证闭环：配置契约校验、与桌面端同契约的调度模拟（时间线/指标/断言）、验证记录与用量健康度呈现，支撑运营对 `rate_per_minute`/`limit_per_5h` 配置的合理性验证与真实机制观测。

## ADDED Requirements

### Requirement: 调度模拟验证
运营后台 SHALL 提供 `POST /api/v1/scheduler/verify`（admin）：按与桌面端 ApiUsageGovernor 同契约的确定性模拟器，对给定 rpm/maxConcurrent/limit_per_5h/请求数/单请求耗时/到达间隔/429 注入/5h 超限参数执行模拟，返回时间线、指标与断言 PASS/FAIL，并落库 `scheduler_verification_runs`。

#### Scenario: 提交模拟参数得到结果
- **WHEN** admin 提交合法模拟参数（rpm、maxConcurrent、requestCount 等）
- **THEN** 返回 `{code:0, run_id, metrics, assertions, timeline}`，断言按 6 条规则输出 PASS/FAIL，记录落库（simulated=1）

#### Scenario: 并发上限被观测
- **WHEN** rpm=20（换算 maxConcurrent=2）且 10 个请求同时到达
- **THEN** `max_concurrent_observed ≤ 2` 且未注入 429 时 `rate_limited_count = 0`，断言 `max_concurrent`/`no_rate_limited` 通过

#### Scenario: RPM 时间槽排队
- **WHEN** rpm=6（maxConcurrent=1）且 8 个请求
- **THEN** `throughput_per_min ≤ 6`、`max_queue_wait_ms < 180000`、排队请求存在，断言 `throughput`/`max_queue_wait` 通过且完成顺序为 FIFO

#### Scenario: 429 冷却与自适应
- **WHEN** 注入第 k 个请求返回 429
- **THEN** `cooldown_count ≥ 1`、rateFactor 曲线先下调（×0.75 下限 0.2）后随成功恢复（+0.05），断言可验证自适应路径

#### Scenario: 5h 额度预检
- **WHEN** limit_per_5h=L 且 exceed_5h=true 且请求数 > L
- **THEN** 第 L+1 个请求预检即拒（`quota_exceeded_count=1`、`started_at` 为空、不消耗执行），断言 `quota_at_limit_plus_1` 通过

#### Scenario: 参数非法被拒
- **WHEN** rpm 非 [1,100000]、requestCount 非 [1,1000]、inject_429 越界、duration 为负等
- **THEN** 400 + 字段级中文提示，不落库

### Requirement: 配置契约校验
运营后台 SHALL 提供 `GET /api/v1/scheduler/contract`（admin）：对全部可见预设输出校验清单（rpm/limit5h 范围、default_model ∈ models、并发换算公式），供运营批量审查配置合理性。

#### Scenario: 非法配置标记 FAIL
- **WHEN** 某预设 rpm=0 或 limit_per_5h 为负数或 default_model 不在 models
- **THEN** 对应规则输出 FAIL 与原因；合法项 PASS

#### Scenario: 并发换算展示
- **WHEN** 预设 rpm=6
- **THEN** 契约输出 `max_concurrent=1`（clamp(round(6/10),1,4)）；rpm=20 → 2

### Requirement: 验证记录可审计
运营后台 SHALL 持久化验证 run（metrics/assertions/timeline JSON）并提供历史查询（列表分页 + 单条详情），来源区分模拟（simulated=1）与桌面端自检上报（simulated=0 + client_id）。

#### Scenario: 历史查询
- **WHEN** admin 调用 `GET /api/v1/scheduler/verify`（可按 preset_id/simulated 过滤）
- **THEN** 返回按 created_at 倒序的 run 摘要；`GET /verify/{id}` 返回含 timeline 的完整详情

#### Scenario: 权限控制
- **WHEN** 非 admin 调用 `/api/v1/scheduler/*`
- **THEN** 403

### Requirement: 用量健康度呈现
用量看板 SHALL 呈现调度健康度：按 provider 展示 429 率、排队/冷却事件（来自桌面端上报的 queued_count/cooldown_count/queue_wait_ms/cooldown_wait_ms）与预算利用率（实测每分钟调用 ÷ rpm 预算，rpm 取 model_presets 目录）；429 率 >10% 或利用率 >90% 标 warning。

#### Scenario: 健康度表
- **WHEN** 存在 usage 汇总数据与预设 rpm
- **THEN** 看板按 provider 显示 调用量/429率/排队次数/平均排队ms/利用率，异常项 warning 标记

#### Scenario: 旧数据兼容
- **WHEN** 桌面端未上报新字段（旧客户端）
- **THEN** queued_count/cooldown_count 等按 0 呈现，不报错
