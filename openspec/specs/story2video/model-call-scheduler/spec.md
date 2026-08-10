# story2video/model-call-scheduler Specification

## Purpose
视频创作模块统一模型调用调度：按 provider 的每分钟连接次数/5小时限额合理安排并发与排队，预算来自前端默认模型配置并可回退默认。
## Requirements
### Requirement: 统一模型调用调度机制
桌面端所有模型 API 调用（含视频创作生成阶段）必须收敛到 ApiUsageGovernor + model-call-scheduler 统一入口：并发信号量、RPM 滑动窗口排队、429 冷却重试、5h 请求额度窗口。

#### Scenario: 生成阶段调用走统一入口
- **WHEN** story2video generate_assets 并行生成图片/TTS 且 provider 已配置
- **THEN** 调用经 model-call-scheduler.mapWithModelBudget 调度，并发上限 = min(请求并发, provider maxConcurrent)

#### Scenario: 未配置预算时回退
- **WHEN** provider 未配置 rate_per_minute/limit_per_5h 且不在静态表
- **THEN** 使用类别默认预算，行为与现状一致（不回归）

#### Scenario: 超出预算排队而非失败
- **WHEN** 同时并发请求超过 provider 每分钟预算
- **THEN** 后续请求进入有界排队（时间槽预约），排队超时返回明确限流错误而非静默失败

### Requirement: 每分钟连接次数与5小时限额配置
model provider 配置必须支持 rate_per_minute（每分钟连接次数）与 limit_per_5h（5小时限额次数），允许为空；非空时必须为正整数并注入 governor。

#### Scenario: 预算注入
- **WHEN** ModelProviderManager 初始化或 provider 配置更新且包含 rate_per_minute/limit_per_5h
- **THEN** governor.setProviderLimits（rpm/maxConcurrent）与 5h 请求窗口被同步更新

#### Scenario: 空值语义
- **WHEN** rate_per_minute 或 limit_per_5h 为空
- **THEN** 对应维度使用静态表/默认值，不报错

#### Scenario: 非法值拦截
- **WHEN** rate_per_minute/limit_per_5h 为 0、负数、非整数或超上限
- **THEN** 配置保存被拒绝并给出明确错误提示

### Requirement: 前端设置展示限流字段
前端模型设置页必须提供「每分钟连接次数」「5小时限额次数」输入（可空），并提示语义与留空行为。

#### Scenario: 编辑与持久化
- **WHEN** 用户在模型设置编辑 rate_per_minute/limit_per_5h 并保存
- **THEN** 值持久化到 provider config 且不包含在公开字段泄露之外（同现有 config 处理）

#### Scenario: 显示提示
- **WHEN** 输入框留空
- **THEN** 界面显示「留空使用默认限流」提示，不阻塞保存

### Requirement: 种子预算来源约束
预设限流种子只允许包含代码事实：rate_per_minute 必须与 governor-provider-limits 静态表一致；limit_per_5h 无代码事实不得预填（运营配置后注入 provider 级 5h 窗口）。

#### Scenario: 种子自洽
- **WHEN** 检查 PRESET_RATE_LIMITS
- **THEN** 仅含 rate_per_minute 且与 PROVIDER_LIMITS.rpm 一致，无 limit_per_5h

#### Scenario: 5h 窗口由配置驱动
- **WHEN** provider config.limit_per_5h 为空
- **THEN** governor 不预置 5h 窗口（注入清除），运营填写后生效

