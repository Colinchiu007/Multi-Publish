## Context

AGENTS.md PROJECT-003 原规则：所有开发和代码变更必须在分支上进行，禁止直接修改 main。实际执行：51/56 最近提交走 PR merge；5 个直接 main 提交均为低风险文档/流程类。分层化可降低纯文档迭代成本，同时保留运行时代码的安全基线。

## Goals / Non-Goals

**Goals:**
- 运行时代码强制分支+PR（保持现状安全基线）
- 纯流程/规格/文档变更允许 main 直接小步提交（openspec/、.ccg/、docs/、scripts/ 工具）
- 契约层（spec）与 AGENTS.md 表述一致

**Non-Goals:**
- 不放松运行时代码的分支与 PR 门禁
- 不代平台提交 AGENTS.md 的 Multica 自动管理块

## Decisions

**D1: 分层边界**
- 强制分支：apps/、packages/ 运行时代码及关联配置/CI 变更
- 允许 main：openspec/、.ccg/、docs/、01-docs/、scripts/ 工具脚本、CHANGELOG、.quality-gates.md 等纯流程文档
- 判断标准：变更是否影响运行行为（产品代码/测试/构建/部署）

**D2: main 直接提交约束**
- 必须可回滚（单文件小步、可 revert）
- 不得与并发会话的脏文件冲突（stage 命名路径）
- 涉及运行时代码的变更即使一行也必须走分支

## Risks / Trade-offs

- [规则被滥用（文档夹带代码）] → 判定以「是否影响运行行为」为准；混入代码的提交按违规处理
- [AGENTS.md 与 spec 双表述漂移] → 以 openspec/specs/openspec-integration/spec.md 为契约真相源，AGENTS.md 仅索引