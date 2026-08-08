# openspec-integration Specification

## Purpose
TBD - created by archiving change openspec-integration. Update Purpose after archive.
## Requirements
### Requirement: 三层机制分工
系统开发流程 SHALL 由三层机制分工协作：CCG 负责决策/执行编排（复杂度/风险评估、双模型分析审查、task.json 生命周期），质量节拍负责流程门禁（Phase 0-5 阶段检查、7 步日常循环、QM-1~4），OpenSpec 负责规格工件（change 生命周期与 specs 真相源）。三层职责不得相互替代。

#### Scenario: 新任务进入时按层路由
- **WHEN** 一个新任务进入开发流程
- **THEN** 先由 CCG 评估复杂度与风险，再由质量节拍确定所处 Phase 与门禁，M+/中高风险任务创建 OpenSpec change 承载规格

#### Scenario: 规格真相源唯一
- **WHEN** 需要确认某能力的需求定义
- **THEN** 以 `openspec/specs/<capability>/spec.md` 为准，CCG 的 requirements.md 与质量节拍的 PRD 不重复定义规格内容

### Requirement: OpenSpec change 生命周期
规格层 SHALL 遵循 spec-driven schema 的 change 生命周期：proposal（Why）→ design（How）→ specs（What）→ tasks（执行清单）→ apply（合入 specs/）→ archive（归档）。artifacts 必须按依赖顺序生成（proposal 先行，design/specs 依赖 proposal，tasks 依赖 design+specs）。

#### Scenario: 创建 change
- **WHEN** 规格层启用且用户提出需求
- **THEN** 执行 `openspec new change <kebab-case-name>`，并按 `openspec instructions <artifact> --change <name>` 的模板与依赖顺序生成 proposal.md、design.md、specs/**/spec.md、tasks.md

#### Scenario: 批准并应用
- **WHEN** change 的 design 与 specs 经质量节拍 Phase 1 评审通过且 tasks 就绪
- **THEN** 执行 apply 将规格合入 `openspec/specs/`，变更进入可追踪状态

#### Scenario: 完成后归档
- **WHEN** change 对应的实现已通过质量节拍 Phase 2-3 门禁（测试/审查/CI）
- **THEN** 执行 `openspec archive <change-name>` 归档，规格保留在 `openspec/specs/` 与 `openspec/changes/archive/`

### Requirement: 适用范围约束
规格层 SHALL 仅对 M+ 复杂度或中高风险任务强制启用；S 复杂度且低风险任务允许跳过 OpenSpec 流程，直接由 CCG + 质量节拍完成，以控制流程开销。

#### Scenario: S/低风险任务跳过规格层
- **WHEN** CCG 评估任务为 S 复杂度且低风险
- **THEN** 不强制创建 OpenSpec change，直接进入 CCG task + 质量节拍日常循环

#### Scenario: M+ 或中高风险任务必须建 change
- **WHEN** CCG 评估任务为 M+ 复杂度或中/高风险（auth/数据库/API 契约/加密）
- **THEN** 必须创建 OpenSpec change 并完成 proposal→design→specs→tasks 全流程后才允许进入实现

### Requirement: 归档三同步
change 完成时 SHALL 三同步归档：OpenSpec archive（规格）、CCG task 归档（执行记录）、质量节拍复盘/learnings（经验沉淀）；git 提交可合并为一次，避免历史噪音。

#### Scenario: 三同步完成
- **WHEN** 一个 change 的实现完成并通过全部门禁
- **THEN** OpenSpec change 归档、对应 CCG task 移入 `.ccg/tasks/archive/<yyyy-mm>/`、质量节拍复盘记录 learnings，三者以同一 commit 提交

### Requirement: 规格层选型决策记录
规格层 SHALL 记录选型决策与备选方案。当前决策：采用 OpenSpec（@fission-ai/openspec CLI，本地化、多 IDE 自动集成、schema 版本化）；备选 GitHub Spec Kit（quality-rhythm-sdd Preset，质量节拍 5.4 已定义但 CLI 未安装）暂不启用，切换时须更新本 spec。

#### Scenario: 查询选型依据
- **WHEN** 后续会话需要了解为何选用 OpenSpec 而非 Spec Kit
- **THEN** 本 Requirement 及其场景提供决策记录与切换条件

