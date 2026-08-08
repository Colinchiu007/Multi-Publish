# OpenSpec 落地 + 三机制分工

## 需求
1. 完整初始化 OpenSpec（此前仅 config.yaml，doctor unhealthy）
2. 刷新 Codex 集成到 1.5.0（项目级 .codex/skills + 用户级 prompts 已备份）
3. 用真实 change 验证 propose→design→specs→tasks 端到端可跑
4. 文档化三机制分工：CCG（编排）/ 质量节拍（门禁）/ OpenSpec（规格工件），真相源为 openspec/specs/openspec-integration/spec.md

## 验收
- [x] openspec doctor → ok
- [x] openspec list → openspec-integration 4/4 artifacts complete
- [x] git 提交限定路径（openspec/ + .ccg/tasks/openspec-adoption/），不碰 AGENTS.md/worktrees
- [x] CCG task 归档

## 关键决策
- 规格层二选一：采用 OpenSpec，搁置 Spec Kit（quality-rhythm-sdd Preset），避免双轨
- 适用范围：仅 M+/中高风险走规格层；S/低风险直接 CCG+质量节拍