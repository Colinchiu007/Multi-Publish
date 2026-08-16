## Purpose

Defines the failure-transparency contract for Story2Video segment retry (image/video) and scene image generation: real failure reasons must be preserved end-to-end, normalized into user-visible localized messages for known failure classes, and leave a log trail — never masked into a generic "operation failed" message.

## ADDED Requirements

### Requirement: 分段重试失败保留真实原因

服务端 SHALL 在分段重试（图片/视频）或场景图片生成失败时，把生成器返回的原始错误原因（如余额不足、限流、API Key 缺失、内容审核）原样上抛给调用方；不得因产物路径缺失等派生错误替换原始原因。失败时 SHALL 保留旧媒体、清理本次尝试产物，并把 failed 状态与原始错误持久化到分段。

#### Scenario: 图片生成器返回失败结果

- **WHEN** 用户点击「重试图片」，图片生成器返回 `{ code: -1, message: '余额不足' }`
- **THEN** IPC 返回的 message 包含「余额不足」，分段保留旧媒体且状态为 failed，原始错误持久化到分段 error 字段

#### Scenario: 图片生成成功但分段视频重渲染失败

- **WHEN** 图片生成成功且产物已复制，但分段视频重渲染返回非 0
- **THEN** 重试整体失败并上抛原始渲染错误，本次图片产物与部分视频被清理，旧媒体与旧视频保留

### Requirement: 渲染层错误归一化展示

结果页 SHALL 把分段重试失败的错误文本交给既有通知归一化处理（quota/rate-limit/API Key/权限等已知类别映射到对应本地化文案）；不得固定显示 operation_failed 而丢弃错误文本。未命中任何已知类别的错误 SHALL 回退 operation_failed 通用文案，且不得把内部路径或堆栈暴露给用户。

#### Scenario: 已知失败类别显示具体文案

- **WHEN** 重试图片失败，且错误文本命中余额不足（quota）模式
- **THEN** 弹窗显示 quota 类本地化文案，而非通用「当前操作未能完成」

#### Scenario: 未映射错误回退通用文案

- **WHEN** 重试图片失败，且错误文本不匹配任何已知失败类别
- **THEN** 弹窗回退 operation_failed 通用文案，不展示内部路径或堆栈

### Requirement: 主进程失败日志痕迹

主进程 SHALL 在分段重试 IPC 失败时记录 warn 级日志，包含错误 message，为故障诊断保留痕迹。

#### Scenario: 重试失败产生日志

- **WHEN** `story2video:retry-segment` 调用抛错
- **THEN** 日志出现 warn 级记录，且内容包含错误 message
