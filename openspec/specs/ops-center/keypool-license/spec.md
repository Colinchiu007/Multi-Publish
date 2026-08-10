# ops-center/keypool-license Specification

## Purpose
官方 Key 池增强（配额/告警/成本概览）与许可证管理（签发/吊销/列表），补齐 P0-1/P1-6 运营后台管理面。
## Requirements
### Requirement: 官方 Key 池配额与告警
OfficialKey 新增 rate_per_minute（正整数或空）、daily_limit（正整数或空）、alert_threshold_cost（≥0 浮点或空）、note。upsert 校验：正整数/非负浮点/布尔拒绝。`GET /api/v1/secrets/summary`（admin）返回池概览：总数/活跃/30 天内到期/已过期、按 provider 近 30 天成本（复用 model_usage_daily）、配额达标率。

#### Scenario: 新字段校验
- **WHEN** rate_per_minute/daily_limit 为负数、小数或布尔
- **THEN** 400 且提示字段

#### Scenario: 池概览
- **WHEN** 存在活跃/到期 Key 与用量数据
- **THEN** summary 返回正确计数与成本聚合；非 admin 403

### Requirement: 许可证管理
`licenses` 表：license_key 唯一（自动生成 MP-XXXX-XXXX-XXXX-XXXX，去易混淆字符）、plan、device_limit≥1、expires_at 可空（空=永久）、status(active/disabled/expired 派生)、note。`GET/POST /api/v1/licenses`、`PUT/DELETE /api/v1/licenses/{id}`（require_admin）。

#### Scenario: 签发
- **WHEN** 合法 plan/device_limit/expires_at
- **THEN** 返回生成的 license_key（唯一、格式正确）

#### Scenario: 校验与禁用
- **WHEN** device_limit<1 / plan 为空 / key 重复
- **THEN** 400 且提示
- **WHEN** 对 active 许可证 PUT status=disabled
- **THEN** 状态更新，列表不再视为可激活

#### Scenario: 权限
- **WHEN** 非 admin 访问
- **THEN** 403

### Requirement: 桌面端边界
本 change 不修改桌面端 license-manager / entitlement 验签（本地激活合同保持），不新增桌面端消费路径。

#### Scenario: 桌面端行为不变
- **WHEN** 运行现有桌面端许可证测试
- **THEN** 全部通过且无行为变化

