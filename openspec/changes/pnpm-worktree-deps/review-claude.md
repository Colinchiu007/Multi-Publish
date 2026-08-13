[codeagent-wrapper]
  Backend: claude
  Command: claude -p --dangerously-skip-permissions --setting-sources  --output-format stream-json --verbose -
  PID: 1628
  Log: D:\Temp\codeagent-wrapper-1628.log
  Web UI: http://localhost:65518
  Session-ID: 747a9343-4535-4f99-8f4b-d26f90b2499f
Review complete. I verified key facts against the live repo: `allowBuilds` is the correct pnpm 11 key (`onlyBuiltDependencies` was removed in v11), `package-lock.json` is gone, no `.npmrc` with a store-dir is committed, root scripts are fully pnpm-ized, and only 3 `npm` script references remain in `apps/desktop/package.json`. Here is the review.

---

## Review: npm → pnpm 迁移（pnpm-worktree-deps）

### Critical 🔴

**1. `visual-test.yml` 的 Vite 启动丢失了 `exec` 参数（此 workflow 必然失败）**
- **位置**: diff L686-687 / `.github/workflows/visual-test.yml:59-60`
- **问题**: 迁移时只把 `npx.cmd` 换成了 `pnpm.cmd`，但 `-ArgumentList` 仍是 `@("vite", ...)`：
  ```powershell
  $viteProcess = Start-Process -FilePath "pnpm.cmd" `
    -ArgumentList @("vite", "--host", "127.0.0.1", "--port", "5174")
  ```
  `pnpm vite` 会被当作 `pnpm run vite` 解析（pnpm 脚本简写），而 `apps/desktop/package.json` 没有名为 `vite` 的 script → 进程立即以 "Missing script: vite" 退出 → 下面 30s 轮询命中 `if ($viteProcess.HasExited) { throw "Vite exited before becoming ready" }` → **整个 visual-test workflow 的红线步骤必挂**。对比 `quality-gate.yml` visual job（diff L566-568）与 Gate 8（diff L613-614）都已正确改为 `@("exec", "vite", ...)`，唯独此文件漏改。
- **修复**: 改为 `-ArgumentList @("exec", "vite", "--host", "127.0.0.1", "--port", "5174")`。
- **附带契约缺口**: `.github/scripts/workflow-contract.test.js`「视觉工作流…Windows 渲染环境」只断言 `Start-Process -FilePath "pnpm\.cmd"` 与 `pnpm\.cmd run test:visual:pixel`，没有断言 vite 的 `-ArgumentList` 含 `exec`，因此 14/14 契约全绿但该 workflow 仍是坏的。建议在契约测试中增加 `exec` 断言（对齐 quality-gate 的实现）。

### Warning 🟡

**2. `apps/desktop/package.json` 三个打包脚本仍是 `npm run` 残留**
- **位置**: diff L928-930 / `apps/desktop/package.json:13-15`
  ```json
  "build": "npm run build:vue && electron-builder",
  "build:win": "npm run build:vue && electron-builder --win --x64",
  "build:dir": "npm run build:vue && electron-builder --dir",
  ```
- **为什么**: 根脚本 `pnpm --filter @multi-publish/desktop build:win`（diff L1553-1554）会进入这三个脚本并重新 `npm run build:vue`。它当前能跑只是因为 CI/本地机器恰好装了 npm——但这直接违反 spec Requirement「pnpm 为唯一依赖管理器」（`pnpm-lock.yaml` 为唯一锁文件，`npm run` 不应出现在任何脚本里），也是「遗漏：npm 残留」点第 5 项里唯一仍在执行路径上的残留。
- **修复**: 三处统一改 `pnpm run build:vue && electron-builder`。

**3. `production-dependency-security.test.js` 的 axios 断言语义被弱化**
- **位置**: diff L1586-1593 / `packages/api-publish-engine/test/production-dependency-security.test.js:24-31`
- **问题**: 原断言读 `lockfile.packages['node_modules/axios'].version`（即 api-publish-engine 实际解析的 axios）；新实现用 `/axios@(\d+\.\d+\.\d+)/` 取**全文第一个**匹配。`pnpm-lock.yaml` 里排序是字典序：`axios@1.18.1` 排在 `axios@1.7.9` 之前（'1.1' < '1.7'）。后果：若未来某个传递依赖拉进 `axios@1.7.x`，第一个匹配仍是 1.18.1 → 测试照样通过，但存在高危版本却未被拦截（假阴性）；反过来若首个版本 `< 1.18.1` 又会误报。
- **修复**: 解析 `importers` 段中 `packages/api-publish-engine` 的 `axios` resolved version，或对 lockfile 中所有 `axios@` 版本都断言 `isAtLeast >= 1.18.1`。

**4. `fix-worktree-node-modules.sh` 使用非 frozen 的 `pnpm install`**
- **位置**: diff L1722 / `scripts/fix-worktree-node-modules.sh:59`
- **问题**: 脚本执行 `pnpm install`（不带 `--frozen-lockfile`）。文档（AGENTS.md/build.md）明确「锁文件只在单一 worktree 更新，其余 worktree 用 `--frozen-lockfile`」。修复脚本运行在任意 worktree 里，若该分支 lockfile 与 pnpm 解析有细微漂移，会被静默改写并在该分支产生未提交的 lockfile diff。
- **修复**: 改 `pnpm install --frozen-lockfile`（该脚本目的只是重建 node_modules，不应更新锁文件）。

**5. `run-package-install.js` 对共享 store 的写穿（hardlink 变异）风险**
- **位置**: diff L1810-1824（`runInstall` 的 `spawnSync`）
- **问题**: `node-linker=hoisted` 下 `node_modules/vue-demi` 是指向 `.pnpm/vue-demi@x/...` 的 symlink，其中文件是从全局 content-addressable store **硬链接**而来。`vue-demi/scripts/postinstall.js` 会重写其自身 `package.json`——通过硬链接写入会**变异共享 store 的内容**，影响所有复用同一 store 的 worktree。内容确定性使它目前无实际危害，但这是本迁移想根除的那类「共享实例被改动」的隐患，且 esbuild install.js 同理。
- **修复**: 对会改写自身文件的 postinstall，先拷贝一份到临时目录再执行；或至少加注释说明 vue-demi postinstall 幂等、下次 install 会从 store 重新链接覆盖，明确该风险已被接受。

### Info 🟢

**6. `verify-worktree-deps.js` 硬编码主仓库路径**
- **位置**: diff L1877 / `scripts/verify-worktree-deps.js:18`：`const mainRepo = 'D:/Data/projects/Multi-Publish'`。仅用于错误提示后缀，Linux CI 上永远不会匹配；建议从 `git worktree list` 或环境变量派生。

**7. `verify-worktree-deps.js` 链接扫描的 prefix 比较缺少分隔符**
- **位置**: diff L1953：`!targetCanon.startsWith(rootCanon)`。不像消费方解析那处（L1935）带 `+ path.sep`，若存在 `...\mp-pnpm-worktree-deps-other` 之类同名前缀目录会被误判为合法。当前 workspace 链接都在 root 之下，实际不可达，但应补 `path.sep` 保持两处一致。

**8. `verify-worktree-deps.js` 的 `canonical` fallback 会掩盖「悬挂链接」**
- **位置**: diff L1879-1885：`fs.realpathSync.native` 对悬挂 junction 抛错后回退到 `path.resolve(p)`（链接自身路径，必然在 root 内）→ section 2 扫描会静默放行指向已删除外部目标的坏链接。section 1 的 `require.resolve` 对消费者会兜住，但**未被任何包消费**的 workspace 链接则漏检。

**9. `quality-gate.yml` 四处错误消息仍写 npm**
- **位置**: `.github/workflows/quality-gate.yml:174,189,268,283`（"terminated the npm process tree" / "after npm exited"）。纯文案，但排障时会误导（实际进程已是 pnpm）。

**10. 其他小项**
- `scripts/ensure-electron.js:40` 错误提示仍写「请先 npm install」（应为 pnpm）。
- 根 `package.json` 保留 `workspaces: ["apps/*","packages/*"]`，pnpm 11 会在 install 时打印「ignored」告警；无功能影响，可留可删（design 决策 #2）。
- `@electron/rebuild -f -w better-sqlite3`（electron-ci/gui-test）实为 no-op：better-sqlite3 不在依赖图。保留无害。
- `run-package-install.js` 的 `resolveViaVirtualStore` 只匹配非 scoped 名（`.pnpm/esbuild@*`），scoped 包在 `.pnpm` 里是 `@scope+name@` 形式；当前仅用于 esbuild/vue-demi，无影响，将来复用时需注意。
- 7 个 workflow 里 `pnpm/action-setup` 的 `pnpm@11.13.1` 硬编码重复 7 份；与根 `packageManager` 声明一致，但升级需改 7 处，可考虑省略让 action 读 packageManager。

### 已核实无问题（非缺陷）
- `allowBuilds` 是 pnpm 11 正确键名（`onlyBuiltDependencies` 已在 v11 移除），map 值布尔格式正确；`nodeLinker: hoisted` 放 `pnpm-workspace.yaml` 正确。electron 未放行是刻意的（@43 无 postinstall）。
- `verify-worktree-deps.js` 的 realpath 比较与 `require.resolve(..., { paths: [dir] })` 消费方解析逻辑正确；`run-package-install.js` 的解析顺序（root → @remotion/bundler → vue-demi → `.pnpm` 虚拟存储 glob）能正确覆盖 esbuild 0.25.12/0.28.1 双版本。
- `pnpm.cmd --filter @multi-publish/desktop test -- --shard=…`、`Start-Process pnpm.cmd`、`cache: pnpm`、`--frozen-lockfile` 的语法与顺序全部正确；setup-node `cache: pnpm` 均位于 pnpm/action-setup 之后。
- 契约测试（workflow-contract / gui-ci-exit-contract / e2e-quality-infrastructure / build-preload）的断言与新 workflow 逐条对齐（除第 1 项所述 vite exec 断言缺失）。

### Summary
方向正确、绝大多数迁移点到位，`allowBuilds`/`node-linker`/解析门禁/`.pnpm` 排除均合理。**但有一个会实际打断 CI 的 Critical：`visual-test.yml` 的 Vite 启动漏加 `exec`**，且现有契约测试恰好未覆盖该参数而放行。其余为一致性与健壮性问题（desktop 打包脚本的 npm 残留、axios 断言语义弱化、修复脚本非 frozen install、store 写穿风险）。建议：修掉 Critical + Warning 2/3 后再合并，Warning 4/5 可权衡后处理。

Sources:
- [pnpm Settings — Build Settings (allowBuilds)](https://pnpm.io/settings)
- [pnpm Build Settings reference](https://pnpm.io/settings/build)

---
SESSION_ID: 747a9343-4535-4f99-8f4b-d26f90b2499f
