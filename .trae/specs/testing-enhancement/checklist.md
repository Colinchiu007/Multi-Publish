# Checklist

## Task 1: Stryker 变异测试

- [x] `@stryker-mutator/core` 和 `@stryker-mutator/vitest-runner` 已安装到 devDependencies
- [x] `stryker.conf.json` 存在于项目根目录
- [x] `mutate` 配置包含 `electron/services/`、`electron/ipc-handlers/`、`src/stores/`、`src/composables/`
- [x] `testRunner` 配置为 `vitest`
- [x] `thresholds` 配置：high=60, low=50, break=40
- [x] `reporters` 配置包含 `html`（生成可视化报告）
- [x] `stryker-tmp/` 已加入 `.gitignore`
- [x] `reports/mutation/` 已加入 `.gitignore`
- [x] `coverage/` 已加入 `.gitignore`
- [x] `tests/sessions/` 已加入 `.gitignore`
- [x] `package.json` 已添加 `"test:mutation": "stryker run"` script
- [x] `package.json` 已添加 `"test:coverage": "vitest run --coverage"` script
- [x] `npx stryker run` 能正常启动并输出进度
- [x] 变异测试完成后 `reports/mutation/index.html` 存在且可打开
- [x] 变异得分低于 break threshold 时 exit code 非零

## Task 2: 覆盖率门禁

- [x] `@vitest/coverage-v8` 已安装到 devDependencies
- [x] `vitest.config.js` 中已添加 `coverage` 配置块
- [x] `coverage.provider` = `"v8"`
- [x] `coverage.reporter` 包含 `["text", "html", "lcov"]`
- [x] `coverage.thresholds.statements` = 70
- [x] `coverage.thresholds.branches` = 60（核心指标）
- [x] `coverage.thresholds.functions` = 75
- [x] `coverage.thresholds.lines` = 70
- [x] `coverage.include` 限定了关键目录
- [x] `coverage.exclude` 排除了测试/配置文件
- [x] `npm run test:coverage` 正常输出覆盖率摘要
- [x] `coverage/` 目录生成 HTML 报告
- [x] 未达标时 exit code 非零

## Task 3: 用户会话录制

### 代码实现
- [x] `electron/services/user-session-recorder.js` 已创建
- [x] `SessionRecorder` 类包含 `startRecording()` / `recordCall()` / `stopRecording()` / `getSession()` / `replaySession()`
- [x] `BACKLOT_RECORD_SESSION=false` 时所有方法静默返回（零性能开销）
- [x] `recordCall()` 深度克隆 args，防止引用变更
- [x] `recordCall()` 对 Buffer/大型二进制数据截断记录
- [x] `replaySession()` 逐条断言返回值匹配
- [x] `electron/tests/user-session-recorder.test.js` 已创建

### 功能验证
- [x] 录制生成的 JSONL 每行均为有效 JSON
- [x] 回放同一代码版本时成功率 100%
- [x] 录制时不阻塞正常的 IPC 调用
- [x] 多会话文件隔离
- [x] 单元测试全部通过（24 个测试）

## Task 4: 故障注入测试

- [x] `electron/tests/fault-injection.test.js` 已创建
- [x] 使用 `vi.mock` 拦截 `ipcRenderer.invoke`（不依赖真实 Electron）
- [x] 故障注入概率 20%，4 种故障类型均匀分布
- [x] 拒绝故障（throw Error）— 验证不崩溃 + 错误提示
- [x] 超时故障（30s Promise）— 验证超时处理（使用 `vi.advanceTimersByTime`）
- [x] 空值故障（return null）— 验证 null 安全检查
- [x] 格式异常（`{ code:0, data:undefined }`）— 验证 data 不存在时的处理
- [x] BoardService 故障场景已覆盖
- [x] ProjectService 故障场景已覆盖
- [x] ContactSheetService 故障场景已覆盖
- [x] ApprovalGateService 故障场景已覆盖
- [x] ExecutionRecorder 故障场景已覆盖
- [x] Store 故障场景已覆盖（error 状态 + 重试按钮）
- [x] `INJECT_FAULTS=1 vitest run electron/tests/fault-injection.test.js` 全部通过
- [x] 连续运行 3 次结果一致（随机种子固定）

## Task 5: Monkey 测试

- [x] `electron/tests/monkey.test.js` 已创建
- [x] 固定随机种子确保可复现
- [x] 操作空间覆盖所有 IPC channel
- [x] 参数生成器为每个 channel 生成随机有效参数
- [x] 主循环 500 次迭代
- [x] 操作分布：60% 读取 / 30% 写入 / 10% 订阅
- [x] 每次操作后验证结果格式正确（有 `code` 字段或为数组）
- [x] 每次操作后验证不抛出未捕获异常
- [x] 每次操作后验证 Store 状态不进入无效状态（`loading=true` 卡死）
- [x] 失败序列可复现（记录随机种子和索引）
- [x] `vitest run electron/tests/monkey.test.js` 全部通过
- [x] 连续运行 3 次结果一致

## Task 6: 集成

- [x] `package.json` 中已添加 `"test:quality"` script
- [x] `package.json` 中已添加 `"test:fault"` script
- [x] `package.json` 中已添加 `"test:monkey"` script
- [x] `npm run test:quality` 能正常执行全部测试
- [x] 所有 5 个工具的测试在 CI 环境中可运行