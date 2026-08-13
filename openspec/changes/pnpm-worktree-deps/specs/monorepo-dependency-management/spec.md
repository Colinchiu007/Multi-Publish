## Purpose
定义 monorepo 依赖安装与跨 Git worktree 复用契约：pnpm 为唯一依赖管理器、workspace 包解析必须指向当前 worktree、共享 store 提供跨 worktree 复用、禁止整目录 Junction 复用。

## ADDED Requirements

### Requirement: pnpm 为唯一依赖管理器
monorepo SHALL 使用 pnpm 作为唯一依赖管理器：根 package.json 声明 `packageManager`（pnpm@11.13.1），`pnpm-workspace.yaml` 定义 workspaces（apps/*、packages/*）、`nodeLinker: hoisted` 与构建脚本放行（onlyBuiltDependencies）；`pnpm-lock.yaml` 为唯一锁文件，`package-lock.json` 不再作为依赖来源。

#### Scenario: 全新 checkout/worktree 安装依赖
- **WHEN** 执行 `pnpm install --frozen-lockfile`
- **THEN** 安装成功且 `pnpm-lock.yaml` 未被修改（frozen 生效），workspace 列表与 pnpm-workspace.yaml 一致

#### Scenario: 遗留 package-lock.json
- **WHEN** 仓库存在 package-lock.json 且其内容与 pnpm-lock.yaml 不一致
- **THEN** 依赖解析以 pnpm-lock.yaml 为准，package-lock.json 不参与安装（迁移完成后被删除）

### Requirement: workspace 包解析必须指向当前 worktree
任何 @multi-publish/* workspace 包在 node_modules 中的链接 SHALL 解析到当前 worktree 的 packages/ 或 apps/ 目录；仓库提供 `scripts/verify-worktree-deps.js` 门禁，对每个 workspace 断言 `require.resolve` 的 realpath 落在当前 worktree 内。

#### Scenario: 新 worktree 安装后校验
- **WHEN** 新 worktree 执行 `pnpm install` 后运行 `node scripts/verify-worktree-deps.js`
- **THEN** 所有 @multi-publish/* 包解析路径均以当前 worktree 目录为前缀，退出码 0

#### Scenario: 链接指向其他 checkout
- **WHEN** node_modules/@multi-publish/* 链接指向主仓库或其他 worktree（如历史整目录 Junction 产物）
- **THEN** verify-worktree-deps.js 输出失败项并返回非零退出码，提示执行修复流程（移除 junction 后 pnpm install）

### Requirement: 依赖跨 worktree 复用且布局兼容
pnpm 全局 store SHALL 为所有 worktree 提供硬链接复用；`nodeLinker: hoisted` 保证根 node_modules 为扁平布局，dev.js、launch-worktree.js、electron-builder 与 depcheck 的既有路径假设继续成立。

#### Scenario: 第二个 worktree 安装
- **WHEN** 在已有完整安装的机器上新建 worktree 并执行 `pnpm install --frozen-lockfile`
- **THEN** 主要依赖从全局 store 硬链接（不重新下载、不复制全量 node_modules），安装完成后根 node_modules 存在扁平 vite/electron 条目

#### Scenario: 构建脚本放行
- **WHEN** pnpm install 完成后检查 esbuild、vue-demi 等构建脚本
- **THEN** 放行列表中的包已执行其 install/postinstall（或 CI 通过 scripts/run-package-install.js 显式执行），未被 pnpm 默认拒绝策略跳过

### Requirement: 禁止整目录 Junction 复用 node_modules
worktree 的 node_modules SHALL NOT 以整目录 Junction 指向主仓库或其他 worktree 的 node_modules；该方式导致 @multi-publish/* 共享物理链接、并发 worktree 无法解析各自分支源码。fix-worktree-node-modules.sh SHALL 检测 junction 并执行"移除 junction → pnpm install → 解析门禁"修复。

#### Scenario: 检测到 junction
- **WHEN** worktree 的 node_modules 或其内 @multi-publish 链接为 junction/symlink 且指向其他 checkout
- **THEN** fix-worktree-node-modules.sh 输出检测结果、移除 junction、执行 pnpm install，并以 verify-worktree-deps.js 验证通过为完成标准

### Requirement: 打包产物不含 pnpm 虚拟存储
electron-builder 打包配置 SHALL 排除 `node_modules/.pnpm/**`，打包产物结构与体积与 npm 基线保持一致（ffmpeg 排除、extraResources 等规则继续生效）。

#### Scenario: electron-builder --dir 冒烟
- **WHEN** 在 pnpm 布局下执行 `electron-builder --dir`（win 与 linux 各一次）
- **THEN** 打包成功，产物不含 .pnpm 虚拟存储，`!ffmpeg*` 排除规则仍生效，体积与 npm 基线同量级
