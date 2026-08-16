## Purpose

Defines the failure-transparency contract for Story2Video segment retry (image/video) and scene image generation: real failure reasons must be preserved end-to-end, normalized into user-visible localized messages for known failure classes, and leave a log trail — never masked into a generic "operation failed" message. Segment status must be displayed with localized labels and an inline failure reason, and success writes must clear stale failure traces so persisted state stays truthful.

## ADDED Requirements

### Requirement: 分段成功写回清除失败痕迹（2026-08-16）

服务端 SHALL 在任一素材写回路径把分段状态置为 `completed`（图片生成/重试、视频生成/重试、音频替换/重生成、优化词/字幕重生成等）时，清除该分段的 `error` 字段；分段 `status` 为 `failed` 时 SHALL 保留 `error`（既有契约）。禁止出现 `completed` 与 `error` 并存的误导状态。

#### Scenario: 重试图片成功后无残留错误

- **WHEN** 分段曾失败（error 记录「余额不足」）且用户重试图片成功
- **THEN** 分段 `status=completed` 且 `error` 为空/不存在

#### Scenario: 失败仍保留原因

- **WHEN** 图片生成失败
- **THEN** 分段 `status=failed` 且 `error` 保留原始错误文本

### Requirement: 分段状态本地化与失败原因内联展示（2026-08-16）

结果页/历史编辑页分段卡片 SHALL 以本地化标签展示分段状态（完成/失败/生成中），不得输出英文原值；`status=failed` 且存在 `error` 时 SHALL 内联展示一行可读失败原因（复用通知归一化分类映射本地化文案，未命中回退通用文案并截断）；`status` 非 `failed` 时 SHALL NOT 展示失败原因或失败样式，即使 `error` 字段存在残留。

#### Scenario: 失败分段显示原因

- **WHEN** 分段 failed 且 error 命中「额度/余额不足」模式
- **THEN** 卡片显示本地化「失败」标签与额度/余额类可读原因，用户可据此检查套餐或重试

#### Scenario: 完成分段不显示残留错误

- **WHEN** 分段 completed 但数据残留 error（旧版本数据或未清理路径）
- **THEN** 卡片仅显示「完成」标签，不渲染失败原因与失败样式

#### Scenario: 未映射错误回退通用文案

- **WHEN** 分段 failed 的 error 不匹配任何已知失败类别
- **THEN** 内联原因回退 operation_failed 通用文案，不暴露内部路径或堆栈