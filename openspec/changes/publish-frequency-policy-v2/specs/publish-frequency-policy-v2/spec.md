# publish-frequency-policy-v2 (delta: publish-frequency-policy-v2)

## ADDED Requirements

### Requirement: 提交阶段判定（不可被获益方伪造）

守卫 MUST 以**提交阶段**而非**错误类型**作为「未提交失败」的判据。发布传输层（真正发出平台写操作的那一层）MUST 在首次平台写操作前调用一次 `markSubmitted()`，队列 MUST 将其结果记录为 `task.submittedAt`。回滚间隔窗口 MUST 仅在 `task.submittedAt` 为空时允许；错误对象上的 `notSubmitted` MUST 降级为佐证位，两者不一致时 MUST 按「已提交」处理（占窗口）并记录 error 级日志。

#### Scenario: 提交前失败可立即重试
- **WHEN** 一次发布在发出任何平台请求之前失败（如登录态失效发生在提交阶段之前），且该错误带 `notSubmitted`
- **THEN** 守卫回滚该次占位，同一 (platform, accountId) 无需等待即可再次提交

#### Scenario: 提交后失败仍占窗口
- **WHEN** 一次发布已发出平台请求（`submittedAt` 已置位）后失败或超时
- **THEN** 该窗口 MUST 保持占用，后续同窗口提交被拦；回滚 MUST NOT 发生

#### Scenario: 佐证位与阶段标记不一致时 fail-closed
- **WHEN** 错误带 `notSubmitted === true` 但 `task.submittedAt` 已置位
- **THEN** 判定为已提交，占窗口，并记录 error 级日志与计数

#### Scenario: 成功发布的接线自证
- **WHEN** 一次发布**成功**但 `task.submittedAt` 为空
- **THEN** 记录 error 级日志并递增「接线缺陷」计数（把传输层漏接线从静默风险变为主动告警）

### Requirement: 账号级日配额

守卫 MUST 支持账号级日配额维度，与最小间隔**并存**：间隔管突发，配额管总量。日配额 MUST 按 `platform:accountId` 计数，键为**本机运营日** `YYYY-MM-DD`（不换算平台时区、不声称与平台日界等价）。配额被拒 MUST 以 `bucket='daily'`、`reason='daily_quota'` 表达，且 MUST NOT 以固定短间隔反复重判。

#### Scenario: 当日配额用尽
- **WHEN** 同一账号当日已提交次数达到该平台档上限
- **THEN** `check()` 返回 `allowed=false`、`bucket='daily'`、`reason='daily_quota'`；任务进入 `_quotaBlocked`，`_processNext` 跳过它，定时器指向次日 00:00:05

#### Scenario: 跨日恢复
- **WHEN** 本机运营日跨过 00:00
- **THEN** 该账号计数从 0 起算，被阻任务重新入队并重新判定

#### Scenario: 未提交回滚回补配额且幂等
- **WHEN** 一次未提交失败触发了回滚
- **THEN** 该次占用的配额计数 MUST 被回补（下限 0），且重复回滚 MUST NOT 重复回补

#### Scenario: 回滚计数只增不减
- **WHEN** 任意一次回滚发生
- **THEN** 该账号当日的回滚计数 +1，且不因配额回补而减少

### Requirement: 间隔抖动只增不减

守卫 MUST 支持可注入随机源与抖动比例；实际等待 MUST 为 `remaining × (1 + ratio × rand)`，`rand ∈ [0,1)`。抖动 MUST NOT 使等待短于标称最小间隔；`ratio = 0` 时行为 MUST 严格等于未引入抖动前的值。

#### Scenario: 抖动区间
- **WHEN** 抖动比例为 0.4 且连续采样多次
- **THEN** 每次实际等待均落入 `[base, base × 1.4)`

#### Scenario: 关闭抖动等价旧行为
- **WHEN** 抖动比例为 0
- **THEN** 实际等待严格等于标称剩余时间（与 v1 逐值一致）

### Requirement: 未登记平台出声

平台未登记于策略表时，守卫 MUST 回落最严基线（而非 0），并 MUST 对该平台**出声告警一次**（进程内按平台去重）。

#### Scenario: 未登记平台回落并告警
- **WHEN** 对未登记平台发起发布
- **THEN** 使用最严基线档位，且日志出现且仅出现一次该平台的回落告警

### Requirement: 一次性紧急放行

系统 MUST 提供显式的一次性紧急放行入口，跳过某一 (platform, accountId) 的当前等待。放行 MUST 经二次确认、MUST 受每日次数上限与最小间隔冷却约束、MUST 写入追加式审计（UI 无编辑入口），并 MUST 对「成功 / 超上限 / 无等待中的窗口」三种结果给出明确回显。

#### Scenario: 放行成功并留痕
- **WHEN** 用户在设置页确认紧急放行且当日次数未用尽
- **THEN** 该账号的等待被解除、任务立即进入队列，审计追加一行，设置页与进度面板同步刷新

#### Scenario: 超过每日上限
- **WHEN** 当日紧急放行次数已达上限
- **THEN** 拒绝放行，队列状态不变，界面给出上限文案

#### Scenario: 无等待中的窗口
- **WHEN** 该账号当前没有等待中的窗口
- **THEN** 明确回显「当前没有等待中的窗口」，MUST NOT 静默

## MODIFIED Requirements

### Requirement: 间隔策略数值与档位

策略表 MUST 采用 v2 数值：账号档 长文 20 分钟 / 短视频 10 分钟 / 短内容 3 分钟；平台档 **默认 2 分钟**（`0` = 显式关闭，与日配额的 `0` 语义一致）；未登记平台回落最严档。数值 MUST 只在此单一真源维护，调用方 MUST NOT 复制。

#### Scenario: 同平台多账号受平台档约束
- **WHEN** 同一平台的两个不同账号在同一台机器上连续发布，且平台档未被显式关闭
- **THEN** 第二个账号被拦，`bucket='platform'`，等待约 2 分钟

#### Scenario: 显式关闭平台档
- **WHEN** 平台档被显式设为 0
- **THEN** 同平台跨账号不再互相阻塞，仅受账号档与日配额约束

### Requirement: 阻塞与失败的用户可见文案

渲染层 MUST 区分四类状态并给出对应文案：间隔等待、日配额用尽、未提交失败（可立即重试）、已提交失败（需等待）。归因标签 MUST 支持 `account` / `platform` / `daily` 三态；字段缺席时 MUST NOT 渲染任何归因标签（不得猜测档位）。

#### Scenario: 日配额用尽的等待行
- **WHEN** 任务因日配额被阻
- **THEN** 进度面板显示「今日已达上限（used/max），将于明日 00:00 后自动继续」并带 `daily` 归因标签

#### Scenario: 未提交失败提示可立即重试
- **WHEN** 一次失败被判定为未提交
- **THEN** 失败卡片提示「未提交到平台，可立即重试」

#### Scenario: 归因字段缺席不渲染
- **WHEN** 阻塞事件的 `bucket` 字段缺席
- **THEN** 渲染行不含任何归因标签节点
