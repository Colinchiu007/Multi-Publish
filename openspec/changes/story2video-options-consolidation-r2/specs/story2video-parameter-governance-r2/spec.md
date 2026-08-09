## Purpose

延续图片轮播参数治理（R1，PRD 7.1.19）：将 splitSpeechRate、concurrency、autoAdvance 从前端 s2vConfig 移除，其值由契约派生/默认/参数字面量提供，清除剩余「存在但不可控」的假配置项。

## ADDED Requirements

### Requirement: R2 死字段移除
前端 s2vConfig SHALL 不包含 splitSpeechRate、concurrency、autoAdvance 字段；提交构造 SHALL 不显式提交 split.speechRate 与 concurrency（split.speechRate 由 normalizer 以 voice.speed 派生，concurrency 由契约默认 3 兜底）；流水线 params SHALL 保留字面量 autoAdvance: true。恢复快照中的已移除键 SHALL 被白名单忽略。

#### Scenario: 缺省走契约派生
- **WHEN** renderer 提交不携带 split.speechRate / concurrency / autoAdvance（s2vConfig 无字段）
- **THEN** normalizer 输出 split.speechRate = voice.speed、stageOptions.generate_assets.concurrency = 3、params.autoAdvance = true

#### Scenario: 前端不再声明
- **WHEN** 检查 CreateView.vue 的 s2vConfig 默认对象
- **THEN** 声明块不包含 splitSpeechRate / concurrency / autoAdvance 键（UE 契约断言）

### Requirement: 契约与文档同步
PRD 7.1.19 参数治理合同 SHALL 将 splitSpeechRate/concurrency/autoAdvance 标记为「前端已移除（R2）」，并保留其系统管理语义说明。

#### Scenario: 合同更新
- **WHEN** 查询 PRD 7.1.19 系统管理参数清单
- **THEN** 三字段标注 R2 移除状态，派生/默认来源不变
