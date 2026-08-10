## MODIFIED Requirements

### Requirement: 种子预算来源约束
预设限流种子只允许包含代码事实：rate_per_minute 必须与 governor-provider-limits 静态表一致；limit_per_5h 无代码事实不得预填（运营配置后注入 provider 级 5h 窗口）。

#### Scenario: 种子自洽
- **WHEN** 检查 PRESET_RATE_LIMITS
- **THEN** 仅含 rate_per_minute 且与 PROVIDER_LIMITS.rpm 一致，无 limit_per_5h

#### Scenario: 5h 窗口由配置驱动
- **WHEN** provider config.limit_per_5h 为空
- **THEN** governor 不预置 5h 窗口（注入清除），运营填写后生效
