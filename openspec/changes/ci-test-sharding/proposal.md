# Proposal: 桌面测试套件分片（vitest --shard 跨 runner 并行）

## Why

实测（2026-08-09）：quality-gate 单测 job 全量 11.0 min，其中**桌面套件占 9.3 min（~85%）**——桌面 5000+ 测试是 CI 关键路径最大瓶颈。把桌面测试按文件拆成 N 份、在 N 个独立 runner 上并行执行，墙钟近似减半（再叠加 Phase 2 affected 只选受影响包），PR 等待进一步下降。

## 差异审计（既有基线 vs 现状）

**已交付（不重复规格化）**：Phase 1 paths-ignore 门控；#433 electron-ci 迁移 GitHub runner；#435 quality-gate 并行拆分（6 job）；Phase 2 Nx affected + `--parallel=1` 串行契约 + `.nx/cache` 缓存（PR #439）；`scripts/affected-report.js` 诊断工具。

**待办（本 change 承载）**：桌面 vitest 套件跨 runner 分片（`--shard`），含矩阵 job、watchdog 同步、契约测试、覆盖率口径保持。

## What Changes

- quality-gate 新增 **desktop-shards** matrix job（N 个并行 runner），每个 runner 执行桌面 vitest 的 1/N 分片：`vitest run --shard=k/N`；每分片进程内保持既有串行确定性契约（maxWorkers=1、fileParallelism=false、超时契约）。
- unit-tests job 改为非桌面集合：`nx affected -t test --exclude=@multi-publish/desktop`（full 模式同），保留 Gate 4 watchdog。
- 根 `package.json` 新增分片脚本（`test:desktop:shard`，CI 传入 `--shard=k/N`）。
- coverage job 保持全量（非分片），聚合口径不变。
- 契约测试同步：vitest 串行配置断言保留；新增 shard 矩阵断言（N、`--shard` 参数、`--exclude`）。
- electron-ci 桌面单测步骤**暂不**接入分片（控制范围，后续可加）。
- 无产品代码变更；无 secrets 变更。

## Capabilities

### New Capabilities
- `ci-test-sharding`: 桌面测试跨 runner 分片契约（分片并行、进程内串行保持、跨分片隔离、覆盖率门禁保持）。

### Modified Capabilities
- （无既有 spec 的 Requirement 被修改；ci-quality-gate-parallel 的并行 job 结构保持兼容，仅新增一个 job。）

## Impact

- 文件：`.github/workflows/quality-gate.yml`、根 `package.json`、`.github/scripts/workflow-contract.test.js`（如 gui-ci-exit-contract 断言受影响则同步）。
- 依赖：vitest 4.1.9 原生支持 `--shard`（无需新依赖）。
- 风险：分片边界（--shard 按测试文件切分）、覆盖率聚合（coverage job 全量保持）、跨 runner 资源隔离（独立 runner 天然隔离）、矩阵 runner 分钟数成本（windows × N）。
