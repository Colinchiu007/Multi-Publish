---
sync_reason: 远程同步 PENDING——PR 开启中（分支 podcast-rss-channel）；合并后在状态列改写 PASS + merge SHA，并同一次提交删除 gate-record-debt-ledger.json 的登记项与本篇 frontmatter 三字段（回填与销账必须同一次发生）
sync_backfill_owner: agent（PR 自动合并后由回填 PR 收口）
---

# 执行记录：播客 RSS 频道发布（podcast-rss-channel，2026-10-09）

- **分支 / worktree**：裸分支 `podcast-rss-channel` @ `D:\Data\projects\mp-worktrees\mp-podcast-rss-channel`（非 C 盘）；共享根 `D:\Data\projects\mulpub` 保持 `main` 且未被写入。
- **变更分层**：运行时代码（`packages/shared-utils/`、`apps/desktop/electron/`、`apps/desktop/src/`、`packages/api-publish-engine/test/`）⇒ 走完整质量节拍，`classify-docs-only.js` 判定 false。
- **需求来源**：`01-docs/INVESTIGATE-XIAOYUZHOU-PODCAST-2026-10-09.md`（小宇宙无发布侧 API，仅消费侧 RSS 协议）→ `01-docs/PRD-PODCAST-RSS-CHANNEL-2026-10-09.md` → `docs/adr/0008-podcast-rss-is-protocol-channel-not-platform.md` → `openspec/changes/podcast-rss-channel/`（proposal / design / tasks / specs）。

## 提交构成（origin/main..HEAD，rebase 后 SHA）

| SHA | 内容 |
| --- | --- |
| `66c9b03fc` | 共享层单一实现：`podcast-rss.js`（校验/构建/自检/判重 `EPISODE_DUPLICATE` / `PODCAST_FEED_INVALID` fail-closed 不写文件）+ `podcast-endpoints.{json,js,browser.js}` 目录与 CJS/ESM 孪生（parity 锁）+ 33 例回归 |
| `00fb31d70` | 形态 B 托管直传**规则层** `podcast-hosting-upload.js`：`validateHosting` 缺字段 fail-closed、`deriveObjectKey`（禁标题/禁路径穿越）、`objectPublicUrl`（禁拼出 `bucket.bucket`）、OSS V1 待签串结构断言、签名头返回值不含凭证、STS 形态 `uv` 形状、`putObject` 出站经注入 `httpClient`（测试零真实出站）+ 34 例 |
| `8c61ce318` | 主进程持久化与接线：`podcast-channel-service.js`（`{userData}/podcast/{channel.json,episodes.json,feed.xml}`、`PODCAST_FILES` 单点导出、临时文件 + 原子 rename、仅 `EPERM/EACCES/EBUSY` 有界退避、损坏即 `PODCAST_STORE_CORRUPT`）+ `ipc-handlers/podcast.js`（8 通道，**字面量**注册）+ `preload/podcast.js`（`electronAPI.podcast`，两个 bundle 已重生成） |
| `e38a678ae` | 渲染层：`PodcastChannelView.vue`（频道/单集/feed+分发端指引三区块）+ `usePodcastChannel.js` + 路由/侧栏/`useTabDocumentTitle` 注册 + zh/en **成对** locale |
| `763c04524` | ADR-0008 正交闸锁：`publishMode` 三态不回退、误配 `rss` 经 `normalizeMode` 抛 `/unknown publishMode/`、`platforms.yaml` 键集不含分发端 id；max-lines 基线随 locale 落盘更新（接受漂移，已披露） |
| `151541f23` + `eaf379d3c` + `f94bc0060` | docs 刀：PRD / 调研报告 / ADR-0008 / openspec 四件套入库并按三刀实况回填（§8.2 落盘位置、§8.3 composable、§8.5 正交闸 enforcement、§9.1 实现偏差表、P0/P1 状态行）；`eaf379d3c` 补执行记录的远程同步行与 `sync_*` 登记字段；`f94bc0060` 补 CHANGELOG 的 QM-6 修复段与视觉登记段，并把 proposal 的 Impact 范围清单与实际改动逐一对齐（SHA 以 `git log --oneline origin/main..HEAD` 当场取证为准） |
| `ac2242ffe`（修复刀，QM-6 处置 + QG Static 红因修复） | ① **Critical**：`buildItem` enclosure/guid 取址改为 `audioUrl` 优先，与 `resolveEnclosure` 同序（此前反向可让 http 地址经校验入 feed）；② `verifyFeed` 徽标 `ok` 改引擎语义 `issues.length===0`（不再沿用恒真的 IPC envelope.ok）；③ guid `trim` 后纯空白视同缺省（与判重口径一致，杜绝空 `<guid>`）；④ `ownerEmail` 公开提示落地（`podcast-owner-email-privacy-hint` + zh/en 成对键）；⑤ 保存失败 issues 区块逐条清单（`podcast-channel-save-issues`/`podcast-episode-save-issues`，成功即清空）；⑥ 渲染层 CJS 越界修复：新建窄面 ESM 孪生 `podcast-rss.browser.js` + vite alias + 裸 specifier import。回归锁：引擎 38 passed（含 2 条 QM-6 锁）、视图 30 passed（含 4 条 QM-6 锁）、契约 6 passed；每条修复均做变异反证后还原全绿。PRD §5.3/§6.3/§九.A/§9.1/§十/§11.1 已同步写入实况 |
| `88399d827`（第三次刀） | 浅色像素基线按 CI artifact 回填（新增 `podcast-channel.png` + 重建 8 张侧栏位移视图，逐张 SHA-256 自证 0 px，`check-baseline-freshness` 违规 8→0）+ 修掉一处**注释引发的 IPC 假缺口**（`check-ipc-bridge.js` 的 `RE1` 不剥注释，把示例读成真实注册，432→431 handlers）+ 第三刀 QM-1 复跑 + `01-docs/learnings.md` 事件一~四。详见下方「QM-4 浅色基线回填证据」 |
| 第四次刀（本记录所在提交，SHA 以推送后 `git log` 为准） | **两道此前从未被执行到的 `QG Static` 门禁**：① Gate 10 渲染端 IPC 单轨制——新建 `src/api/podcast-channel.js`（本页唯一桌面端取用点，内部走 `electron-bridge.js` 的 `invokeNamespace`，**8 个具名导出各自写方法名字面量**——不得写成泛化转发，否则 `ipc-exposure-contract` 判「生产侧动态取名」，且新面须登记进 `SCAN_DOMAIN`），composable 的 9 处直写与自制探测函数删除，`{available:false}` 与抛错分档保两种用户可见语义；新增 `usePodcastChannel-ipc.test.js` 11 例（含 reactive 脱壳行为锁 + 逐条字面量结构锁 + 导出名与暴露面逐字一致锁；变异反证：摘 `available` 红 3 例、退回变量转发时**外部门禁与本 PR 结构锁同时红**）。② Gate 16 字号标度——`PodcastChannelView.vue` 16 处 `font-size: Npx` 折进七档令牌，16px→`md`、14px→`base` 使两处标题各高 1 px（明确拒绝 `calc(… - 1px)` 规避）。连带：`podcast-channel.png` 基线重新失效，须按下一次 run 的 artifact 重取。本机 `check-frontend-consistency` 0/0 PASS、`check-font-size-scale` 34/790 PASS，并按「同 job 步骤顺序」教训把该 job 全部 37 个门禁脚本逐个复跑。文档同步：PRD §9.1 新增同名行、§十 新增字号标度显示项、§十五 两行改写；tasks §4.6 新增；proposal Impact/未闭合项扩展；CHANGELOG 新增第四刀段；learnings 新增事件五~七 |

## QM-1 打包证据（实跑，非推断）

`node scripts/verify-worktree-deps.js` → OK（11 项解析到当前 worktree）→ `pnpm run build:dir` rc=0（vite 29.78s；electron-builder 25.1.8，`--dir`）：

1. **asar 清单**：`podcast-channel-service.js` / `podcast-hosting-upload.js` / `ipc-handlers\podcast.js` / `preload\podcast.js` / shared-utils 四份 podcast 源全部在包内；`\dist\` 条目 1913 项（渲染层已入包，非空壳）。
2. **require 链**：解包到 `D:\Temp\app-asar-pod-*` 后，4 个非宿主模块逐个 `require` 成功；`ipc-handlers/podcast.js` 唯一失败为 `Cannot find module 'electron'`（离线 node 无宿主；所有 ipc-handlers 文件同态），相对 require 全部解析 → 无路径层级/文件遗漏类缺陷。
3. **启动验证**：`Multi-Publish.exe` 存活 12 秒并输出 `[NOTIFY] window main-window-shown`；stderr 无 `Failed to load platform config`、无 `ENOTDIR.*app.asar`、无 `PluginLoader.*mkdir failed`、无配置/插件路径指向 asar 内部。现场两类与本刀无关的既有噪声：`spawn python ENOENT`（本机 PATH 无 python）、`许可证权限不足`（未打包授权开发态）。
4. 取证文件：`D:\Temp\mp-pod-qm1b.txt`（打包）、`D:\Temp\mp-pod-stderr.txt`（启动 stderr）。
5. **修复刀后复跑（第二次实跑，当下结论以本节为准）**：`pnpm run build:dir` rc=0（vite 30.63s）；asar 清单含 `podcast-rss.browser.js`/`podcast-rss.js`/`podcast-endpoints.browser.js` 等全部播客件与 `dist\assets\PodcastChannelView-*`；解包 `D:\Temp\app-asar-pod-c` 后 `require(podcast-rss.js)` 成功（exports=30）且包内文件含修复行 `const url = ep.audioUrl || ep.resolvedAudioUrl`；渲染 bundle 含 `podcast-owner-email-privacy-hint`；`Multi-Publish.exe` 存活 12 秒、`[NOTIFY] window main-window-shown`，stderr 三类禁发噪声（platform config / ENOTDIR asar / PluginLoader mkdir）计数 0。取证 `D:\Temp\mp-pod-qm1c.txt`、`mp-pod-stdout-c.txt`、`mp-pod-stderr-c.txt`。
6. **第三次刀后复跑（第三次实跑，当下结论以本节为准，覆盖前两次）**：`pnpm run build:dir` **rc=0**。① asar 清单命中 13 个 podcast 条目，含窄面孪生 `podcast-rss.browser.js`/`podcast-endpoints.browser.js`、引擎 `podcast-rss.js`、`preload\podcast.js`、`services\podcast-hosting-upload.js` 与渲染产物 `dist\assets\PodcastChannelView-JgfnGdUY.js`/`-CyMzj7-Q.css`（清单取证 `D:\Temp\mp-pod-asar-e.txt`）；② 解包 `D:\Temp\app-asar-pod-e` 后 `require(podcast-rss.js)` 成功（exports=30），包内仍含 Critical 修复行 `const url = ep.audioUrl || ep.resolvedAudioUrl`（计数 1），渲染 bundle 含 `podcast-owner-email-privacy-hint`（计数 1），`electron/ipc-handlers/podcast.js` 内 `ipcMain.handle('podcast:` 字面量 **8 处**（本刀只改注释，注册形态未被破坏）；③ 启动验证：`Multi-Publish.exe` 存活 >2 分钟、`[NOTIFY] window main-window-shown {}`，stderr 仅 163 B 的 `DEP0180 fs.Stats constructor is deprecated`，三类禁发噪声（`Failed to load platform config` / `ENOTDIR.*app.asar` / `PluginLoader.*mkdir failed`）在 stdout+stderr 双文件计数均为 **0**。取证 `D:\Temp\mp-pod-qm1e-stdout.txt`、`mp-pod-stdout-e.txt`、`mp-pod-stderr-e.txt`。
   - **本刀踩到并已修的一个环境坑（如实登记，因为它会让下一个会话误判 QM-1 失败）**：第二次复跑前 `build:dir` 报 rc=1，栈为 `app-builder.exe ... EnsureEmptyDir ... remove ...win-unpacked\d3dcompiler_47.dll: Access is denied`——根因是**前两次 QM-1 的启动验证遗留了 4 个 `Multi-Publish.exe` 进程仍占用 `dist-electron\win-unpacked`**，与代码无关。判据：出现该栈时先 `Get-Process | Where-Object { $_.Path -like '<本 worktree>*' }` 看遗留实例，`Stop-Process` 后重跑即 rc=0；**禁止**去删 `win-unpacked` 目录硬解（R0 删除守卫同样不允许），也**禁止**把这条报成打包失败。收尾已固化：启动验证后一律 kill 本 worktree 的实例（本次 `LEFT=0`）。

## 其余门禁

见 `.quality-gates.md` 顶部同名记录（TDD / 契约锁承重 / locale 成对 / max-lines / 未接线测试 / 品牌残留 / 行尾对账 / 文档同步 / QM-4 视觉 / IPC 桥接完整性 / QM-6 双模型 / 远程同步）。

## QM-4 浅色基线回填证据（第三次刀，2026-10-09，实跑非推断）

1. **首次 `QG Visual` 如设计报红**：run `37840950306`（head `f94bc0060`）的 `Gate 7 - Visual regression` 失败，即新用例无基线可比的 `ERR_VISUAL_BASELINE_MISSING`；同 run 的 `Upload GUI quality artifacts` 步骤是 `if: always()`，所以**一次 run 就同时给出「失败结论」和「可用作基线的渲染」**——这是本条能在下一刀闭合而不是需要两刀的前提。`Gate 7b`（基线新鲜度）因步骤级 `if: success()` 被 skipped，属预期，不影响取证。
2. **渲染来源**：`gh run download 37840950306 --name quality-gate-visual-reports -D D:\Temp\mp-pod-vr`，判定域取 `tests/visual-testing/screenshots/`。回填一律复用 `scripts/check-baseline-freshness.js` 的 `findRender(rendersDir, name)`，**不新写第二份命名映射**（该函数优先取视图套件产出的 `<name>.png`，它才是 Gate 7b 的权威渲染；像素门禁自己的 `<name>-current.png` 与它**不是同一张图**，workflow 在 `quality-gate.yml:1050-1064` 已用实测数值说明这点）。9 张全部命中 `from=views`。
3. **回填清单与自证**：新增 `podcast-channel.png`（115579 B）；重建侧栏位移的 8 张 `calendar`/`cloud-publish`/`collection`/`create-editor`/`intelligence`/`keyword-monitor`/`model-providers`/`viral-analysis`。逐张 SHA-256 对照源渲染 = **0 字节差**；`node scripts/check-baseline-freshness.js --renders=<本次 artifact>/screenshots --baselines=apps/desktop/tests/visual-testing/base-screenshots --partial` → **检查 42 张 / 违规 0 张 / 登记内动态漂移 0 张**（同一条命令在回填前报 **8 张违规**，回填后归零，前后对照即证据）。`node --test scripts/check-baseline-freshness.test.js` 34 passed；`vitest run tests/visual-ci.test.js electron/tests/visual-view-runner.test.js electron/tests/ipc-contract.test.js electron/ipc-handlers/podcast.test.js` → 4 files / 50 tests passed。
4. **漂移归因（不是噪声）**：8 张里 7 张对旧基线的差异**恰好同为 473 px**，`collection` 231 px；七个互不相关的视图给出逐字相同的漂移量，形状上只能是同一共享元素（侧边菜单新增「播客频道」条目）在每个含侧栏页面各渲染一次。**判据不是提阈值**：`PIXEL_THRESHOLD` 未动，`KNOWN_DYNAMIC` 仍为空，未新增任何忽略区。
5. **暗色基线 `podcast-channel-dark.png` 本 PR 不产出（结构性原因，非偷懒）**：`test:visual:pixel:dark` 只接线在 `.github/workflows/visual-test.yml:100`（main push / workflow_dispatch），PR 侧 `QG Visual` 只跑浅色，故本 PR 转绿不依赖暗色基线；`.gitignore` 的 `!podcast-channel-dark.png` 放行条目本次已一并落盘（`visual-ci.test.js` 的放行锁只要求**条目存在**，实测通过）。暗色基线按同一口径在合并后由 main 那次 Visual Tests 的 artifact 回填——登记为下方「已知未闭合」的一条，不伪装已完成。
6. **第四次刀使本节第 3 条的 `podcast-channel.png` 重新失效（如实登记，勿当作已闭合）**：该刀为满足 `QG Static` Gate 16 字号标度，把本页 16 处 `font-size: Npx` 折进七档令牌，其中 16px→`md`(17px)、14px→`base`(15px) 是**真实的 1 px 尺寸变更**（`.podcast-section h2`、`.podcast-endpoint-card h3`），故 run `37840950306` 的渲染不再等于新代码的渲染。其余 8 张侧栏位移基线**不受影响**（第四刀未触碰任何共享元素）。处置口径与本节第 2~4 条完全一致：取**下一次 run** 的 `quality-gate-visual-reports`，复用 `findRender()`，逐张 SHA-256 自证 0 px，不提 `PIXEL_THRESHOLD`、不加 mask、`KNOWN_DYNAMIC` 保持为空、不用本机截图。**一条必须写明的判据差异**：PR 侧 `QG Visual` 用 6% 全页容差，对 1 px 文本变更**天生失明**，所以本 PR 即使报绿也**不能**作为"基线仍有效"的证据；能证伪它的只有合并后 main 那次 Visual Tests 的基线新鲜度门禁（逐像素 0 px）。这也再次说明「测试全绿 ≠ 视觉证据有效」——单测断言 DOM/class，对 1 px 完全无感。

## 已知未闭合（如实登记，不伪装完成）

- `headImpl` 的主进程 `net` 版 HEAD provider **未接**：缺省不注入即跳过 enclosure 可达检查（生产零真实出站，日志 `head=off`）。结构检查始终执行。接线属 F9 巡检刀。
- P1 直传**只有规则层**：托管配置落盘加密（credential-store）、`podcast:hosting:*` IPC、渲染层「本地文件 → 直传回填 `resolvedAudioUrl`」入口均未实现；`podcast-hosting-upload.js` 除自身测试外无消费者。
- QM-4 **暗色基线仍未入库**、**浅色 `podcast-channel.png` 因第四刀字号令牌化重新待取**：`calendar` 等 8 张侧栏位移基线仍等于 run `37840950306` 的渲染（第四刀未触碰共享元素），但 `podcast-channel.png` 因本页两处标题各高 1 px 而失效，须按下一次 run 的 artifact 以同一口径重取（见上一节第 6 条）。`podcast-channel-dark.png` 则一直拿不到：`test:visual:pixel:dark` 只在 `visual-test.yml`（main push / dispatch）跑，PR 侧不判暗色，所以它**结构上无法在本 PR 内合法取得基线**——正解是合并后取 main 那次 Visual Tests 的 artifact 一并回填这两张，禁止用本机 `test:visual:pixel:dark:update-baseline` 产物入库。`.gitignore` 的暗色放行条目已落盘，放行锁已通过。
- 代托管（P2 / 形态 C）未启动，三前置条件见 PRD §三。

## 远程同步

| 远程同步 | PENDING |
|--------|---------|
| PR | #3193（podcast-rss-channel → main，已开启） |
| 回填约定 | 合并后本行状态列改写 `PASS` + merge SHA（取证 `git log origin/main --grep='(#NNNN)$' --format=%H|%cI`），并同一次提交删除 frontmatter 三字段与 `scripts/gate-record-debt-ledger.json` 的登记项（回填与销账必须同一次发生） |
