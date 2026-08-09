# ci-test-sharding

## Purpose

定义桌面 vitest 测试套件跨 GitHub runner 分片执行的契约：分片并行缩短墙钟，同时每个分片进程内保持既有确定性串行契约（maxWorkers=1、no-file-parallelism、超时）；跨分片无共享可变资源；覆盖率与既有门禁语义不因分片改变。

## ADDED Requirements

### Requirement: 跨 runner 分片

桌面 vitest 测试 SHALL 可拆为 N 个 shard 在 N 个独立 runner 上并行执行；每个 shard SHALL 使用 `vitest run --shard=k/N`（k∈[1,N]）；每个 shard 进程内 SHALL 保持串行 vitest 配置（maxWorkers=1、fileParallelism=false、testTimeout/hookTimeout/teardownTimeout=10000）不变。

#### Scenario: 分片并行

- **WHEN** 桌面测试分片启用
- **THEN** N 个 runner 并行各执行自己的 shard 文件集，总墙钟约为全量/N 加调度开销

#### Scenario: 进程内串行保持

- **WHEN** 任一 shard 进程执行
- **THEN** 使用与全量模式一致的串行 vitest 配置与超时

### Requirement: 跨分片隔离

分片进程之间 SHALL NOT 共享可变资源（文件、端口、全局状态）；测试用例 SHALL 可归一到单文件粒度（vitest --shard 语义），分片不改变用例语义。

#### Scenario: 隔离执行

- **WHEN** 两个 shard 同时运行
- **THEN** 各自结果独立、无跨进程污染，任一 shard 失败仅影响该 shard

### Requirement: 覆盖率门禁保持

分片 SHALL 不改变覆盖率门禁语义：coverage 检查 SHALL 仍以全量测试集运行（非分片），聚合口径与基线一致。

#### Scenario: 覆盖率全量

- **WHEN** coverage 门禁执行
- **THEN** 使用全量测试集（不分片），阈值与基线一致

### Requirement: 契约测试守护

分片相关 CI/vitest 配置变更 SHALL 由契约测试守护：断言 shard 矩阵存在、`--shard` 参数正确、unit-tests 的 `--exclude=@multi-publish/desktop` 存在、串行配置断言保留、affected/`--parallel=1` 不回归。

#### Scenario: 契约守护

- **WHEN** 修改 quality-gate.yml 或 vitest 配置
- **THEN** 既有契约套件通过，且包含分片矩阵与串行配置断言
