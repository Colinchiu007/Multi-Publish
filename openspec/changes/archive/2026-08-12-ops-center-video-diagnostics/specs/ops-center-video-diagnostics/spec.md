## Purpose

Provides an operations-center (运营后台) capability for video-creation failure diagnostics: desktop clients upload redacted run diagnostics via an authenticated ingest API, the server aggregates them into daily buckets and stores bounded whitelist samples, and admins view summaries, alerts, and sample details to make disposition decisions.

## ADDED Requirements

### Requirement: 桌面端失败诊断脱敏上报

桌面端 SHALL 在编排模式 run 终结后入队诊断记录，并按周期（默认 30 分钟）将聚合桶与失败样本经 `POST /api/v1/diagnostics/ingest` 上报；上报字段 SHALL 仅含白名单（run_id、日期、pipeline、status、stage、failure_type、severity、recoverability、cause_id、duration_ms、client_id、env 白名单字段），不得包含 errorParams 原文、凭据、路径明文或用户内容。未配置 ops-center URL/Key 时 SHALL 静默跳过且不影响主流程。

#### Scenario: 上报成功推进水印

- **WHEN** 桌面端已配置 ops-center 且 ingest 返回成功
- **THEN** 上报器推进 watermark，下次不重复上报已确认批次

#### Scenario: 未配置时静默跳过

- **WHEN** ops-center URL 或 Key 未配置
- **THEN** 上报返回 skipped 且不抛错、不影响桌面端其他功能

### Requirement: 服务端 ingest 幂等与校验

ops-center `POST /api/v1/diagnostics/ingest` SHALL 以 X-Catalog-Key 鉴权（未配置 Key 返回 404，Key 不匹配返回 401）；SHALL 校验日期/枚举/数值字段，非法输入返回 400；SHALL 以 (client_id, batch_id) 去重批次，同批次重复提交不重复计数；日聚合桶按 (diag_date, client_id, pipeline) 幂等累加；样本按 (client_id, run_id) 去重。

#### Scenario: 超时重试不翻倍

- **WHEN** 同一 batch_id 被重复提交
- **THEN** 服务端标记 duplicate 且计数不翻倍

#### Scenario: 非法字段被拒绝

- **WHEN** 上报包含非法日期、未知枚举或负数
- **THEN** 返回 400 且不写入任何数据

### Requirement: 样本保留期

系统 SHALL 将诊断样本保留 30 天并在每次 ingest 时滚动清理过期样本；日聚合数据不设保留期限制。

#### Scenario: 过期样本被清理

- **WHEN** 样本创建时间超过 30 天
- **THEN** 在后续 ingest 或清理任务中被删除

### Requirement: 管理端汇总与告警

`GET /api/v1/diagnostics/summary` SHALL 要求 admin 鉴权，返回：totals（总 run/失败/成功/取消/失败率/受影响设备数/平均失败耗时）、by_date、by_stage、by_failure_type、by_cause、by_client、环境维度（磁盘不足样本数/占比、sidecar 异常样本数）、以及按阈值计算出的 alerts（level/dimension/message）。阈值：整体失败率 > 20% 告 HIGH；compose 阶段失败占比 > 50% 告 MEDIUM；sidecar 类根因占比 > 20% 告 MEDIUM；存在磁盘不足样本告 LOW。

#### Scenario: 失败率超阈值产出告警

- **WHEN** 近 30 天失败率大于 20%
- **THEN** summary.alerts 包含 HIGH 级整体失败率告警

#### Scenario: 未达阈值无告警

- **WHEN** 所有维度均低于阈值
- **THEN** alerts 为空数组

### Requirement: 管理端样本查询

`GET /api/v1/diagnostics/samples` SHALL 要求 admin 鉴权，支持 days/limit/offset/stage/failure_type/cause_id 过滤，返回分页样本（含白名单 env JSON）；样本字段 SHALL 保持与服务端存储一致的白名单。

#### Scenario: 按根因过滤样本

- **WHEN** 管理端按 cause_id=provider_timeout 过滤
- **THEN** 仅返回该根因的样本

### Requirement: 运营看板

运营后台 SHALL 提供 `/diagnostics` 页面（admin 可见）：KPI 卡片、每日趋势、stage/failureType 分布、Top 根因及处置建议（causeId → 建议操作 + 功能开关入口）、告警面板、失败样本列表与详情抽屉（checks/advice + 复制诊断信息）。处置建议 SHALL 只提供建议与跳转，不自动写入 feature_flag。

#### Scenario: 看板展示 Top 根因与建议

- **WHEN** 运营打开 /diagnostics 且存在失败样本
- **THEN** 页面展示按 cause_id 聚合的 Top 根因列表，每条附建议操作与「前往功能开关」入口
