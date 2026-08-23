## 1. 规格工件

- [x] 1.1 proposal.md（Why/What/Capabilities/Impact）
- [x] 1.2 design.md（方案选型：workflow 层分类 vs runner 退出码；降级判定）
- [x] 1.3 specs/ci-autonomous-loop/spec.md（派发 label 契约 + 降级语义 + fail-closed + 测试锁定）

## 2. 实现

- [x] 2.1 创建 `autonomous-loop` label（远端，gh label create）
- [x] 2.2 `.github/workflows/autonomous-loop.yml` Report final status 降级分类（LOOP_REPORT_DIR 可覆盖）
- [x] 2.3 `.github/scripts/autonomous-loop-workflow.test.js` 四象限契约用例 + 既有用例保持
- [x] 2.4 `.ccg/tasks/autonomous-loop-dispatch-fix/task.json` 关联 openspecChange

## 3. 验证与交付

- [x] 3.1 `node --test` 契约测试（autonomous-loop-workflow + agent-review-gate）全绿
- [x] 3.2 `openspec validate` + `scripts/openspec-sync-check.js` 通过
- [x] 3.3 双模型审查（antigravity/claude 降级则记录）
- [x] 3.4 推送 codex/autonomous-loop-dispatch-fix → PR → CI 全绿 → 合并回 main
- [x] 3.5 三同步归档（openspec archive + CCG task 归档 + .quality-gates.md 记录）
