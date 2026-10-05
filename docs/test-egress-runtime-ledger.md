# 测试期运行时出站台账与基线棘轮

> 落地于 2026-10-04（change/分支：`test-egress-runtime-ledger-baseline`）。关联单：#2491 档3、#2783（子进程面）、#2794（夹具面）。

## 1. 这条门禁测什么

测试层"禁止真实出站"的守卫（`packages/shared-utils/src/network-egress-guard.js`）有两个平面，每个平面都会遇到**守卫管不到的东西**：

| 形状 | 为什么管不到 | 怎么兜 |
|------|-------------|--------|
| 非 node 子进程（git / python / ffmpeg / powershell / chrome-headless-shell / taskkill / esbuild） | `--require` 注入只对 node 系子进程有效；别的二进制里的网络请求与这个 realm 无关 | 进台账 + 每个命令名出声一次 + **基线之外的新命令名判红** |
| 被 `catch` 吞掉的出站尝试 | 守卫抛的错误如果被上层消化，用例照样通过，谁也不知道曾经真想过要出网 | 拦截时同时写 `__mpBlockedEgress` 与台账，**基线之外的新 host:port 判红** |

判据键只有两种形状：`child::<命令名>` 与 `blocked::<host[:port]>`。

## 2. 为什么不是静态 grep（改判的实测依据）

#2491 档3 原本要做静态棘轮（扫"起子进程无 timeout / 真实出网且无注入面"）。2026-10-04 的清点实测把它否了：

- 命中 1080 个被跟踪测试文件（`unreadable=0` 证明遍历完整）；
- "真实出网且无注入面"命中 9 个文件，**抽样 3/3 全是断言里的 URL 字符串**（NavBar / tab / url-collector），不是真出站；
- "起子进程无 timeout"71 处，多为 mock 与扫源码的结构锁；
- 结论：静态判据写出来要么恒真、要么被误报淹没后一周内长满豁免清单 —— 那是"装饰性门禁"。

运行时台账只登记**真的起过进程 / 真的试过连接**的那些，噪声天然为 0。代价是它需要一次真实跑，所以判定步被放在跑测试的那两个 job 里（见 §4）。

## 3. 三份部件

| 部件 | 作用 |
|------|------|
| `network-egress-guard.js` 的 `ledgerAppend` / `recordInstallOnce` | sink。env `MP_TEST_EGRESS_LEDGER` 指向可写路径时，逐条追加 JSONL；`MP_TEST_EGRESS_SUITE` 只作诊断标签，**不进键**。写失败必须打 `[TEST-EGRESS-LEDGER-SINK-FAILED]` 且**绝不冒泡**（守卫把自己的测试弄崩比漏记一条更糟，见 #2783 同族） |
| `scripts/check-test-egress-ledger.js` | 判定器。读 JSONL 与基线比对，**新增即红**；基线里有而本次没出现 = 只出声不判红（分片/子集跑无法证否"再也不出现"） |
| `scripts/test-egress-ledger-baseline.json` | 清单。每条必须写原因；`check-test-egress-ledger.test.js` 里有一条锁要求"基线非空且每条原因 ≥8 字符"，防止有人拿空文件或占位原因过关 |

三条 fail-closed 判据（都在 `check-test-egress-ledger.test.js` 有对应夹具）：

1. **台账文件不存在 / 0 行 ⇒ 红**。否则"env 名拼错""写入被包装层吞掉"会被读成"零违规"。
2. **台账里没有任何 `{type:"install"}` ⇒ 红**（"装配未经证实"）。install 记录按 **(realm, 台账文件)** 去重，且只在**真的写成功**之后才置位 —— 只按 realm 去重会让"CI 里 setup 先写过、用例里再指一个新文件"这条路径永远拿不到记录，同一条锁就变成本机绿 / CI 红。
3. **坏行与未知 `type` 计数并判红**，不得 `catch { continue }`（不完整的遍历判定全绿是假绿，与 worktree 链接扫描同族）。
4. **"跑过测试"这件事必须是真的**：`Gate 4` 走 nx，而缓存命中时 nx 只重放上次结果、**根本不启动测试进程** ⇒ 台账连 install 都没有 ⇒ 上面的 fail-closed 会把一条正常 PR 判红。所以该步骤显式 `NX_SKIP_NX_CACHE: 'true'`（由接线锁钉住）。QM-6 之前我只想着"取不到证据会不会炸"，没料到"缓存让证据消失"这一维。
5. **落盘去重与出声去重是两件事**：realm 内的 `recordExternalChild` / `blocked.seen` 负责"每个命令/主机只出声一次"，sink 另用 `__mpEgressLedgerWritten` 负责"每个键只写一次"。写失败时后者**不置位** ⇒ 后续同类事件还能补写。反之，`ledgerAppend` 必须返回三态 `skip|ok|fail`：把"没配路径"也当失败去回滚 realm 台账，会直接改掉既有消费者 `readExternalChildLedger()` 的语义（我第一版就是这么改坏的，被既有用例当场拦下）。
6. **判"写成功"要看文件真的变大**：QM-6 指出的形态是有 setup 抢在守卫之前把 `fs.appendFileSync` 换成 no-op（`packages/ui/vitest.config.ts:9` 正是"自有 setup 在前、共享守卫在后"的形状），try/catch 什么都抓不到，恒绿的棘轮就是这么来的。

## 4. 判据落在哪里（以及为什么不是别处）

| 落点 | 是否 required | 结论 |
|------|--------------|------|
| `quality-gate.yml` → `Gate 4 - Workspace unit tests`（`QG Unit Tests`） | **是**（classic protection 的 `contexts` 实测含 `QG Unit Tests`） | 主落点，红了拦得住合并 |
| `quality-gate.yml` → `Desktop tests shard`（`QG Desktop Shards`） | 本身不 required，但 `Gate Result`（required）`needs:` 它 | 第二落点，红了经聚合拦得住 |
| 新开一个非 required job | 否 | 只"显示为红"，不阻断 —— 不采用 |
| `electron-ci.yml` 的 `electron-tests` | 否，且不在 `Gate Result` 的 `needs:` 里 | 不装 env 也不判定：装 env 却没有判定步 = 台账白写 |

两处判定都放在**"真的跑完测试"这条路径的末尾**，不是独立 step + `always()`：`Gate 4` 在 `nx affected` 为空时有一支 `exit 0` 早退，那条路径没跑测试也没有台账，独立 step 会把"这次没有受影响项目"读成"台账缺失"（假红）。pwsh 步骤不会因中间命令非零自动中止，所以显式判 `$LASTEXITCODE` 再 `throw`（`check-step-failfast` 同族）。

## 5. 怎么重跑与怎么改基线

```bash
# 桌面（约 20 分钟）
cd apps/desktop
MP_TEST_EGRESS_LEDGER=/tmp/l.jsonl MP_TEST_EGRESS_SUITE=desktop-shard pnpm exec vitest run

# packages 各 workspace
MP_TEST_EGRESS_LEDGER=/tmp/l2.jsonl MP_TEST_EGRESS_SUITE=unit-tests pnpm --filter '!@multi-publish/desktop' -r --if-present run test

# 判定 / 重生成
node scripts/check-test-egress-ledger.js --ledger /tmp/l.jsonl
node scripts/check-test-egress-ledger.js --ledger /tmp/l.jsonl --write-baseline   # 新键会写成 "(待补原因)"，必须人工补
```

改基线的规则：**新增键必须在同一次里补一条"为什么这里会出现非 node 子进程 / 会真的试出站"**；带"欠账"字样的条目（见 §6）修好后必须**删掉**，不是留着当纪念。

## 6. 基线里三类条目的区别

| 类别 | 例 | 处置 |
|------|-----|------|
| 守卫自测（故意触发拦截） | `blocked::example.com:8099`、`blocked::198.51.100.7:443` | 常驻，删除等于拆掉自测 |
| 预期的本地工具 | `child::ffmpeg.exe`、`child::powershell.exe`、`child::git` | 常驻；新增命令名必须先说明它为什么会在测试里被真起 |
| **欠账（被测代码真的想出网）** | **已清零** —— 原 `blocked::channels.weixin.qq.com:443`、`blocked::mp.toutiao.com:443`、`blocked::ops.example.com:443` 三条 | 2026-10-05 补上传输层桩并删除条目（#2878）。新增欠账按同一处置：补桩 → 删条目；基线里不得再留「欠账」字样 |

### 6.1 #2878 三条欠账的根因与反证（2026-10-05）

三条同形，**都不是守卫的锅，也不是生产逻辑的错**：被测代码的判断是对的，错在测试夹具只桩了「判定」那一层，没桩「判定之后顺带发生的那次真实请求」。

| 条目 | 触发用例 | 真实出站的那条边 | 处置 |
|---|---|---|---|
| `blocked::channels.weixin.qq.com:443` | `account-manager.test.js > checkLoginStatus 渲染崩溃平台降级 > tencent_video HTTP 检测有效` | 用例 mock 了 `tryHttpLoginCheck`，但 `checkLoginStatus` 判有效后还会调 `profileRefresh.refreshProfileFromHttpApi(...)`，它内部直接持有 `require('./http-login-checker')` 的**真实**模块对象 | 加载消费方**之前**把 `./account-profile-refresh` 整层打桩，并断言它确实被调到 |
| `blocked::mp.toutiao.com:443` | `account-manager.test.js > checkLoginStatus session 分区 Cookie 合并 > toutiao 分区有 Cookie 时不再走 NO_COOKIE 硬判失效` | 同上（同一形态的第二落点） | 同上 |
| `blocked::ops.example.com:443` | `ops-center-sync.test.js > OpsCenterSync syncNow > 未配置 URL / Key / manager 时 fail-closed` | **生产行为是有意的**：`syncNow` 在模型服务未就绪时仍会 best-effort 下发运行时策略（`_syncRuntimeBestEffort` → `/api/v1/runtime/bootstrap`）。旧注释写的「不发起网络请求」与实现不符 | 给 `global.fetch` 打桩并改注释；**不改生产行为、不改断言** |

两个必须记住的机制细节：

1. **为什么单跑 `-t` 复现不出来、必须整文件跑**：`account-profile-refresh` 只在首次 `require` 时求值，那一刻若注册表里还没有 checker 的桩，它就把**真实**模块对象存进模块级 `const` 并终身持有；后续用例再注册桩已经晚了。用例过滤改变了首次 require 的时机，于是过滤跑反而「干净」。**这属于「夹具在隔离依赖还是在藏缺陷」的典型形状**：绿灯来自加载顺序，不来自断言。
2. **反证（桩必须承重，不能是装饰）**：摘掉 `stubProfileRefreshTransport()` 后重跑该文件 → `Tests 1 failed | 82 passed`，且台账重新记回 `blocked::channels.weixin.qq.com:443`。即新断言会红、新桩是必要的。

第三条尤其值得记住：**当旧注释与实现不符时，先判定哪一边是契约**。这里实现的 best-effort 运行时下发是明确设计（目录无处应用，但公告/版本/菜单仍须下发），所以错的是注释与夹具，不是生产代码——照着旧注释去改生产逻辑会把一个正确设计改坏。

## 7. 已知不闭合

- **归因不进键**：台账里没有测试文件坐标 —— 实测 vitest 4 的 worker realm 里 `globalThis.__vitest_worker__` 取不到 `ctx.file`，`process.argv` 也没有文件名。所以键是全局的，"哪个用例起的"只能从 vitest 自己的 `stderr | <file>` 输出里读（本文 §6 的三条归属就是这样得到的，不是猜的）。
- **分片跑无法证否陈旧**：所以"基线里有、本次没出现"只出声。要真删一条，必须在全量跑里持续不出现。
- **partial sink 盲视**：某个 realm 若连 `fs` 都被替成谎报对象且**装守卫之前**就替换，写盘可能静默失败；现在靠每次 install 记录 + 写失败出声 + "0 行判红"覆盖，**但"某些 realm 没写出来"仍无法证否** —— 那属"探针自己坏了"这一类，不做成恒真式声明。
- **只覆盖 node 测试面**：`ops-center` 的 pytest 面不归这个守卫管。
