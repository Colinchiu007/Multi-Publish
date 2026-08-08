## Why

Multi-Publish 已有两套活跃机制：CCG（决策/执行编排层）与质量节拍（流程门禁层），但规格工件层是空白——PRD、计划、审查散落为自然语言文档（01-docs/.ccg/tasks），没有变更生命周期状态机、没有可机器查询的 specs 真相源、没有变更可追踪性。OpenSpec 补齐这一层，且项目已有 openspec CLI 1.5.0 与 .opencode 集成残留，补齐成本最低。

## What Changes

- 完整初始化 OpenSpec：补齐 `openspec/specs/`、`openspec/changes/`、`openspec/changes/archive/`（此前仅 config.yaml，doctor 判定 unhealthy）
- 生成 Codex 集成：项目级 `.codex/skills/openspec-*` 5 个技能 + 命令（与既有 `.opencode` 集成并存，刷新到 1.5.0）
- 定义三机制分工并文档化：CCG 负责"怎么分析、谁来做"（多模型编排 + task.json 生命周期）；质量节拍负责"什么节奏、过什么门禁"（Phase 0-5 + QM-1~4）；OpenSpec 负责"规格写成什么、如何追踪"（propose → design → tasks → apply → archive）
- 明确适用范围：仅 M+/中高风险任务走 OpenSpec 规格流程；S/低风险直接 CCG + 质量节拍
- 规格层选型决策：采用 OpenSpec，搁置 GitHub Spec Kit（quality-rhythm-sdd Preset）路线，避免双轨
- 归档三同步约定：OpenSpec archive（规格合入 specs/）+ CCG archive（执行记录）+ 质量节拍复盘（经验沉淀），commit 合并避免历史噪音

## Capabilities

### New Capabilities
- `openspec-integration`: OpenSpec 作为规格工件层与 CCG、质量节拍三层分工的集成规范——适用范围、完整 change 生命周期（propose→design→tasks→apply→archive）、归档同步约定、与既有规范体系（AGENTS.md CCG / PROJECT-003 质量节拍）的边界

### Modified Capabilities
<!-- 无既有 spec（openspec/specs/ 为空），无修改项 -->

## Impact

- 新增/变更：`openspec/`（config.yaml 已存在，新增 changes/specs/archive 目录）、项目级 `.codex/skills/openspec-*`、`.codex/prompts/opsx-*`（用户级）、`.ccg/tasks/openspec-adoption/`（CCG 执行记录）
- 不涉及：运行时代码（apps/packages）、AGENTS.md（受 CCG 管理块保护且有未提交修改）、各 worktree
- 文档化产物：本 change 的 specs/openspec-integration/spec.md 作为集成规范的真相源