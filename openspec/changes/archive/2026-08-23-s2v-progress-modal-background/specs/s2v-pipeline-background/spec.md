## MODIFIED Requirements

### Requirement: 启动即后台

当编排流水线启动接口返回合法 runId 且 outcome 未完成、未失败时，系统 SHALL 在创作页前台跟踪该 run，并在统一进度弹窗中展示阶段状态；主进程 run 继续执行。用户点击【后台运行】或进度弹窗右上角关闭后，renderer SHALL 停止当前运行轮询、关闭弹窗并恢复启动初始态，且不得调用 pipelineCancel。用户未主动脱离时，完成/失败终态 SHALL 沿用既有结果处理。

#### Scenario: 启动成功前台展示
- **WHEN** pipelineStartOrchestrated 返回 code=0、success=true、非空 runId 且 run 未完成/失败
- **THEN** 创作页保留该 run 的前台跟踪，统一进度弹窗显示阶段信息，底部运行控制区显示暂停、后台运行和取消等当前可用动作

#### Scenario: 启动响应无效
- **WHEN** 启动响应缺少非空 runId 或 success=false
- **THEN** 不执行前台挂载或后台清理，不调用取消，按现有错误流程显示失败提示

#### Scenario: 用户主动后台化
- **WHEN** 用户点击【后台运行】或进度弹窗右上角关闭
- **THEN** renderer 停止轮询、关闭弹窗、恢复【启动流水线】初始态并显示后台提示，主进程 run 继续执行且历史记录可查看

### Requirement: 历史续跑前台展示

当历史任务卡片的【继续】或【从断点继续】成功恢复并进入 running 时，系统 SHALL 进入创作页前台跟踪语义并打开统一进度弹窗；用户离开、点击【后台运行】或关闭弹窗后，任务 SHALL 继续在主进程后台执行。恢复结果 paused=true 且属于人工 checkpoint 时 SHALL 进入对应交互面板。

#### Scenario: 失败任务从断点继续
- **WHEN** pipelineResumeOrchestration 对失败任务返回成功且 paused 不为 true
- **THEN** 任务进入创作页，显示统一进度弹窗并建立前台观察，历史记录继续反映最新阶段

#### Scenario: 已运行任务点击继续
- **WHEN** 运行中历史任务返回幂等 alreadyRunning=true
- **THEN** 不重复创建 run，创作页仅挂载同一 run 的前台观察，不重复创建多个轮询器

#### Scenario: 分镜素材选择恢复
- **WHEN** 历史任务恢复返回 success=true、非空 runId、paused=true 且 checkpoint 为 scene_asset_selection
- **THEN** 创作页进入素材选择交互，进度弹窗保留等待语义和候选素材操作，不提供后台运行按钮

### Requirement: 人工检查点保留交互

当恢复结果 paused=true 且 checkpoint 类型为 scene_asset_selection 时，系统 SHALL 进入素材选择交互面板；不得把等待用户输入的任务标记为可后台化的普通运行任务。内容政策 checkpoint SHALL 保留修订文案和取消路径。

#### Scenario: 分镜素材选择恢复
- **WHEN** 历史任务恢复返回 success=true、非空 runId、paused=true
- **THEN** 创作页进入流水线交互视图，加载候选素材，状态保持 paused，等待用户确认后再推进

#### Scenario: 人工检查点禁止关闭与后台化
- **WHEN** `checkpoint.type/reason` 为 `scene_asset_selection` 或 `content_policy`，或状态枚举为 `waiting_approval` / `needs_user_input`
- **THEN** 进度弹窗保留检查点提示和用户操作，右上角关闭按钮 disabled，不显示【后台运行】；用户完成确认、修改内容或取消后才离开该状态

### Requirement: 历史显示

历史任务卡片在 status=running 时 SHALL 显示运行阶段、阶段进度、更新时间和运行状态；用户已关闭前台进度弹窗的 run SHALL 继续在历史记录中可见。历史刷新 SHALL 读取主进程快照，不依赖创作页是否挂载该 run。

#### Scenario: 运行中卡片显示后台状态
- **WHEN** 历史快照中的任务 status=running
- **THEN** 卡片显示运行提示、当前阶段、阶段进度、更新时间和“继续生成”操作

### Requirement: 数据与并发安全

前台跟踪、后台脱离与历史续跑 SHALL 使用非空字符串 runId；后台操作 SHALL 不调用 pipelineCancel，不释放并发槽位；并发上限仍由主进程统一校验；新增文案 SHALL 在 zh/en locale 成对维护。普通非编排流水线若没有稳定 run identity，系统 SHALL 不伪造按单任务恢复或取消能力。

#### Scenario: 后台运行保持并发占用
- **WHEN** 用户从前台进度弹窗点击后台运行或关闭按钮
- **THEN** 主进程继续持有该 run 的并发槽位，renderer 不调用 pipelineCancel，历史刷新仍能读取该 run

#### Scenario: 普通流水线缺少 run identity
- **WHEN** 非编排流水线仅能按流水线名称返回状态且启动响应不含稳定 runId
- **THEN** 系统只统一进度显示和生命周期清理，不为该任务提供伪造的 run-scoped 恢复或取消动作

### Requirement: 回归测试

实现 SHALL 覆盖启动前台弹窗、右上关闭与后台按钮、历史运行中重挂、人工 checkpoint、无效 runId、过期响应丢弃、取消路径未回归和普通流水线 identity 边界。

#### Scenario: 回归矩阵完整
- **WHEN** 执行 CreateView、UiModal 和 StageProgress 回归测试
- **THEN** 测试覆盖启动成功/无效响应、后台化不取消、关闭策略、人工 paused 检查点、异步竞态、终态处理和普通流水线安全降级
