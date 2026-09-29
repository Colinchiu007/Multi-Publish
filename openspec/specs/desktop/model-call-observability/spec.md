# desktop/model-call-observability Specification

## Purpose
桌面端调度机制的可观测性与自检：governor 采集每请求排队/冷却等待写入调用日志并由用量上报携带；提供真实 governor + 假 adapter 的限流自检（零网络/零额度），结果可上报运营后台并与 Python 模拟器对拍一致。
## Requirements
### Requirement: 调度等待指标采集
ApiUsageGovernor SHALL 在每次受管调用采集 `queuedMs`（并发信号量 + RPM 时间槽实际等待）与 `cooldownMs`（冷却实际等待），经调用链透传并写入 `model_provider_logs.queued_ms/cooldown_ms`（默认 0）；同 key 重入透传路径内层不计时（外层已计）。不得改变调度行为。

#### Scenario: 排队被记录
- **WHEN** 请求在并发信号量或 RPM 时间槽等待后放行
- **THEN** 该调用日志 `queued_ms > 0`，且未等待的调用为 0

#### Scenario: 冷却被记录
- **WHEN** 请求经历 429 冷却等待
- **THEN** 该调用日志 `cooldown_ms > 0`

#### Scenario: 重入不计时
- **WHEN** 同 key 内层 run 重入透传
- **THEN** 内层不重复累加 queued/cooldown 计时（仅外层记账）

### Requirement: 用量上报携带调度指标
UsageReporter SHALL 把日志聚合为 `queued_count`/`cooldown_count`/`queue_wait_ms`/`cooldown_wait_ms` 并随 ingest 上报；ops-center ingest 与 `model_usage_daily` SHALL 接受这些可空字段（旧客户端缺失按 0，upsert 幂等累加）。

#### Scenario: 上报新字段
- **WHEN** 日志含 queued_ms/cooldown_ms
- **THEN** ingest items 含四个新字段且数值非负

#### Scenario: 旧客户端兼容
- **WHEN** 旧桌面端上报不含新字段
- **THEN** ingest 正常（200），存储按 0 计，不破坏既有幂等键

### Requirement: 真实 governor 限流自检
桌面端 SHALL 提供 `rate-limit:self-check`（authenticated）：用独立 ApiUsageGovernor 实例 + 本地假 adapter（仅内存 sleep/可选抛 ProviderError(RATE_LIMITED)，不发起任何网络请求/不消耗额度）驱动 N 个并发请求，产出与运营后台模拟器同构的 timeline/metrics/assertions（engine='real-governor'）。

#### Scenario: 自检不触网
- **WHEN** 运行自检
- **THEN** 全程无 fetch/网络调用（假 adapter 不访问 provider），结果含并发上限/429/排队指标

#### Scenario: 自检可上报
- **WHEN** 已配置 ops-center 同步且用户确认上报
- **THEN** 结果 POST `/api/v1/scheduler/verify`（simulated=0, engine='real-governor', client_id）并返回 run_id；未配置 → 明确提示不发送

#### Scenario: 自检不污染生产
- **WHEN** 自检运行
- **THEN** 使用独立 governor 实例，生产单例的 rateFactor/时间槽/额度窗口不受影响

### Requirement: 模拟器与真实 governor 对拍
同一组固定参数下，运营后台 Python 模拟器与桌面端真实自检的关键指标 SHALL 一致，由对拍脚本/测试门禁保证，防止两套模型契约漂移。一致性的判据按指标性质分两类，不得混用同一口径：
- **计数与顺序类指标**（`rate_limited_count`、`quota_exceeded_count`、完成顺序）：必须**相等**，不放宽。
- **挂钟耗时类指标**（`total_duration_ms`）：允许时钟容差，容差口径为「绝对下限 + 与模拟器预测值成正比的比例项」，分母必须取模拟器预测值，不得取实测值。
- **并发观测指标**（`max_concurrent_observed`）：该值由「任务开始到其完成回调真正执行」这段窗口观测得到，因此进程事件帧被饥饿时会被动偏高，属测量口径而非并发能力。判据为两条同时成立：① **上限不变量**：真实侧观测并发 SHALL NOT 超过该组参数配置的最大并发数，此条在任何条件下不得放宽；② **单侧有界噪声**：真实侧与模拟器的差 SHALL NOT 超过 +1，且**只允许真实侧偏高**；真实侧低于模拟器（`real < simulated`）属调度行为回归，必须判为不一致。

#### Scenario: 对拍一致
- **WHEN** 对 rpm=6/并发1/8 请求、rpm=20/并发2/10 请求、注入 429、5h 超限四组输入分别运行模拟器与真实自检
- **THEN** 关键指标一致（容差内），真实侧观测并发等于模拟器观测并发且不超过配置上限，门禁通过

#### Scenario: 事件帧饥饿下并发观测偏高但不越上限
- **WHEN** 真实侧所在进程的事件帧被阻塞到接近相邻请求的起始间隔，导致某次调用的完成回调推迟到下一次放行之后才执行，观测并发比模拟器高 1
- **THEN** 门禁仍判为一致（差值恰为 +1 且真实侧 ≤ 配置上限），并在结果中如实记录该组为「有界测量噪声命中」而非静默通过

#### Scenario: 饥饿不足阈值时不得掩盖真实差异
- **WHEN** 事件帧阻塞时长明显小于相邻请求起始间隔，完成回调不被推迟
- **THEN** 真实侧观测并发必须等于模拟器观测并发；此时若出现 +1 判为不一致（噪声豁免不得被当成万能容差）

#### Scenario: 并发越上限必须判红
- **WHEN** 任一组参数下真实侧观测并发超过该组配置的最大并发数
- **THEN** 门禁失败，且该失败不因 +1 噪声豁免而被吞掉（含配置上限为 1 的用例：此时豁免上限被配置上限夹住，等价于仍要求相等）

#### Scenario: 真实侧并发低于模拟器必须判红
- **WHEN** 真实侧观测并发小于模拟器观测并发
- **THEN** 门禁失败，不得被噪声豁免覆盖（该方向的偏差只能来自调度行为差异，不来自回调推迟）

#### Scenario: 契约常量一致
- **WHEN** 检查两端契约常量（30s/180s/45s/×0.75/+0.05/下限0.2/clamp 公式）
- **THEN** 桌面端常量测试与 ops-center 模拟器单测数值一致

