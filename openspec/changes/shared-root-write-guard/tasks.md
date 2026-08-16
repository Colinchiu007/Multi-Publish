## 1. 规格与任务

- [x] 1.1 创建 OpenSpec change `shared-root-write-guard`
- [x] 1.2 生成 proposal/design/specs/tasks 四件套
- [x] 1.3 创建 CCG task `shared-root-write-guard` 并关联 openspecChange

## 2. 写保护实现

- [ ] 2.1 新增 `scripts/guard-shared-root-writes.ps1`：watcher + 单次处理函数 + 隔离/恢复/日志
- [ ] 2.2 新增 `scripts/session-write-guard.test.ps1`：临时 git 仓库确定性测试
- [ ] 2.3 扩展 `scripts/install-session-isolation-task.ps1`：注册/移除 Write Guard 任务
- [ ] 2.4 扩展 `scripts/mp-worktree-health.ps1`：报告 writeGuard 状态并支持 -RequireWriteGuard
- [ ] 2.5 更新 `docs/session-isolation-automation.md`

## 3. 验证

- [ ] 3.1 PowerShell 语法解析通过
- [ ] 3.2 `session-write-guard.test.ps1` 全绿
- [ ] 3.3 `session-isolation-automation.test.ps1` 全绿（扩展后断言）
- [ ] 3.4 `openspec validate shared-root-write-guard --strict` 通过
- [ ] 3.5 真实注册计划任务并启动 watcher，验证隔离动作与健康报告
- [ ] 3.6 提交 main 并归档 OpenSpec + CCG task
