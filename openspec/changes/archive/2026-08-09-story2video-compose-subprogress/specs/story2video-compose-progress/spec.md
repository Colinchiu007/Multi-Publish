## Purpose

图片轮播流水线（story2video-compose）「视频合成（compose）」阶段在启动后的进度状态中展示独立的子百分比进度条与阶段文案，让用户感知逐场景合成、拼接、旁白合并、可选 BGM/转码与校验的实时进度，与 optimize（场景 x/y）、generate_assets（图片/旁白 x/y）的子进度模式对称。

## ADDED Requirements

### Requirement: compose 阶段发射子进度数据

系统 SHALL 在 compose 阶段执行期间通过 `context.compose_progress` 提供子进度数据，包含阶段（phase）、百分比（percent）、已完成片段数（segmentsDone）与总片段数（segmentsTotal）。percent 为 0-100 整数且单调不降；阶段权重为：preflight 0 → validated 3 → segments 3+72·k/N（k 为已完成片段数，k=N 时精确 75）→ concat 87 → narration 89 → bgm 92（可选）→ webm 95（可选）→ verify 98 → done 100。

#### Scenario: 逐片段合成时发射片段进度
- **WHEN** compose 引擎完成第 k 个视频片段（共 N 个）
- **THEN** `compose_progress.phase === 'segments'`、`segmentsDone === k`、`segmentsTotal === N`、`percent === min(75, 3 + 72·k/N)` 且不小于上次发射值

#### Scenario: 成功完成发射 done
- **WHEN** compose 引擎全部步骤成功并即将返回 `code === 0`
- **THEN** 发射 `phase === 'done'`、`percent === 100`

### Requirement: compose 阶段失败路径不得发射成功信号

任何 compose 失败路径（片段生成失败、拼接失败、旁白合并失败、BGM 混音失败、WebM 转码失败、输出校验失败、会话清理/持久化失败）SHALL 冻结 percent 在最后有效值且绝不发射 `done/100`；`percent === 100` 必须与合成成功（`code === 0`）一一对应。

#### Scenario: 片段生成失败冻结进度
- **WHEN** 第 i 个视频片段生成失败，引擎提前返回 `code === -1`
- **THEN** 最后一次 `compose_progress.percent` 冻结在 `3 + 72·(i-1)/N`（≤75），不发射 `done`，且后续不再发射新值

### Requirement: 执行器 fail-closed 写入与字段级校验

StageExecutor 的 compose 执行器 SHALL 仅在 `compose_progress` 通过字段级校验后写入 context：phase 为非空已知枚举字符串；percent 为有限数且 [0,100]；segmentsTotal 存在时须为 ≥1 整数；segmentsDone 存在时须为 [0, segmentsTotal] 整数；结构为纯原始值对象（IPC structuredClone 安全）。任一字段非法则丢弃该次更新（fail-closed），不得向 renderer 下发非法值。

#### Scenario: 非法进度值被丢弃
- **WHEN** 引擎回调携带 `percent: NaN` 或 `percent > 100` 或 `segmentsTotal: 0` 或未知 phase
- **THEN** `context.compose_progress` 不被该次回调更新（保持上次合法值或 undefined）

### Requirement: 前端展示 compose 子进度条与文案

前端阶段清单 SHALL 在 compose 阶段 running 时渲染子进度条（含 `data-testid="story2video-stage-compose-progress"`）并展示进度文案：`phase === 'segments'` 且 total>0 时显示「正在合成片段 k/N · p%」，其余 phase 显示「视频合成 p%」。percent 非法（非有限或越界）或历史 run 无 `compose_progress` 时隐藏子进度条与文案（安全降级）。文案沿用 `translateWithLocaleFallback` 内联 fallback，不写入 locale 静态文件。

#### Scenario: 合成中显示片段进度
- **WHEN** `context.compose_progress = { phase: 'segments', percent: 39, segmentsDone: 3, segmentsTotal: 5 }` 且 compose 阶段 running
- **THEN** 子进度条显示且宽度为 39%，文案含「正在合成片段 3/5 · 39%」

#### Scenario: 无子进度数据时安全降级
- **WHEN** compose 阶段 running 但 context 无 `compose_progress`（历史 run / 旧数据）
- **THEN** 子进度条与文案不渲染，阶段清单保持原状
