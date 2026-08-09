# affected-test-selection Specification

## Purpose
定义 CI 的受影响测试选择与任务缓存契约：分支/PR 事件只执行「git 基线以来受影响」的 workspace 测试（含传递依赖闭包），main 合并与手动触发保留全量回归；任务输入未变化时允许缓存命中跳过，但不得削弱既有确定性测试契约。
## Requirements
### Requirement: 受影响测试选择

CI 在分支/PR 事件上 SHALL 仅执行 git 基线以来受影响的 workspace 测试；受影响集合 SHALL 包含直接改动包及其全部传递依赖者；未受影响 workspace 的测试 SHALL NOT 被执行。

#### Scenario: 单包改动只跑相关测试

- **WHEN** 一个 PR 仅修改 `packages/shared-utils` 下的源码
- **THEN** CI 只执行 shared-utils 及其依赖者（如 rpa-engine、apps/desktop）的测试，不执行其余 workspace 的测试

#### Scenario: 基线比较语义

- **WHEN** CI 计算受影响集合
- **THEN** 基线为分支与 main 的 merge-base（PR 事件），或 `origin/main`（分支 push 事件）

### Requirement: 全量回归保留

main 合并后的 push 事件与手动 workflow_dispatch SHALL 执行全量测试（所有 workspace），不受 affected 选择限制，以守住既有 QM 全量回归契约。

#### Scenario: main 合并全量

- **WHEN** 代码合并到 main（push main 事件）或手动触发 quality-gate
- **THEN** CI 执行所有 workspace 的测试，不使用 affected 选择

### Requirement: 任务缓存

受影响测试任务的结果 SHALL 可缓存：任务输入（源码、测试文件、依赖图、lockfile、命令与配置）未变化时重复执行 SHALL 命中缓存并跳过真实运行；输入变化 SHALL 使缓存失效并真实执行。缓存 SHALL NOT 改变「受影响任务至少真实执行一次」的语义。

#### Scenario: 同 head 重复执行缓存命中

- **WHEN** 同一提交或未变更包集合的 CI 再次执行
- **THEN** 输入未变的任务恢复缓存结果并标记命中，不重新启动测试进程

#### Scenario: 输入变化失效

- **WHEN** 某 workspace 的源码、测试或 lockfile 变化
- **THEN** 该 workspace 及其受影响依赖者的缓存失效并真实执行

### Requirement: 确定性契约保持

affected 选择与缓存 SHALL 不削弱既有确定性测试契约：桌面 vitest 的串行参数（maxWorkers=1、no-file-parallelism、testTimeout/hookTimeout/teardownTimeout=10000）与共享 mock/资源型测试隔离 SHALL 保持不变；affected 模式下执行的每个测试命令 SHALL 与全量模式使用同一命令与参数，仅包集合不同。

#### Scenario: 串行确定性保持

- **WHEN** affected 模式执行 apps/desktop 的测试
- **THEN** 使用与全量模式完全相同的 vitest 串行参数与超时

#### Scenario: 契约测试守护

- **WHEN** CI 配置或 nx 配置被修改
- **THEN** 既有 node --test 契约套件（workflow-contract、autonomous-loop 等）必须通过，并包含本能力的 affected 行为断言

### Requirement: 可观测性

CI 输出 SHALL 记录 affected 计算与缓存结果：受影响包清单、每个任务的缓存命中/未命中、执行时长，便于核对「跳过是否合理」。

#### Scenario: 日志可见

- **WHEN** PR CI 执行 affected 测试
- **THEN** 日志包含受影响包列表与每个任务的缓存命中状态

