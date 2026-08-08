# 机制硬化实现任务

## 1. Spec 契约固化

- [x] 1.1 创建 change openspec-mechanism-hardening（spec-driven schema）
- [x] 1.2 写入 proposal.md（Why/What/Modified Capabilities）
- [x] 1.3 写入 design.md（D1-D5 决策与风险）
- [x] 1.4 写入 specs/openspec-integration/spec.md delta（5 条 ADDED Requirements：差异审计前置/进度单一来源/归档同步检查/M+ 模板化/场景-测试映射）
- [x] 1.5 写入 tasks.md 并验证 openspec status 4/4

## 2. 归档三同步检查工具

- [x] 2.1 新增 scripts/openspec-sync-check.js（扫描 .ccg/tasks 关联 + openspec/changes 状态）
- [x] 2.2 语法校验 node --check + 真实运行（当前 0 警告预期）

## 3. 质量节拍门禁记录

- [x] 3.1 更新 .quality-gates.md 追加本次执行记录（机制硬化）
- [x] 3.2 验证 openspec validate + doctor

## 4. 归档与交付

- [x] 4.1 执行 openspec archive 合入主 specs（openspec/specs/openspec-integration/spec.md +5 Requirements）
- [x] 4.2 git 提交（限定路径：openspec/ + scripts/openspec-sync-check.js + .quality-gates.md）
- [ ] 4.3 输出 AGENTS.md CCG 块补丁建议（远程同步/子代理降级/OpenSpec 引导）供用户决定