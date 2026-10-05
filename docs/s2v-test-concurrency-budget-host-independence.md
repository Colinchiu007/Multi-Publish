# 一条"在 CI 绿、在开发机红"的用例：story2video 测试引擎必须自己钉住并发预算（#2796）

分支：`fix-s2v-auto-start-preflight`；关联 **#2796**（由收 #2794 时的全量对照暴露）。

## 1. 症状与最初的错误描述

`electron/services/story2video-manual-assets.test.js > pipeline-engine manual 集成 > manual 模式在 compose 前插入 finalize_assets 阶段；auto 不插入`
确定性红，且**只在某些主机上红**：

```
AssertionError: expected false to be true
 ❯ electron/services/story2video-manual-assets.test.js:685:26   // expect(auto.success).toBe(true)
```

#2796 正文把它描述成"auto 模式在 runStart 就失败"。**这个描述是错的** —— 它连"是不是 auto 的问题"都还没排除。
真正的形状是：**同一个 engine 上的第二次 `startOrchestrated` 被拒**，与 manual/auto 无关。

## 2. 一步到位的取证：把失败原因打出来

不猜、不改产品代码，只在探针里把返回值整个打印（探针是临时件，跑完即删）：

```
P2_FIRST ={"success":true,"runId":"murlprl8_ex0w"}
P2_SECOND={"success":false,"error":"根据当前设备的内存占用情况，流水线已满负荷运行，请等待其中一条完成后再启动。",
            "errorCode":"PIPELINE_CONCURRENCY_LIMIT","errorParams":{"count":1,"max":1}}
P2_FRESH_AUTO ={"success":true,...}      // 换一个全新 engine，同样的 auto 参数 ⇒ 成功
```

三条读出来的事实：

1. 失败带**明确的 `errorCode`** —— 是并发预算拒启，不是配置校验、不是阶段构造。
2. `max:1` —— 预算在这台机器上是 **1**；`pipeline-engine.js:738-743` 的优先级是
   `deps.maxConcurrentRuns` 注入 > `STORY2VIDEO_MAX_CONCURRENT_RUNS` 环境变量 > **按机器资源自适应**
   （`computeDefaultMaxConcurrentRuns`：`cpus<2 或 freeMem<2GB ⇒ 1`，最高 4）。
3. 换 engine 即成功 ⇒ 与 auto 语义无关；本用例在同一个 engine 上连起两条 run，
   而第一条（`autoAdvance:false` + 无执行器推进）**永远停在 running**，于是独占掉唯一的槽位。

⇒ 这是一条**依赖主机资源**的测试：CI runner（4 vCPU / 16GB）预算 ≥2 所以绿，开发机空闲内存低于 2GB 就红。
"同一提交既绿又红"意味着"本地跑过"不再构成证据 —— 反过来，**能把它变确定性的不是放宽断言，而是让测试自己声明前提**。

## 3. 把整类问题一次枚举出来（比修单个用例更值钱）

引擎的预算有环境变量入口，于是可以在**最坏主机**下跑全量，把整类一次性逼出来：

```bash
cd apps/desktop && STORY2VIDEO_MAX_CONCURRENT_RUNS=1 pnpm exec vitest run electron
```

实测（修复前，423 文件 / 8195 例）：**只有 2 个文件红** ——
`feedback.test.js`（Windows symlink `EPERM`，既有已知）与本文件。
⇒ 这个类的规模就是 1 个文件，不需要全局重构；也顺带证明了"再没有别的用例偷偷依赖主机内存"。

## 4. 修复

只改测试夹具，产品代码一行未动：

- `makeConfiguredEngine()` 显式注入 `maxConcurrentRuns: 4`（同先例：`electron/tests/pipeline-engine.test.js:1206-1211`
  早就为了同一个原因这么写了，本文件只是漏了一处）。
- 两条 `success` 断言改成 `expect(x.success, JSON.stringify(x)).toBe(true)`：将来若再被预算拒，
  现场直接报出 `errorCode` 而不是 `expected false to be true`。
- 新增一条防再犯锁：**工厂产出的引擎必须自己钉住预算（>=2）**。它不看行为，只看前提声明。

## 5. 反证（都在 `STORY2VIDEO_MAX_CONCURRENT_RUNS=1` 下实跑）

| 变异 | 跑法 | 结果 | 说明 |
|---|---|---|---|
| M-1 取消预算注入 | 只跑锁 | **RED** `expected 1 to be greater than or equal to 2` | 锁单独就能抓，不搭行为用例的便车 |
| M-3 取消注入 + 把锁断言拆成 `>=0` | 只跑锁 | **GREEN** | 证明红来自那条断言本身（锁是承重的，不是装饰） |
| M-2 预算钉成 1 | 整文件 | **RED**（2 红 21 绿，现场含 `PIPELINE_CONCURRENCY_LIMIT`） | 行为用例也守得住 |
| 基线（修复后） | 整文件 | **GREEN** 23/23 | 最坏主机下确定性通过 |

驱动收尾断言文件与备份**逐字节相同**。驱动自身也修了一处探针缺陷：
它原来只认 `Tests N failed | M passed` 这一形态，而 vitest 在"全红且 0 通过"时打的是 `Tests N failed (N)`，
于是解析失败被当成了结论 —— 现在按汇总行里的 `failed`/`passed` 计数分别取，且零计数一律抛 `PROBE_EMPTY`。

## 6. 遗留

- **没把 `STORY2VIDEO_MAX_CONCURRENT_RUNS=1` 接成 CI 车道**。它是一次性枚举整类的利器，
  长期跑则会把"允许自适应"这条产品语义变成测试约束，且全量成本 +1 轮；要做的话应当只挑
  `pipeline`/`story2video` 相关子集，并同 PR 明确"这条车道测的是主机无关性，不是并发策略"。
- `autoAdvance:false` + 无执行器时 run 永久停在 `running` 并独占槽位，是**测试环境的人造状态**
  （生产里有执行器推进/暂停），因此本 PR 不改产品行为；但若将来有真实场景会让 run 停在 running 而不释放预算，
  那是另一个问题，需要单独的取证。

## 7. 2026-10-05 复核：这条车道到底接不接（结论：不接，改钉常规用例）

上面「遗留」第一条当时只写了倾向、没做测量。本轮把测量补齐后**维持不接**，并把它换成零成本的常规锁。

### 7.1 成本实测（取一次 main push 的真实 run）

| 项 | 实测 |
|---|---|
| `quality-gate` 全程 | run `37250937816` = **27m52s** |
| `Desktop tests shard` 单片 | 1487s / 1519s，job `timeout-minutes: 40`、步骤 30min |
| 桌面全量不拆片 | ≈47min ⇒ **超过 40min job 预算**，接它必须先拆片，机器分钟翻倍 |
| 子集 lane（约 10 个受影响文件） | ≈2–4min（按 shard 内 setup ≈65s + 约 6.7s/文件推得；整文件墙钟未逐条实测） |

本仓一次完整 quality-gate 是 25–30 分钟，而 main 前进的间隔就在这个量级内 —— 给每个 PR 再加一轮重量级 lane，
会把「置顶共享件 + auto-merge 落不了地」那条已知问题放大（见 AGENTS.md 行尾/置顶件纪律）。

### 7.2 收益实测：这条 lane 唯一的独占覆盖只有一格取值

`env=1` 走的分支与 `deps.maxConcurrentRuns=1` 走的是同一条（`pipeline-engine.js:740-743` 的三元表达式），
差别只在**预算的来源**。budget=1 的行为（第二条被拒、取消释放槽位、resume 占槽）早已是常规单测
（`resume-orchestration.test.js:403-443`）。所以整条 lane 新增的可表示状态，只有「env 解析出的值恰好是 1」这一格 —— 
而环境变量开关 describe 原本只测 2 / 非法 / 99，确实没测 1。

**结论**：为一格取值开一轮 47 分钟的车道不成立；把那一格补进常规用例即等价收益、零增时。
落点：`resume-orchestration.test.js` 的「设 1（最坏主机档）→ 上限为 1 且第 2 条被拒、取消后释放槽位」。

### 7.3 顺带挖出来的一条通用判据（比本条结论更值钱）

反证 T1a（`envLimit > 0` 改成 `envLimit > 1`）在本机**跑成了绿的**。原因不是锁没牙，而是本机实测
`os.freemem()` 只有 **1.03GB** ⇒ `computeDefaultMaxConcurrentRuns()` 返回 **1** ⇒ 「env 被忽略」与「env=1 生效」
在本机是**同一个可观测状态**，该变异在本机是等价变异（在自适应为 3/4 的主机上必红）。

这正是 #2800 那个病根的镜像形态：判据的正确性偷偷依赖主机。两种可接受的处理是「把默认值注入成确定值」或
「换一条与默认值不可能重合的断言」；**不可接受**的是「加条件 skip」或「记成本机等价」。这里选后者，
做法是在同一条用例里**再取一个档位**：先 `env=3` 断言 `maxConcurrentRuns === 3`，再 `env=1` 断言行为链。
这样「env 分支整条失效」这一类变异在**任何**主机上都会红（T1b、T2 实测各红 2 条，其中一条就是新用例）。

> 通用口径：给「资源自适应」类默认值写锁时，先量一次本机自适应实际解析成几；
> 若与待锁取值相同，则该锁在本机恒真，必须补一个不可能与默认值重合的档位一起断言。

### 7.4 评估过并否决的第二件东西：全域「必须钉预算」结构锁

把 `story2video-manual-assets.test.js` 那条逐文件自觉锁升级成扫 `apps/desktop/**/*.test.js` 的结构锁，
判据「同一文件内 `startOrchestrated(` 出现 ≥2 次且引擎构造未含 `maxConcurrentRuns` 即红」。实测清点：

- 771 个桌面测试文件，含 `startOrchestrated(` 的 **11** 个，被该判据标记 **5** 个；
- 其中 3 个是**必须不钉**的：`pipeline-engine.test.js`（被测对象就是默认链路）、`resume-orchestration.test.js`
  （环境变量开关要求 deps 缺席，钉了反而测不到）、`stage-executor.test.js`（裸引擎夹具）。

即例外清单与判据同等规模 —— 一把只能靠三条例外才不误伤的锁，正是本仓「装饰性门禁」的定义。不做，
并在此留测量，避免下一个会话重新发明。
