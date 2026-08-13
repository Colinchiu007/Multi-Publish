# Tasks: pnpm-worktree-deps

进度单一来源（openspec-integration Requirement）：本文件 checkbox 为唯一进度来源。

## Phase 1: 配置与锁文件

- [x] T1 新增 `pnpm-workspace.yaml`（packages: apps/*, packages/*；nodeLinker: hoisted；onlyBuiltDependencies: esbuild/vue-demi/better-sqlite3/electron）
- [x] T2 根 package.json：加 `packageManager: pnpm@11.12.0`；根 scripts npm→pnpm 等价语法（dev/build/build:win/test/test:rpa-selectors 等）；评估并处理 `workspaces` 字段（与 pnpm-workspace.yaml 冲突则移除，冒烟验证 nx）
- [x] T3 执行 `pnpm import` 生成 pnpm-lock.yaml；检查 `importers` 段 @multi-publish/* 为本地 link（否则改 workspace:*）
- [x] T4 删除 package-lock.json（迁移完成）

## Phase 2: 脚本与门禁

- [x] T5 新增 `scripts/run-package-install.js`（require.resolve 穿透 pnpm symlink 定位 esbuild/vue-demi 真实目录执行 install.js）
- [x] T6 新增 `scripts/verify-worktree-deps.js`（每个 workspace require.resolve realpath 落在当前 worktree）
- [x] T7 重写 `scripts/fix-worktree-node-modules.sh`（junction 检测 → 移除 → pnpm install → verify-worktree-deps 门禁）
- [x] T8 各 workspace package.json：嵌套 `npm run`→`pnpm run`、`npx`→`pnpm exec`（desktop/remotion-composer 等）

## Phase 3: 打包与 CI

- [x] T9 apps/desktop electron-builder `files` 加 `!node_modules/.pnpm/**`
- [x] T10 迁移 7 个 workflow（quality-gate/visual-test/gui-test/electron-ci/build/autonomous-loop/agent-judge）：pnpm/action-setup + cache: pnpm + pnpm install --frozen-lockfile + npm run/npx 等价语法 + Start-Process pnpm.cmd + nx cache key
- [x] T11 同步 `nx.json`（package-lock.json→pnpm-lock.yaml）、`.github/scripts/workflow-contract.test.js`、doc-gate paths

## Phase 4: 本地门禁（质量节拍 QM-1~4）

- [x] T12 `pnpm install --frozen-lockfile` 成功 + verify-worktree-deps.js 通过
- [x] T13 desktop 全量 vitest（--maxWorkers=1 --no-file-parallelism）+ check:ts + build:vue
- [x] T14 check:deps + check:circular（depcheck 误报按需 --ignores）
- [x] T15 ensure-electron + electron 冒烟（8 秒存活 + 无错误 stderr）
- [x] T16 打包门禁：win + linux `electron-builder --dir`，核对产物无 .pnpm、ffmpeg 排除、体积同量级

## Phase 5: worktree 复用验收

- [ ] T17 throwaway worktree：`pnpm install --frozen-lockfile` 计时验收 + verify-worktree-deps + 少量桌面测试
- [ ] T18 验证 junction worktree 被 fix-worktree-node-modules.sh 正确修复

## Phase 6: 文档与交付

- [ ] T19 文档：AGENTS.md（worktree 流程）、01-docs/build.md（store-dir 机器配置 + 新 worktree 流程）、CHANGELOG
- [ ] T20 双模型审查（claude；antigravity 重试，不可用则记录降级）→ 修复 Critical
- [ ] T21 PR + CI 全绿 + 合并证据 + 三同步归档（openspec archive + .ccg/tasks 归档 + learnings）
