## Why

`run-autonomous-e2e.js` 视觉阶段以子进程执行像素套件（`npm run test:visual:pixel`），但未把本循环启动的 Vite 端口传给子进程：子进程 `run-pixel-tests.js` 默认回退 `http://127.0.0.1:5174`（`test-runner.js:39`），而循环在 5173 起服务（`TARGET_PORT` 默认 5173）→ 17/17 路由全部连接失败、像素报告为空 → `agent-visual-judge.js` 因「无任何测试结果」exit 1 → VISUAL_FAIL 噪音。本次 dispatch run 31943071353 实证：11:00:00.7 启动像素 → 11:00:05.1 即 17 个失败（约 4 秒），且上传的 `report-*.json` 为空结果；修复后本地同套件 13/17 通过、剩 4 个真实小差异并生成 diff 图。

## What Changes

- `packages/ai-autonomous-tester/scripts/run-autonomous-e2e.js`：视觉阶段像素子进程注入 `env = { ...process.env, TEST_URL, TEST_PORT: TARGET_PORT }`，仅扩子进程，不触碰像素门禁判定逻辑。
- `packages/ai-autonomous-tester/tests/autonomous-e2e-result.test.js`：新增回归用例，断言像素子进程 env 携带与 `TARGET_PORT` 一致的 `TEST_URL`/`TEST_PORT` 且保留原环境变量。
- 不修改 workflow YAML、不改变降级语义、不放松真实像素失败。

## Capabilities

### Modified Capabilities

- `ci-autonomous-loop`: 像素子进程端口继承契约（解决 5174/5173 错配导致的系统性秒挂与空报告）。

## Impact

- `packages/ai-autonomous-tester/scripts/run-autonomous-e2e.js`
- `packages/ai-autonomous-tester/tests/autonomous-e2e-result.test.js`
- `openspec/specs/ci-autonomous-loop/spec.md`（新增 1 Requirement）
- 行为保持：PR 只读契约、LLM 供应商配置、降级条件均不变；配置 LLM key 后循环将呈现真实像素差异而非连接失败。
