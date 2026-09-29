## Why

对拍门禁（#2606，main `4770b0b5` / run 36483489315）断言 `max_concurrent_observed` 在 Python 模拟器与桌面端真实自检之间**必须相等**，但这个数是**回调驱动**的观测量：任务「结束」要等它的 promise 回调真正跑完才减计数。当进程事件帧被饿到接近相邻请求的起始间隔（rpm=120 → 500ms）时，前一个 20ms 调用的递减被推迟，与下一次放行挤进同一批 tick，观测并发就会从 1 变 2。规格里 `total_duration_ms` 已因同类的挂钟不确定性拿到时钟容差，唯独这个指标没有——于是一条**任何一侧都没违反契约**（2 ≤ 配置上限 `maxConcurrent=2`）的运行，被门禁判成契约漂移。

**这不是孤例，也不能靠「再跑一次看看」处置。** 复发率的分母必须用「真正执行过该步骤的 run」：`electron-ci.yml:122` 的 `if: github.event_name != 'pull_request'` 使串行单测（含本用例）只在 main push / dispatch 执行，所以 PR run 不进分母。实测 2026-09-28 单日最近 100 次 Electron CI run 中 `event=push` 共 24 次，其中完成且成功 18 次、红 1 次 ⇒ **约 1/18 的 main push 触发一次（≈5%）**。以 5% 的复发率，它会周期性吃掉 main 的红绿信号，而每次红都长得像"两套模型契约漂移"，把人支向一个并不存在的调度 bug。

## What Changes

- 把对拍判据中 `max_concurrent_observed` 的「相等」改为**两条可同时成立的判据**：① 不变量 `real ≤ maxConcurrent`（真实 governor 不得超过自己的配置上限，这条**任何情况下不放宽**）；② 与确定性模型的偏差 `real − sim ≤ 1` 且只允许**这一方向**（模拟器保守、真实侧因饥饿多报 1）；`real < sim` 仍是回归，照常变红。
- 保留 `rate_limited_count` / `quota_exceeded_count` / 完成顺序的相等断言不变，`total_duration_ms` 沿用既有「绝对下限 + 比例」容差口径不动。
- 把「上限不变量」与「有界噪声」都做成**可反证的锁**：喂入真实超限（`real > maxConcurrent`）与反向偏差（`real < sim`）必须变红；把噪声方向放宽成双向必须变红。
- 新增一条**机制回归锁**：在同进程内注入可控的事件帧饥饿（阻塞时长跨过/不跨过相邻起始间隔两档），断言「不足阈值 ⇒ 并发仍等于模型值」「超过阈值 ⇒ 并发 = 模型值 + 1 且始终 ≤ 上限」。这条锁把「为什么允许 +1」从注释变成可执行证据，防止后来者把它当成随意放宽。
- 文档侧同步：`01-docs/learnings.md` 记录该度量口径结论；对拍脚本注释写清阈值实测数据，不再只写「测量噪声」。

不做的事：**不**把 `inject-429` 移入 `KNOWN_DIFF_CASES`（那会让它退出判定，等于删掉一条锁）；**不**调大 `durationTolerance`（与本问题无关，且那条口径已有两轮实测依据）；**不**改 governor 的调度行为（规格明确「不得改变调度行为」）。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `desktop/model-call-observability`：「模拟器与真实 governor 对拍」Requirement 中 `max_concurrent_observed` 的一致性定义由「相等」改为「上限不变量 + 单侧有界测量噪声」，并新增可执行场景说明该噪声的成立条件与不可放宽部分。

## Impact

- 判定逻辑：`scripts/compare-scheduler-models.js`（`runParity` 的 `checks` 组装 + 常量注释）
- 度量与自检：`apps/desktop/electron/services/rate-limit-self-check.js`（其自身第 133 行已按 `≤ maxConcurrent` 断言，本 change 让对拍侧与它口径一致，不改其行为）
- 测试：`apps/desktop/electron/tests/test_scheduler_parity.test.js`（新增饥饿阈值两档用例）
- 规格与文档：`openspec/specs/desktop/model-call-observability/spec.md`（经 sync）、`01-docs/learnings.md`
- 不影响：运营后台模拟器实现、governor 调度路径、发布链路、用户可见行为
- 风险：放宽方向若写错（允许双向 ±1 或允许超限），会把真实并发回归钉成契约——故反证为本 change 的验收项
