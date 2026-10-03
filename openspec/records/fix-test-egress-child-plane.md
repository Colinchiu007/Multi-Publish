---
record: fix-test-egress-child-plane
task: 补上 #2783 的另一半——测试期"禁止真实出站"守卫原先只 patch net.Socket.prototype.connect（realm 级），对测试起的 node 子进程结构性无效；新增子进程面并让 Gate 20 要求 setup 同时装两个平面
date: 2026-10-03
# ↓ 下面三个字段只在「远程同步」尚无法收口时填写；回填成 PASS 后必须整段删除。
sync_status: PENDING
sync_reason: 本 PR 尚未合并，merge SHA 还不存在
sync_backfill_owner: 下一个会话（合并后取 merge SHA 回填并删除本段三字段）
---

## 本次执行记录：测试期出站守卫的子进程面（fix-test-egress-child-plane，2026-10-03）

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | PASS | 运行时代码面（测试基建 + 门禁脚本）⇒ 独立 worktree `D:/Data/projects/mp-worktrees/mp-fix-test-egress-child-plane` + 裸分支 `fix-test-egress-child-plane`，由 `scripts/start-mp-task.ps1` 创建，起点 `d560cc3c`；依赖就绪由 `pnpm install --frozen-lockfile` + `ensure-electron.js` + `verify-worktree-deps.js` 实证。共享根保持 main clean（该目录里两条未跟踪文档是并发会话的，未动）。 |
| 第一性原因（QM-5 ①） | PASS | 不是"某个用例写坏了"。守卫自 2026-09-30 全仓化（Gate 20）起只有 socket 面，patch 的是**当前 realm** 的 `net.Socket.prototype.connect`；#2783 的现场是 `require('electron')` 在测试 realm 里 `spawnSync(process.execPath, [install.js])` ⇒ 子进程 realm 无守卫，真下载 4 秒；`stdio:'inherit'` 把子进程 stdout 并进父进程，vitest 于是把下载**记到当时正在跑的那条用例**名下。#2793 消掉 CI 侧触发条件（缺 dist）、#2797 拦住 realm 内那条 spawn，但这个 realm 边界缺口一直在 #2783 的「明确不修」段落里可见（两轮评审判 Critical）。 |
| 逃逸分析（QM-5 ②） | PASS | 单元层：`network-egress-guard` 的既有测试全部在**同一 realm** 里 patch/断言，"守卫是否传给子进程"在这类测试里不可表示；集成层：桌面全量此前没有一条用例去看子进程的 `process.execArgv`；审查层：Gate 20 枚举的是"测试面有没有引用共享 setup"，setup 里装了几个平面不在它的判据内 ⇒ 判据通过 ≠ 覆盖面完整。 |
| 修复 + 回归保护（QM-5 ④） | PASS | ①`installTestChildProcessGuard` 覆盖 `spawn`/`spawnSync`/`execFile`/`execFileSync`/`fork` 五个入口，对 node 系注入 `--require <setup>`，`fork` 走 `options.execArgv`；②非 node 子进程 argv 一字不改，只进台账 + 每命令名出声一次；③setup 用 `__filename` 作注入目标 ⇒ 孙进程继续被注入、安装幂等（标记打在函数自身）；④新回归锁 `packages/shared-utils/src/__tests__/network-egress-guard-child.test.js` 10 例，全部让**子进程自己报告**（`process.execArgv` / 守卫标记 / fork 自己写盘），含一条走未包装原始 `spawnSync` 的对照组；⑤Gate 20 加"setup 必须两面齐全"判据。 |
| 防止再次发生（QM-5 ⑤） | PASS | ①机制：Gate 20（`.github/scripts/check-test-egress-guard.js`）从此要求共享 setup 同时引用两个 installer，摘掉任一面即红（G1 反证实测）；②文档 `docs/test-egress-guard-child-plane.md` 写明三条实测口径与已知边界（含"非 node 子进程仍出网，本层只做可见化"）；③台账 `readExternalChildLedger()` 已暴露但暂不设"必须为空"断言 —— 理由写在文档 §5：先取一轮真实数据再定阈值，否则第一版就把 python/electron 的合法子进程判红。 |
| 反证（驱动实跑） | PASS | 8 条变异全部 rc≠0 且红因逐条对上：C1 摘掉注入 / C2 只 patch spawnSync（证明 `execFileSync` 那条锁不是装饰性的）/ C3 fork 把 `--require` 塞进 args / C4 给 git 也注入 argv / C5 setupPath 丢失 / C6 包装层吞掉真实调用 / C7 setup 退回单面 / G1 摘掉 Gate 20 新判据。驱动收尾断言 3 个被变异文件与备份逐字节相同；基线 vitest 0 failed、node --test 0 failed。<br>驱动自身两处故障如实记录并修好（它们一度给出**错误结论**）：① 初版 C1 把语句替换成注释，造出 `else 无 if` 语法错，而解析器只数 `×` 行 ⇒ 把"整个文件加载失败"读成 `NOT_RED`（现同时读 `Test Files N failed` 汇总行，且拿语法合法的等价变异替换）；② 初版 C4 的 `else if (true)` 是 no-op 变异，等于没变异 ⇒ 改成真的给 git 注 `--require`（变红）。 |
| 行尾与 diff 对账 | PASS | 实测三态（`D:/tmp/mp-eol-truth.js`，逐字节数 `\r\n` / LF-only / 孤立 `\r`）：`CHANGELOG.md` 的 **blob 是纯 LF**（`origin/main` crlf=0/lfOnly=63886；HEAD crlf=0/lfOnly=63814），**工作区是纯 CRLF**（crlf=63836/lfOnly=0/孤立 `\r`=0），属性来源 `HEAD:.gitattributes:1` 的 `* text=auto` 且 `core.autocrlf=false` ⇒ clean 过滤器把 CRLF 归一为 LF 后入库，所以"前插 22 行"在 git 眼里就是 22 行。两口径对账（vs merge-base `d560cc3c`）`git diff --numstat` 与 `git diff --ignore-cr-at-eol --numstat` **五个文件逐项相等**（`check-test-egress-guard.js 13/2`、`check-test-egress-guard.test.js 20/0`、`CHANGELOG.md 22/0`、`network-egress-guard.setup.js 12/1`、`network-egress-guard.js 114/0`）⇒ 无行尾污染。<br>**顺带暴露一处文档事实漂移（不在本 PR 修）**：AGENTS.md「行尾（CRLF）不是噪声」条写的是"本仓 CHANGELOG.md、01-docs/learnings.md 等文档**在 blob 里就是 CRLF**"并给出 14391/16446 行的混行尾分布；本次实测这三份（含 `.quality-gates.md`）的 **blob 侧 crlf 均为 0**、行数也已翻倍（63886 / 17202 / 8192），即该结论对当前仓库状态不再成立（"禁止统一回写"仍是对的实践，但"整体写成 LF 会让每行都算改动"在 `* text=auto` 下不会发生）。回灌 AGENTS.md 属独立 docs 变更，未并入本 PR，登记在下方「遗留」。 |
| 消费者并集 | PASS | 改动的是被**所有测试面**加载的 setup 与守卫实现 ⇒ 风险面是"注入影响别的子进程"。实测跑量：① shared-utils 全量 522 passed；② `check-test-egress-guard.test.js` 9/9；③ **桌面全量 `vitest run electron` 426 文件 / 8242 例 = 1 failed / 8240 passed / 1 skipped**，唯一红是既知的 `feedback.test.js` Windows symlink `EPERM`（pristine main 可复现，与本 PR 无关）⇒ vitest 自身 worker 的 spawn/fork 未被注入破坏。 |
| 接线棘轮 | PASS | 新增测试文件 `network-egress-guard-child.test.js` 由 vitest workspace 收集（`packages/shared-utils` 有 vitest.config，`pnpm test` 即 vitest run）⇒ 已实跑见到它执行（10 passed）。`.github/scripts/check-test-egress-guard.test.js` 早接在 Gate 20，本次新增断言随之被执行。新测试文件名不以 `test-` 开头（避开 `.gitignore` 的 `test-*.js` 陷阱）。 |
| QM-1 打包 / QM-4 视觉 | N/A | 未触 `apps/desktop/electron/` 运行时代码与渲染面；改动为测试基建（packages/、.github/scripts/）+ 文档。 |
| QM-6 CCG 双模型外部评审 | 见下 | 规定通道实测仍不可用（CC Switch `:15721` 无监听、`app_paths.json={}`），走替代双模型；发现项与处置在本表之后补记。 |
| 远程同步 | PENDING | 本 PR 尚未合并，merge SHA 还不存在。合并后取 `git log origin/main --grep='(#NNNN)$'` 的 SHA/时间 + `git ls-remote --heads origin fix-test-egress-child-plane`（期望 0 行，并对 `main` 做正控），回填 PASS 并**同次删除** frontmatter 三个 sync_* 字段 |

### 遗留（不假装已闭合）
- 非 node 子进程（python / git / electron.exe）仍可在测试期真实出网：本层做的是**可见化**（台账 + 出声），不是拦截。真要拦需要在传输层做（作业级代理黑洞或防火墙），那是 CI 基础设施改动，另案。
- 台账尚无"必须为空"的门禁断言：等真实数据（哪些命令名会进台账、各多少次）拿到后再定阈值。
- `ELECTRON_RUN_AS_NODE` 下 electron 的 `process.execPath` 判定仍走 basename ⇒ 若将来有测试用 electron 当 node 跑并期望被守卫覆盖，需要显式加一档判据。
- Electron GUI 存活测试（真起 electron.exe）**不在**注入范围内，这是有意的：给 electron 注 `--require` 语义不确定，且那类测试本就要网络。
- **AGENTS.md「行尾」条的 blob 结论已被本次实测否证**（详见上表「行尾与 diff 对账」）：`CHANGELOG.md`/`01-docs/learnings.md`/`.quality-gates.md` 的 blob 侧现在 crlf=0、工作区侧纯 CRLF，靠 `* text=auto` 归一。需要一次独立 docs PR 把该条改为按实测写（并保留"禁止统一回写、改前先测工作区基线"的实践结论，因为它对**未加 `text` 属性的文件**与未来属性变更仍然安全）。本次不动 AGENTS.md：它不在本 PR 的因果链上，混进来会让这次交付的证据面与变更面对不上。
