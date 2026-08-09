# ci-affected-test-selection — 双模型审查记录

## 审查方式
- antigravity：后端不可用（`agy command not found`）→ 降级（与 Phase 1 一致）。
- Claude（codeagent-wrapper --lite，固定 diff）：API 503/未知错误重试超过 20 分钟无产出 → 按机制硬化规则终止并降级。
- 降级证据链（主代理核验）：
  1. affected 闭包：shared-utils 改动 → 仅 shared-utils + desktop（依赖图核验，契约测试守护）
  2. 缓存：同输入二次执行 `Nx read the output from the cache`（冷/热/三跑验证）
  3. 确定性契约：`--parallel=1` 修复 CI 并行抖动；Gate 4 watchdog 完整保留（契约测试断言）
  4. push main 全量回归 vs #435 触发去重：以 MODIFIED delta 更新 ci-quality-gate-parallel spec，feature 分支去重保持
  5. 契约测试 29/29 + gui-ci 31/31 + YAML 全量解析 + openspec validate
- CI 实测：head 6b7f28fc 全绿；quality-gate 日志确认 `TEST_MODE=affected (nx affected -t test --base=origin/main)`。
