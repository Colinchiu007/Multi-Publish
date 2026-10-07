# desktop/rewrite-hard-constraints Specification

## Purpose
定义 desktop/rewrite-hard-constraints 的行为契约，判据只认下列 Requirement 与其 Scenario：「硬约束运营中心同步与引擎注入」，共 1 条。本规格由归档 change `rewrite-hard-constraints` 产生。

## Requirements
### Requirement: 硬约束运营中心同步与引擎注入

桌面端 SHALL 经 OpsCenterSync 消费 bootstrap 的 rewrite_hard_constraints，经 RewriteHardConstraintManager sanitize（类型不符/超限跳过）后 JSON 持久化（临时文件 + rename 原子写），并在构建改写引擎时注入；硬约束内容变化时 SHALL 失效引擎缓存，使运行中同步立即生效。

#### Scenario: bootstrap 到引擎注入全链生效

- **WHEN** ops-center bootstrap 携带默认硬约束且桌面端完成同步
- **THEN** 约束经 sanitize 落盘持久化，下一次改写经引擎 setHardConstraints 注入且位于 systemPrompt 最前

#### Scenario: 非法载荷跳过不落盘

- **WHEN** bootstrap 载荷类型不符或内容超 5000 字
- **THEN** 该约束被 sanitize 跳过，不写入本地持久化，既有约束不受影响

#### Scenario: 运行中同步内容变化立即生效

- **WHEN** 桌面端运行期间同步到内容变化的硬约束
- **THEN** 引擎缓存被失效，下一次改写即使用新约束，无需重启应用

