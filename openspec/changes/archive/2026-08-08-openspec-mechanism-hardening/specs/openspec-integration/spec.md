## ADDED Requirements

### Requirement: 规格化前差异审计
对既有基线创建 OpenSpec change 时，SHALL 先执行「基线 vs 现状」差异审计：核对 origin/main 已合并的交付记录与关键源码，产出「已交付 / 待办 / 待确认」三栏清单，change 的 proposal/specs/tasks 只承载真实待办与待确认项，禁止重复规格化已交付功能。

#### Scenario: 基线含已交付项
- **WHEN** 任务基线中的需求已由已合并 PR 交付
- **THEN** 对应项在 tasks 中标为 [已交付] 并附证据（file:line / 合并记录），不进入待办实现

#### Scenario: 审计先行
- **WHEN** 为既有基线创建 change
- **THEN** 在写 proposal 之前完成差异审计，审计结论记录于 change 内

### Requirement: 进度单一来源
实现进度 SHALL 以 change tasks.md 的 checkbox 为唯一来源；CCG task.json 只承载执行阶段、风险与 openspecChange 关联，不维护第二套任务清单，避免双进度漂移。

#### Scenario: 进度查询
- **WHEN** 需要确认任务实现进度
- **THEN** 以 `openspec status --change <name>` 为准，CCG task.json 仅反映当前执行阶段

### Requirement: 归档三同步自动检查
系统 SHALL 提供 scripts/openspec-sync-check.js：扫描 .ccg/tasks 下 task.json 的 openspecChange 关联与 openspec/changes 状态，对「task 已 completed 但关联 change 未 archive」输出警告并返回非零；无关联任务不得误报。

#### Scenario: task 完成但 change 未归档
- **WHEN** CCG task status=completed 且 openspecChange 关联存在但对应 change 仍 active
- **THEN** 检查脚本输出该任务并返回非零，提示执行 openspec archive

#### Scenario: 无关联任务
- **WHEN** task.json 无 openspecChange 字段
- **THEN** 检查脚本跳过该任务，不产生警告

### Requirement: M+/中高风险任务建 change 模板化
CCG 评估为 M+ 复杂度或中/高风险的任务，SHALL 在任务创建时同步执行 `openspec new change`，把建 change 作为固定动作而非可选项；S 复杂度且低风险任务不受此约束。

#### Scenario: M+ 任务创建
- **WHEN** CCG 评估任务为 M+ 或中/高风险
- **THEN** 任务创建步骤必须包含 openspec new change，并在 task.json 记录 openspecChange 关联

### Requirement: spec 场景与测试映射
change 的每个 WHEN/THEN 场景 SHALL 在实现时映射到对应测试（单元/集成/E2E），tasks 中标注测试目标；archive 前通过 `openspec validate` 并核对场景可追踪性。

#### Scenario: 场景有测试引用
- **WHEN** 某 spec 场景被实现
- **THEN** tasks.md 对应任务标注测试文件/用例，archive 前可追踪到验证

#### Scenario: 归档前校验
- **WHEN** 执行 openspec archive
- **THEN** 先运行 openspec validate 确认 change 有效，并核对场景-测试映射无遗漏