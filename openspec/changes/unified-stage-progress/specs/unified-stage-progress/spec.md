# Spec: 统一阶段进度契约

## Requirement: stage.progress 统一模型

系统 SHALL 在 stage 对象上维护 `progress` 字段，结构为 `{ percent: number(0-100), message: string, updatedAt: string(ISO) }`。

### Scenario: 阶段执行中写入 progress
- **WHEN** 任何阶段正在执行且有可量化进度
- **THEN** `stage.progress` SHALL 包含合法 percent（0-99）、非空 message 和 updatedAt

### Scenario: 阶段完成后 progress 归零
- **WHEN** 阶段状态变为 completed
- **THEN** `stage.progress` SHALL 被清除（设为 null），由 stage-detail 展示完成摘要

### Scenario: 旧数据兼容
- **WHEN** `stage.progress` 为 null 或 undefined
- **THEN** 前端 SHALL fallback 到 `orchestrationContext[stage.name + '_progress']` 读取进度

## Requirement: StageExecutor onProgress 通道

系统 SHALL 为 `StageExecutor.execute` 提供统一的 `onProgress` 上报通道。

### Scenario: _executeStage 注入 onProgress
- **WHEN** `_executeStage` 执行任意阶段
- **THEN** SHALL 注入 `onProgress` 回调到 `fullStage.onProgress`，回调写入 `stage.progress` + `context[stage.name + '_progress']`

### Scenario: onProgress 异常不阻断
- **WHEN** `onProgress` 回调抛出异常
- **THEN** 异常 SHALL 被 catch，阶段执行继续，progress 保持上次值

### Scenario: 归一化校验
- **WHEN** `onProgress` 收到 update
- **THEN** SHALL 校验 percent 为 finite number 0-100、message 为非空字符串（限长 200），非法值 fail-closed 丢弃

## Requirement: 各阶段接入

### Scenario: optimize 运行中显示进度
- **WHEN** optimize 阶段执行中
- **THEN** SHALL 上报 `{ percent: Math.round(done/total*100), message: '正在优化第 M/N 个场景' }`

### Scenario: publish 逐平台进度
- **WHEN** publish 阶段逐平台发布中
- **THEN** SHALL 上报 `{ percent: Math.round(i/total*100), message: '正在发布到 {平台} (i/N)' }`

### Scenario: split 完成摘要
- **WHEN** split 阶段完成
- **THEN** SHALL 写入 `stage.summary = '拆分为了 N 个场景'`

### Scenario: select_video_scenes 运行中
- **WHEN** select_video_scenes 阶段执行中
- **THEN** SHALL 上报 `{ percent: 0, message: '正在生成 AI 视频场景…' }`（视频生成耗时长，至少提供状态文案）

## Requirement: 总进度加权计算

### Scenario: 加权进度
- **WHEN** 计算流水线总进度
- **THEN** SHALL 使用 `已完成阶段数/总阶段数*100 + 当前阶段percent/总阶段数` 公式，结果 round 到整数

### Scenario: 当前阶段无 progress
- **WHEN** 当前阶段 stage.progress 为 null
- **THEN** SHALL fallback 到阶段数占比（与当前行为一致）
