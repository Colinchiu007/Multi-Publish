# Design: ci-test-sharding

## Context

见 proposal.md（Why/差异审计）。实测基线：Gate 4 全量 11.0 min，桌面 9.3 min（85%）；vitest 4.1.9 原生支持 `--shard`；桌面 vitest.config.js 已强制 `maxWorkers:1`、`fileParallelism:false`（契约测试断言）。

## Goals / Non-Goals

**Goals**
- 桌面套件跨 N 个独立 runner 分片，墙钟 ≈ 全量/N。
- 每分片进程内串行确定性契约不变（QM-2/3）。
- coverage 门禁口径不变；affected/缓存不回归。

**Non-Goals**
- 单进程内文件级并行（保持串行，避免共享 mock/资源型测试争用——Nx 并行抖动已证）。
- electron-ci 桌面步骤接入分片（后续可选）。
- 改测试代码或 vitest 串行配置本身。

## Decisions

1. **载体：新增 `desktop-shards` matrix job**（N=2 起步，参数可调 4）。
   每个 matrix runner：`npm run test:desktop:shard -w @multi-publish/desktop -- --shard=k/N`（k 由 matrix 注入），进程内仍走桌面 vitest 串行配置。保留每 shard 的 30 分钟 watchdog（超时终止进程树），与 Gate 4 watchdog 同款。
   - 备选（放弃）：unit-tests job 内部按步骤分片——shard 需并行进程，单 job 串行 step 无法并行，不可行。
2. **unit-tests job 排除桌面**：`nx affected -t test --exclude=@multi-publish/desktop`（full 模式 `nx run-many -t test --all --exclude=@multi-publish/desktop`），保留 Gate 4 watchdog；桌面测试职责移交 desktop-shards job。
3. **N 值**：2 起步（9.3/2≈4.7 min，矩阵分钟数 ×2 换取墙钟减半）；验证后调 4。
4. **覆盖率**：coverage job 保持全量（非分片）——聚合口径与基线一致，spec「覆盖率门禁保持」。
5. **契约测试**：新增断言 —— quality-gate 含 `desktop-shards` job 且 `strategy.matrix.shard` 存在、run 含 `--shard=`、unit-tests run 含 `--exclude=@multi-publish/desktop`、根 package.json 有 `test:desktop:shard`、vitest 串行配置断言保留。
6. **electron-ci**：不接入（范围控制）。

## Risks / Trade-offs

- [分片后时序敏感测试跨 runner 抖动] → 独立 runner 无共享资源（隔离）；进程内仍串行；N 从 2 起步观察。
- [--shard 与 coverage 交互] → coverage job 独立全量，不 shard。
- [矩阵 runner 成本] → GitHub-hosted windows 分钟数 ×N；N=2 起步，实测收益后调。
- [契约测试漏同步] → Gate 4 watchdog/串行断言保留；新增分片断言；本地 node --test 全量验证。
- [与 affected 叠加复杂度] → unit-tests 与 desktop-shards 职责分离清晰；affected 只影响「哪些项目」，分片只影响「桌面怎么跑」。

## Migration Plan

1. 根 package.json 加 `test:desktop:shard`（透传 `--shard`）。
2. quality-gate.yml：新增 desktop-shards matrix job（N=2，watchdog 同款）；unit-tests 命令加 `--exclude=@multi-publish/desktop`。
3. 契约测试新增分片断言；本地验证（desktop 两 shard 各自跑通、文件数之和=全量、串行配置断言）。
4. PR → CI 实测（shard 前后 Gate 4/桌面时长对比）→ 双模型审查 → 合并 → 三同步归档。

## Open Questions

- 无阻塞项；N 值与 electron-ci 接入作为后续调优项。


## 双模型审查处置（2026-08-09，Claude 完成）
- C1 跨 shard 串行契约 → **排除**：分片跑在独立 matrix runner 上（跨机器隔离，无共享可变资源）；
  每 shard 进程内保持 maxWorkers=1/no-file-parallelism/超时（与全量一致）；实证 = 本 PR CI 中
  shard 1/2 与 2/2 各自独立通过。跨文件顺序/状态耦合若存在会在独立 shard 中失败，CI 兜底。
- W1 死脚本 → **修复**：删除根 test:desktop:shard（CI 用直接命令，契约断言其为 undefined）。
- W2 串行标志无断言 → **修复**：契约新增 --maxWorkers=1/--no-file-parallelism/--testTimeout=10000 断言。
- W3 watchdog 无守护 → **修复**：契约新增 Get-TestProcessTree/WaitForExit(1800000)/taskkill 断言。
- W4 空缓存步骤+写竞争 → **修复**：desktop-shards 移除 Restore Nx cache（不经 nx，无意义且与
  unit-tests 争写同一 key）。
- W5 桌面恒全量（无视 affected）→ **记录为有意取舍**：桌面是核心产品，每个 PR 全量覆盖桌面
  （shards + coverage）是保证；效率损失（非桌面 PR 多跑桌面）后续可加条件触发。
- W6 --exclude 依赖 nx 项目名 → **实证排除**：nx show projects 输出 @multi-publish/desktop；
  本 PR CI 的 QG Unit Tests 仅 0.6min 证明 exclude 生效。
