## Context

Multi-Publish 现有两套活跃机制：CCG（AGENTS.md 内嵌：复杂度/风险决策矩阵、双模型并行分析审查、.ccg/tasks task.json 生命周期、Inline/Parallel 实现、归档）与质量节拍（PROJECT-003 + .quality-rhythm：强制触发、Phase 0-5 阶段门禁、7 步日常循环、57 技能路由、QM-1~4）。两者已在约 40 个任务上并行运作。

OpenSpec 此前处于"工具已装、配置残留、零使用"：全局 CLI @fission-ai/openspec@1.5.0、openspec/config.yaml（2026-07-02 随清理提交加入）、.opencode 与用户级 .codex/prompts 的 opsx 技能（1.4.1 生成）；但 openspec/specs|changes|archive 全缺，doctor 判定 unhealthy。

## Goals / Non-Goals

**Goals:**
- 补齐 OpenSpec 项目结构并刷新 Codex 集成（doctor ok）
- 定义并文档化三层分工：CCG（编排）→ 质量节拍（门禁）→ OpenSpec（规格工件）
- 用真实 change 验证 OpenSpec 端到端流程可跑（propose → design → specs → tasks）
- 明确适用范围与归档同步约定，避免流程过载

**Non-Goals:**
- 不替代 CCG 或质量节拍（OpenSpec 只是规格工件层）
- 不做双轨 SDD（OpenSpec 与 Spec Kit 二选一，本次选 OpenSpec）
- 不修改 AGENTS.md（CCG 管理块受保护且当前有未提交修改）、运行时代码、各 worktree
- 不强制 S/低风险任务走规格流程

## Decisions

**D1: 规格层采用 OpenSpec，搁置 GitHub Spec Kit**
- 理由：openspec CLI 1.5.0 已全局安装；init 自动生成 codex/opencode/claude 多 IDE 技能；纯本地无外部依赖；schema 版本化（spec-driven）可演进
- 备选：Spec Kit（quality-rhythm-sdd Preset）——质量节拍 SKILL.md 5.4 已定义但 CLI 未安装（需 uv tool install specify-cli），且 preset 注入的 UI/交互/TDD 规格模板与 OpenSpec 默认模板互补。本次不启用，保留切换可能（决策记录于 spec.md）

**D2: 三层职责切分（避免重叠）**
- OpenSpec specs/ = 规格真相源（要做什么）；CCG task.json currentPhase = 执行状态机（做到哪）；质量节拍 Phase + QM = 门禁放行权（能不能过）

**D3: 触发链**
需求 → CCG 5秒评估（S/M/L + 风险）→ M+/中高风险：质量节拍 Phase 0（/pm PRD 确认）→ OpenSpec /opsx:propose（proposal→design→specs→tasks）→ CCG 建 task 按 tasks.md 实现 → 质量节拍 Phase 2-3（7步日常循环 + QM-1~4 + CI）→ 三同步归档

**D4: 归档三同步 + commit 合并**
OpenSpec archive（规格合入 openspec/specs/）+ CCG archive（.ccg/tasks/archive）+ 质量节拍复盘（learnings）；git commit 合并为一次（如 `chore: archive openspec change + ccg task`）避免历史噪音

## Risks / Trade-offs

- [流程过重，小改动被拖慢] → 适用范围限定：仅 M+/中高风险走规格层；S/低风险直接 CCG + 质量节拍
- [两套 SDD 系统并存（OpenSpec vs Spec Kit）] → 本次决策记录明确二选一；后续若要切换，specs/ 结构可迁移
- [CLI 版本升级后技能漂移] → 技能由 CLI 生成，升级后重跑 `openspec init --tools <ide> --force` 刷新（本次已从 1.4.1 刷新到 1.5.0）
- [AGENTS.md 未记录三机制（受保护）] → 集成规范以 openspec/specs/openspec-integration/spec.md 为真相源，AGENTS.md 后续由用户/CCG 管理块更新