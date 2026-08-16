## ADDED Requirements

### Requirement: 像素子进程必须继承循环启动的 Vite 端口契约

`run-autonomous-e2e.js` 的视觉阶段 SHALL 在执行像素套件子进程（`npm run test:visual:pixel`）时注入 env：`TEST_URL` 等于基于本循环 `TARGET_PORT` 的 `http://127.0.0.1:<port>`，`TEST_PORT` 等于 `TARGET_PORT`，且 SHALL 保留继承全部既有环境变量。像素子进程 SHALL 继续以真实像素门禁与基线对比判定失败，端口注入 SHALL NOT 放宽任何判定。`agent-visual-judge.js` 生成的 judge 报告 SHALL 依赖像素报告包含合法测试结果；因端口错配导致的空报告 SHALL 视为缺陷而非使用者操作错误。

#### Scenario: 循环 5173 时像素套件同端口

- **WHEN** 循环以默认端口 5173 启动 Vite 并进入视觉阶段
- **THEN** 像素套件子进程 env 携带 `TEST_URL=http://127.0.0.1:5173` 与 `TEST_PORT=5173`，各路由真实加载并与基线对比，而非全量连接失败

#### Scenario: 回归测试锁定端口继承

- **WHEN** 契约测试以注入 `execute` 捕获视觉阶段子进程 env
- **THEN** 断言 `TEST_URL` / `TEST_PORT` 与 `TARGET_PORT` 一致，且原环境变量（如 `LLM_PROVIDER`）被保留
