# Tasks

## Task 1: Stryker 变异测试集成

### 1.1 安装依赖
- [ ] 执行 `npm install --save-dev @stryker-mutator/core @stryker-mutator/vitest-runner`

### 1.2 创建 `stryker.conf.json`
- [ ] `mutate` 配置：`["electron/services/**/*.js", "electron/ipc-handlers/**/*.js", "src/stores/**/*.js", "src/composables/**/*.js"]`
- [ ] `testRunner` 配置：`"vitest"`
- [ ] `concurrency` 配置：`4`（避免 CPU 过载）
- [ ] `reporters` 配置：`["html", "progress", "clear-text"]`
- [ ] `htmlReporter.baseDir` 配置：`"reports/mutation"`
- [ ] `thresholds` 配置：`{ high: 60, low: 50, break: 40 }`
- [ ] `tempDirName` 配置：`"stryker-tmp"`（在 .gitignore 中忽略）
- [ ] `dashboard.project` 配置：`"github.com/colin-chiu/multi-publish"`

### 1.3 更新 `.gitignore`
- [ ] 添加 `stryker-tmp/`
- [ ] 添加 `reports/mutation/`
- [ ] 添加 `coverage/`
- [ ] 添加 `tests/sessions/`

### 1.4 更新 `package.json` scripts
- [ ] 添加 `"test:mutation": "stryker run"`
- [ ] 添加 `"test:coverage": "vitest run --coverage"`

### 1.5 验证
- [ ] 执行 `npx stryker init` 验证安装（以 dry-run 方式）
- [ ] 确认 `npm run test:mutation` 启动并输出进度
- [ ] 确认 HTML 报告生成到 `reports/mutation/index.html`
- [ ] 确认 exit code 符合 threshold 配置

---

## Task 2: 覆盖率门禁

### 2.1 安装覆盖率依赖
- [ ] 执行 `npm install --save-dev @vitest/coverage-v8`

### 2.2 修改 `vitest.config.js`
- [ ] 在 `test` 配置块中新增 `coverage` 子配置
- [ ] `provider` 配置：`"v8"`
- [ ] `reporter` 配置：`["text", "html", "lcov"]`
- [ ] `thresholds.statements` = 70
- [ ] `thresholds.branches` = 60（核心指标）
- [ ] `thresholds.functions` = 75
- [ ] `thresholds.lines` = 70
- [ ] `include` 配置：`["electron/services/**/*.js", "electron/ipc-handlers/**/*.js", "src/stores/**/*.js", "src/composables/**/*.js"]`
- [ ] `exclude` 配置：`["**/*.test.*", "**/*.spec.*", "vite.config.*", "test-setup.js"]`

### 2.3 验证
- [ ] 执行 `npm run test:coverage`
- [ ] 确认控制台输出覆盖率摘要
- [ ] 确认 `coverage/` 目录生成 HTML 报告
- [ ] 确认各指标数值正确报告

---

## Task 3: 用户会话录制服务

### 3.1 创建 `electron/services/user-session-recorder.js`
- [ ] 实现 `SessionRecorder` 类
- [ ] `constructor()` — 读取 `BACKLOT_RECORD_SESSION` 环境变量，为 false 时完全静默（零性能开销）
- [ ] `startRecording(label)` — 创建新会话，生成 `tests/sessions/<timestamp>-<label>.json`
- [ ] `recordCall(channel, args, result)` — 记录单次 IPC 调用
  - [ ] 记录字段：`channel`、`args`（深度克隆，防止引用变更）、`result`、`timestamp`（相对时间）
  - [ ] args 中如包含 Buffer 或大型二进制数据，只记录 `"[Buffer: ${size} bytes]"`
- [ ] `stopRecording()` — 关闭会话文件，写入结束标记
- [ ] `getSession(sessionId)` — 读取已保存的会话
- [ ] `replaySession(sessionFile, ipcMock)` — 回放会话
  - [ ] 按时间顺序依次调用 `ipcMock.invoke(channel, ...args)`
  - [ ] 逐条断言返回值与录制一致
  - [ ] 返回 `{ passed: N, failed: N, total: N }`
- [ ] 导出 `{ SessionRecorder, recordCall, replaySession }`

### 3.2 创建 `electron/tests/user-session-recorder.test.js`
- [ ] 测试 `recordCall` 写入 JSON 行
- [ ] 测试 `replaySession` 正确回放
- [ ] 测试 `BACKLOT_RECORD_SESSION=false` 时零开销
- [ ] 测试大型参数截断
- [ ] 测试多会话隔离

### 3.3 验证
- [ ] 单元测试全部通过
- [ ] 录制产生的 JSONL 每行均为有效 JSON
- [ ] 回放成功率 100%（对同一代码版本）

---

## Task 4: 故障注入测试

### 4.1 确认测试策略
本测试采用 **全 mock 方式**，不依赖真实 Electron 环境：
- 使用 `vi.mock` 模拟 `ipcRenderer.invoke`
- 在 mock 函数中按 20% 概率注入故障
- 验证 Vue 组件/Store 在故障下的行为

### 4.2 创建 `electron/tests/fault-injection.test.js`
- [ ] 使用 `vi.mock` 拦截所有 IPC invoke
- [ ] 实现故障注入逻辑（概率 20%）：
  - [ ] 拒绝故障（25%）：`throw new Error('Connection refused')`
  - [ ] 超时故障（25%）：`new Promise(resolve => setTimeout(resolve, 30000))`
  - [ ] 空值故障（25%）：`return null`
  - [ ] 格式异常（25%）：`return { code: 0, data: undefined }`
- [ ] 针对重点模块编写测试场景：
  - [ ] **BoardService** 订阅看板时注入故障 → 验证重试/优雅降级
  - [ ] **ProjectService** 扫描项目时注入故障 → 验证空列表返回 + 错误日志
  - [ ] **ContactSheetService** 审批时注入故障 → 验证错误提示
  - [ ] **ApprovalGateService** 获取审批门时注入故障 → 验证 null 安全
  - [ ] **ExecutionRecorder** 录制时注入故障 → 验证不阻断流水线
  - [ ] **Store** 调用 project:list 时注入故障 → 验证 error 状态 + 重试按钮
  - [ ] **Store** 调用 board:subscribe 时注入故障 → 验证 fallback 显示

### 4.3 验证
- [ ] `INJECT_FAULTS=1 npx vitest run electron/tests/fault-injection.test.js` 全部通过
- [ ] 每个故障场景验证了"程序不崩溃"这个核心性质
- [ ] 测试可重复运行（随机种子固定）

---

## Task 5: Monkey 测试

### 5.1 创建 `electron/tests/monkey-test.js`

本测试使用 vitest 运行在 node 环境，**不依赖真实浏览器**。测试策略：
- 通过模拟 IPC 调用序列来模拟用户操作
- 每次操作随机选择 IPC channel 和参数
- 验证每次操作后系统状态一致

- [ ] 定义操作空间（所有可能的 IPC invoke channel 列表）
- [ ] 定义每个 channel 的参数生成器（随机有效参数）
- [ ] 实现主循环（500 次迭代）：
  - [ ] 固定随机种子（`Math.random = seed`）确保可复现
  - [ ] 每次迭代：随机选 channel → 生成参数 → invoke → 验证结果
  - [ ] 验证规则统一（不关心具体返回值，只关心不崩溃）
- [ ] 操作类型覆盖：
  - [ ] 读取操作（list/get/status 等）— 占 60%
  - [ ] 写入操作（create/delete/update 等）— 占 30%
  - [ ] 订阅操作（subscribe/on 等）— 占 10%
- [ ] 验证每次操作后：
  - [ ] 返回结果格式正确（有 `code` 字段或为数组）
  - [ ] 不抛出未捕获异常
  - [ ] Store 状态不进入无效状态（`loading=true` 卡死等）
- [ ] 记录失败序列，方便复现

### 5.2 验证
- [ ] `npx vitest run electron/tests/monkey-test.js` 全部通过
- [ ] 连续运行 3 次结果一致（可复现性）
- [ ] 输出测试统计：总操作数、成功率、每种操作分布

---

## Task 6: 集成与 CI 配置

### 6.1 更新 `package.json` scripts
- [ ] 添加 `"test:quality": "npm run test:mutation && npm run test:fault && npm run test:monkey"`
- [ ] 更新质量门禁脚本或文档

### 6.2 可选：修改 `.github/workflows/quality-gate.yml`
- [ ] 在现有 workflow 中新增 Stryker 变异测试轮次（可选，首次建议本地运行观察）
- [ ] 新增 coverage 报告上传（`actions/upload-artifact`）

### 6.3 文档
- [ ] 在 `AGENTS.md` 或 `README.md` 中记录新增的测试命令和用途

---

# Task Dependencies

```
Task 1 (Stryker) ───── 独立，无前置依赖
Task 2 (Coverage) ──── 独立，无前置依赖
Task 3 (Session Recorder) ─ 独立，无前置依赖
Task 4 (Fault Injection) ─── 独立，无前置依赖
Task 5 (Monkey Test) ─────── 独立，无前置依赖
Task 6 (Integration) ─────── 依赖 Task 1-5 中的脚本定义
```

## 执行顺序

所有 Task 1-5 **完全独立，可并行执行**。Task 6 最后做，把 script 统一加到 `package.json`。

推荐执行顺序：
1. **Task 2（覆盖率门禁）** — 5 分钟，最快见效，CI 立刻开始保护
2. **Task 1（Stryker 变异测试）** — 10 分钟，得到变异报告
3. **Task 4 + 5（故障注入 + Monkey）** — 并行，各 15 分钟
4. **Task 3（会话录制）** — 20 分钟
5. **Task 6（集成）** — 5 分钟