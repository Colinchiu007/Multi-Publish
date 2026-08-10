## ADDED Requirements

### Requirement: 运行时同步预算来源
桌面端 governor 预算来源增加「运行时同步目录」层：ModelProviderManager.applyCatalog 把运营目录写入本地 config（rate_per_minute/limit_per_5h/capabilities/capability_models/models/default_model），随后重应用 governor；不覆盖 api_key/enabled/is_default/base_url。

#### Scenario: 同步后预算生效
- **WHEN** applyCatalog 更新某 provider 的 rate_per_minute=30
- **THEN** governor.setProviderLimits 以 rpm=30/maxConcurrent=clamp(30/10,1,4) 应用

#### Scenario: 冲突保护
- **WHEN** 目录与本地存在 provider
- **THEN** api_key/enabled/is_default/base_url 保持不变

### Requirement: 前端字段只读
模型设置页在启用运营后台同步后：限流字段只读展示（不提供输入）；模型列表只读（disabled）。

#### Scenario: 已同步
- **WHEN** lastSyncedAt 存在
- **THEN** 限流字段显示同步值或「未配置（默认限流）」且不可编辑；模型列表 disabled

#### Scenario: 未同步
- **WHEN** 未配置同步
- **THEN** 模型列表可手动编辑（向后兼容），限流字段显示「未配置（默认限流）」
