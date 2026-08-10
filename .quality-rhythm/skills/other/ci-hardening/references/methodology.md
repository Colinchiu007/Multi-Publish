# CI 硬化方法论（跨项目可迁移）

源于 Multi-Publish 实战（2026-08-09：electron-tests 迁移 GitHub runner、Quality Gate 并行化 + 触发去重）。

## M1 自托管 runner → GitHub 官方 runner 迁移判断法
1. **找先例**：目标 repo 是否已有在 GitHub 官方 runner 上跑同类任务的先例（如 gui-test 用 xvfb 跑 Electron GUI）→ 有则风险大降。
2. **三项适配点核对**：
   - 系统依赖：RHEL `dnf` → Ubuntu `apt`（包名可能不同：xvfb/build-essential/python3）
   - 原生模块 ABI：Electron 项目需 `npx @electron/rebuild -f -w <module>`（Node 运行 vitest 时**不得**在其之前 rebuild——会破坏 Node ABI；rebuild 应放在 vitest 之后、Electron 冒烟之前）
   - 网络：镜像（npmmirror）公网可达性；无内网/secrets 依赖才可迁移
3. **验证**：迁移 PR 自身 CI 即验收（观察 runner_name 为 `GitHub Actions *`、时长、通过率）。
4. 保留：checksum pin、`SKIP_*` 测试开关、失败诊断（进程树）。

## M2 CI 优化法（并行拆分 + 触发去重）
1. **实测定位瓶颈**：取一次通过 run 的 step 耗时（GitHub API `jobs/<id>` 的 steps.started_at/completed_at）→ 找出占 80% 的步骤。
2. **并行拆分**：把串行 gate 拆成独立 job（静态/单测/覆盖率/视觉/E2E/自主审计），关键路径 = max(各 job)；注意：
   - 每 job 独立 VM → 各自 `npm ci`（分钟略升，墙钟大降）
   - 覆盖率/单测这类重资源步骤拆到独立 job，避免同 job 争资源
   - 保留 gate 语义与顺序契约（如 watchdog、退出码捕获）
3. **触发去重**：`on:` 只保留 `pull_request`（+ `workflow_dispatch`），移除 `push: branches-ignore` 与 PR 的同 head 双跑 → CI 分钟减半。
4. **验证**：PR 自身 CI 观察各 job 时长与并行效果。

## M3 Workflow 契约测试同步法（改 workflow 前必查）
- **全仓 grep 契约测试**：不仅 `.github/scripts/*.test.js`，还有 `apps/*/tests/*.test.js`（Multi-Publish 的 gui-ci-exit-contract.test.js 就锁定了 workflow 结构）。
- 契约测试常见锁定点：步骤名、邻接注释/邻接步骤、`runs-on`、timeout、退出码模式、跨文件字符串。
- 并行化后：邻接锚点从 `# --- Gate N` 注释改为同 job 的后续步骤（如 Upload）；单 job 引用改跨 job 汇总（`Object.values(jobs).flatMap(j => j.steps||[])`）。
- 改完先本地跑契约测试（`node --test .github/scripts/*.test.js` + vitest 对应文件），再推 CI。

## M4 三层门禁体系
- 本地提交门禁：`.quality-gates.md` 提交前自检清单（QM-1~4）+ husky pre-commit。
- 流程 skill：质量节拍（Phase 0-5 + 日常循环 ⑦ CI 验证）。
- 远程 CI：GitHub Actions（PR 触发）。
- 三层各司其职：skill 把关过程，CI 把关结果，本地清单把关提交。

## M5 交付节奏（质量节拍式）
1. 隔离 worktree（`git worktree add -b codex/<slug> <path> origin/main`），不动并发会话主工作区。
2. 分支 + PR（运行时代码/CI 变更禁止直改 main）+ openspec change（M+ 复杂度）。
3. 双模型分析/审查（antigravity 缺失时降级 Claude + 主代理 grep 核验，记录降级）。
4. 全量测试 + 契约测试 + eslint/vite build。
5. 合并（Quality Gate 通过；自托管排队不阻塞——迁移后已消除）。
6. 归档三同步（openspec archive + CCG task 归档 + learnings）→ 记忆备注。

## 通用清单（新项目应用）
- [ ] 本地：`.quality-gates.md` + husky pre-commit + 流程 skill 引用
- [ ] CI：并行 quality-gate.yml（去重触发）+ 契约测试
- [ ] Electron 项目（可选）：electron-ci.yml + checksum pin + rebuild 顺序
- [ ] 契约测试：`node --test .github/scripts/*.test.js` + 对应 vitest 全绿
- [ ] 文档：PRD/CHANGELOG/learnings 同步

## M6 路径门控法（文档/流程改动 → 0 CI）
1. **黑名单优先于白名单（fail-closed）**：只排除「肯定无关」的文档/流程/配置路径（docs、*.md、LICENSE、.gitignore、.ccg/openspec 等流程目录、lockfile），代码/依赖/CI 路径一律保留触发——白名单漏掉传递依赖会静默漏测。
2. **tag 行为**：GitHub 官方文档明确 *Path filters are not evaluated for pushes of tags*——`tags: [v*]` 发布触发不受 `paths-ignore` 影响，无需为 tag 特判。
3. **PR 按整个 PR diff 评估**：最后一个提交只改被忽略路径也会触发整个 workflow（因为 PR 总 diff 含代码变更）——process-only 收尾提交不会跳过 CI。
4. **契约守护清单**：把忽略清单固化为契约测试断言（单一来源），防未来漂移；`**/*.md` 覆盖根级与嵌套。
5. **同类门禁同步**：doc-sync 类门禁的忽略集也要补流程目录，否则纯 CI/流程 PR 会误触发并失败。

## M7 affected 测试选择 + 任务缓存法（Nx）
1. **配置**（npm/pnpm/yarn workspaces 通用）：根 `nx.json` `targetDefaults.test.cache=true` + `inputs`（默认 + `^default` + lockfile）；根脚本 `test:affected`（`nx affected -t test --base=origin/main --parallel=1`）与 `test:all`（`nx run-many -t test --all --parallel=1`）。
2. **`--parallel=1` 是硬要求**：nx 默认跨项目并行会抖动时序敏感/共享资源测试（实测 shared-utils scheduler 5000ms 超时）——确定性套件必须显式串行；选择与缓存收益不受影响。
3. **排除大套件**：大 workspace 拆分出去后，`nx affected ... --exclude=<pkg>` / `nx run-many ... --exclude=<pkg>`（依赖 nx 项目名=package.json name，验证 `nx show projects`）。
4. **根级配置变更 = 全部受影响**：package.json/nx.json/tsconfig 等根配置变化使所有项目受影响（与 Nx 语义一致，报告/契约需体现）。
5. **全量回归保留**：main 合并与手动 dispatch 走 `test:all`；feature 分支仅 PR 触发（触发去重共存）。
6. **缓存语义**：同输入二次执行命中（`Nx read the output from the cache`）；输入含 lockfile 才安全；`--skip-nx-cache` 不写缓存。

## M8 大测试套件跨 runner 分片法（matrix + vitest --shard）
1. **前提**：确定单测阶段是 CI 关键路径（用 analyze-ci-steps.js 实测；分片后瓶颈会转移——Multi-Publish 案例中单测 11→6.4min 后 coverage 11.7min 成为新关键路径，需重新评估）。
2. **方案**：matrix job（N 个独立 runner）各跑 `vitest run --shard=k/N`；**每分片进程内保持串行确定性参数**（maxWorkers=1 / no-file-parallelism / 超时）；`fail-fast: false`；gate-result 汇总 `needs` 纳入分片 job。
3. **隔离是设计**：跨 runner = 独立机器，无共享可变资源；进程内串行契约原样保留——「套件级确定性文件顺序」由跨 runner 隔离 + 双分片各自独立通过来实证兜底。
4. **覆盖率/门禁口径保持全量**：coverage job 不分片（聚合与阈值口径不变）；代价 = 大套件每 PR 执行多次，按质量策略取舍。
5. **契约守护核心属性**：断言分片矩阵、`--shard=`、串行标志、watchdog（Get-TestProcessTree/WaitForExit/taskkill）——不是「字符串存在」而是这些属性被删除时测试必须红。
6. **避免无意义缓存步骤**：不经 nx 的 shard job 不要加 `Restore Nx cache`（空缓存 + 与 nx job 争写同一 key 产生噪音）。

## 通用清单（新项目应用）
- [ ] 本地：`.quality-gates.md` + husky pre-commit + 流程 skill 引用
- [ ] CI：并行 quality-gate.yml（去重触发）+ 契约测试
- [ ] 路径门控：全量 workflow paths-ignore 黑名单（M6）+ 契约守护清单
- [ ] affected 选择（workspaces monorepo）：nx.json + test:affected/test:all + `--parallel=1`（M7）
- [ ] 大套件分片（单测是瓶颈时）：matrix `--shard` + watchdog + coverage 保持全量（M8）
- [ ] Electron 项目（可选）：electron-ci.yml + checksum pin + rebuild 顺序
- [ ] 契约测试：`node --test .github/scripts/*.test.js` + 对应 vitest 全绿
- [ ] 文档：PRD/CHANGELOG/learnings 同步
