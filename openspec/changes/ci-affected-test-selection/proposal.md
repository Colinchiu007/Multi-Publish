# Proposal: Affected 测试选择 + 任务缓存（Nx）

## Why

仓库 6000+ 测试文件，但 CI 对**任意代码改动**都全量重跑：quality-gate 单测 job（~11-25min）、electron-ci 桌面单测（~8-18min）、gui-test 等。只改一个包，所有 workspace 测试都被跑一遍；同 head 反复 push 也没有跨 run 缓存。Phase 1（ci-path-gating）已解决「文档/流程改动」的全量跳过，但「代码改动」仍是全量——需要基于依赖图的 affected 测试选择 + 任务缓存，把 PR 关键路径从「全量」降到「受影响包 + 传递依赖包」。

## 差异审计（既有基线 vs 现状）

**已交付（不重复规格化）**：
- ci-path-gating（PR #430, 558b4bc9）：build/electron-ci/quality-gate 的 `paths-ignore` 文档/流程门控 + doc-gate 流程目录 + CI_IGNORED_PATHS 契约测试。
- ci-electron-github-runner（PR #433, b694cd3d）：electron-ci 迁移 GitHub ubuntu-latest，消除自托管排队。
- ci-quality-gate-parallel（PR #435/436, a3a6365a）：quality-gate 并行拆分（6 job）+ 触发去重（移除 push），关键路径 25min→~12min。
- 既有确定性契约：桌面 vitest 串行（maxWorkers=1 / no-file-parallelism / testTimeout=10000），契约测试 node --test 套件。

**待办（本 change 承载）**：affected 测试选择（依赖图）、任务缓存、CI 接入与契约测试、选型决策记录。

## What Changes

- 引入 **Nx**（devDependency + `nx.json` + 目标推断/显式 targets），覆盖 npm workspaces 全部 vitest 测试目标；**选型决策**：Nx vs Turborepo，见 design.md。
- `nx affected -t test`：按 git 基线（`origin/main`）计算受影响包（含传递依赖），PR/分支 push 只跑受影响 workspace 的测试。
- 任务缓存：`.nx/cache` 本地缓存（可选 Nx Cloud 远程缓存）；同 head 重复 push、未变包直接缓存命中跳过。
- CI 接入：quality-gate 单测 job、electron-ci 单测步骤、gui-test 按角色接入 affected 选择；**main 合并后与 workflow_dispatch 保留全量**（`nx run-many -t test` / `--all`）以守住 QM 全量回归契约。
- 契约测试：新增 affected 行为断言（改哪个包应跑哪些 workspace、缓存命中语义），保留 vitest 串行确定性契约与既有 17 项契约测试。
- 无产品代码变更；无 secrets 变更。

## Capabilities

### New Capabilities
- `affected-test-selection`: CI 受影响测试选择与任务缓存契约（哪些变更触发哪些测试、全量/affected 两种模式的边界）。

### Modified Capabilities
- `ci-quality-gate-parallel`: 触发去重 Requirement 更新为「允许 main 分支 push 触发（全量回归保留），feature 分支仍仅 pull_request 触发」。

## Impact

- 代码：根 `package.json`（nx devDependency + scripts）、`nx.json`（targetDefaults/cacheableOperations）、各 workspace `package.json`（如需要显式 targets）、`.github/workflows/quality-gate.yml`、`electron-ci.yml`、`gui-test.yml`、`.github/scripts/` 契约测试。
- 风险：npm workspaces 上 Nx 目标推断准确性、vitest 串行确定性契约必须保持、与并发 CI 改动（#435 并行 gate）共存、CI 分钟基线变化需实测记录。
- 依赖：`nx`（dev，版本锁定）；不引入远程缓存服务（可选后续）。
