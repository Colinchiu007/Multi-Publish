# Windows 文件锁握手预算：取值来源与复测路径

> 本文件只回答一个问题：`test-helpers/windows-file-lock.js` 里那三个等待预算（启动 45s / 持锁 12s / 释放 20s）**是怎么来的**，
> 以及下一个人**怎么重新量一遍**。在它存在之前，这些数字唯一的"出处"是注释里一句"PowerShell 冷启动是秒级"——没量过。
>
> 本文件取代的表述：`test-helpers/windows-file-lock.js` 与 `windows-file-lock.test.js` 早期注释里那种
> "某宿主启动是秒级"的**未实测断言**。它曾把一次真故障误归因成"锁没拿到"，而根因是启动相位被饿死——与断言无关。

## 1. 预算为什么要按相位拆开

夹具等的是一个 PowerShell 子进程走到"已持有独占句柄"。这条路上有两件事，只有一件是被测语义：

| 相位 | 在等什么 | 归属 | 预算常量 |
| --- | --- | --- | --- |
| ready | `powershell.exe` 冷启动到吐出 `READY`（CLR / AMSI / Defender 扫描） | **环境开销** | `DEFAULT_READY_TIMEOUT_MS` |
| locked | 拿到 `READY` 之后，`[IO.File]::Open(..., FileShare.None)` 真的报回 `LOCKED` | **被测语义** | `DEFAULT_LOCKED_TIMEOUT_MS` |
| release | 子进程退出，且父进程探针能重新打开该文件 | 收尾 | `DEFAULT_RELEASE_TIMEOUT_MS` |

只有一个总预算时，"慢在启动"还是"慢在抢锁"**不可归因**；启动吃满预算后，错误文案还会说成"LOCKED 缺失"，
把人引向去怀疑断言本身。所以被等待方必须**在做被测动作之前**先吐 `READY`，两相位各带独立预算与点名相位的错误文案。

总预算与用例超时的关系另有一条硬约束：夹具总预算必须被 `LOCK_CASE_TIMEOUT_MS` 包住（**预算倒挂**——
否则先撞上框架超时，诊断全被吃掉），且所有消费方只能引用该单点常量，不得各自裸写数字。

## 2. 现在的数字与其出处

- 启动相位实测最大值 **12762 ms**，来自 **41** 个 `QG Desktop Shards` 作业、**26** 次 main push run、共 **410** 条握手样本（采集日 2026-10-02）。
- 取值规则：`DEFAULT_READY_TIMEOUT_MS ≥ maxObservedReadyMs × safetyMultiplier(2)`，由
  `windows-file-lock.test.js`「预算取值来源」第一条断言守住；当前生效值 45000ms（余量 3.53×）。
- 同一组数字以 `LOCK_BUDGET_PROVENANCE` 的形式**导出在源码里**——注释会被人改写，导出的对象和断言不会。
- **更早的窗口量到 max=21090ms**，与本次同一量级。预算按"量级"取，不按"单次抽到的最大值"取。

⛔ 由此得一条不对称纪律：**重测量出更低的值不构成收紧预算的理由**。长尾只会因窗口变窄而漏看，
不会因"这次没看到"而被否证。要收紧必须先给出多窗口对照；任何时候都不得反过来放宽断言。

## 3. 怎么重新量

```bash
node scripts/lock-timing-audit.js --runs=26          # 人类可读：pages/runs/jobs/samples/p50/max + 余量判定
node scripts/lock-timing-audit.js --runs=26 --json    # 直接打印可粘进 LOCK_BUDGET_PROVENANCE 的对象
```

退出码：

| rc | 含义 | 正解 |
| --- | --- | --- |
| 0 | 采到样本且余量成立 | 什么都不用做 |
| 3 | **一条样本都没采到** ⇒ 探针坐标可能过期 | 去查第 4 节的五个坑，**不得**读成"没问题" |
| 4 | 实测最大值吃掉 `max × safetyMultiplier` | 抬预算并同步 `LOCK_CASE_TIMEOUT_MS` 的消费方，不是放宽断言 |

需要 `gh` 登录态；作业日志只在 run 结束后可取，所以它是**事后复测**工具，不进 CI。
每次 push 都跑的是**活体检查**：`windows-file-lock.test.js` 读进程内握手台账（`getLockTimings()`），
断言"本次有样本 + `readyMs` 真实非零 + 观测值没有贴脸逼近预算（<90%）"。贴脸是要重测并抬预算的信号。

mock 注入（`options.spawnImpl`）的样本**一律不入台账**：假跑出来的 `readyMs` 是 0，混进去会让"观测值 vs 预算"
这条比较变成恒真——而同一个文件里「标记不等于效果」那条回归恰恰是靠假子进程跑的，两类样本必须分得开。

## 4. 采集坐标的五个坑（都真实踩过）

1. Actions 的**作业**对象没有 `completed` 字段 ⇒ 判完成态一律 `status === 'completed'`。
   写成 `j.completed` 的症状是"脚本跑得通、样本恒 0"。
2. 日志请求必须**绕开本机代理**（走 7897 时 Actions 日志/产物会失败）。
3. `gh api` 对含 ANSI 转义序列的响应会**拒答**，而 Actions 日志必然含 ANSI ⇒ 必须 `--allow-escape-sequences`。
4. 列 run 那一步失败（repo 写错 / 未登录 / 网络）原本抛裸栈、rc=1，读起来像"脚本坏了"而不是"没采到"
   ⇒ 现在并进同一条零样本出口，并把失败坐标与页数一起打出来。
5. **GitHub 的 workflow run 列表一旦带服务端 `event` / `status` 查询参数，本仓返回的是一个被静默截断到
   2026-09-15 之前的窗口**（`total_count` 从 2000+ 掉到 1372）。那个窗口里还没有本夹具，
   症状同样是"采不到样本"。⇒ 过滤一律放**客户端**做，并且必须**翻页**：
   最近 100 条 run 里只有约 9 条是 main push，单页会把 `--runs=26` 静默缩改成个位数。

第 5 条最值得记的一句：**"脚本没报错、也报了数"不代表它在读你以为的那个集合**。
这也是为什么零样本必须是非零退出码而不是"0 个样本，看起来一切正常"。

## 5. 为什么刻意不写 CHANGELOG / learnings.md

本 PR 的执行记录写在 `openspec/records/lock-budget-provenance.md`（新载体：文件名即键，欠账登记在文件自身的
`sync_*` frontmatter 里；该门禁现仍为 `--mode=advisory`，但已有多个会话采用）。`.quality-gates.md` 是 legacy 源，
两源分列、不相加当趋势。`CHANGELOG.md` 与 `01-docs/learnings.md` 在本仓含 NUL 字节、被 git 判为 binary
⇒ 按字节存，任何"置顶插入"都是与所有并发会话抢同一行的三方合并。本 PR 里可复现的机制、判据与五个坑
全部落在本文件、代码注释与 AGENTS.md 的 MUST 条目里；CHANGELOG 条目由后续回填型 docs PR 按 main 实际内容统一补
（**延期 ≠ 丢弃**）。
