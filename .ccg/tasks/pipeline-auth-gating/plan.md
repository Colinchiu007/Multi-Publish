# 实施计划

1. 更新任务状态与需求合同
2. 补充认证门禁回归测试
3. 实现统一启动认证处理
4. 同步 PRD、变更日志和检查清单
5. 运行测试、构建与 Electron 验证
6. 双模型审查并归档任务

## 文件边界

- `apps/desktop/src/views/CreateView.vue`
- `apps/desktop/src/story2video/story2video-notifications.js`（仅在需要补充通用认证错误映射时）
- 相关 `apps/desktop/src/**/*.test.js`
- `01-docs/PRD.md`
- `01-docs/PRD-video-creation.md`
- `01-docs/review-checklist-enhanced.md`
- `CHANGELOG.md`
- `.ccg/tasks/pipeline-auth-gating/*`

## 非目标

- 不修改模型 provider 数据库、不迁移或提交用户 profile。
- 不新增 Story2Video 权益映射。
- 不改变普通非认证流水线业务逻辑。
