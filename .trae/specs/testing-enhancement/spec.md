# 测试质量增强 Spec

## Why

项目已有 **1830 个单元测试**，但实际使用中发现大量 AI 测试未覆盖的 bug。核心问题是：现有测试以"快乐路径"为主，缺少对**边界条件、故障场景、用户误操作、状态累积**的系统化测试。

传统覆盖率（line/statement coverage）只能告诉你"哪些代码被执行了"，但无法告诉你"测试是否真的验证了代码行为"。例如一个 `if/else` 分支即使测试跑过，也可能只覆盖了 `if=true` 的分支而从未测试 `if=false` 的分支。

本规范引入 5 种互补的测试增强手段，形成一个从"发现问题→量化质量→持续验证"的闭环。

## What Changes

### 新增工具一览

| 工具 | 类型 | 价值定位 | 估算 |
|------|------|---------|------|
| **Stryker 变异测试** | 质量分析 | 找出"假测试"——哪些代码虽然测试通过了但实际没测到 | 0.5 天 |
| **覆盖率门禁** | 质量门禁 | CI 强制分支覆盖率 ≥ 60%，低于则阻断 | 0.5 天 |
| **故障注入测试** | 新测试 | 20% IPC 请求随机注入异常，验证容错 | 1 天 |
| **Monkey 测试** | 新测试 | 随机操作 500 次，抓用户操作路径 bug | 1 天 |
| **用户会话录制** | 新服务 | 录制真实操作序列，自动生成测试用例 | 1.5 天 |

### 新增/修改文件清单

```
新增：
  stryker.conf.json                         — Stryker 变异测试配置
  electron/services/user-session-recorder.js — 用户操作录制服务
  electron/tests/fault-injection.test.js     — 故障注入测试
  electron/tests/monkey-test.js             — Monkey 随机测试

修改：
  apps/desktop/package.json                  — +devDeps +4 个 scripts
  apps/desktop/vitest.config.js              — +覆盖率门禁
  .github/workflows/quality-gate.yml         — +变异测试轮次
```

### 新增 npm scripts

```json
{
  "test:quality": "npm run test:mutation && npm run test:fault && npm run test:monkey",
  "test:mutation": "stryker run",
  "test:fault": "INJECT_FAULTS=1 vitest run electron/tests/fault-injection.test.js",
  "test:monkey": "vitest run electron/tests/monkey-test.js",
  "test:coverage": "vitest run --coverage"
}
```

## Impact

| 系统 | 影响 | 说明 |
|------|------|------|
| `package.json` | 修改 | 新增 5 个 devDependencies + 4 个 scripts |
| `vitest.config.js` | 修改 | 新增 coverage 配置块（thresholds） |
| `quality-gate.yml` | 修改 | 新增 mutation 轮次（可选，可后续加） |
| 现有测试 | 无影响 | 全部保持，新增工具是补充而非替换 |
| 现有代码 | 无影响 | 仅新增文件，不修改任何既有代码 |

## Requirements

### Requirement: Stryker 变异测试

The system SHALL run Stryker mutation testing to identify weak tests.

#### Scenario: 运行变异测试
- **WHEN** 执行 `npm run test:mutation`
- **THEN** Stryker 对 `electron/services/*.js`、`electron/ipc-handlers/*.js`、`src/stores/*.js`、`src/composables/*.js` 执行变异
- **AND** 对每个文件的每种变异模式，运行对应测试文件
- **AND** 输出 HTML 报告到 `reports/mutation/` 目录
- **AND** 输出控制台摘要（变异得分）

#### Scenario: 变异得分门禁
- **WHEN** 变异测试完成
- **THEN** 总变异得分 ≥ 50% 为通过，< 50% 为失败（break threshold）
- **AND** 得分 < 60% 显示黄色警告，< 50% 显示红色失败

#### Scenario: 增量改进
- **WHEN** 后续修复了被标记的弱测试
- **THEN** 重新运行变异测试，得分应逐步提升
- **AND** HTML 报告中存活变异数量减少

### Requirement: 覆盖率门禁

The system SHALL enforce minimum coverage thresholds in CI.

#### Scenario: 运行覆盖率报告
- **WHEN** 执行 `vitest run --coverage`
- **THEN** 生成覆盖率报告到 `coverage/` 目录
- **AND** 检查以下门槛：
  - statements ≥ 70%
  - branches ≥ 60%（关键指标——AI 测试最弱项）
  - functions ≥ 75%
  - lines ≥ 70%

#### Scenario: 覆盖率未达标
- **WHEN** 任何门槛未达标
- **THEN** vitest 退出码非零，CI 阻断

### Requirement: 故障注入测试

The system SHALL test application resilience by injecting random failures into IPC calls.

#### Scenario: 随机故障注入
- **WHEN** 执行 `INJECT_FAULTS=1 vitest run electron/tests/fault-injection.test.js`
- **THEN** 每个 IPC invoke 有 20% 概率被拦截并注入故障
- **AND** 故障类型包括：连接拒绝、超时（30s）、返回 null、返回格式异常
- **AND** 每次故障注入后验证渲染进程不崩溃
- **AND** 错误提示信息正确显示给用户

### Requirement: Monkey 测试

The system SHALL perform random UI operations to uncover unexpected interaction bugs.

#### Scenario: 随机操作测试
- **WHEN** 执行 `vitest run electron/tests/monkey-test.js`
- **THEN** 模拟用户在 UI 上执行 500 次随机操作
- **AND** 操作类型包括：点击按钮/链接、输入文字、切换页面、打开弹窗
- **AND** 每次操作后验证页面不崩溃
- **AND** 每次操作后控制台无未捕获错误
- **AND** 操作序列可复现（使用固定随机种子）

### Requirement: 用户会话录制

The system SHALL record real user operation sequences for later replay as tests.

#### Scenario: 录制用户操作
- **WHEN** 用户在设置了 `BACKLOT_RECORD_SESSION=true` 时使用应用
- **THEN** UserSessionRecorder 自动记录所有 IPC invoke 调用序列
- **AND** 记录包含：channel、参数、返回值、时间戳
- **AND** 会话保存到 `tests/sessions/<timestamp>-<label>.json`

#### Scenario: 回放会话为测试
- **WHEN** 执行 `npm run test:replay -- sessions/<file>.json`
- **THEN** 系统按时间顺序重放所有 IPC 调用
- **AND** 验证当前代码的返回结果与录制时一致
- **AND** 输出回放结果（通过/失败数）

## Architecture

### 故障注入架构

```
渲染进程 IPC invoke
  │
  ▼
fault-injection interceptor (在 test 环境激活)
  │
  ├── 随机 20% → 注入故障（拒绝/超时/null/异常格式）
  │     │
  │     ▼
  └── 渲染进程错误处理 → 验证不崩溃 + 显示错误提示
  
  └── 正常 80% → 正常转发到主进程
```

### 会话录制数据流

```
用户正常操作
  │
  ▼
electron-bridge.js (invoke/on 调用)
  │
  ├── (BACKLOT_RECORD_SESSION=true 时激活)
  │     ▼
  │   UserSessionRecorder
  │     │ 记录 { channel, args, result, timestamp }
  │     ▼
  │   tests/sessions/<file>.json
  │
  └── 正常执行
```

## Non-Goals

- 不修改任何现有测试文件（所有新增为独立文件）
- 不修改任何生产代码的行为（录制功能仅在环境变量开启时激活）
- 不引入新的第三方测试框架（全部基于 vitest）
- 不涉及 UI 截图/视觉回归（已有单独的 visual-testing 体系）