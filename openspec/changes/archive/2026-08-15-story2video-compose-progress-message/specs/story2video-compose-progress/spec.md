## MODIFIED Requirements

### Requirement: 前端展示 compose 子进度条与文案

前端阶段清单 SHALL 在 compose 阶段 running 时渲染子进度条（含 `data-testid="story2video-stage-compose-progress"`）并展示进度文案：`phase === 'segments'` 且 total>0 时显示「正在合成片段 k/N · p%」；`phase === 'concat'` 时，中文界面优先显示引擎提供的合法非空按块 message，英文界面显示本地化「Concatenating video segments · p%」；message 缺失、空白或非法时两种界面均使用本地化 concat 回退；其余 phase 显示「视频合成 p%」。percent 非法（非有限或越界）或历史 run 无 `compose_progress` 时隐藏子进度条与文案（安全降级）。完成态 summary SHALL 优先于统一 `stage.progress.message`，统一 message SHALL 优先于 legacy compose message。该展示增强不得改变合成执行顺序、FFmpeg 参数或实际合成耗时。

#### Scenario: 合成中显示片段进度
- **WHEN** `context.compose_progress = { phase: 'segments', percent: 39, segmentsDone: 3, segmentsTotal: 5 }` 且 compose 阶段 running
- **THEN** 子进度条显示且宽度为 39%，文案含「正在合成片段 3/5 · 39%」

#### Scenario: concat 分块消息按语言展示
- **WHEN** `context.compose_progress = { phase: 'concat', percent: 88, message: '正在拼接视频片段（分块 3/5）' }` 且 compose 阶段 running
- **THEN** 中文界面显示完整按块 message，英文界面显示本地化 concat 文案，子进度条宽度为 88%

#### Scenario: concat message 缺失或非法时安全回退
- **WHEN** compose 阶段 running 且 concat percent 合法，但 message 缺失、空白或非字符串
- **THEN** renderer 显示对应语言的本地化 concat 百分比文案，不渲染空详情

#### Scenario: 无子进度数据时安全降级
- **WHEN** compose 阶段 running 但 context 无 `compose_progress`（历史 run / 旧数据）
- **THEN** 子进度条与文案不渲染，阶段清单保持原状
