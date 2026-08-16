## 方案对比

- A（选定）：子进程注入 `TEST_URL` / `TEST_PORT` env——零侵入、复用 `execSync` 既有 `env` 选项、与 `test-runner.js` 的 `TEST_URL` 探测契约天然对齐。
- B：修改像素套件默认端口为 5173——影响手动/其他调用语义，默认端口改动面大，拒绝。
- C：改为进程内直调——改动大、破坏视觉阶段子进程隔离与超时控制，拒绝。

## 数据流

`run-autonomous-e2e.js` TARGET_PORT(默认5173) → 起 Vite(5173) → 视觉阶段像素子进程 env 注入 TEST_URL/TEST_PORT → `run-pixel-tests.js` `createRunner` 命中 `process.env.TEST_URL` → 17 路由对基线像素对比 → `agent-visual-judge.js` 读取报告生成 judge-report.md。

## 回归保护

`autonomous-e2e-result.test.js` 新增用例以注入 `execute` 捕获像素子进程 env，断言 `TEST_URL === http://127.0.0.1:${TARGET_PORT}`、`TEST_PORT === TARGET_PORT`、原 env（如 LLM_PROVIDER）保留——锁定端口继承契约，防止未来重构回退到 5174。
