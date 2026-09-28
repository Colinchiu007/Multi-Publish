## MODIFIED Requirements

### Requirement: 排队等待与冷却时序预算
governor 的排队与冷却等待 SHALL 有界且文案明确：并发信号量队列 30s、RPM 时间槽 180s、429 冷却 45s；超限返回 RATE_LIMITED 明确文案，额度窗口请求前预检即拒返回 QUOTA_EXCEEDED，不静默丢弃。

按请求次数计的额度窗口（`field: 'requests'`）SHALL 采用「准入即占额度」：预检通过的同一时刻即递增该窗口计数，因此并发在途请求不可能同时看到同一份未更新快照并一起放行。任务成功 SHALL 保留该次占用且不得再次递增；任务抛错 SHALL 归还该次占用，使「只有真正成功的调用消耗额度」的既有语义保持不变。按 token 数量计的窗口 SHALL 保持响应回来后记账（成本无法预先得知），仍由事后断言兜底。

一次受管调用 SHALL 只占用一次额度，其内部的 429 退避重试不得重复占用。

#### Scenario: 并发队列超时
- **WHEN** 请求等待并发信号量超过 30s（MAX_QUEUE_WAIT_MS）
- **THEN** 返回 RATE_LIMITED「当前请求频率已达上限，请稍后再试。」，不静默丢弃

#### Scenario: RPM 时间槽超时
- **WHEN** 请求预约 RPM 时间槽等待超过 180s（MAX_PACE_WAIT_MS）
- **THEN** 抛 RATE_LIMITED 且 context 携带 cooldownMs

#### Scenario: 冷却期超长直接提示
- **WHEN** 429 冷却剩余超过 45s（MAX_COOLDOWN_WAIT_MS）
- **THEN** 提示「该模型 API 处于限流冷却期，请稍等约 N 秒后重试。」，不阻塞等待

#### Scenario: 429 自适应下调
- **WHEN** 收到 429 后同 provider 继续请求
- **THEN** rateFactor ×0.75（下限 0.2）下调 RPM 预算，成功后每笔 +0.05 缓慢恢复，_effectiveRpm = max(2, round(rpm × rateFactor))

#### Scenario: requests 窗口并发不超支
- **WHEN** `maxConcurrent=4`、`limit=3`、7 个请求同时到达、每次调用都成功
- **THEN** 恰好 3 个被放行并执行、其余 4 个返回 QUOTA_EXCEEDED 且一次都未执行；重复运行结果稳定

#### Scenario: 失败的调用归还额度
- **WHEN** `field: 'requests'` 窗口 limit=L，某被放行的调用随后抛错（非 QUOTA_EXCEEDED）
- **THEN** 该次占用被归还，后续请求仍可被放行至累计 L 次**成功**调用；窗口计数不等于「已发起次数」

#### Scenario: 429 重试不重复占用
- **WHEN** 一次受管调用先收到 429、退避重试后成功
- **THEN** 该 `limit` 窗口只递增 1（同一次调用不因重试累计成 2）

#### Scenario: 窗口换代不得污染新窗口
- **WHEN** 某请求在旧窗口内被放行并占用了额度，其后窗口因过期被重置，该请求才失败
- **THEN** 归还动作只作用于它所占据的那一代窗口；新窗口的计数不受这次迟到归还影响

#### Scenario: token 计数窗口仍走事后记账
- **WHEN** 窗口 `field` 为 `total_tokens` 等需响应才知道成本的字段
- **THEN** 准入时不预扣，成本在响应回来后记账；第 limit+1 次超限仍返回 QUOTA_EXCEEDED
