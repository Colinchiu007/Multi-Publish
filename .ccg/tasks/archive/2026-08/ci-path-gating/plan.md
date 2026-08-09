# CI 路径门控 Phase 1 — 实施计划

## 目标
给 3 个无路径过滤的全量 workflow（build / electron-ci / quality-gate）加 `paths-ignore`，
让文档/流程类改动不再触发全套 CI；代码/依赖/CI 配置变化保持全量触发（fail-closed）。

## 设计
- 用 `paths-ignore` 黑名单（非 `paths` 白名单）：只排除「肯定无关」的 11 项文档/流程路径。
- tag 推送不受路径过滤影响（GitHub 官方文档），build.yml 的 v* 发布触发保留。
- canonical 白名单固化为 `.github/scripts/workflow-contract.test.js` 的 `CI_IGNORED_PATHS`，
  三个 workflow × push/pull_request 共 6 处必须与其一致（契约测试守护）。

## 变更文件
- .github/workflows/build.yml
- .github/workflows/electron-ci.yml
- .github/workflows/quality-gate.yml
- .github/scripts/workflow-contract.test.js（新增白名单断言）

## 验证
1. js-yaml 解析 + paths-ignore 内容一致（3 workflow × 2 事件）✅
2. workflow-contract.test.js + autonomous-loop-workflow.test.js 15/15 通过 ✅
3. 双模型审查：antigravity 后端不可用（agy not found，降级）；Claude 第一轮完成，
   Critical 经事实核验排除（无分支保护/无 ruleset），Warnings 修复后重审超时（240s），
   以契约测试 + 本地验证作为已测试 follow-up 证据。
4. push 后 gh run list 确认触发；PR 上观察 CI 结果。
