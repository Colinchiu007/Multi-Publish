## 1. 规格与实现

- [x] 1.1 参数化 `start-mp-task.ps1`（-WorktreeRoot/-GitBash/MP_WORKTREES/MP_GIT_BASH）
- [x] 1.2 参数化 `mp-worktree-health.ps1`（-WorktreeRoot/-GitPath/报告字段）
- [x] 1.3 参数化 `guard-shared-root-writes.ps1` 与 `install-session-isolation-task.ps1`（-GitPath）
- [x] 1.4 `gwm-task.sh` / `session-cleanup.sh` / `fix-worktree-node-modules.sh` 默认根推导
- [x] 1.5 `scripts/hooks/pre-commit` worktree 提示去硬编码
- [x] 1.6 新增 `scripts/bootstrap-write-guard.ps1`
- [x] 1.7 自检覆盖 `-WorktreeRoot` 健康检查

## 2. 文档与分发

- [x] 2.1 更新 `docs/session-isolation-automation.md`
- [x] 2.2 更新 `.quality-rhythm/SKILL.md`
- [x] 2.3 更新 `.quality-rhythm/integrations/README.md` 与 `env-checklist.md`
- [x] 2.4 更新 `AGENTS.md` 硬编码路径描述

## 3. 验证与交付

- [x] 3.1 PowerShell AST 解析全部改动脚本
- [ ] 3.2 两个会话隔离自检测试通过
- [ ] 3.3 bootstrap 幂等运行通过且健康检查 ok=true
- [x] 3.4 `openspec validate --strict` 通过
- [ ] 3.5 分两笔提交并记录 origin/main 差异