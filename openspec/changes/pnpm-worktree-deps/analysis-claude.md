[codeagent-wrapper]
  Backend: claude
  Command: claude -p --dangerously-skip-permissions --setting-sources  --output-format stream-json --verbose -
  PID: 42088
  Log: D:\Temp\codeagent-wrapper-42088.log
  Web UI: http://localhost:59754
  Session-ID: a030b3ab-8995-4471-8daf-112362fa6a97
I have a complete picture now. Key facts verified: 10 workspaces (apps/desktop + 9 packages; python-backend has no package.json), `esbuild` version conflict (root 0.25.12 vs `@remotion/bundler` 0.28.1 — the reason for the nested path), `better-sqlite3` is **not** in the dependency graph (the `@electron/rebuild -w better-sqlite3` step is a no-op), `workflow-contract.test.js` hardcodes npm syntax, and `nx.json` references `package-lock.json`. Here is the analysis.

---

## Analysis: Multi-Publish npm → pnpm 迁移（worktree 依赖复用）

### 结论摘要

方案方向正确，**`node-linker=hoisted` 是唯一稳妥选择**（本仓库 `dev.js`/`launch-worktree.js`/electron-builder `files: node_modules/**/*`/depcheck 都依赖扁平布局；isolated 会让 `repoRoot/node_modules/vite` 这类绝对路径直接失效）。迁移可行，但有 **2 个 Critical 级阻塞点**必须先解决：① `node_modules/@remotion/bundler/node_modules/esbuild/install.js` 硬编码路径在 pnpm 下**不存在**（hoisted 与 isolated 都一样）；② electron-builder 在 pnpm node_modules 布局下的真实打包（`.pnpm` 是否被 `files: node_modules/**/*` 整体卷入导致体积翻倍、symlink 解引用）必须用真实 `--dir` 冒烟验证，不能只跑单测。此外 `workflow-contract.test.js`、`nx.json`、7 个 workflow 的 `package-lock.json` 引用必须同步改，否则迁移本身会被 Gate 3 卡死。

整目录 Junction **不应保留为 fallback**（它是双模块实例 bug 的根因）；应改为"检测 + 清理 + pnpm install + 解析门禁"脚本。

---

### 一、node-linker=hoisted vs isolated

| 维度 | hoisted | isolated |
|---|---|---|
| `apps/desktop/scripts/dev.js` 用 `repoRoot/node_modules/vite/bin/vite.js`、`node_modules/electron/cli.js`（dev.js:36-37） | ✅ root 扁平，vite/electron 都在 | ❌ vite 是 desktop 的依赖，不在 root → 路径失效，需重构 dev.js |
| `scripts/launch-worktree.js:93` `repoRoot/node_modules/electron/dist/electron.exe` | ✅ | ❌ electron 是 root dep 所以**碰巧**在，但 vite 不在 |
| `scripts/ensure-electron.js:23` `root/node_modules/electron` | ✅ | ✅（electron 是 root 依赖） |
| electron-builder `files: node_modules/**/*`（desktop/package.json:121） | ✅ 布局接近 npm | ⚠️ desktop/node_modules 只有 workspace 链接，传递依赖需 electron-builder 走 `.modules.yaml` 还原，风险高 |
| depcheck（`check:deps`） | ✅ 兼容 | ⚠️ 常把不在本包 node_modules 的依赖报为 missing |
| `node_modules/@remotion/bundler/node_modules/esbuild/install.js` | ❌ 同样不存在（esbuild 在 `.pnpm` 虚拟存储里） | ❌ 同样不存在 |
| 纯 pnpm 收益（防幻影依赖、严格树） | 弱 | 强 |

**推荐：`node-linker=hoisted`**。理由：本仓库的运行时路径假设（dev.js、launch-worktree.js、stage-remotion-runtime 的 `require.resolve` 回退遍历、electron-builder 的 files glob）全部建立在上层扁平布局上，hoisted 让这些假设继续成立，迁移改动面最小。isolated 是"教科书正确"但对这个仓库是"重构 + 迁移"双重成本。

唯一必须额外处理的：**hoisted 模式下 `node_modules/.pnpm` 仍然存在**（symlink 目标所在虚拟存储），electron-builder 的 `files: node_modules/**/*` 需要显式 `!node_modules/.pnpm/**`，否则打包体积膨胀。

---

### 二、pnpm 迁移坑清单与规避

| # | 坑 | 影响 | 规避 |
|---|---|---|---|
| 1 | **`@remotion/bundler/node_modules/esbuild` 路径不存在**。根/desktop 用 esbuild 0.25.12，`@remotion/bundler` 锁 esbuild 0.28.1（package-lock.json:9188/3906），npm 用嵌套目录解决，pnpm 把 0.28.1 放 `.pnpm/esbuild@0.28.1` | electron-ci.yml:72 手动步骤直接失败 | 写一个解析助手 `scripts/run-package-install.js`：`require.resolve('esbuild/package.json', { paths:[dirname(require.resolve('@remotion/bundler/package.json'))] })` 定位真实目录后跑 `install.js`（该 resolve 能正确穿过 pnpm symlink）。esbuild 的 install.js 在有 optional 平台二进制时本就是 no-op，可作保险 |
| 2 | **electron-builder 打包**。`files: node_modules/**/*` + pnpm `.pnpm` 虚拟存储 + symlink 解引用 | 打包体积翻倍 / symlink 复制错误 / ffmpeg 排除失效（真实文件在 `.pnpm/.../node_modules/ffmpeg-ffprobe-static/`） | 加 `!node_modules/.pnpm/**`；必须在 **win + linux 各跑一次真实 `electron-builder --dir`**，核对体积与 `!ffmpeg*` 排除生效（QM-1 门禁） |
| 3 | **workspace 协议**。desktop 依赖 `"@multi-publish/*": "*"`（desktop/package.json:66-70,84） | pnpm 对裸 `*` 可能去 registry 拉（404 或拉到已发布版），而不是链接本地 | `pnpm import` 后检查 lockfile 的 `importers` 段，确认 `@multi-publish/*` 是 `link:`/`workspace:`；建议统一改 `"workspace:*"`。用 `require.resolve` 解析门禁兜底 |
| 4 | **`.bin` 与脚本语法**。pnpm 的 `-w` = workspace-root（含义与 npm 相反）；`npm run -w X` → `pnpm --filter X run` | 根脚本全部需要改 | 根 `dev/build/build:win` → `pnpm --filter @multi-publish/desktop ...`；desktop 内部 `npm run build:preload` → `pnpm run build:preload`；`npx` → `pnpm exec`（electron-ci/gui-test/build/visual-test 的 playwright、vite、electron-builder、@electron/rebuild） |
| 5 | **pnpm 10+ 默认屏蔽依赖构建脚本**（onlyBuiltDependencies 白名单） | 本地 `pnpm install` 后 vue-demi postinstall（vue 版本修正）不执行 → 运行期坏；esbuild 有 optional 二进制所以多半没事 | package.json 加 `"pnpm": {"onlyBuiltDependencies": ["esbuild","vue-demi","@electron/get","electron-winstaller"]}`；CI 若沿用 `--ignore-scripts`（镜像 electron-ci 现状），则手动步骤照旧跑 |
| 6 | **`pnpm import` 保真度** | lockfileVersion 3 的 npm lock 转换可能改变解析、peer 处理、混合 registry（npmmirror + npmjs） | `pnpm import` 后立即 `pnpm install --frozen-lockfile` + 顶层版本抽查 + 解析门禁；可接受混合 registry，但 CI 慢可后续 `registry=` 归一 |
| 7 | **nx**。`nx.json:6` 的 `inputs` 引用 `{workspaceRoot}/package-lock.json`；quality-gate.yml:115 `hashFiles('package-lock.json')` | 依赖变化不触发 nx 缓存失效 | 两处改 `pnpm-lock.yaml`；nx 会自动识别 pnpm（读 lockfile） |
| 8 | **workflow-contract.test.js 硬编码 npm** | line 19 `npm.cmd`、21 `npm.cmd run test:visual:pixel`、81 `rootPackage.scripts.test === 'npm run test --workspaces --if-present'`、83-85 `npm.cmd run test:affected`、187 doc-gate paths-ignore | 随根 scripts 一起改（`pnpm.cmd`、新 test 脚本串 `pnpm -r --if-present test`），并在 doc-gate 断言里加 `pnpm-lock.yaml` |
| 9 | **store-dir 不能提交**。`store-dir=D:\Data\projects\.pnpm-store` 写进 `.npmrc` 会破坏 Linux runner | CI（ubuntu-latest）直接报无效路径 | `.npmrc` 只提交 `node-linker=hoisted` 等跨平台项；store-dir 走机器级 `~/.npmrc` 或环境变量，写进 AGENTS.md 文档 |
| 10 | **`@electron/rebuild -f -w better-sqlite3`**（electron-ci.yml:90、gui-test.yml:63） | better-sqlite3 **不在依赖图里**（lockfile 无此包）→ 本是无操作 | 保留无碍；可顺手删掉减少误导（Info 级） |
| 11 | **CI 缓存**。`cache: 'npm'` + setup-node 读 package-lock | 不缓存 pnpm store | setup-node 改 `cache: 'pnpm'`（或 pnpm/action-setup + 独立 store cache） |
| 12 | **playwright browsers 每 worktree 独立**。`.playwright-browsers` 重定向后每个 worktree 重新下载 ~170MB | 不属于 pnpm 范围但仍是 worktree 成本 | 可选：`.playwright-browsers` 做只读共享 junction（安装后只读，安全）；electron 二进制同理走 `@electron/get` 共享缓存 |
| 13 | **`dev.js` 解析根 node_modules** | 见上，hoisted 下安全 | 迁移后必须验证 dev 模式一次；若未来改 isolated 需先重构 dev.js/launch-worktree.js 用 `require.resolve(paths:[desktopDir])` |

---

### 三、新 worktree 复用流程评估 + Junction fallback

**流程合理，方向正确**：
```
git worktree add ... && pnpm install && node scripts/ensure-electron.js
```
- `pnpm install` 秒级（store 热、硬链接）；workspace 链接由 pnpm 指向当前 worktree 的 `packages/` → 天然解决双模块实例。
- electron@43 无 postinstall，`ensure-electron.js` 走 `@electron/get` 本地缓存，不重复下载；每 worktree 的 `dist/` 仍占 ~250MB（install 产物不入 store），可接受。
- **必须补解析门禁**：新增 `scripts/verify-worktree-deps.js` —— 对每个 `@multi-publish/*` 执行 `require.resolve`，断言结果以当前 worktree 绝对路径为前缀且 `node_modules` 不是指向仓库外的 junction/symlink；CI 的 build/electron-ci/gui-test 安装后也跑一次。

**整目录 Junction 不保留为 fallback**。它是本 bug 的根因，且 pnpm store 已提供复用；保留只会诱导误用。把 `scripts/fix-worktree-node-modules.sh` 重写为"检测 junction → 删除 → `pnpm install` → 跑门禁"，并新增"发现 `.pnpm` 标记缺失则判定为旧布局"的检测。

---

### 四、CI 迁移最小改动清单

| 文件 | 改动 |
|---|---|
| `pnpm-workspace.yaml`（新增） | `packages: [apps/*, packages/*]`；消除 pnpm 11 对 package.json `workspaces` 的告警 |
| 根 `package.json` | `packageManager: pnpm@11.12.0`；`workspaces` 字段移除（BREAKING）；`"pnpm": {onlyBuiltDependencies:[...]}`；根 scripts 里 `npm run -w X`→`pnpm --filter X run`、`npx`→`pnpm exec`、`test`→`pnpm -r --if-present test`；`.npmrc` 加 `node-linker=hoisted` |
| `apps/desktop/package.json` | 内部脚本 `npm run`→`pnpm run`、`npx`→`pnpm exec`；`@multi-publish/*` 改 `workspace:*`；electron-builder `files` 加 `!node_modules/.pnpm/**` |
| `nx.json` | `inputs` 的 `package-lock.json`→`pnpm-lock.yaml` |
| 7 个 workflow | ① 加 `pnpm/action-setup`（version 11.12.0）或 setup-node `cache: 'pnpm'`；② `npm ci[ ...]`→`pnpm install --frozen-lockfile [--ignore-scripts]`；③ `npx`→`pnpm exec`；④ `npm run X -w @multi-publish/desktop`→`pnpm --filter @multi-publish/desktop X`；⑤ quality-gate Gate 4 / desktop-shards 的 `Start-Process npm.cmd`→`pnpm.cmd`；⑥ quality-gate `Restore Nx cache` key→pnpm-lock；⑦ electron-ci 手动 install 步骤改 `scripts/run-package-install.js`；⑧ gui-test `paths` 里的 `package-lock.json`→加 `pnpm-lock.yaml` |
| `.github/scripts/workflow-contract.test.js` | 同步上述 npm→pnpm 断言；doc-gate 断言加 `pnpm-lock.yaml` |
| `.github/workflows/doc-gate.yml` | `paths-ignore` 的 `package-lock.json`→加 `pnpm-lock.yaml`（避免 lockfile 变更触发 doc-gate） |
| `scripts/` | 新增 `run-package-install.js`、`verify-worktree-deps.js`；重写 `fix-worktree-node-modules.sh`；`ensure-electron.js`/`launch-worktree.js` 文档提示更新 |
| `AGENTS.md` / `01-docs/build.md` / `CHANGELOG.md` | store-dir 机器级配置说明 + 新 worktree 流程 |

---

### 五、风险排序（Critical / Warning / Info）+ 验证策略

#### Critical
1. **electron-builder 真实打包兼容性**（QM-1）——`.pnpm` 卷入、symlink 解引用、`!ffmpeg*` 排除失效、体积翻倍。→ 迁移 PR 必须含 win+linux 的 `electron-builder --dir` 冒烟，核对 dist 体积与内容。
2. **`node_modules/@remotion/bundler/node_modules/esbuild` 硬编码路径失效**（electron-ci.yml:72）→ 用解析助手重写。
3. **`pnpm import` + `*` workspace 协议**——若 lockfile 未生成 `link:` 引用或拉到 registry，安装即失败。→ import 后立即检查 `importers` + 解析门禁。
4. **workflow-contract.test.js / nx.json / doc-gate / quality-gate 的 npm 硬编码**不同步改 → Gate 3 会挂、PR 全红。→ 与根 scripts 同 PR 一起改。

#### Warning
5. pnpm 10+ 屏蔽构建脚本 → vue-demi postinstall 不跑；本地与 CI 行为需 `onlyBuiltDependencies` + `--ignore-scripts` 策略统一。
6. store-dir 提交到 `.npmrc` 会坏 Linux CI → 机器级配置。
7. CI 缓存仍走 `cache: npm`/`package-lock.json` → 不换 `pnpm` + `pnpm-lock.yaml` 则依赖缓存与 nx 缓存失效语义失效。
8. depcheck 在 hoisted 下可能新增误报（`@multi-publish/*` 未识别）→ `check:deps` 需复验，必要时加 `--ignores`。
9. 并发会话未提交改动（`@esbuild/win32-x64@0.28.2`）与 pnpm-lock 生成互相覆盖 → 合并前协调；pnpm store 不可变，天然防 node_modules 污染。
10. dev 模式 / electron 冒烟 / `.playwright-browsers` 每 worktree 的成本 → 迁移后本地跑一次 dev 确认根路径假设成立。

#### Info
11. `@electron/rebuild -w better-sqlite3` 本是无操作（better-sqlite3 不在依赖图）→ 可删可留。
12. `madge` 用自己的解析器、不深入 node_modules → 不受影响。
13. 混合 registry（npmmirror + npmjs）会随 lockfile 保留 → 可接受。
14. 历史 `C:/tmp` worktree 跨盘硬链接退化为复制 → 均已在 D 盘，无影响。

#### 验证策略（证明迁移成功）
```bash
# 1. 锁文件与协议
pnpm import && grep -A2 '@multi-publish' pnpm-lock.yaml   # 确认 link:/workspace:，非 registry
pnpm install --frozen-lockfile && node scripts/verify-worktree-deps.js
# 2. 等价回归（对照 npm 基线）
pnpm -r --if-present test
pnpm --filter @multi-publish/desktop test -- --maxWorkers=1 --no-file-parallelism
pnpm run check:deps && pnpm run check:circular
pnpm --filter @multi-publish/desktop build:vue && node scripts/ensure-electron.js && <electron 冒烟>
# 3. 打包门禁（QM-1）
cd apps/desktop && pnpm exec electron-builder --dir   # win + linux 各一次；核对体积 ~= npm 基线
# 4. worktree 复制验证：新建 throwaway worktree
git worktree add ../mp-pnpm-verify && cd ../mp-pnpm-verify && time pnpm install
node scripts/verify-worktree-deps.js && pnpm --filter @multi-publish/desktop test -- --maxWorkers=1 --no-file-parallelism
# 5. CI 全量：7 个 workflow 各跑一次，Gate 3（workflow-contract）必须绿
```

---

### 建议（Action Items）

1. [ ] 写 `pnpm-workspace.yaml` + `.npmrc`（`node-linker=hoisted`）+ 根 `packageManager`/`pnpm.onlyBuiltDependencies`；先跑 `pnpm import` 并冻结 lockfile。
2. [ ] 新增 `scripts/run-package-install.js` 与 `scripts/verify-worktree-deps.js`；改写 electron-ci 手动 install 步骤。
3. [ ] 全仓 `npm run/npx`→pnpm 等价语法 + `@multi-publish/*`→`workspace:*`（先 desktop，再各 package 的 `*` 引用）。
4. [ ] 同步 7 个 workflow + `nx.json` + `workflow-contract.test.js` + `doc-gate.yml` 的 lockfile/npm 引用。
5. [ ] **先在分支上做 electron-builder `--dir` 冒烟（win+linux）**，确认 `.pnpm` 排除与体积后再合入；这是唯一无法靠单测证明的环节。
6. [ ] 重写 `fix-worktree-node-modules.sh`（junction 检测→pnpm install→门禁），删除整目录 Junction fallback。
7. [ ] 用 throwaway worktree 做时间与解析门禁验收，再更新 AGENTS.md/build.md/CHANGELOG。

---
SESSION_ID: a030b3ab-8995-4471-8daf-112362fa6a97
