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
