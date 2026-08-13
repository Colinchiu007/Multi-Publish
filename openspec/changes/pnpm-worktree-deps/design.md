## Context

- 现状：npm workspaces（apps/*, packages/*，10 个 workspace），依赖安装与运行时代码假设都建立在 **hoisted 扁平布局**上：`apps/desktop/scripts/dev.js` 直接引用 `repoRoot/node_modules/vite/bin/vite.js`、`node_modules/electron/cli.js`；`scripts/launch-worktree.js` 引用 `node_modules/electron/dist/electron.exe`；electron-builder `files: node_modules/**/*`；depcheck 依赖扁平布局。
- 问题：多 Git worktree 并发开发时 npm 无法跨目录复用依赖——新 worktree 要么全量重装（~1.5GB/数分钟），要么借整目录 Junction 导致 `@multi-publish/*` 指向主仓库源码（双模块实例，已记录在 fix-worktree-node-modules.sh 与 learnings）。
- 机器已装 pnpm 11.12.0。双模型分析：antigravity 不可用（地区限制，见 analysis-antigravity-unavailable.md），分析由 Claude（analysis-claude.md）+ 主代理完成。
- pnpm 11 关键事实（官方文档/源码核对）：`nodeLinker`、`onlyBuiltDependencies` 等工程设置放 `pnpm-workspace.yaml`，`.npmrc` 仅接受 auth/registry/network 设置；pnpm 10+ 默认拒绝未放行的构建脚本。

## Goals / Non-Goals

**Goals:**
- npm → pnpm 迁移：`pnpm-lock.yaml` 为唯一锁文件、`packageManager` 声明版本、`pnpm-workspace.yaml` 承载 workspaces 与构建放行策略。
- 采用 `node-linker=hoisted` 保持扁平布局，运行时路径假设（dev.js/launch-worktree.js/electron-builder/depcheck）继续成立。
- 全局 store 跨 worktree 复用：新 worktree `pnpm install` 秒级、几乎不新增磁盘；`@multi-publish/*` 链接自动指向当前 worktree。
- 新增解析门禁 `scripts/verify-worktree-deps.js`：断言每个 workspace 包 `require.resolve` 落在当前 worktree。
- 新增 `scripts/run-package-install.js`：经 `require.resolve` 穿透 pnpm symlink 定位 esbuild/vue-demi 真实目录执行 install.js（替代 electron-ci.yml 硬编码的 `node_modules/@remotion/bundler/node_modules/esbuild/install.js` 路径）。
- 重写 `scripts/fix-worktree-node-modules.sh`：junction 检测 → 移除 → `pnpm install` → 解析门禁；**删除整目录 Junction fallback**。
- CI 全量迁移：7 个 workflow + `nx.json` + `.github/scripts/workflow-contract.test.js` + doc-gate 的 npm/lockfile 引用同步。
- 真实打包验证：win + linux `electron-builder --dir`（QM-1），核对 `.pnpm` 排除、体积、ffmpeg 排除生效。
- 文档：AGENTS.md、01-docs/build.md、CHANGELOG。

**Non-Goals:**
- 不切换到 isolated linker / pnp（本仓库运行时假设不兼容，属"重构+迁移"双重成本）。
- 不解决 esbuild 版本冲突（desktop 0.25.12 vs @remotion/bundler 0.28.1），保留嵌套版本。
- 不迁移 ops-center（独立 npm 依赖，不在根 workspaces 内）、python-backend（无 package.json）。
- 不碰主工作区并发会话的未提交改动（`@esbuild/win32-x64@0.28.2`、story2video e2e 测试）——迁移基于当前 HEAD 基线。

## Decisions

1. **pnpm 11 + `node-linker=hoisted`**。理由（Claude 分析逐项核对）：dev.js 绝对路径、launch-worktree.js、electron-builder files glob、depcheck 全部依赖扁平布局；hoisted 迁移改动面最小。配置放 `pnpm-workspace.yaml`（camelCase `nodeLinker`），不放 `.npmrc`（pnpm 11 忽略工程设置）。
2. **`pnpm-workspace.yaml` 承载 `packages: [apps/*, packages/*]` + `nodeLinker: hoisted` + `onlyBuiltDependencies`**（esbuild、vue-demi、better-sqlite3、electron）。package.json 的 `workspaces` 字段保留与否以实装冒烟为准（先保留，验证 pnpm 无告警且 nx 正常；若有冲突再移除）。
3. **Workspace 协议**：`pnpm import` 后检查 `importers` 段确认 `@multi-publish/*` 解析为本地 link（而非 registry）；若裸 `*` 有拉到 registry 风险则统一改 `workspace:*`。
4. **脚本语法迁移**：根 `npm run -w X` → `pnpm --filter X run/...`（或 `pnpm -F`）；`npm run test --workspaces --if-present` → `pnpm -r --if-present test`；workspace 内部嵌套 `npm run` → `pnpm run`；需要时 `npx` → `pnpm exec`。
5. **electron 二进制**：electron@43 无 postinstall，保留 `scripts/ensure-electron.js`（dev）与 CI 显式 install.js；esbuild/vue-demi 通过 onlyBuiltDependencies + `scripts/run-package-install.js` 放行（`--ignore-scripts` 场景）。
6. **electron-builder**：`files` 增加 `!node_modules/.pnpm/**`（hoisted 模式下 `.pnpm` 仍存在，避免体积膨胀与 symlink 解引用问题）；`npmRebuild: false` 不变；win+linux 真实 `--dir` 冒烟。
7. **CI**：`pnpm/action-setup@v4`（version 11.12.0）+ `setup-node@v4 cache: pnpm`；`npm ci` → `pnpm install --frozen-lockfile`；`npx` → `pnpm exec`；`Start-Process npm.cmd` → `pnpm.cmd`；nx cache key 换 pnpm-lock。
8. **store-dir 机器级配置**（不提交）：`pnpm config set store-dir D:\Data\projects\.pnpm-store`，写入 build.md 说明；CI 用默认 store。
9. **新 worktree 标准流程**：`git worktree add ... && pnpm install --frozen-lockfile && node scripts/ensure-electron.js && node scripts/verify-worktree-deps.js`。
10. **整目录 Junction 废弃**：它是双模块实例根因；fix-worktree-node-modules.sh 改为"检测-修复-校验"。

## Risks / Trade-offs

- **Critical**：electron-builder `.pnpm` 卷入/ffmpeg 排除失效（需真实打包验证，无法单测证明）；`@remotion/bundler/node_modules/esbuild` 硬编码路径失效（用 run-package-install.js 解决）；`pnpm import` 后 workspace 协议拉到 registry（importers 检查 + 解析门禁兜底）；CI 硬编码 npm 未同步（workflow-contract Gate 3 会挂，必须同 PR 改）。
- **Warning**：onlyBuiltDependencies 遗漏 → vue-demi/esbuild 构建脚本被 pnpm 跳过；store-dir 提交进 .npmrc 会破坏 Linux CI；depcheck 在 hoisted 下对 `@multi-publish/*` 可能误报；并发会话未提交 package.json 改动与迁移产生潜在合并冲突（协调项）；每 worktree 的 electron dist 仍需 ensure-electron.js（本地 @electron/get 缓存，秒级）。
- **Info**：`@electron/rebuild -w better-sqlite3` 实为 no-op（better-sqlite3 不在依赖图，可留可删）；madge 不深入 node_modules 不受影响；混合 registry 条目随 lockfile 保留可接受。
