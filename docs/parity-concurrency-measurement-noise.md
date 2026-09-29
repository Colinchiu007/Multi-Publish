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
real > maxConcurrent                 → 红（上限不变量，任何情况不放宽）
real < simulated                     → 红（该方向不可能来自回调推迟）
real === simulated                   → 绿
real - simulated <= 1 且 <= 上限      → 绿，但必须记 noiseBypass 并打印
real - simulated >= 2                → 红
```

顺序有讲究：**先夹上限再谈豁免**。反过来的话，`maxConcurrent=1` 的用例（`rpm30-concurrency1`）
会把"观测到 2"当成噪声放过——而那正是单并发违约。现在 cap=1 时豁免自动失效，等价于仍要求相等，
这不是特例分支而是同一条判据的后果，已有显式用例钉住。

## 与既有两处口径的关系

1. `rate-limit-self-check.js` 自身的断言本来就是 `max_concurrent_observed <= maxConcurrent`。
   也就是说**产品侧一直把"上限"当契约，只有对拍侧把"相等"当契约**——本 change 是让两边口径一致。
2. `slow-call-concurrency`（`interval == duration` 临界）早在 2026-08-13 就被登记为
   "1ms 级重叠 ⇒ maxc 比模拟器高 1，属测量噪声"。当时它的处置是**移出 must-pass**；
   这次不再重复那种做法（移出判定等于删锁），而是把"上限 + 单侧 +1"写成显式判据，
   并用两档饥饿实验证明这个 +1 是可达的、有界的、可反证的。

## 五条变异反证（都实跑过）

| 变异 | 变红的用例 |
| --- | --- |
| 判据退回严格相等 | 「真实侧比模型多 1 且未越上限 ⇒ 通过」+ 高档饥饿机制锁 |
| 摘掉 `≤ maxConcurrent` 夹持 | 「多 1 但越上限 ⇒ 判红」+「cap=1 时豁免必须失效」 |
| 允许双向偏差 | 「真实侧低于模型 ⇒ 判红」 |
| 噪声放宽到 +2 | 「多 2 及以上 ⇒ 判红」 |
| 把 `inject-429` 移出 must-pass | 六组用例的存在性前置断言（缺席不会让它变绿） |

第 5 条原本设计为"去掉低档相等断言"，实现时发现低档**不能**断言相等：CI 自己就可能饿到
500ms（#2606 就是这么红的），把相等写进低档等于新造一个假红源。于是改为给六组用例加
存在性前置（`CASES` 名单逐项 `toEqual` + `KNOWN_DIFF_CASES` 不得含 `inject-429`），
让"悄悄移出一组"当场变红。
