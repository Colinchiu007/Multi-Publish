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

### Requirement: 分层分支策略
分支策略 SHALL 分层执行：运行时代码变更（apps/、packages/ 及关联配置/CI）MUST 在 `D:/Data/projects/mp-worktrees/mp-<task-name>` 下的独立 linked worktree 与 `codex/<task-name>` 分支进行，经 PR 审查与 CI 后合并回 main；共享主工作区 MUST 保持在 main，禁止运行时代码任务在共享主工作区切换 feature 分支或修改代码。纯流程/规格/文档变更（openspec/、.ccg/、docs/、scripts/ 工具脚本、CHANGELOG、.quality-gates.md）MAY 在 main 直接小步提交，但 MUST 保持可回滚且不得与并发会话的脏文件冲突。判定以「是否影响运行行为」为准，禁止以文档提交夹带运行时代码。

#### Scenario: 运行时代码必须分支
- **WHEN** 变更涉及产品代码、测试、构建或部署配置
- **THEN** 必须在 D 盘独立 linked worktree 的 codex/ 分支上开发并经 PR 合并回 main，不得在共享主工作区开发或提交

#### Scenario: 纯流程文档允许 main
- **WHEN** 变更仅涉及 openspec/、.ccg/、docs/、工具脚本等纯流程/文档
- **THEN** 允许在 main 直接小步提交，但须 stage 命名路径、不与并发脏文件冲突且可回滚

#### Scenario: 文档夹带代码
- **WHEN** 一次提交同时包含流程文档与运行时代码
- **THEN** 该提交按运行时代码处理，必须拆分并走独立 worktree + 分支 + PR

#### Scenario: 共享主工作区误切 feature 分支
- **WHEN** 任一会话使共享主工作区成功切换到非 main 分支
- **THEN** Git 守卫必须立即检测并恢复 main；恢复失败时必须进入 fail-closed 事故状态并给出精确恢复步骤

