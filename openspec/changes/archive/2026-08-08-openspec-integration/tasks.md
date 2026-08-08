## 1. OpenSpec 完整初始化

- [x] 1.1 备份用户级 Codex prompts（C:\tmp\codex-openspec-backup-20260808-215314）
- [x] 1.2 运行 `openspec init --tools codex --force` 补齐 openspec/specs、changes、changes/archive
- [x] 1.3 验证 `openspec doctor` 为 ok、`openspec list` 正常返回

## 2. 规格工件（本 change）

- [x] 2.1 创建 change `openspec-integration`（spec-driven schema）
- [x] 2.2 按依赖顺序生成 proposal.md、design.md、specs/openspec-integration/spec.md、tasks.md
- [x] 2.3 验证 `openspec status --change openspec-integration` 全部 artifact ready

## 3. CCG 任务记录与归档

- [x] 3.1 创建 .ccg/tasks/openspec-adoption/task.json（S/低风险）
- [x] 3.2 完成验收：openspec doctor ok + status 就绪 + git 提交 ca604dd2（限定路径，不碰 AGENTS.md/worktrees）
- [x] 3.3 CCG task 归档至 .ccg/tasks/archive/2026-08/ 并提交