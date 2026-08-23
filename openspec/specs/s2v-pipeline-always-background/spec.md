# s2v-pipeline-always-background Specification

## Purpose
让视频创作编排流水线的运行态统一按后台任务处理：启动成功或历史卡片续跑进入 running 后，主进程继续执行、任务占用并发槽位，renderer 不要求用户额外点击【后台运行】。
## Requirements
### Requirement: 启动即后台

当编排流水线启动接口返回合法 runId 且 outcome 未完成、未失败时，系统 SHALL 将该 run 视为后台运行；renderer SHALL 停止当前运行轮询、恢复启动初始态并刷新历史。系统 SHALL NOT 调用 pipelineCancel。

#### Scenario: 启动成功自动后台
- WHEN pipelineStartOrchestrated 返回 code=0、success=true、非空 runId
- THEN 主进程 run 继续执行，创作页显示【启动流水线】，历史列表显示该任务为运行中/后台运行中，且不需要点击【后台运行】按钮

#### Scenario: 启动响应无效
- WHEN 启动响应缺少非空 runId 或 success=false
- THEN 不执行自动后台清理，不调用取消，按现有错误流程显示失败提示

### Requirement: 历史续跑即后台

当历史任务卡片的【继续】或【从断点继续】成功恢复并进入 running 时，系统 SHALL 保持后台运行语义；不得切换到创作页运行态、不得为该 run 建立 renderer 轮询。

#### Scenario: 失败任务从断点继续
- WHEN pipelineResumeOrchestration 对失败任务返回成功且 paused 不为 true
- THEN 任务留在历史视图，显示后台运行提示与运行中状态，历史列表刷新阶段进度

#### Scenario: 已运行任务点击继续
- WHEN 运行中历史任务返回幂等 alreadyRunning=true
- THEN 不重复创建 run、不挂载创作页、不重复建立轮询，显示后台继续运行提示

### Requirement: 人工检查点保留交互

当恢复结果 paused=true 且 checkpoint 类型为 scene_asset_selection 时，系统 SHALL 进入素材选择交互面板；不得把等待用户输入的任务标记为运行中后台任务。

#### Scenario: 分镜素材选择恢复
- WHEN 历史任务恢复返回 success=true、非空 runId、paused=true
- THEN 创作页进入流水线交互视图，加载候选素材，状态保持 paused，等待用户确认后再推进

### Requirement: 历史显示

历史任务卡片在 status=running 时 SHALL 显示“后台运行中”提示、运行阶段、阶段进度、更新时间和运行状态。历史刷新 SHALL 读取主进程快照，不依赖创作页是否挂载该 run。

#### Scenario: 运行中卡片显示后台状态
- **WHEN** 历史快照中的任务 status=running
- **THEN** 卡片显示后台运行提示、当前阶段、阶段进度、更新时间和“继续生成”操作

### Requirement: 数据与并发安全

自动后台与历史续跑 SHALL 使用非空字符串 runId；后台操作 SHALL 不调用 pipelineCancel，不释放并发槽位；并发上限仍由主进程统一校验；新增文案 SHALL 在 zh/en locale 成对维护。

#### Scenario: 后台运行保持并发占用
- **WHEN** 启动或续跑成功后 renderer 自动释放运行态
- **THEN** 主进程继续持有该 run 的并发槽位，自动后台路径不调用 pipelineCancel，历史刷新仍能读取该 run

### Requirement: 回归测试

实现 SHALL 覆盖启动自动后台、历史失败续跑后台、运行中幂等续跑后台、人工检查点交互、无效 runId 守卫、取消路径未回归等场景。

#### Scenario: 回归矩阵完整
- **WHEN** 执行 CreateView 与历史组件回归测试
- **THEN** 测试覆盖启动成功/无效响应、失败与 running 续跑、人工 paused 检查点、无效 runId、取消未调用和后台显示文案
