# 测试期「禁止真实出站」守卫的子进程面（#2783 的另一半）

对应 issue #2783（其 CI 侧触发条件已由 PR #2793 消掉，本面补的是**能力缺口**）。
记录载体 `openspec/records/fix-test-egress-child-plane.md`。

## 1. 缺的是什么

共享守卫 `packages/shared-utils/src/network-egress-guard.js` 只 patch
`net.Socket.prototype.connect` —— 那是 **realm 级**的补丁。测试一旦用 `spawnSync` /
`execFileSync` / `fork` 起另一个 node 进程，那个进程里没有守卫，于是"测试期零真实出站"
对这条路径**结构性无效**。

#2783 的事故就是这个形状：`require('electron')` 在测试 realm 里执行
`spawnSync(process.execPath, [<pkg>/install.js], { stdio: 'inherit' })`，子进程真去下载了
4 秒；`stdio:'inherit'` 让子进程 stdout 并进父进程，vitest 把这段下载记到"当时正在跑的
那条用例"名下 ⇒ 表现为**某条无关用例随机 15s 超时**（`Test timed out in 10000ms`）。

## 2. 实现口径（每条都对应一次实测；★ 标的是 QM-6 外部评审命中后补的）

| 口径 | 为什么 |
|------|--------|
| 只给 **node 系**子进程注入 `--require <setup>` | 非 node（git / python / electron.exe）注入不了守卫。给它们注入只会把命令行搞坏，而"看起来守住了"是假的。非 node 一律 **argv 一字不改**，进台账 + 每个命令名出声一次（`[TEST-NETWORK-CHILD-UNGUARDED]`） |
| ★ `spawn` / `spawnSync` / `execFile` / `execFileSync` / **`exec` / `execSync`** / `fork` **七个入口逐个 patch** | 实测：Node 的 `execFileSync` 走内部绑定，**只 patch `spawnSync` 对它无效**；同理 `execSync` 也不经过 `execFile` 的导出 —— 第一版把它当"会落到 execFile"漏掉，于是 `execSync('node …')` 既不注入也不进台账，是这条门禁下唯一**完全静默**的出站口（`apps/desktop/src/views/accounts-compile.test.js` 的 `execSync('npx vite build …')` 就是真实消费者） |
| ★ shell 形态（`exec` / `execSync`）经 **`NODE_OPTIONS`** 注入，不改命令串 | 命令行会被 shell 二次展开，改它等于在引号规则上赌；`NODE_OPTIONS=--require <setup>` 由 node 自己解析，还能顺带覆盖 `npx → node` 这类孙进程。代价：`setupPath` 含空白/引号时 NODE_OPTIONS 会被拆断（实测 `Cannot find module 'D:/tmp'`）⇒ 此时**跳过注入并出声**，不产出"注入了但子进程起不来"的第三种坏 |
| ★ `fork` 的第一个参数是**模块路径**不是可执行文件 | 按命令名判 node 会把每一次 fork 误判成 external ⇒ 不注入、不进台账，而"目标脚本照常跑完"的端到端用例**照样绿**（本轮实测踩过：判据退回 `isNodeCommand(argv[0])` 后 fork 注入消失，红的是精确断言那条，不是那条端到端） |
| `fork` 只能改 `options.execArgv` | `fork(modulePath, args, options)` 的 args 是脚本参数位；把 `--require` 塞进去会被子进程当成 `process.argv` 的一部分 |
| ★ 回落 `process.execArgv` 时必须**剔除求值族旗标**（`-e/--eval/-p/--print/-c/--check` 及其值） | Node 在**未显式给 execArgv** 时自己会剔除这些旗标；一旦我们显式写入，这层保护就没了。实测：`node -e` 的父进程 fork 出的子进程拿到 `["--require",setup,"-e","<父的整段脚本>"]` ⇒ 去跑父脚本、目标模块根本不执行、子进程永不退出（还会把自己递归 fork 出来） |
| ★ `options.shell` / `windowsVerbatimArguments` 为真时**跳过注入并出声** | 这两种形态下 Node 不转义参数，注入的路径会在空格处断裂，把"每个被注入的 node 子进程"打崩（本机路径无空格看不出来，checkout 到 `C:\Users\John Doe\` 就成片失败） |
| ★ `setupPath` 缺失必须出声 | 静默 no-op 会让"装配漏了参数"读起来像"本轮没有子进程"，违反本仓「静默配置失败必须留日志」 |

装配仍然只有一份：`packages/shared-utils/network-egress-guard.setup.js` 同时装两个平面，
各测试面照旧引用这个 setup（Gate 20 的枚举判据不变）。因为 setup 用 `__filename` 作注入目标，
**孙进程**（子进程再 spawn 的 node）也会继续被注入，且安装幂等。
★ 桌面 realm 也装了子进程面（`apps/desktop/test-setup.js` 调 `installTestChildProcessGuard`，
注入目标指共享 setup 而不是桌面自己的 test-setup —— 后者带 electron mock 装配，用 `--require`
在子进程里加载它会把整个桌面测试外壳拉起来）。原因很直接：**#2783 的案发现场就是桌面 realm**，
只给 packages 装等于给主案发现场留着无守卫的子进程路径。

## 3. 锁的形状：一律由子进程自己报告，不用 mock

`network-egress-guard-child.test.js` 里每条"注入是否生效"的断言都是让子进程打印
`process.execArgv` / `net.Socket.prototype.connect` 的守卫标记 / 自己写盘（fork 那条）。
原因：本仓吃过两次「夹具只断言我调用过某个方法」的假绿。
另外还有一条**对照组**：显式走未包装的原始 `spawnSync` / `execSync`，证明"没有这一层时子进程确实没守卫" ——
装上之后 `cp.spawnSync` 本身已会注入，对照组若不走原始函数就测的是包装层的效果。
★ 对照组**禁止**写 `__mpOriginalSpawn || cp.spawnSync` 这种回退：守卫根本没装上时，回退会让对照组
拿着真 spawnSync 也断言出"没有守卫"，装配失效照样绿（本轮评审命中的装饰性对照）。

★ `fail-open` 那条锁必须**真的走进 catch 分支**（用一个 `toString()` 就抛的 command 对象把异常
注入到包装层内部），并断言两件事：真实调用被发起了（异常来源是 Node 的参数校验，不是被吞），
以及 `[TEST-NETWORK-CHILD-UNGUARDED]` 出了声。只跑一次正常输入的"fail-open 测试"对
「把 catch 整段删掉」完全免疫 —— 这是评审两路独立命中的同一条。

★ 子进程探针超时收敛为 `CHILD_PROBE_TIMEOUT_MS = 6000`，并由一条"预算不得倒挂"的用例从
`vitest.config.js` **现场读** `testTimeout` 来比对（不写死那个数），同时扫本文件禁止裸数字
`timeout:` —— 一个漏写的用例就是隐形倒挂，而倒挂的后果是红里只剩 `Test timed out`、
stderr 与 JSON 证据全被吃掉。

拦截证据用 `198.51.100.7`（RFC 5737 TEST-NET-2，不可路由、不需要 DNS）：守卫生效时拦在
connect 入口，连 SYN 都不发，所以"秒失败"本身就是判据（用例断言 < 5s）。

## 4. 门禁接线

`.github/scripts/check-test-egress-guard.js`（Gate 20）加两条：
① 共享 setup 必须**同时**引用两个 installer；② 桌面 realm 的 `apps/desktop/test-setup.js`
也必须两面齐全。判据形态是 `hasPlaneCall()`：**先剥注释**（整行 `//`、块注释、行尾 ` //`）
再匹配，且子进程面必须带 `setupPath:` —— 纯文本存在性判据会被"删掉真调用、留一行同名字样的注释"
绕过，也会被"调用在但没传参数"绕过（后者使实现里两个分支都不成立 ⇒ 既不注入也不登记）。
★ 反过来，判据**不设行首锚点**：`require('x').installTestNetworkGuard()` 是合法接线，
加锚点会把它误判成没接（这条是我自己第一版写错后由夹具实测暴露的）。
两个平面**各自独立**判，不写成 `else if` 链 —— 否则"两面都缺"只会报一条，补上 socket 面之后
子进程面的洞又看不见。
作用域按 `readFile` 是否读得到 setup 分档 —— 夹具仓库不建模 setup 是合法的，只有真实仓库模式
才要求它存在（否则既有夹具测试被误拦，实测发生过）。

## 5. 已知边界（不假装已闭合）

- **非 node 子进程仍然能出网**。本层做的是**让它可见**（台账 + 出声），不是拦住 —— 拦它需要在
  传输层做（代理/防火墙），那是 CI 基础设施改动，不在本 PR。
- **`npm` / `npx` / `pnpm` / `yarn` 这类 node 包装器只登记、不注入**。实测现场：
  `apps/desktop/electron/services/render-engine.js:107` 用 `spawn('npm', ['install'], { shell: true })` ——
  `isNodeCommand('npm')` 为 false，所以它进台账（名字记 `npm`）但不注入。给这类形态注入的唯一安全面
  是 `NODE_OPTIONS`，而把它推广到**所有**子进程会让 Electron 存活测试的 realm 也加载本守卫
  （`--require` 在 Electron 里语义不确定，正是上一轮被有意排除的那件事），所以停在"可见化"。
  真要覆盖 npm 的下载，需要在 env 注入清单里显式列 npm 系并排除 electron.exe —— 那是另一个 PR 的判据。
- **经 shell 包装的任意命令串**（`cmd.exe /c node …`、`sh -c "node …"`）：argv[0] 是 shell 本身，
  首 token 判据看到的是 `cmd.exe`/`sh` ⇒ 走 external 台账（**能看见是谁**，不注入）。
  要覆盖它必须解析 shell 命令串，等于重新发明引号语境 —— 宁可如实登记为边界。
  实测本仓测试域内没有 `shell:true` 起 node 的写法（唯一的 `shell:true` 就是上面那条 npm，
  另一处命中是断言"必须用 shell:false"的负例）。
- **台账 `readExternalChildLedger()` 目前只有测试读，没有 CI 侧的"必须为空"断言**：先观察一轮
  真实数据（哪些命令名会出现、各多少次）再决定阈值，否则第一版就会把 python/electron 的合法
  子进程判红。台账名现已收敛为"shell 首 token 的路径末段"（`npx vite build …` 记成 `npx`，
  不再把整条命令串当命令名）。
- **Electron 宿主下 `process.execPath` 是 electron.exe** ⇒ `isNodeCommand` 判 false（除非
  `ELECTRON_RUN_AS_NODE`），存活测试里的 electron 子进程不会被注入。这是有意的：给 electron
  注 `--require` 语义不确定，且 GUI 存活测试的目标本来就要网络。
- **`spawn(cmd, opts)` 不带 args 数组的形态**：注入会插入一个空 args 数组。这是 Node 合法签名，
  但若有代码依赖"第二个参数必须是 options"就会漂 —— 由本轮的桌面全量跑量兜（见记录里的跑量证据）。
- **`NODE_OPTIONS` 注入会传染整棵子进程树**（含孙进程）。这是特性不是缺陷（覆盖面更广），
  但它意味着：若某个被测试调起的工具自己读 `NODE_OPTIONS` 并做严格校验，会看到多出来的
  `--require`。当前实测的唯一 shell 形态消费者是 `npx vite build`，未受影响。

## 6. 复跑

```bash
cd D:/Data/projects/mp-worktrees/mp-fix-test-egress-child-plane
node --test .github/scripts/check-test-egress-guard.test.js
node .github/scripts/check-test-egress-guard.js
cd packages/shared-utils && pnpm exec vitest run src/__tests__/network-egress-guard-child.test.js
cd apps/desktop && pnpm exec vitest run electron        # 全量回归（子进程注入的最大风险面）
```
