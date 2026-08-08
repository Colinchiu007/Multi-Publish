## Why

OpenSpec 落地与首个 M+/高风险任务试点（story2video-autopilot-tts-localization）暴露出机制缺口：规格化前未做「基线 vs 已合并代码」差异审计导致大量重复规格化；CCG 任务状态滞后于远程交付（task 停 analysis 但 PR #352 已合并）；子代理后端 403 不可用导致探子全灭、等待浪费；change tasks 与 CCG task 双进度并行；AGENTS.md 无引导导致新会话不知 OpenSpec 已启用。

## What Changes

- 固化「规格化前差异审计」：propose 前核对 origin/main 已合并交付，change 只承载真实待办
- 固化「进度单一来源」：change tasks.md 为实现进度唯一来源，CCG task.json 只承载执行阶段/风险，change 记录对应 CCG task id
- 固化「归档三同步检查」：新增 scripts/openspec-sync-check.js 检查 CCG task completed 但关联 change 未 archive
- 固化「M+/中高风险建 change 模板化」：CCG 评估后必须附带 OpenSpec change
- 固化「spec 场景↔测试映射」：每个 WHEN/THEN 场景实现时映射测试，archive 前校验可追踪性
- 记录需用户/CCG 工具执行的 AGENTS.md CCG 块补丁建议（远程同步、子代理降级、OpenSpec 引导）

## Capabilities

### New Capabilities
<!-- 无新 capability，修改现有 openspec-integration 的 REQUIREMENTS -->

### Modified Capabilities
- `openspec-integration`: 追加机制硬化 Requirements（差异审计前置、进度单一来源、归档同步检查、M+ 模板化、场景-测试映射）

## Impact

- 变更：openspec/specs/openspec-integration/spec.md（经本 change delta 合入）、scripts/openspec-sync-check.js（新增工具）、.quality-gates.md（执行记录）
- 不涉及：运行时代码、AGENTS.md（CCG 块受保护，补丁建议另行提供）