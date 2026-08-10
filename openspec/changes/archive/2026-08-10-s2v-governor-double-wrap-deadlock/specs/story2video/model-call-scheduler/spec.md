## Purpose
修复 2026-08-10 图片轮播流水线「生成图片与旁白」阶段自死锁：统一调度网关同 key 双包 + 网关重入保护 + 排队槽位记账修正。

## MODIFIED Requirements

### Requirement: 统一模型调用调度机制
桌面端所有模型 API 调用（含视频创作生成阶段）必须收敛到 ApiUsageGovernor + model-call-scheduler 统一入口：并发信号量、RPM 滑动窗口排队、429 冷却重试、5h 请求额度窗口。调度边界必须单层收敛：已由 AIGenerator.generate 内部 governor 调度的路径，阶段外层不得重复包裹（同 key 双包会导致并发信号量自死锁）；网关必须提供同 key 重入保护。

#### Scenario: 生成阶段调用走统一入口
- **WHEN** story2video generate_assets 并行生成图片/TTS 且 provider 已配置
- **THEN** 调用经 model-call-scheduler.mapWithModelBudget 调度，并发上限 = min(请求并发, provider maxConcurrent)

#### Scenario: 未配置预算时回退
- **WHEN** provider 未配置 rate_per_minute/limit_per_5h 且不在静态表
- **THEN** 使用类别默认预算，行为与现状一致（不回归）

#### Scenario: 超出预算排队而非失败
- **WHEN** 同时并发请求超过 provider 每分钟预算
- **THEN** 后续请求进入有界排队（时间槽预约），排队超时返回明确限流错误而非静默失败

#### Scenario: 调度边界单层收敛
- **WHEN** story2video generate_assets 使用 assetGenerator（生产路径）生成图片/TTS 且 provider 已配置
- **THEN** 阶段外层不再套 withModelBudget/governor.run，调用仅经 AIGenerator.generate 内部 governor 单层调度，并发上限仍 = min(请求并发, provider maxConcurrent)

#### Scenario: legacy 路径保留外层调度
- **WHEN** generate_assets 无 assetGenerator（legacy python 路径）
- **THEN** 每项图片/TTS 调用仍经 withModelBudget → governor.run 统一调度（RPM 排队 + 429 冷却 + 5h 窗口）

#### Scenario: 同 key 嵌套调用重入透传
- **WHEN** 同一 async 调用链对同一 key 已持有 governor 调度（外层 run）且再次调用 run（内层）
- **THEN** 内层直接透传执行，不重复占信号量/时间槽/不重复记账，调用有界完成且不自死锁

#### Scenario: 不同 key 嵌套仍独立调度
- **WHEN** 外层持有 key A 时内层调用 key B
- **THEN** B 不视为重入，按各自独立信号量正常排队调度

#### Scenario: 排队槽位记账不漂移
- **WHEN** 请求排队后被放行执行
- **THEN** 释放方把槽位转移给被放行请求（active+=1），全部完成后 active 归零、不漂移为负
