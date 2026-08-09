# Design: ci-affected-test-selection

## Context

见 proposal.md（Why 与差异审计）。现状：npm workspaces monorepo（6 个 JS/TS workspace + python-backend），根脚本 `npm run test --workspaces --if-present`；桌面 vitest 串行确定性契约（maxWorkers=1 等）；quality-gate 已并行拆分（6 job，windows-latest，触发 pull_request + workflow_dispatch）；Phase 1 已有 paths-ignore 门控与 17 项契约测试。

## Goals / Non-Goals

**Goals**
- 包粒度 affected 测试选择（含传递依赖闭包），接入 quality-gate 单测 job。
- 任务缓存（本地 `.nx/cache`；同 head 重复执行、未变包跳过）。
- main 合并 / workflow_dispatch 保留全量（`nx run-many -t test`）。
- 契约测试守护 affected 行为；保留既有确定性契约。

**Non-Goals**
- 远程缓存服务（Nx Cloud）——后续可选。
- visual-test / e2e / gui-test 的包粒度选择——保持现有 workflow 语义。
- 改变 vitest 串行确定性契约；Bazel/Pants 迁移。

## Decisions

1. **选型：Nx（优于 Turborepo）**
   - Nx：成熟 project graph + affected 计算（改动包 + 传递依赖者自动纳入）；原生支持 npm workspaces（自动发现 workspaces）；`targetDefaults`/`cacheableOperations`/`inputs` 精确控制缓存键；`run-commands` 目标可包住现有 npm scripts 而不改包内命令；未来可开 Nx Cloud 远程缓存。
   - Turborepo 备选：配置更轻，但 affected 依赖 git 过滤 + task graph，图保证较弱；缓存键与目标级控制不如 Nx 精确；对「多 workflow 各自算 affected」支持弱。
   - 代价：引入 project-graph 层；缓解 = 优先用推断目标 + 最小配置，早验证 `nx show projects` 发现全部 workspace。

2. **受影响基线**：PR 事件用 `git merge-base origin/main HEAD`；分支 push 用 `origin/main`；main 合并与 dispatch 不走 affected。
3. **缓存范围**：`cacheableOperations = ["test"]`；`inputs` 覆盖源码、测试、lockfile、project graph、命令与 nx 配置；CI 内同一 run 直接命中本地缓存，跨 run 缓存通过 actions/cache 持久化 `.nx/cache`（可选，先做 run 内 + 同 job 复用）。
4. **接入面（最小改动，避免与并发 CI 改动冲突）**：仅 quality-gate 的 unit-tests job —— PR 事件走 `nx affected -t test`，workflow_dispatch 走 `nx run-many -t test`；electron-ci / gui-test / visual-test 保持现状（electron-ci 本就只跑 desktop 包；gui/visual 已有路径门控）。quality-gate 是当前最重的全 workspace 测试步骤，收益最大。
5. **契约测试**：新增断言 —— 根 package.json 含 nx devDependency、nx.json 的 cacheableOperations 含 test、quality-gate unit job 在 pull_request 事件使用 affected 命令且 dispatch 使用全量命令、既有 17 项契约测试保持通过。
6. **python-backend**：npm workspace 之外（Python），不进 nx graph；其 pytest 步骤（gui-test/doc-gate）保持现状。

## Risks / Trade-offs

- [Nx 对 npm workspaces 图推断不准] → 上线前 `nx show projects`/`nx graph` 核验 6 个 workspace 全发现；推断失败处用显式 targets 修正；契约测试断言项目集合。
- [affected 漏选（依赖者未纳入）] → Nx affected 语义本身含传递依赖者；契约测试用「shared-utils 改动 → rpa-engine/desktop 入选」场景守护。
- [缓存误命中掩盖真实失败] → 仅 test 可缓存；inputs 含 lockfile 与全部相关文件；缓存键含命令；CI 首次/输入变化必真实执行。
- [CI 分钟基线漂移] → 记录改造前后 quality-gate 单测 job 实测时长（tasks 中留测量任务）。
- [与并发 CI 改动冲突] → workflow 改动仅限 quality-gate 单测 job + dispatch 分支；合并前同步 main。

## Migration Plan

1. 根 package.json 加 `nx` devDependency（锁定版本）+ 根 `nx.json`（targetDefaults、cacheableOperations、inputs）。
2. 本地验证 `nx show projects` / `nx affected -t test --base=origin/main` 于临时分支冒烟，记录受影响集合与时长。
3. quality-gate.yml：unit-tests job 命令改为 affected/dispatch 双模式 + cache 持久化步骤。
4. 契约测试新增断言；本地 node --test 全绿。
5. PR → CI 实测（记录 affected 场景与缓存命中）→ 合并 → 三同步归档。

## Open Questions

- 无阻塞项；远程缓存（Nx Cloud）与 electron-ci 后续接入列为 follow-up。
