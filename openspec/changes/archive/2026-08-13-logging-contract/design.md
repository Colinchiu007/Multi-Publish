## Context

日志体系 7 项加固（#658/#659/#664/#678/#684/#689/#696）已合并：脱敏同源、requestId、loguru 桥接、保留策略、容器轮转均落地。当前缺口是**契约文档化**（审计 P2 #14）：缺少统一 level/脱敏/字段/保留的权威出处，3 处 JS 内联脱敏存在漂移风险。

## Goals / Non-Goals

**Goals:**
- 单一权威合同 `01-docs/LOGGING-CONTRACT.md`（人读）+ `.ccg/spec/observability/index.md`（代理读）（R1-R5）
- 契约防漂移测试：3 处 JS 脱敏同源断言（含替换串）+ level 默认断言 + 保留/截断常量断言 + 文档↔代码一致性（R1-R5 覆盖）
- OpenSpec 契约化并归档

**Non-Goals:**
- 不改任何运行时日志行为（已有 spec 各自约束）
- 不引入第三方日志库（保持零依赖）
- 不实施 C5 跨进程 traceId（另一 P2 项，单独 change）

## Decisions

**D1: 合同分三层落地**
人读（01-docs）→ 代理读（.ccg/spec/observability）→ 契约化（openspec spec）。01-docs 为权威细节，.ccg/spec 为精简约束，spec 提供 Requirements/Scenarios 供 CI 与归档。

**D2: 防漂移测试放 shared-utils vitest**
无 electron 依赖、可跨包 fs 读 3 处 JS 脱敏源 + python logging_setup + 合同文档断言。先例：`logto-deploy-contract.test.js`（api-publish-engine 读 deploy/ 跨目录）。

**D3: 断言锚定常量而非行为**
已有各设施测试覆盖行为（脱敏/轮转/保留单测齐全）；契约测试只锚定"同源性与常量一致性"，避免重复覆盖。

**D4: 静默边界显式文档化**
remotion/story2video 引擎库、pre-Vue 入口失败、runSelfCheck 排队被拒观测盲区等已知静默区，在合同中标注为"文档化边界"而非"待修缺陷"。

## Risks / Trade-offs

- [文档漂移] → 契约测试断言文档常量与代码一致，CI 门禁兜底。
- [测试脆弱（fs 读源码）] → 断言锚定稳定模式标记（正则字面量/常量名），非行号。
- [重复覆盖] → 明确只做同源/常量断言，行为测试归各设施既有测试。

## Migration Plan

- 单 PR 合并即生效；无运行时迁移；回滚 = revert。
