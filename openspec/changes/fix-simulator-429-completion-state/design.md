# Design: 完成顺序升为硬判定的依据与边界

## D1. 为什么"顺序"可以当硬判定（实测，不是推断）

#2632 的教训是：把**测量口径敏感**的指标写成相等契约就会造假红。所以本 change 在动手前先做同一个实验，
问「顺序是否也被事件帧饥饿影响」，而不是默认"顺序大概是确定的"。

探针（临时文件 `apps/desktop/electron/tests/tmp-order-probe.test.js`，跑完即删）用与
`test_scheduler_parity.test.js` 里已提交的 `withBlocker()` **同一套**饥饿装置，参数取对拍的
`rpm=120 / 并发2 / 8 请求 / 20ms`（相邻起始间隔 500ms），分四档递增强度各跑 2 次：

| 档位（block 时长） | 实测帧延迟 lag | 真实侧 maxc | 真实侧完成顺序 |
| --- | --- | --- | --- |
| gap×1.2 (600ms) | 301 / 300 ms | 2（= sim+1，确证发生推迟） | `[1..8]` |
| gap×2 (1000ms) | 812 / 810 ms | 2 | `[1..8]` |
| gap×4 (2000ms) | 1905 / 1904 ms | 2 | `[1..8]` |
| gap×8 (4000ms) | 3908 / 3906 ms | 2 | `[1..8]` |

另有无饥饿的 3 次对照，同样 `[1..8]`。**8/8 饥饿样本顺序未变**，而其中 maxc 已经比模型值高 1 ——
也就是说：**同一次饥饿足以让并发观测失真，却不足以让完成顺序失真**。

机制解释（也是前提的来历）：`rate-limit-self-check.js:81` 每个任务 `await sleep(requestDurationMs)`，
时长统一 ⇒ 到期时刻的顺序 == 准入顺序；帧被阻塞时所有未到期定时器一起变成"已过期"，
Node 按到期时刻依次排程回调，相对次序不变。⇒ **顺序承重的真正前提是"各组时长统一"**，
这个前提必须在 spec 与 docs 里写成可见条件，因为将来接真实 adapter（延迟不等）时它会失效。

## D2. 只改身份标签，不改占用与额度（最小爆炸半径）

注入分支现状（`scheduler_simulator.py:200-213`）先写 `completed` 再补 `rate_limited_count += 1`。
本 change 只把 **身份** 改对：`state = "rate_limited"`、`finished_at = None`。

明确**不动**的四项，以及不动的理由（写了理由才不会被下一个人"顺手修正"）：

| 保持不动 | 理由 |
| --- | --- |
| `heapq.heappush(finish_heap, finished)` | 真实侧确实在任务体内 `active += 1` 后才抛错，槽位被占用过；摘掉它 = 改 `max_concurrent_observed` |
| `executing_now += 1` / 递减配对 | 同上 |
| `used_5h += 1` | 桌面端 2026-09-28 起"准入即占额度"（#2566），被 429 的调用照样消耗 5h 计数；这一侧本来就是对齐的 |
| `end_times.append(finished)` | 它决定 `total_duration_ms` 的上界；真实侧的 429 判定同样发生在挂钟推进之后，改成判定时刻会挪动耗时指标 ⇒ 属另一件事 |

由此得出一条**可测的边界**（写进 spec 的 Scenario）：改身份标签后三项指标必须逐项不变，
并用一条锚定用例钉住 —— 否则"我只改了标签"这句声明是不可证的。

## D3. 已知的第三处分歧，为何本 change 仍不修

真实侧 429 在 `await sleep` **之前**抛错 ⇒ 槽位占用 ≈0ms；模拟器占满 `duration`。
当前所有对拍组里 `duration(20ms) « 起始间隔(500ms)`，两者对 `max_concurrent_observed` 的影响都是 0，
因此实测两侧一致、不构成本 change 的阻塞。

不修的理由不是"没事"，而是**修它的判据与不修它相同**：一旦某组把 `duration` 提到 ≥ 起始间隔
（例如 `concurrency-real` 那种 2500ms），模拟器就会比真实侧多占一段槽位，`real < simulated` 是**硬红**
（方向性判据不许豁免）。届时必须正面处理（改成"判定时刻即释放"或显式登记 KNOWN_DIFF），
不得靠放宽方向性判据绕过。这一条已写进 #2626 的评论，本 change 只在代码注释里指向它，不越范围修。

## D4. `cooldown_until` 起点口径的同类问题（登记不修）

模拟器 `cooldown_until = finished + cooldown_ms`，真实侧从 `ProviderError` 抛出时刻起算。
同 D3：当前用例下不可见（注入位之后的请求起始间隔远大于 20ms）。不在本 change 动，
理由与 D3 一致 —— 它会挪动排队/拒绝时刻，属另一个归因单元。

## D5. 判据落点选择

- `completion_order` 的相等判定放在 `runParity` 的 `checks` 里（与另三项同级），
  比较函数**复用已有的 `completionOrder()` 投影** + 一处逐元素比较，不新写第二套取序逻辑。
- CLI（`node scripts/compare-scheduler-models.js`）与 vitest 的 `[parity]` 留痕都改为
  `完成顺序=sim→real` 并去掉「未计入 pass」字样；留痕必须带上两侧的**序列本身**，
  否则红了以后看不出是谁少了哪一项。
- `tests/…/test_scheduler_parity.test.js` 删除过渡断言，替换为「inject-429 两组序列相等且
  `checks.completion_order` 为 true」；同时保留 `CASES` 存在性前置（防"悄悄移出一组"）。

## D6. 反证设计（先定好再实现，避免写完自证不了）

| 变异 | 必须变红的用例 |
| --- | --- |
| Python：注入分支保持 `state="completed"`（只补 `finished_at=None`） | ops-center 该组状态计数断言 |
| Python：把 `finished_at` 也留着不改（完整回退） | 同上 + `completion_order` 硬判定 |
| JS：`checks` 里摘掉 `completion_order` | node 侧判据真值表 + vitest `checks.completion_order` |
| JS：把顺序比较改成「只比长度」 | 新增的逐元素比较真值表（长度同、内容不同必须判不等） |
| JS：把堆记账也一并摘掉（越范围的"顺手修正"） | D2 的三项指标锚定用例（`max_concurrent_observed` / `total_duration_ms` 必须变 ⇒ 红） |

最后一条是本项目最容易犯的错法：修标签时把占用也改了，看起来"更真实"，实际让两个指标同时漂移。
所以必须有一条变异证明"越界改动会被当场抓住"。
