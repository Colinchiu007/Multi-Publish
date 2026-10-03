---
record: coverage-gate-electron-prepare
task: 跑桌面测试的 quality-gate 作业先备好 Electron 二进制，并把这条装配约束锁成可反证的结构判据（#2783）
date: 2026-10-03
---

## 本次执行记录：桌面测试作业的 Electron 二进制装配（coverage-gate-electron-prepare，2026-10-03）

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | PASS | 运行时代码/CI 配置变更 → 隔离 worktree `D:/Data/projects/mp-worktrees/mp-coverage-gate-electron-prepare`（裸分支 `coverage-gate-electron-prepare`，`bash scripts/session-init.sh` 创建，依赖就绪由该入口打印 `verify-worktree-deps OK`）。共享根停在 `main` 且 `git status --porcelain` 为空。本 PR 改 `.github/workflows/` 与 `.github/scripts/` ⇒ 按 docs-only 快速通道的反向判据属**混合 PR**，走完整门禁，不借道。 |
| 第一性原因（QM-5 ①） | PASS | 两半合成。装配侧：`quality-gate.yml` 里 `unit-tests` / `desktop-shards` / `coverage` 三个作业只有 `Install deps`，从不准备 Electron 二进制，而同仓 `build.yml:134` 与 `electron-ci.yml:118` 早就为同一个坑各写了一步 —— 引入点即"这三个作业被创建时没带上这套惯例"。代码侧：`electron@43` 无 `postinstall`，`require('electron')` 落到 `node_modules/electron/index.js` 的 `downloadElectron()`（`console.log('Downloading Electron binary...')` + `spawnSync(install.js,{stdio:'inherit'})`）；本仓的惰性触发点是 `apps/desktop/electron/services/story2video-paths.js:38`（`getElectronMediaRoots()` 函数体内 require，外层 try/catch 吞异常，由 `:54 getAllowedMediaRoots()` 无注入调用）。 |
| 逃逸分析（QM-5 ②） | PASS | 单元层：该用例本身没问题，三次本机全量重跑与一次 `--reporter=verbose` 基线都是绿的（该用例 15ms），所以**没有一条断言能抓住它** —— 症状在 CI 才出现。集成/打包层：CI 的装配差异（有没有 dist）不在任何测试面里被观察；`.github/scripts/workflow-contract.test.js` 此前只锁视觉/E2E 等形态，从未锁"跑桌面测试前是否备好二进制"。归类：**判据域缺口**（没有东西看作业装配）+ **环境差异**（本机有缓存、CI 冷缓存 ⇒ 同一机制 1476ms vs 15700ms）。 |
| 修复 + 回归保护（QM-5 ④） | PASS | ① 三个作业在 `Install deps` 之后各插一步 `Ensure Electron binary`（`node scripts/ensure-electron.js`，复用既有脚本，不新写下载逻辑，它自身 fail closed）；② `workflow-contract.test.js` 末尾加一条结构锁：清单由**步骤内容**自动收集并与 `NEEDS_PREP ∪ EXEMPT` 做 `deepEqual`；准备步骤必须**整条命令就是**该脚本；SKIP 变量查**步骤/作业/workflow 三层**；`Install deps` 与准备步骤都不得 `continue-on-error`；`ensure-electron.js` 本体必须仍有 `isDistComplete` 与"装完仍不完整 ⇒ 非零退出"；e2e/visual 的豁免前提是**可判定事实**（扫 `apps/desktop/tests/{e2e,visual-testing}` 里有没有 `require('electron')`）。TDD 顺序：先写锁 → 实测红在 `作业 unit-tests 缺 Electron 二进制准备步骤`，再插步骤转绿（29/29）。 |
| 因果链的 A/B（不是推断） | PASS | 同一 worktree、同一文件，只改 `node_modules/electron` 的 dist 有无：对照（dist 在位）下载日志 **0 条**、该用例 **15ms**、文件 12.55s；复现（改名摘除）下载日志 1 条且**归属到同一条用例名下的 `stdout \| …story2video-stages.test.js > … > 任一 scene 的图片或音频失败时默认阻断…`**、该用例 **1476ms**、文件 18.20s；CI 冷缓存下同一归属形态跑到 **15700ms > testTimeout 10000**。跑完按 `existsSync(dist)`+`electron.exe` 大小回读确认恢复原状（`恢复回读：dist 在位=true 备份已清=true`）。 |
| 反证（判据 = `rc≠0 ∧ ℹ fail N>0 ∧ 失败测试名命中 ∧ 断言消息命中`） | PASS | **10 条**全部实跑 RED_OK，每轮还原后按 sha256 与原件逐字节相同：M-1 摘步骤 / M-2 挪到测试之后 / M-3 作业改名 / M-4 换成 `echo "…install.js"` 假步骤 / M-5 准备步骤 `continue-on-error` / M-6 步骤级 SKIP / M-7 **作业级** SKIP / M-8 `Install deps` 容错 / M-9 把 `ensure-electron.js` 掏成 `process.exit(0)` / M-10 往 e2e 用例里引入 `require('electron')`。其中 M-4 与 M-7 否证的是**我第一版锁自己**（首版按"正文出现过字样"匹配、只查步骤级 env），两条都由外部评审各自命中。 |
| QM-1 打包 / QM-4 视觉 | N/A / N/A | 未触 `apps/desktop/electron/**` 与 `packages/rpa-engine/**` 的运行时代码，只改 CI 作业装配与门禁测试；渲染端视图未动。真正的执行面验证是**本 PR 自己的 CI run**：`QG Coverage` / `QG Desktop Shards` / `QG Unit Tests` 三个作业将在带准备步骤的前提下实跑（这是唯一能证明"下一次不再出现该用例名下下载日志"的现场，合并后按 `gh run view --log` 复核）。 |
| 行尾与 diff 对账 | PASS | 故意**不写行数合计**（这条证据写在被统计对象里，写数字必然自我过期）。只锁两口径：每个改动文件 `git diff --numstat` 与 `--ignore-cr-at-eol --numstat` 逐行相同（`.github/workflows/quality-gate.yml` 18/0、`.github/scripts/workflow-contract.test.js` 两口径同为一条插入块、`CHANGELOG.md` 13/0）；`CHANGELOG.md` 全程 Buffer 原字节前插，以"原字节是结果完整后缀"为强判据、CR 增量恰等于新块行数；yml/测试文件插入按**该行自身行尾**（两文件工作区均为 CRLF）逐行补齐。 |
| 接线棘轮 | PASS | 未新增测试**文件**（新判据并入已被 `quality-gate.yml` Gate 3 显式点名的 `.github/scripts/workflow-contract.test.js`，实测该步骤正文含此文件名）⇒ 无新接线项；`scripts/check-unwired-tests.js` rc=0、`scripts/check-step-failfast.js` rc=0（新插步骤是单条命令，不构成多命令 `run:` 块）、`.github/scripts/check-max-lines.js` rc=0、`scripts/check-debt-budget.js` rc=0、`scripts/check-no-brand-residue.js` PASS、`scripts/check-gate-record-debt.js` rc=0。 |
| QM-6 CCG 双模型外部评审 | **降级通道达成 2/2（规定通道不可用）** | 见「QM-6 实跑补记」。规定通道 `codeagent-wrapper --backend codex` 于本次交付**当下重跑**仍 `unexpected status 502 Bad Gateway … http://127.0.0.1:15721/v1/responses`（5/5 重连后挂死到被 kill，rc=124）；`--backend claude` 早前实测最小探针 150s 零输出；`gemini` CLI 本机不存在。CC Switch 属用户机器级路由，未经授权不修。降级通道 `opencode run --agent plan`（只读）下 **big-pickle 与 fledge-alpha-free 各产出一份完整评审**（五问逐条、带行号），另三次尝试（`nemotron`/`longcat`/`mimo`）零产出。 |
| 远程同步 | PASS | PR #2793 已 squash 合并为 `8f3029121b0040859cc4b4cb61cc340fbd109752`（`git log origin/main --grep='(#2793)$' --format=%H|%cI` 现场读得 `2026-10-02T19:18:33Z`，非凭记忆）。`git ls-remote --heads origin coverage-gate-electron-prepare` 返回 **0 行**，同一次取证里对 `main` 的正控返回 **1 行**（证"0 行"是分支确已删除，而不是命令失败被静默当成空集）。**装配顺序在真实 runner 上被现场看过**：合并前 PR run `37050379937` 的 `QG Coverage` 步骤表里`Ensure Electron binary = completed/success`、`Gate 5 - Test coverage check` 在其之后完成，该 run `completed/success`。**合并后 main push 复核（本记录原先登记的"期望 0"判据被部分否证，如实改口）**：run `37053268768` 整体 `completed/success`（20 项全绿），其 `QG Coverage`（job `110991734260`，19:18:59Z→19:41:50Z）作业日志里准备步骤段打出`[ensure-electron] electron dist 缺失，执行 install.js ...`（19:20:32.977）→ `已就绪：v43.1.1`（19:20:37.120，**真下载 4.1s**）；而测试步骤段内 `Downloading Electron binary` 仍有 **1 条**（19:28:07.956，vitest 归属 `asset-generator.test.js > spawn must use shell: false`），合并前同一作业该段有 **2 条**（run `37042651965`，17:45:30 与 17:53:06，第二条归属逐字相同）⇒ 本 PR 消掉的是"测试开头那条会真的下载数秒、耗时记到当时用例头上"这一类（#2783 的 15700ms 形状）；残留那条距下一条日志只有 **11ms**（`install.js` 的 `if (isInstalled()) process.exit(0)` 立即退出），不是同一量级，本 run 也因此全绿。正确判据由"整作业期望 0"改为「**测试步骤段内**命中数 = 0」；残留触发点的机制读数与未闭合部分登记为 **#2794**。 |

### QM-6 实跑补记

**通道实况**：规定通道两路今日均不可用（codex 502 / claude 挂死，均为一手原文，非推测）；`opencode` 直连的只读 plan agent 拿到**两路实质评审**，任务书五问逐条作答，工件路径写成 cwd 相对（绝对路径会被 `external_directory` 自动拒读）。产物为会话级 scratch，**逐条发现原文已抄进下表**，不作为可引用地址。

| # | 评审意见（哪一路） | 我的判定 | 处置 |
|---|--------------------|----------|------|
| 1 | big-pickle Q1「因果链只证了两环，归属到该用例只是推断；Defender 冷读同样能造出单例 15.7s」 | **成立且可判**：不该靠邻近性说话 | 补做本地 A/B（摘 dist / 复原），结果**归属到同一条用例名下**、该用例 15ms → 1476ms ⇒ 排除了"任意冷读"这一替代解释；数字进文档 §1b 与本记录。剩余未证两点（为何恰是这条用例、CI 为何是两条下载日志）如实写进 §5，不下钻成结论 |
| 2 | big-pickle Q1/Q3「没为 electron@43 无 postinstall 留锁，升版即静默失效」 | **部分不同意**：若未来版本恢复 postinstall，准备步骤只是冗余跳过（`isDistComplete` 命中即 exit 0），不是"静默回归"；真正会回归的是**步骤被人摘掉**，而那已被 M-1 锁住 | 不额外加"版本 == 43"这类脆锁；改加 M-9（脚本本体被掏空即红），它防的是实际存在的回归方向 |
| 3 | big-pickle Q2a + fledge Q3「e2e/visual 作业也在跑桌面测试却不在清单里；硬编码三元组会漏第四个」 | **完全成立**（且我的首版收集判据看不见 `test:e2e`） | 判据改为按**内容**收集；`e2e`/`visual` 进 EXEMPT，但豁免前提是可判定事实（扫两个目录里 `require('electron')` 命中数必须为 0，实测各 0）⇒ 前提一变即红 = M-10 |
| 4 | big-pickle Q2b/c + fledge Q2「SKIP 变量只在步骤级查会被作业级绕过；脚本被掏空锁仍绿」 | **成立**（两条都是对我首版锁的直接否证） | SKIP 检查提到步骤/作业/workflow 三层（M-6/M-7）；加 `ensure-electron.js` 本体判据（M-9） |
| 5 | fledge Q4「findIndex 在 `uses:`/composite、矩阵、前置容错下有例外」 | `uses:` 盲区**承认**（GH 里无 run 字段的步骤本判据看不见）；矩阵与前置容错**已处理** | 加 M-8（`Install deps` 不得 continue-on-error）；`uses:` 盲区写进 §5 遗留，不为它造一个假判据 |
| 6 | big-pickle Q5 + fledge Q5「只治了一半：子进程下载不经过 `net.Socket` 守卫，测试期零出站仍无哨兵」 | **成立，且本 PR 不修** | 见下「否证与不做」 |
| 7 | fledge Q5 建议「给三个测试步骤注入 `ELECTRON_SKIP_BINARY_DOWNLOAD=1` 让缺二进制快速失败」 | **有害，拒绝**：`ensure-electron.js:35` 见该变量直接 `exit 0` ⇒ 照它的建议做，准备步骤自己就被禁用，正好是 M-6/M-7 要拦的形态 | 不采纳；反向把它做成两条判据 |
| 8 | fledge Q2 建议「key 换成 realpath/大小写归一」类改造、big-pickle 建议「mock 默认开启」 | 前者与本议题无关（那是 #2778 的形状）；后者是对 7000+ 用例共享夹具的广域行为变更 | 后者**不在本 PR 做**，登记为独立事项（见遗留） |

**否证与不做（不假装已闭合）**：评审 Q6（另一半"测试期零真实出站"）确实成立 —— 这条路径是 `spawnSync` 起**另一个 node 进程**，`test-setup.js` 与 `--require` 装配的 `net.Socket.prototype.connect` 守卫对它结构性无效。本 PR 不写这一半的判据，理由是：能真正守住它的形态只有"作业里不允许出现非准备步骤触发的下载"或"子进程也装守卫"，两者都不是加一条正则能完成的，硬加会变成一条恒真的装饰判据。已按事实登记为独立事项并在 #2783 下留收尾评论。

### 防止再次发生（QM-5 ⑤）

- **装配类缺陷要锁"装配顺序 + 被依赖脚本本体"，只锁调用点等于没锁。** 本轮两条 Critical 都是"锁在、保护为零"（echo 假步骤、作业级 env），第三类（脚本被掏空）是我自己想到但没验的同类 —— 现在三条都有独占红出口。
- **豁免必须是可判定的事实，不是注释。** `EXEMPT` 里的每个作业都配一条目录扫描；注释会过期，扫描不会。
- **偶发超时先做对照实验再下结论。** 把"我认为是下载"变成"摘掉 dist 能稳定复现同一条归属"，成本 20 分钟；不做这一步，本 PR 的叙事就只是 plausible。
- **判据与它的匹配对象同域**（#2778 已记过一次，本轮一次做对）：变异驱动同时匹配"失败的测试名"和"断言消息"，否则 10 条变异打的是同一条用例，"红错了原因"会被读成反证成功。
- 文档 `docs/ci-electron-binary-prepare-before-desktop-vitest.md` 落了 A/B 数字、10 条变异表与三条边界；重跑命令写在里面。

### 遗留（不假装已闭合）

- 「测试期零真实出站」缺一个能覆盖**子进程下载**的哨兵（评审两路均判 Critical）。本 PR 只消掉了 CI 侧的触发条件，未消掉这条能力缺口。
- `test-setup.js` 的 electron mock 仍是 opt-in；把它改成默认开启是对全量桌面套件的行为变更，需独立评估（评审建议未采纳为本 PR 内容）。
- 判据看不见 `uses:`/composite action 里的下载；矩阵 `include:` 引入非 Windows runner 时 `ensure-electron.js` 的 `dist/*.exe` 判据不适用。
- CI 上"两条下载日志"与"为何恰好是这一条用例"两点未下钻；不影响修复正确性，但说明"谁付账"仍是偶然。
- 合并后的复核动作：对下一次 main 的 `QG Coverage` 日志跑 `gh run view --log | grep -c "Downloading Electron binary"`，期望 0；若非 0，本记录的因果叙事须重开。
