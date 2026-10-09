## Purpose

为双轨发布（api-only / api-then-dom / dom-only）中的「API 轨尝试 → 结果归一 → 是否降级 DOM」路径提供结构化观测能力：把每次 API 尝试的耗时、归一结果、原因码与是否降级变成可按平台聚合、可持久读取的指标，用于量化空转成本并作为发布模式调整决策的数据判据。

## ADDED Requirements

### Requirement: 双轨降级路径必须产生结构化观测事件

系统 SHALL 在每次经双轨发布服务入口发起的发布中，为 API 轨的每次尝试记录一条结构化观测事件，事件 MUST 至少包含：平台、当次生效的发布模式、API 尝试耗时、归一结果（success / transient_error / risk_blocked / login_expired / unsupported）、原因码、以及本条是否以降级 DOM 结束。

只经 DOM 轨执行的发布（`dom-only`）MUST NOT 产生 API 尝试事件。

#### Scenario: api-then-dom 首试失败后降级 DOM

- **WHEN** 平台发布模式为 `api-then-dom`，API 轨尝试失败且归一结果为 `transient_error` 或 `unsupported`，随后回落 DOM 轨执行
- **THEN** 记录一条 `degraded=true` 的观测事件，含该次 API 尝试耗时、归一结果与降级原因码
- **AND** 该平台的「API 尝试数」「API 失败数」「降级数」各加一

#### Scenario: API 轨成功

- **WHEN** 平台发布模式为 `api-then-dom` 或 `api-only`，API 轨尝试返回成功
- **THEN** 记录一条 `degraded=false`、归一结果为 `success` 的观测事件
- **AND** 增加「API 尝试数」与「API 成功数」，不增加「降级数」

#### Scenario: 风控或登录失效停报

- **WHEN** API 轨尝试归一结果为 `risk_blocked` 或 `login_expired`，发布按既有合规红线停报且不降级
- **THEN** 记录一条 `degraded=false` 且标记为停报的观测事件
- **AND** 「降级数」不增加（停报不得被统计成空转降级）

#### Scenario: dom-only 平台不产生 API 事件

- **WHEN** 平台发布模式为 `dom-only`，发布直接进入 DOM 轨
- **THEN** 不产生任何 API 尝试观测事件，该平台「API 尝试数」保持为零

### Requirement: 观测汇总必须可按平台聚合读取

系统 SHALL 提供只读汇总能力，按平台返回：API 尝试数、成功数、失败数、降级数、API 尝试累计与平均耗时、原因码分布、以及最后一次事件时间。汇总 MUST 可从进程外读取（持久化快照），以便在应用重启后仍可用于复盘。

#### Scenario: 多平台混合发布后读取汇总

- **WHEN** 同一进程内先后对两个平台各发起若干次发布（含成功、失败降级、停报）
- **THEN** 汇总按平台分组返回各自的尝试数 / 成功数 / 失败数 / 降级数 / 累计与平均耗时 / 原因码分布
- **AND** 各计数之和与已发出的观测事件数一致

#### Scenario: 尚无任何事件

- **WHEN** 进程内尚无任何 API 轨尝试
- **THEN** 汇总返回空聚合（各平台计数为零或不存在该平台条目）且不抛错

### Requirement: 观测不得影响发布主链

观测 MUST 为旁路（fail-open）：观测器缺失、耗时取值异常、聚合或持久化写入失败时，发布结果与既有路由语义 MUST 保持不变，且 MUST NOT 因观测失败向调用方抛出错误或改变返回的 `success` / `track` / `reasonCode`。

#### Scenario: 持久化写入被拒绝

- **WHEN** 观测快照落盘因磁盘满或权限拒绝而失败
- **THEN** 本次发布仍按原路由返回既有结果
- **AND** 至多产生一条观测告警日志，不向上抛错、不重试阻塞发布线程

#### Scenario: 观测器不可用

- **WHEN** 发布服务未注入观测器，或观测器记录时抛出异常
- **THEN** 发布链路照常执行（API 尝试、归一决策、降级/停报语义均不变）
- **AND** 不因观测器缺失而把可降级场景误判为失败或误判为成功

### Requirement: 观测数据作为发布模式决策依据时受样本门禁约束

汇总 MUST 同时给出样本量与观察窗口；当样本量或窗口长度低于配置的判据门槛时，汇总 MUST 标注为样本不足（insufficient-sample）。禁止在样本不足的情况下据此变更平台 `publishMode` 配置。

#### Scenario: 样本量不足

- **WHEN** 某平台 API 尝试数低于判定门槛，或观察窗口长度不足
- **THEN** 该平台汇总条目附带 `insufficientSample=true`
- **AND** 面向人的结论文本 MUST NOT 给出「应当回拨/保留」的配置建议

#### Scenario: 依据观测决定回拨发布模式

- **WHEN** 有人以观测数据为依据提出变更某平台 `publishMode`
- **THEN** 该决策记录 MUST 引用具体汇总数据（平台、尝试数、降级数、累计与平均耗时、观察窗口）
- **AND** 配置变更 MUST 作为独立的运行时代码变更走分支与回归，不随观测实现同批合入
