---
record: fix-ipc-namespace-contract
task: 修 CRITICAL-1（影视单镜重试永久失效，preload 命名空间与渲染层扁平名错配）+ 新增渲染层↔preload 暴露面反向契约测试（18 用例，含红证据与两道反证）
date: 2026-10-05
sync_status: PENDING
sync_reason: 本 PR 尚未合并，merge SHA 还不存在，无法取证
sync_backfill_owner: 下一个会话（合并后就地改写为 PASS + merge SHA，并在同一次提交删除本段三个 sync_* 字段与 scripts/gate-record-debt-ledger.json 的本条登记）
---

## 本次执行记录：影视单镜重试永久失效修复 + IPC 暴露面契约（fix-ipc-namespace-contract，2026-10-05）

> 分支：`fix-ipc-namespace-contract`（worktree `D:/Data/projects/mp-worktrees/mp-fix-ipc-namespace-contract`，`scripts/start-mp-task.ps1 -TaskName fix-ipc-namespace-contract` 建区，`verify-worktree-deps.js` OK 11 项）
> 范围：🐛 Bug 修复 + 新增门禁。**运行时代码变更** ⇒ 完整质量节拍（非 docs-only 快通道），QM-1/QM-2/QM-4/QM-6 均适用。
> 变更面：`apps/desktop/src/api/electron-bridge.js`（新增 `invokeNamespace`）、`apps/desktop/src/api/publisher.js`（C-1 调用侧）、新增 `apps/desktop/electron/tests/ipc-exposure-contract.test.js`、`docs/ipc-exposure-contract.md`、`01-docs/learnings.md`、`CHANGELOG.md`、change 工件。

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | PASS | 隔离 worktree 内编辑；共享根 `RequireClean` 通过（本会话开工前 `ccg-gate` 会话已收口，porcelain 0 改动、HEAD 与 origin/main 同步）。`install-git-hooks.ps1` rc=0 |
| 第一性原因（QM-5 ①） | PASS | 不是 `publisher.js:396` 那一行写错，而是**跨两侧的接缝没有任何断言**。preload 侧 `preload.test.js` 把转发矩阵与暴露面测得很全；渲染层 `useFilmVideoGen.test.js` / `useFilmProduction.test.js` 用 `vi.mock('@/api/publisher')` **整体 mock 掉被测模块**，只断言"调用了 `filmEngineeringRetryShot`"，结构上无法发现 preload 没有该方法 ⇒ 两侧各自绿，方法名写错一路进主干 |
| 逃逸分析（QM-5 ②） | PASS | 四层全漏：**单元层**整体 mock 掉本模块；**集成层**无 preload 暴露面契约测试；**E2E 层**无「重试失败分镜」用例；**视觉层**该操作失败与「点了没反应」像素上不可区分；**审查层**两侧测试各自自洽、读起来完全说得通 |
| 修复 + 回归保护（QM-5 ④） | PASS | ① 修复：`electron-bridge.js` 新增通用 `invokeNamespace(ns, method, ...args)`（按 ns→method 两级取，参数经 `toPlainIpcValue` 脱壳，与 `invoke` 同口径）；`publisher.js` 改走 `invokeNamespace("filmEngineering", "retryShot", payload)`，fallback 形状逐字不变。**未改** preload 暴露面、主进程 handler、IPC channel。② 回归保护：新增 `electron/tests/ipc-exposure-contract.test.js` **18 用例**——取 preload 真实暴露面对账 `src/api/**` 全部调用名、差集对 `public ∪ admin` 求、扫描域棘轮、判据矩阵（正例长度精确断言 + 10 条负例）、命名空间形态对账、失败文案三条断言。③ 回归实跑 **669 passed / 0 failed**（`preload.test.js` 372 / `publisher.test.js` 251 / `useFilmVideoGen` 14 / `useFilmProduction` 13 / `FilmCanvasView.actions` 8 / `electron-bridge` 8 / `FilmCanvasView` 3） |
| 红证据与反证（先证明锁会红） | PASS | **红**：修 C-1 之前契约测试判红并**点名** `filmEngineeringRetryShot`（"未登记的暴露面缺口（1）"），且只红这一条。**反证 1**：把判据改成 `literal: []`（恒返回空数组的 no-op）⇒ 恰 2.2 正例矩阵判红，矩阵对 no-op 不免疫。**门禁级反证 2/2**：① 渲染层新增不存在的调用名 ⇒ 对账判红；② preload 移除 `filmEngineering.retryShot` ⇒ 哨兵用例 + 命名空间对账判红。三次变异后均按 md5 逐字节还原且还原后复跑 18/18 转绿 |
| 存量全量对账（1.1–1.3） | PASS | `src/api/**` 渲染层真实方法名 **213 个**；暴露面 public 411 键/467 可解析、admin 416 键/472 可解析。差集逐条判定：活的真实缺陷 **1**（C-1）、死代码 **3**（`pipelinePauseWithCheckpoint`/`pipelineRegisterPipeline`/`pipelineResumeFromCheckpoint`，暴露面无此名且**除自身定义处 0 引用**）、权限门控 **1**（`paymentSimulate`，在 `ADMIN_ONLY_METHODS` 内，非 admin 整键不暴露，主进程另有 `app.isPackaged !== false` 硬守卫且已有测试 ⇒ **非缺陷**）、测试夹具假名 **5**（扫描域排除）。清单落 `docs/ipc-exposure-contract.md` |
| 防止再次发生（QM-5 ⑤） | PASS | ① 新增 18 用例的契约测试**自动进入必检**：`package.json` 的 `test` = `vitest run`，`vitest.config.js` include 含 `electron/tests/**`，CI Gate 4（required check，阻塞级）跑 `--shard=N` 覆盖全部 include 文件；证据 `vitest list` 实跑枚举出 18 个用例。② 死 wrapper 进 `KNOWN_GAP` 白名单并把"只能缩小"做成两条**可执行**断言（暴露面一旦出现同名方法、或用 `countCallersOutside` 数到外部调用方，即判红）。③ 未登记缺口带**可执行诊断文案**判红（提示查 `ADMIN_ONLY_METHODS` / 登记 `KNOWN_GAP` / 修调用侧三选一），不留静默通过的口子。④ 判据先剥注释，堵掉"把坏调用注释掉"这条绕过路径 |
| 行尾与 diff 对账 | PASS | 变更文件两口径 `numstat` 逐个一致。`CHANGELOG.md`（纯 CRLF）、`01-docs/learnings.md`（纯 CRLF，HEAD 既有 7212 个 U+FFFD 属历史损坏，本次新增段 0 个、存量未增未减）、change 工件（CRLF）、新增测试与 docs 按各自既有风格落盘，均无 CRLF 噪音 |
| 接线棘轮 | PASS | 新增 `*.test.js` 已被 `vitest.config.js` include 与 Gate 4 分片**显式覆盖**（`electron/tests/**/*.test.{js,ts}`），非「只写在配置里没人跑」。`affected-test-selection` 是跨包优化机制（其 spec 场景限定 `packages/shared-utils`），本次改 `apps/desktop`，且该 spec「全量回归保留」条要求合并到 main 跑全量 ⇒ 无需登记 |
| QM-1 本地打包 | PASS | `verify-worktree-deps.js` OK 11 项 → `pnpm run build:dir`（vue 17.28s + electron-builder 25.1.8）→ exe 225,485,824 B、asar 149,315,048 B。**产物层取证**（强于"测试绿"）：主 chunk `index-BiXhD_pf.js` 中该 wrapper 压缩后真身 = `function Hfe(e){const t=await NI("filmEngineering","retryShot",e);return t===void 0?{code:-1,message:"electronAPI not available"}:t}`，`NI` 即 minify 后的 `invokeNamespace`；`filmEngineeringRetryShot` 作为**字符串字面量在产物中出现 0 次** ⇒ `undefined` 路径已从发布产物消失。启动验证：独立临时 userData 启动 8 秒，**进程存活、stderr 0 字节**，未命中 `Failed to load platform config`/`PluginLoader.*mkdir failed`/`ENOTDIR.*app.asar`/`ERR_FILE_NOT_FOUND.*index.html`。任务点名的重点另由仓内工具验证：`pnpm run test:preload:sandbox` → `PRELOAD_SANDBOX_TRUE_OK`/`FALSE_OK`/`BOTH_MODES_OK` |
| QM-2 必检项 | PASS | ① `invokeNamespace` 对参数走 `toPlainIpcValue`（`electron-bridge.js:102`，与 `invoke` 的 `:35` 同口径）；② 两个调用侧 payload 均由 `JSON.parse(JSON.stringify({ runId: runId.value, shotIndex, aspect: chosen.value.aspect, seconds: chosen.value.seconds }))` 显式 `.value` 解包构造，**无 ref/reactive 包装** |
| QM-4 视觉 | N/A | 本次为纯逻辑与桥接层形态变更，未改任何模板、样式、组件结构；界面呈现（重试按钮与失败 toast）沿用既有实现，未产生像素差异面 |
| QM-6 CCG 双模型外部评审 | **未执行（如实登记）** | 本机 `codeagent-wrapper` 通道此前实测不干净（前端路两次空转 rc=0/1 且零产物；后端路首投 stdout 截断在第一条 finding 中途、包装器日志退出自清、无 rollout 不可恢复）。**不以自审冒充外部评审通过**。本次的替代证据是上面三道机械反证（红证据 + no-op 反证 + 门禁级双变异），它们能证明「新锁承重、判据不免疫、两侧都咬得住」，但**不能替代对实现本身的多视角评审**——这是本记录的已知缺口 |
| 远程同步 | PENDING | 本 PR 在途：合并后取 `git log origin/main --grep='(#NNNN)$' --format=%H|%cI` 回填 merge SHA 与时间，`git ls-remote --heads origin fix-ipc-namespace-contract` 返回 0 行证远端分支已删；回填后删除上方三个 `sync_*` 字段，并在**同一次提交**删除 `scripts/gate-record-debt-ledger.json` 的本条登记 |

### 两次自我纠正（写进记录，不抹掉）

1. **一度判定 `paymentSimulate` 是「审查报告漏掉的第二个真实缺陷」**，并差一步就去 preload 补暴露。实际它在 `ADMIN_ONLY_METHODS`（`access-control.js:7`），非 admin 等级**整键不暴露**，admin 面实测存在，主进程另有硬守卫 ⇒ **误判**。而误判后的直觉修法**方向与既有安全设计相反**。根因：只对 public 面求差集 + 采信相似名启发式。
2. **design.md 的 D4 机制假设被实测证伪**：原文写「直接 require `createXxxApi` 工厂函数取暴露面」，但 `preload/index.js` **不导出** `exposedApi`；而 `preload.test.js` 正是手抄路线的产物——只组合 7 个工厂、断言键数 **334**，真实面 411/416。**334 是个漂移的子集，拿它当基准开局就是大面积假阳性。** 已把 D4 改写为「拦截 `exposeInMainWorld` 的最终产物」，并新增 D5（差集对 `public ∪ admin` 求）、D6（扫描域排除测试文件与 wrapper 自身）、D7（死 wrapper 登记而非删除）。

### 实现期踩坑（已固化进测试或注释）

- **`vi.mock('electron')` 拦不住 CJS 源文件的 `require`**：vitest 给 CJS 注入的 require 走真实 Node loader、绕过 vi.mock 的 ESM 注册表；`require('electron')` 拿到的是该 npm 包导出的**可执行文件路径字符串**，症状 `TypeError: Cannot read properties of undefined (reading 'on')`。改用 `Module._load` 拦截（纯 Node 可跑，不拉起 Electron 窗口）。
- **判据矩阵当场抓到判据自身的 2 个真 bug**：`invokeWithFallback` 正则缺 lookbehind（`this.invokeWithFallback("x", null)` 被误抽取）；扫描域棘轮只排除了 `*.test.js`、没尊重 `SCAN_EXCLUDED` 里的 `electron-bridge.js`。
- **只做"最后一跳"对账会留盲区**：把扁平调用改成 `invokeNamespace` 之后，若判据不认命名空间形态，这条路径对契约完全隐形。已把对账从扁平扩展到命名空间形态，并加「C-1 的修复形态必须在场」与「扁平名必须已消失」两条锁。

### 遗留（不假装已闭合）

- **QM-6 未执行**，见上表。这是本 PR 最明确的缺口。
- `pipelinePauseWithCheckpoint` / `pipelineRegisterPipeline` / `pipelineResumeFromCheckpoint` 三个死 wrapper **仍留在 `publisher.js`**，只在契约测试里被登记为 `KNOWN_GAP`。它们是潜伏陷阱：任何人将来接上调用方，就会复活一个静默失效的功能。删除会牵动 `publisher.js` 导出面与他人分支，未在本 change 做。
- `docs/ipc-exposure-contract.md` §七列的判据固有边界（拆句等价、别名/动态取名、字面量右括号、扫描域写死）**未消除**，只是被登记并由棘轮部分兜底。
- `01-docs/learnings.md` 的 7212 个 U+FFFD 历史编码损坏**未修**（会产生上万行无关 diff）。
- `paymentSimulate` 仍是 `UpgradeModal` 的 dev/管理员路径；若将来要把它暴露给非管理员，属产品与安全决策，需另开切片。
