## Context

本次试点经验（2026-08-08）暴露的机制缺口：
1. 规格化未先做差异审计 → change 覆盖约 15 项已交付功能（PR #352）
2. CCG task.json 停在 analysis 但远程已合并 → 重复工作
3. 4 个探子全部 403（子代理后端不可用）→ 等待浪费，需快速降级
4. change tasks 与 CCG task 双进度并行 → 漂移风险
5. AGENTS.md 无 OpenSpec 引导 → 新会话不可发现

## Goals / Non-Goals

**Goals:**
- 把 5 条机制要求固化为 openspec-integration spec 的 REQUIREMENTS（经本 change delta 合入主 specs）
- 提供 scripts/openspec-sync-check.js 作为归档三同步的自动检查工具
- 记录 AGENTS.md CCG 块补丁建议（由用户/CCG 工具执行，本 change 不直接编辑）

**Non-Goals:**
- 不修改 AGENTS.md CCG 管理块（受保护）
- 不实现子代理健康探测脚本（属 CCG 编排规则，记录建议即可）
- 不重写 OpenSpec CLI

## Decisions

**D1: 差异审计前置**
- propose 阶段第一步：读取 task 基线 + `git log origin/main` 合并记录 + 关键源码，产出「已交付/待办/待确认」三栏，再写 proposal/specs
- 依据：本次 26 项中约 15 项已交付，未审计导致重复规格化

**D2: 进度单一来源**
- change tasks.md = 实现进度唯一来源（checkbox 解析）
- CCG task.json 仅承载 currentPhase/risk/status，并记录 openspecChange 关联；不维护第二套任务清单

**D3: 归档三同步自动检查**
- scripts/openspec-sync-check.js：扫描 .ccg/tasks/**/task.json 的 openspecChange 关联 + openspec/changes 状态；对「task completed 但 change 未 archive」输出警告并返回非零
- 可手动运行；pre-push hook 是否接入由用户决定（避免默认改 hook 造成流程噪音）

**D4: M+/中高风险模板化**
- CCG 评估为 M+ 或中/高风险 → 任务创建时同步执行 `openspec new change`（模板动作，不依赖记忆）

**D5: 场景↔测试映射**
- 每个 spec Scenario 在 tasks.md 中映射到测试文件/用例；archive 前用 `openspec validate` + 人工核对可追踪性

## Risks / Trade-offs

- [检查脚本误报] → 只对「task completed 且 openspecChange 关联存在但 change 未 archive」警告；无关联任务跳过
- [AGENTS.md 补丁滞后] → spec 固化先行（本 change），CCG 块更新作为独立后续
- [规则过多导致流程过重] → 5 条均为流程契约，不增加运行时代码复杂度；适用范围仍受 openspec-integration 既有 Requirement 约束（S/低风险跳过）