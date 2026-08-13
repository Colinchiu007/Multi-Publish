## Why

多会话并发开发依赖 Git worktree 隔离，但 npm workspaces 没有跨目录依赖复用：每个新 worktree 要么完整重装（~1.5GB、数分钟），要么借用整目录 Junction 导致 `node_modules/@multi-publish/*` 指向主仓库源码（双模块实例、错误 checkout，已在 fix-worktree-node-modules.sh 与 learnings 中记录）。团队需要一种"复用同一份依赖、且每个 worktree 正确解析自己分支源码"的依赖管理方式。

## What Changes

- 根依赖管理从 npm 切换为 pnpm workspaces（机器已装 pnpm 11.12.0），生成 pnpm-lock.yaml 作为唯一锁文件；`package.json` 增加 `packageManager: pnpm@<version>`。
- 采用 pnpm 全局 content-addressable store + `node-linker=hoisted`（保持与现有 npm hoisted 布局一致，降低 electron-builder/esbuild/手动 install.js 步骤的迁移风险）：新 worktree `pnpm install` 秒级完成、几乎不新增磁盘，workspace 链接自动指向当前 worktree。
- 全量 CI 工作流（7 个 .github/workflows/*.yml）从 `cache: npm` + `npm ci` 迁移到 pnpm action + `pnpm install --frozen-lockfile`；需要构建脚本的依赖（esbuild、vue-demi、electron runtime、better-sqlite3 rebuild）显式声明放行。
- 根 package.json 与各 workspace 的 `npm run`/`npx` 脚本迁移为 pnpm 等价语法。
- 新增"worktree 依赖复用"规范化流程与校验：新 worktree 依赖安装命令、`require.resolve('@multi-publish/*')` 必须落在当前 worktree 的校验门禁；记录禁止整目录 Junction 复用（并发 worktree 共享物理链接无法各自指向本分支 packages）。
- 文档/脚本更新：AGENTS.md、01-docs/build.md、scripts/fix-worktree-node-modules.sh（废弃整目录 junction + 全量重装路径，改为 pnpm install + 校验）、launch-worktree.js 提示、CHANGELOG。

**BREAKING**: 依赖安装命令由 `npm ci`/`npm install` 变为 `pnpm install [--frozen-lockfile]`；本地开发者与 CI 必须使用 pnpm。

## Capabilities

### New Capabilities
- `monorepo-dependency-management`: 定义 monorepo 依赖安装/复用契约——pnpm store 共享、workspace 链接指向当前 worktree、新 worktree 依赖就绪流程、解析正确性校验门禁，以及禁止整目录 Junction 复用的约束。

### Modified Capabilities
（无既有 spec 需要改：CI 质量门禁与 desktop 的行为契约不变，package manager 属实现层变更）

## Impact

- 受影响代码/配置：根 package.json、新增 pnpm-lock.yaml（package-lock.json 退役）、.github/workflows/ 7 个文件、apps/*/packages/* 的 package.json scripts、scripts/fix-worktree-node-modules.sh 等工具脚本、AGENTS.md/01-docs/build.md/CHANGELOG.md。
- 依赖：npm → pnpm（11.x）；store 目录建议 D:\Data\projects\.pnpm-store（避免 C 盘膨胀）。
- 风险与协调：主工作区存在未提交的 `@esbuild/win32-x64@0.28.2` 依赖变更（并发会话，本次不纳入、不覆盖）；pnpm 对 electron-builder 打包兼容性需真实打包验证（QM-1）；esbuild/vue-demi/electron 等构建脚本需放行。
