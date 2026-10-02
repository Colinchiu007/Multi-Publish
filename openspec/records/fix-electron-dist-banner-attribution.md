---
record: fix-electron-dist-banner-attribution
task: 归因并修复 #2794 —— 桌面单测里那条 `Downloading Electron binary...` 是夹具的 blanket fs mock 造成的假象；改为按路径委托，并给测试期 electron/install.js 的 spawn 加响亮失败守卫
date: 2026-10-03
sync_status: PENDING
sync_reason: 本 PR 自身尚未合并，merge SHA 与远端分支删除状态此刻不存在（这正是 PENDING 的语义）
sync_backfill_owner: 下一个会话（回填后删除本文件 frontmatter 的三个 sync_* 字段）
---

## 本次执行记录：桌面单测 Electron 下载 banner 的夹具归因与修复（fix-electron-dist-banner-attribution，2026-10-03）

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | PASS | 运行时代码（测试 realm 的 `test-setup.js` 与 `*.test.js`）→ 独立 worktree `D:/Data/projects/mp-worktrees/mp-fix-electron-dist-banner-attribution`，裸分支 `fix-electron-dist-banner-attribution`；由 `scripts/start-mp-task.ps1` 创建（rc=0 且以 `git worktree list` + `rev-parse --abbrev-ref HEAD` 实证，不以 rc 单独判定）；共享根保持 main clean |
| 第一性原因（QM-5 ①） | PASS | 三条叠加，缺一不发生：`test-setup.js` 的 `__registerMock('fs', …)` 经 `Module._load` 命中该 realm 每一个 `require('fs')`；`apps/desktop/vitest.config.js:17` 的 `deps.inline:['electron']` 把 `node_modules/electron/index.js` 内联进同一 realm；`asset-generator.test.js` 把 `existsSync` 注册成 `vi.fn(() => false)`（不分路径）。首条引入点是 **2026-08** 那次给 AssetGenerator 加"文件不存在降级"用例时写下的 blanket mock（`git log -1 --format=%h -- apps/desktop/electron/services/asset-generator.test.js` 现场读），banner 自此随该用例每次运行出现。 |
| 逃逸分析（QM-5 ②） | PASS | 单元层：夹具对**第三方模块**谎报，而被测代码自己的断言全都只关心沙箱内路径 ⇒ 没有一条既有断言会因"委托没做"变红；集成/视觉层：只影响 stdout 一行文案，不改返回值；审查层：#2794 正文一度把根因写成"`dist/electron.exe` 被短暂删除"，**那是没实测的推断**，被本机四格对照否证（`node -e require(logger)`=0 次、无夹具探针 realm=0 次且 `PROBE_SPAWN=[]`、带夹具=1 次且整文件 1.8s、单变量复刻夹具=1 次并抛 `Electron failed to install correctly`）。 |
| 修复 + 回归保护（QM-5 ④） | PASS | B1 夹具按路径委托：沙箱前缀改 `os.tmpdir()/multi-publish-asset-gen-<pid>`，13 处 `outputDir` 字面量收敛到该常量，判定按路径段比，委托只覆盖 `existsSync`/`readFileSync`，写类动词继续空转。B2 `test-setup.js` 给 `spawnSync/spawn/execFileSync/execSync/fork` 包一层，命中 `node_modules/electron/install.js` 即抛 `[TEST-ELECTRON-INSTALL-SPAWN]` 并点名 `ensure-electron.js`。回归锁：`asset-generator.test.js` 新增 3 例（委托边界自证 / 写不落盘 / banner 不出现且解析到真实 exe）+ 新文件 `electron/tests/setup-electron-install-guard.test.js` 5 例（真路径抛错、普通子进程不受影响、模块同一实例、装配幂等、`execFileSync` 同挡）。两文件实跑 **25 passed / 0 failed**。 |
| 防止再次发生（QM-5 ⑤） | PASS | ①反证 9 档逐个实跑全红（见下表与 `docs/desktop-test-fixture-electron-download-banner.md` §4）；②文档专项落地；③判据纪律写进 §4：**判据本身先在本机 node 单独跑一遍**（本轮把 `install\\.js` 抄进产品代码，正是被新守卫用例抓红的），**反证驱动不得与全量测试并发、被强杀后必须先按指纹回读文件**（本轮 M-2 的 `return true` 就这样残留过一次）。 |
| 行尾与 diff 对账 | PASS | 三个既有文件（`asset-generator.test.js` / `test-setup.js` / `CHANGELOG.md`）检出后均为纯 CRLF；改动全部走 Buffer 精确替换并逐行保留行尾，新文件按 LF（与同类 blob 一致，`* text=auto` 归一）。提交前对账 `git diff --numstat` 与 `--ignore-cr-at-eol --numstat` 两口径（数字见 PR 正文）。 |
| 接线棘轮 | PASS | 新文件 `apps/desktop/electron/tests/setup-electron-install-guard.test.js` 由 vitest include `electron/tests/**/*.test.{js,ts}` 收集，并被 `test:coverage`/`test:startup`/桌面 shards 覆盖；文件名刻意不以 `test-` 开头（`.gitignore:59` 的 `test-*.js` 未锚定目录，会把新用例静默排除在 git 之外 —— 已用 `git check-ignore --no-index` 实测：`test-electron-install-guard.test.js` 命中忽略，`setup-electron-install-guard.test.js` 不命中）。 |
| QM-1 打包 / QM-4 视觉 | N/A | 未触 `electron/**` 运行时代码与 UI：改动限于测试 realm（夹具 + 测试装配 + 测试文件）。桌面全量测试见下一行。 |
| 桌面全量测试 | PASS（本改动 0 红） | 无并发重跑 `pnpm exec vitest run electron`：**423 文件 / 8195 例 = 2 failed / 8192 passed / 1 skipped（614.08s）**。两个红分别是 `feedback.test.js`（EPERM symlink，既有已知）与 `story2video-manual-assets.test.js:685`（`expect(auto.success).toBe(true)` 收到 false）。**两者都在 pristine main（共享根 `b0468604`、无任何本地改动）用同一条命令逐个复现，错误行逐字相同** ⇒ 非本 PR 引入；后者已单独登记 **#2796**（含两处复现坐标）。本 PR 直接相关的两个文件实跑 `Test Files 2 passed / Tests 25 passed`。首轮全量因与反证驱动并发而整体作废，已把这条写成 §4 的纪律 ③。 |
| 本机 A/B（修复效果的直接证据，不依赖 CI） | PASS | 同一条命令 `pnpm exec vitest run electron/services/asset-generator.test.js` 两份代码各跑一次（Windows，`ensure-electron` 均报已就绪）：`main=b0468604` 旧夹具 → **banner 1 次** / 17 passed；本分支委托夹具 → **banner 0 次** / 20 passed。这条 banner **从来不是 CI 特有现象**，也不是"exe 被短暂删除"。 |
| QM-6 CCG 双模型外部评审 | PASS（降级通道 2/2） | 规定通道不可用且**不得擅自修复用户机器级路由**：`codeagent-wrapper --backend codex` 两次探针分别 rc=1 与 rc=124（挂起在网络上；CC Switch :15721 未运行）。改走既有降级通道：并行两路 opencode 免费模型，各自**把结论写进被审计 worktree 内的文件**（`node_modules/.cache/review2794/findings-{BP,FA}.md`，14648 / 10399 字节，均含 `## Q1..## Q4` 逐条判断），判据读文件内容而不是 spawn rc。逐条处置见下表。 |
| 远程同步 | PENDING | 合并后由下一个会话按既有口径回填：merge SHA 与时间取 `git log origin/main --grep='(#NNNN)$' --format=%H|%cI`，远端分支删除取 `git ls-remote --heads origin fix-electron-dist-banner-attribution` 返回 0 行（并配一条对 main 的正控）；回填后**删除本文件 frontmatter 的三个 `sync_*` 字段**。 |

### QM-6 逐条处置（评审 → 判定 → 落地）

| # | 评审意见（来源，严重度） | 我的判定 | 处置 |
|---|---|---|---|
| FB4-1 | BP：新用例在固定路径留目录残留、与文件内注释冲突（Critical） | 同意：`finally` 只删文件不删目录，且 `/tmp/test` 是跨会话共享名 | 已落地（B1）：沙箱改 `os.tmpdir()` + pid 独立目录，锁改用自建 pid 目录并在 `finally` 递归删整目录 |
| FB4-2 | BP：`install.js` 哨兵"现在就能做"，不该记成已接受欠账（Critical） | 同意，且理由比我原来的判断强：banner 文案与真下载**同字**，靠日志形状无法区分 | 已落地（B2）：五个动词包一层，命中即抛 `[TEST-ELECTRON-INSTALL-SPAWN]`；同时如实写明它只覆盖这一条 spawn，不是通用 egress 哨兵 |
| FF-1 | FA：`isSandboxPath` 用裸 `startsWith`，`/tmp/testevil` 会被判进沙箱；盘符形态会被判出沙箱（Warning） | 同意（段界那半是确定的；盘符半在我把前缀改成绝对 tmpdir 后不再适用，已随之删掉该分支与对应断言） | 已落地：判定改 `=== prefix \|\| startsWith(prefix + '/')`；新增 M-6 反证专抓段界（红 1 例） |
| FF-2 | FA：锁在盘符根真建目录、并行共享同一路径（Warning） | 同意，与 FB4-1 同因 | 已落地：锁用 pid 唯一目录 + `mkdtemp`，写入隔离探针的目录也在 `finally` 整目录删 |
| FF-3 | FA：`statSync` 委托会给"不存在的沙箱外路径"引入 ENOENT（Warning） | 同意：没有任何第三方需要 statSync 为真 | 已落地：委托收敛到 `existsSync`/`readFileSync` 两个动词，`statSync` 保持原固定返回；新增 M-4 抓"写动词被委托" |
| FF-4 | FA：锁未还原 `require.cache`；只录 `console.log` 单通道（Info/Warning） | 同意 | 已落地：保存并在 `finally` 还原原条目；同时录 `process.stdout.write` 且**原样转发**（录证据不等于藏证据） |
| FF-5 | FA：应改 `test-setup.js` 的 mock 匹配规则 / 摘 `deps.inline:['electron']` / logger catch 加日志（Info，四条后续判据） | 部分同意：方向对，但都是全局或运行时代码面，塞进本 PR 会把一个夹具修复变成夹具契约重构 | 拆开，四条已登记在本记录「遗留」；其中"摘 inline"的**反证前置条件**按 FA 原话记下：摘后必须重做 M-1 反证，否则锁会因 realm 隔离退化为恒过 |
| FF-6 | FA：不给 banner 建字符串硬门禁是对的，不应推翻 | 同意 | 维持：本 PR 不做日志字符串门禁，B2 锁的是 spawn 面本身 |

### 反证（9 档逐个实跑，判据 = 汇总行 `Tests N failed`，收尾断言两文件逐字节还原）

M-1 红 3 / M-2 红 3 / M-3 红 1 / M-4 红 6 / M-5 红 1 / M-6 红 1 / M-7 红 1 / M-8 红 2 / M-9 红 4，
banner 复现预期只有 M-1、M-2 两档满足 —— 全部符合预期，驱动 `VERDICT=ALL_MUTATIONS_RED`。

### 遗留（不假装已闭合）

- **测试期零真实出站的通用哨兵仍未做**（#2783 的另一半，两轮评审判 Critical）。B2 只让 `electron/install.js`
  这一条 spawn 变成响亮失败；`spawnSync` 起别的进程、或另一个包自己拉网络，本 PR 一律不管。
- **其余 blanket `mock fs` 的测试文件仍会对同 realm 的第三方模块撒谎**（FA A1）。收敛为 `test-setup.js` 的
  通用夹具契约（例如要求显式声明"全局 mock"，否则 warn）属全局变更，另案；清点命令已写进专项文档 §5。
- **`deps.inline:['electron']` 是否该摘**（FA A2）未评估。若要摘，必须同 PR 重做 M-1 反证 ——
  因为摘掉后 banner 根本不会进该 realm 的 logs，现有锁会静默退化为恒过。
- **`logger.js:35` 的 catch 仍然静默**（FA A3）。加一行 warn 属运行时代码，会把本 PR 拖进 QM-1 打包验证面，
  按分层原则拆开；引用依据是 AGENTS.md「静默配置失败必须留日志」。
- 首轮全量测试与反证驱动并发 ⇒ 整轮作废；重跑结果在本记录「桌面全量测试」行末尾，若该句仍写着"待回填"
  就说明本 PR 是在没有全量证据下提交的，须当场补跑。
- 全量重跑里的两个红**都不属于本 PR**，且都已在 pristine main 上逐字复现（不是"不是我改的"式放行，是同命令同错误行的对照）：
  `feedback.test.js` 的 symlink EPERM 是本仓已知环境敏感例；
  `story2video-manual-assets.test.js:685` 是确定性红，已单独登记 **#2796**，本 PR 不顺手修（那会把夹具修复
  和 pipeline auto 分支的语义问题混成一次交付）。
