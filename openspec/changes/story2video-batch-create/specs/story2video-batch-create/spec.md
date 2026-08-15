# story2video-batch-create Specification

## Purpose
故事讲述（story2video-compose）批量创作能力：批量队列调度（并行上限、手动互斥）、弹窗交互（标签页/文案/文件）、任务与排队信息展示、历史记录集成与数据校验。

## ADDED Requirements

### Requirement: 批量入口与弹窗
故事讲述流水线详情页 SHALL 提供「批量创作」按钮；点击后打开批量创作弹窗，弹窗内容 SHALL 包含：隐藏的创作模式（固定全自动，不显示）、「视频增强模式」下拉框（选项与故事讲述界面一致：关闭/固定比例/AI 智能选择）、【启动】按钮、队列规则提示文字、可切换标签（输入文案/本地文件）。

#### Scenario: 打开弹窗
- **WHEN** 用户在故事讲述流水线详情页点击【批量创作】
- **THEN** 弹窗打开，展示视频增强模式下拉（默认与当前界面一致）、队列规则提示、输入文案/本地文件标签与【启动】按钮，且不出现创作模式控件

#### Scenario: 视频增强模式联动
- **WHEN** 用户从批量弹窗下拉框选择视频增强模式
- **THEN** 批量任务的 video.mode 使用该选择；未选择时沿用故事讲述界面当前值

### Requirement: 批量输入与校验
批量弹窗 SHALL 支持两种输入来源：输入文案（1-10 条，带「+」新增，最多 10 个文本输入框）与本地文件（选择 .txt/.md 文件，最多 20 个）。批量启动 SHALL 在以下情况 fail closed 拒绝创建：无任何输入；任一文案为空或超过字符上限；任一文件扩展名不在白名单、大小超过 2MB、不可读、内容为空或超过字符上限。

#### Scenario: 文案条数限制
- **WHEN** 用户在输入文案标签下点击「+」使文本输入框数量达到 10
- **THEN** 「+」按钮禁用，提示已达上限；每条文案非空才允许启动

#### Scenario: 文件白名单与数量限制
- **WHEN** 用户在本地文件标签下选择文件
- **THEN** 仅 .txt/.md 文件被接受（文件选择器按扩展名过滤）；已选文件超过 20 个时拒绝并提示

#### Scenario: 校验失败整体拒绝
- **WHEN** 任一输入项校验失败（空文案/超长/非法扩展名/超大/不可读/空内容）
- **THEN** 批量创建返回错误码与失败项明细，不部分入队；UI 展示对应提示

### Requirement: 批量队列调度
批量任务 SHALL 按队列依次运行：批量任务最大并行 2；存在运行中的手动流水线任务时，批量任务同一时间仅运行 1 个；批量任务与手动任务共同遵守引擎全局并发预算（maxConcurrentRuns）。排队中的任务不创建 run，调度到才启动流水线。

#### Scenario: 批量并行上限
- **WHEN** 队列中多个批量任务就绪且无手动任务运行
- **THEN** 最多 2 个批量任务同时运行，其余保持排队状态

#### Scenario: 手动任务互斥
- **WHEN** 有手动流水线任务正在运行
- **THEN** 批量任务最多 1 个同时运行，第二个批量任务保持排队

#### Scenario: 全局预算约束
- **WHEN** 批量任务数 + 手动任务数达到引擎 maxConcurrentRuns
- **THEN** 批量队列停止启动新任务并退避重试，直至引擎有空闲槽位

### Requirement: 批量任务与历史记录
批量任务 SHALL 复用 startOrchestrated 流水线执行链路：每个批量任务是一个标准 story2video-compose run，完成后按现有机制进入历史记录（pipeline:history）。run SHALL 携带 source=batch、batchId、batchItemId 标记；批量 run 不得覆盖手动流水线的 _<name> 索引与 _currentPipeline。

#### Scenario: 批量任务进入历史
- **WHEN** 一个批量任务完成（成功/失败）
- **THEN** 该 run 出现在历史记录中，与手动任务同样展示，可查看阶段进度/结果/错误

#### Scenario: 手动状态隔离
- **WHEN** 批量 run 启动/运行/结束时手动流水线详情页查询状态
- **THEN** 返回手动流水线自身状态（idle 或手动 run 状态），不显示批量 run 状态

### Requirement: 任务与排队信息展示
批量启动后弹窗 SHALL 展示批量任务与排队信息：每项任务来源（文案序号/文件名）、状态（排队中/运行中/已完成/失败/已取消）、运行中任务的 runId 关联进度（阶段名与进度百分比）、失败原因；批次级统计（运行/排队/完成/失败/取消数量）；提供取消排队任务操作（仅未启动的排队项）。弹窗关闭后批量任务 SHALL 继续在后台运行。

#### Scenario: 队列信息轮询
- **WHEN** 批量任务在运行或排队
- **THEN** 弹窗内任务列表与统计信息按固定周期刷新（3 秒），显示每项最新状态

#### Scenario: 取消排队任务
- **WHEN** 用户对排队中的任务执行取消
- **THEN** 该任务标记为已取消且不再启动；运行中任务不提供取消入口

### Requirement: 批量 IPC 契约
主进程 SHALL 提供批量相关 IPC：story2video:batch:create（创建批量）、story2video:batch:status（查询状态）、story2video:batch:cancel（取消排队项）、story2video:pickBatchFiles（文件选择器）。所有响应 SHALL 使用统一 { code, message?, data? } 包裹，校验类错误带 errorCode 与 errorParams。

#### Scenario: 创建批量
- **WHEN** renderer 调用 story2video:batch:create 且校验通过
- **THEN** 返回 { code:0, data:{ batchId, items:[...] } }，批量进入队列并开始调度

#### Scenario: 查询状态
- **WHEN** renderer 调用 story2video:batch:status
- **THEN** 返回所有批次及其任务状态、统计、失败原因；无批次时返回空数组

#### Scenario: 取消批量项
- **WHEN** renderer 调用 story2video:batch:cancel 指定批次与排队项
- **THEN** 排队项标记为已取消并返回取消数量；不存在的批次返回 BATCH_NOT_FOUND

### Requirement: 文案与本地化
批量创作的用户可见文案 SHALL 成对维护于 locales（zh.js/en.js），包含：按钮、弹窗标题、标签、提示文字（队列规则、并行上限、手动互斥）、状态标签、错误提示；渲染端不得硬编码用户可见中文字符串。

#### Scenario: 中英文切换
- **WHEN** 界面语言在 zh/en 间切换
- **THEN** 批量创作按钮、弹窗、状态与错误提示全部随语言切换，无未翻译文案
