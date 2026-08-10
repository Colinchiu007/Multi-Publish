## Why

预设限流种子含无代码事实的 limit_per_5h 估算，与运营后台「已确定才填」原则不符；需移除估算、由运营配置驱动，并同步 vendored ops-center 目录。

## What Changes

- model-provider-seeds.js PRESET_RATE_LIMITS 移除 limit_per_5h 估算（保留 rate_per_minute，与静态表一致）。
- 同步 vendored ops-center（目录 53 项生成 + 一致性测试 + PRD）。
- 文档 7.4.4.2 数据来源说明。

## Capabilities

### Modified Capabilities
- `story2video/model-call-scheduler`: 种子预算来源约束（rate_per_minute=静态表事实；limit_per_5h 不预填）。

## Impact

- apps/desktop/electron/services/model-provider-seeds.js、测试、ops-center/（vendored）、01-docs/PRD.md、CHANGELOG.md
