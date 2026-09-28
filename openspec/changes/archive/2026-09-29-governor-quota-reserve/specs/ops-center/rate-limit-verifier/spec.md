## MODIFIED Requirements

### Requirement: 调度模拟验证
运营后台 SHALL 提供 `POST /api/v1/scheduler/verify`（admin）：按与桌面端 ApiUsageGovernor 同契约的确定性模拟器，对给定 rpm/maxConcurrent/limit_per_5h/请求数/单请求耗时/到达间隔/429 注入/5h 超限参数执行模拟，返回时间线、指标与断言 PASS/FAIL，并落库 `scheduler_verification_runs`。

额度准入判定与占额度计数 MUST 对并发在途请求原子成立：模拟器与桌面端实现都不得出现「多个请求同时通过预检、其中一个已真实执行后才被判超额」。

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
- **THEN** 第 L+1 个起全部预检即拒（`quota_exceeded_count = n - L`、`started_at` 为空、不消耗执行），断言 `quota_at_limit_plus_1` 通过

#### Scenario: 5h 额度预检在并发下同样成立
- **WHEN** maxConcurrent > 1 且请求同时到达，limit_per_5h=L 且请求数 > L
- **THEN** 真实执行次数 MUST 恰好为 L（既不多也不少），第 L+1 个起 `quota_exceeded_count = n - L` 且这些请求**一次都未执行**；同参数重复运行的该计数 MUST 与单次运行一致（非确定性即视为 FAIL）

#### Scenario: 模拟器不覆盖并发超额维度时的显式声明
- **WHEN** 模拟器为单线程顺序模型、其时间线无法表达「同时在途」
- **THEN** 对拍结论 MUST 显式声明并发维度未被模拟器覆盖，由桌面端并发回归用例单独守住，不得以模拟器 PASS 代替

#### Scenario: 参数非法被拒
- **WHEN** rpm 非 [1,100000]、requestCount 非 [1,1000]、inject_429 越界、duration 为负等
- **THEN** 400 + 字段级中文提示，不落库
