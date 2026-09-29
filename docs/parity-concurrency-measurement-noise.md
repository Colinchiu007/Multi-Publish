# 并发观测指标的度量口径：为什么对拍允许 `max_concurrent_observed` 差 +1

关联：issue #2606、`openspec/changes/fix-parity-concurrency-noise-bound/`、
规格 `openspec/specs/desktop/model-call-observability/spec.md`「模拟器与真实 governor 对拍」。

## 一句话

`max_concurrent_observed` 不是"并发能力"，是"回调有没有跑过"。事件帧被饿到接近相邻请求的
起始间隔时，它必然比确定性模拟器多报 1；多出来的那 1 从未越过配置上限，所以它不该被判成
两套模型的契约漂移。

## 现象

main `4770b0b5` / run 36483489315 上 `test_scheduler_parity` 红：

```
inject-429 {"max_concurrent_observed":false,"rate_limited_count":true,
            "quota_exceeded_count":true,"total_duration_ms":true}
python={"max_concurrent_observed":1, ...} real={"max_concurrent_observed":2, ...}
```

四个被比对的指标里只有并发这一项不一致，耗时差 362ms 远小于允许值 1782ms。
该组参数是 `rpm=120, maxConcurrent=2, requestCount=6, requestDurationMs=20, inject429At=3, cooldownMs=300`。

**注意方向**：配置上限是 2，所以 real=2 是"没用满上限"与"用满上限"的区别，不是越界。
一开始很容易把这类红读成"governor 并发失控"，那是把标识符匹配（组名带 429、作业名带 test）
当成病因匹配的又一次落地。

## 度量为什么天生会偏高

真实侧的计数在任务体里 `active += 1`，在 `await sleep(...)` **之后**的回调里 `active -= 1`
（`apps/desktop/electron/services/rate-limit-self-check.js`）。于是"执行中"的边界由回调
是否被调度决定，而不是由工作是否做完决定：帧被饿时，一个早已睡完 20ms 的任务在账面上仍然
"在执行"，下一次放行就会把它算成并发。

模拟器没有这个性质——它是离散事件模型，时间只在槽位/选择器/冷却处推进。两者比的本就不是
同一个量。

## 阈值实验（本机，同一组参数）

| 条件 | 真实侧 maxc | 备注 |
| --- | --- | --- |
| 空载，同进程连跑 24 次 | 1 | 时间线 0 / 512 / 1002 / 1511 / 2014 / 2670，严格串行 |
| vitest 内跑完整六组 | 1 | 与测试框架无关 |
| 12 个**独立进程** CPU 压力 | 1（耗时仅漂 18ms） | 独立进程不饿本进程事件帧 ⇒ 排除"机器忙"这种含糊解释 |
| 同进程同步阻塞 40ms / 每 250ms | 1 | 低于阈值不翻 ⇒ 判据不是"有点抖就算" |
| 同进程同步阻塞 600ms / 每 300ms | **2** | 时间线出现 `started=0 finished=600`：20ms 的调用被记成 600ms |

相邻起始间隔 = 60000 / rpm = **500ms**。实验与机制预测一致：**只有阻塞时长跨过 500ms 才重叠**。
这条已被固化成回归锁（两档：≤ 间隔的 1/10 与 ≥ 间隔的 1.2 倍），见
`apps/desktop/electron/tests/test_scheduler_parity.test.js` 的「并发观测的饥饿阈值」。

## 判据

```
real > maxConcurrent                                   → 红（上限不变量，任何情况不放宽）
real < simulated                                       → 红（该方向不可能来自回调推迟）
real === simulated                                     → 绿
real === simulated + 1
   且 real ≤ maxConcurrent
   且 探测到"某次调用的槽位占用跨度 ≥ 相邻起始间隔（且 ≥ 2× 配置时长）"
                                                       → 绿，记 noiseBypass 并每次打印
其余                                                   → 红
```

三条次序都不可调换：

1. **先夹上限、再谈豁免**。反过来的话，`maxConcurrent=1` 的用例（`rpm30-concurrency1`）会把
   "观测到 2"当成噪声放过——而那正是单并发违约。现在 cap=1 时豁免自动失效，等价于仍要求相等，
   这不是特例分支而是同一条判据的后果，有显式用例钉住。
2. **豁免必须有因果证据**（QM-6 后端评审的 Critical）。只凭 `real = sim + 1 且 ≤ 上限` 就放行，
   会把"governor 提前放行"这类**节奏型回归**当成噪声 —— 它给出的三元值完全一样。两者在 timeline
   上可分：回调推迟 ⇒ 某次调用的占用跨度被拉长到 ≥ 相邻起始间隔；提前放行 ⇒ 每个跨度仍 ≈ 配置时长。
3. 真实侧低于模型一律判红 —— 回调推迟只会让它偏高。

上限一律经被测侧 `clampConcurrency` 解析（`effectiveMaxConcurrent`），**不在对拍侧抄第二份公式**。

## 证据探测器：我第一版写错了，是被自己的断言当场否证的

第一版要求「两个 **completed** 窗口重叠」。听着严谨，错在过滤条件：本例里与被推迟的调用重叠的，
恰恰是**被 429 拒掉、永远不会 completed** 的那条请求 —— 按 completed 扫就看不见真正的重叠，
高档 `maxSpan=600ms` 却报"无证据"。

发现方式不是事后复盘，是刚加的机制锁自己红的：`低档不该探到推迟证据` 与 `高档必须命中豁免`
一红一绿，直接指出探测器与机制描述不符。阈值取 `max(interStartMs, 2 × requestDurationMs)` ——
前者由机制推（跨度必须长到"下一次放行时上一个仍未释放"），后者防止 rpm 很大（间隔很短）时把
普通定时器抖动当成推迟。

## 完成顺序：从"只打印"升为硬判定（#2626 已修）

规格本来就把「完成顺序」列为必须一致，但 `runParity` 从没真的比过。#2632 真的比了一次就报出：
注入 429 的那条请求，模拟器记 `completed`、真实侧记 `rate_limited` ——
`sim=[1,2,3,4,5,6]` vs `real=[1,2,4,5,6]`；而模拟器自己的单测
（`test_scheduler_simulator.py`）已把该标签**钉成契约**。这是运营后台可见的虚高
（验证详情里完成数多算 1）。

### 为什么"顺序"可以当硬判定，而"并发观测"不行（实测，不是推断）

#2606 的教训是：把**测量口径敏感**的指标写成相等契约就会造假红。所以升级之前先做同一个饥饿实验，
问"顺序会不会也被帧饥饿打乱"，而不是默认它确定。

用与 `test_scheduler_parity.test.js` 里**同一套** `withBlocker()` 饥饿装置，参数取
`rpm=120 / 并发2 / 8 请求 / 20ms`（相邻起始间隔 500ms），四档递进各跑 2 次：

| block 时长 | 实测帧延迟 | 真实侧 maxc | 真实侧完成顺序 |
| --- | --- | --- | --- |
| gap×1.2 (600ms) | 301 / 300 ms | 2（= sim+1，确证发生推迟） | `[1..8]` |
| gap×2 (1000ms) | 812 / 810 ms | 2 | `[1..8]` |
| gap×4 (2000ms) | 1905 / 1904 ms | 2 | `[1..8]` |
| gap×8 (4000ms) | 3908 / 3906 ms | 2 | `[1..8]` |

另 3 次无饥饿对照同为 `[1..8]`。**8/8 饥饿样本顺序未变，而同批 maxc 已经虚高 1** ——
同一次饥饿足以让并发观测失真，却不足以让完成顺序失真。

机制（也就是这条判据的前提）：各组 `requestDurationMs` 统一 ⇒ 到期时刻顺序 == 准入顺序；
帧被阻塞时一批定时器同时变成"已过期"，Node 仍按到期时刻依次排程回调，相对次序不变。
⇒ **前提写进 spec 与代码注释**：一旦某组引入非均匀时长 / 真实网络延迟 / 抖动 adapter，
前提失效，必须重新取证再决定这条是否继续承重，**不得靠放宽 `completionOrderMatches` 消红**
（改成"只比长度"就是把 `[1,2]` 与 `[2,1]` 判成相同，而那正是它要抓的形状）。

### 修复只改身份，不改占用与额度（可测的边界）

`scheduler_simulator.py` 注入分支现在只改两个字段：`state = "rate_limited"`、`finished_at = None`。
`finish_heap` push、`executing_now`、`used_5h += 1`（准入即占额度，#2566）、`end_times.append(finished)`
四项逐字不动，理由写在行内 —— 动了任何一项都会连带挪动 `max_concurrent_observed` /
`total_duration_ms`，把一次身份纠正变成三个指标同时漂移。
边界由 `test_injected_429_is_not_completed_but_keeps_accounting` 钉住（四个基准值：
`maxc=1 / total=2811 / rate_limited_count=1 / cooldown_count=0`，取自改动前对同组参数的实测）。

### 仍未修的两处口径分歧（登记，别当成已对齐）

1. **429 的槽位占用时长**：真实侧在 `await sleep` **之前**抛错 ⇒ 占用 ≈0ms；模拟器占满 `duration`。
   当前用例 `20ms « 500ms` 故不可见。若将来新增 `duration ≥ 60000/rpm` 的 429 用例，
   模拟器会比真实侧多占一段槽位，`real < simulated` 是**硬红**（方向性判据不许豁免）——
   届时要么改成"判定时刻即释放"，要么显式登记 KNOWN_DIFF。见 #2626 评论 §2。
2. **`cooldown_until` 起点**：模拟器从 `finished` 起算，真实侧从抛错时刻起算。同理当前不可见。

### 本单的变异反证（五条，全部实跑）

| 变异 | 变红 | 备注 |
| --- | --- | --- |
| 4.1 只把 `state` 改回 `completed`（`finished_at` 留 None） | 2（python） | 证明两个字段各自承重 |
| 4.2 完整回退注入分支 | 1（vitest） | **`completion_order` 硬判定真的抓到了原缺陷** |
| 4.3 从 `checks` 摘掉 `completion_order` | 1（vitest） | 降级回"只打印"会被当场发现 |
| 4.4 顺序判据退化成"只比长度" | 1（node 真值表） | 原计划"≥2 红"**写错了**：两条顺序断言同在**一个** `it` 里，1 才是对的 |
| 4.5 越范围摘掉 `finish_heap` push | 11（python） | 比预期宽得多：摘掉后 `executing_now` 永不递减，并发在多个用例同时爆 ⇒ 这条边界确实被广泛守住 |

每条施加后都断言三个文件字节还原一致（harness `restore()` 回读比对）；
锚点命中数 ≠ 1 一律 abort —— **锚点未命中不等于锁没守住**，本案 harness 自己就差点用
`'\n'` 去拼 CRLF 文件（四个目标文件在检出态全是 CRLF）。

## 变异反证（九条，全部实跑并记录变红用例）

| 变异 | 变红 |
| --- | --- |
| M1 判据退回严格相等 | 2（真值表 +1 用例 + 高档机制锁） |
| M2 摘掉 `≤ maxConcurrent` 夹持 | 2（越上限 + cap=1 失效） |
| M3 允许双向偏差 | 1 |
| M4 噪声放宽到 +2 | 1 |
| M5 把 `inject-429` 移出 must-pass | 1（六组用例的存在性前置） |
| M6 上限判断挪到豁免授予**之后** | 2 |
| M7 摘掉因果证据门 | 2 |
| M8 探测器退回只扫 completed | 1 |
| M9 阈值丢掉"跨间隔"只留 2× 配置时长 | 1（vitest 低档断言） |

三条要记下来的过程事实：

- **M5 原计划靠六组用例变红，实测它不会红** —— 循环少跑一组照样绿（缺席被当成通过）。
  补了 `CASES` 名单逐项 `toEqual` + `KNOWN_DIFF_CASES` 不得含 `inject-429` 之后才抓住。
  同理，低档也**不能**断言"必须等于模型值"：CI 自己就可能饿到 500ms（#2606 正是如此），
  写死它等于新造一个假红源 —— 现在改为条件化于**实测帧延迟**，低于阈值才主张相等。
- **M6 第一版设计错了**：我只把上限判断挪到 `real === simulated` 之后，那仍在授予之前，
  所以它"没变红"是探针没打到要害，不是换序无害。改成挪到授予之后才红。
- **M9 第一次跑也报"没变红"**：因为它该打的是 vitest 侧机制锁，我却用了 node 侧 runner。
  换对 runner 立刻红（低档 41ms 在 `bound=40` 下被误判成证据）。
  这三条同族：**反证的结论要先排除"我自己的探针没打到目标"**，再谈锁是否有效。
