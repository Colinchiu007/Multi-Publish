# 分支策略契约固化任务

## 1. Spec 契约

- [x] 1.1 创建 change openspec-branch-policy
- [x] 1.2 写入 proposal.md / design.md（分层边界 D1、main 约束 D2）
- [x] 1.3 写入 specs/openspec-integration/spec.md delta（Requirement「分层分支策略」+ 3 场景）
- [x] 1.4 写入 tasks.md 并验证 4/4

## 2. AGENTS.md 同步

- [x] 2.1 修订 AGENTS.md 第 13 行分支隔离条款为分层表述（工作区已改，不随本次提交，避免带入 Multica 自动块）
- [ ] 2.2 由用户/平台决定 AGENTS.md（含 Multica 块）提交时机

## 3. 归档与验证

- [x] 3.1 openspec archive 合入主 specs（openspec-integration → 11 Requirements）
- [x] 3.2 openspec doctor + validate 通过
- [x] 3.3 .quality-gates.md 追加本次执行记录（openspec/ 限定路径提交由后续 commit 完成）