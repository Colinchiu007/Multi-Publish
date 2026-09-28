## Why

`ApiUsageGovernor` 的额度预检在并发下**不成立**，导致真实供应商调用超出 5 小时限额。

`_preflightTokenBudget` 只读 `win.used`，而 `used` 只在 task **完成之后**由 `_recordUsage` 递增。`maxConcurrent > 1` 时，多个请求在同一个过期快照上同时通过预检，随后才被 `_assertTokenBudget` 事后拒绝——此时调用已经发出。这与该函数注释自述的「避免超限请求先消耗真实调用」以及 `ops-center/rate-limit-verifier` 已声明的「预检即拒、不消耗执行」直接矛盾，属实现违反既有契约，而非新增需求。

复现（`field: 'requests'`、独立 governor 实例、`Promise.all` 并发、12 次重复）：

| limit | n | maxConcurrent | 真实执行次数 | `g.run` 成功返回 |
| --- | --- | --- | --- | --- |
| 2 | 6 | 1 | 2 | 2 |
| 2 | 6 | 2 | **3** | 2 |
| 2 | 6 | 4 | **5** | 2 |
| 3 | 7 | 4 | **5 ~ 6（非确定）** | 3 |

超额上限为 `maxConcurrent − 1` 次真实调用，且**跨运行非确定**——这正是 `rate-limit-self-check.test.js`「5h 额度由真实 governor 预检拒绝」在 CI 满载下报 `completed` 期望 2、实到 3 的来源（同一请求既写了 `completed` 时间线，又被事后断言计成超额，故两个计数同时偏高并不矛盾）。

## What Changes

- 对 `field: 'requests'` 的额度窗口，把「只读预检」改为**原子的检查并预留（check-and-reserve）**：准入判定通过的同一时刻就把该窗口计数 +1，因此并发在途请求看到的一定是已含自己的计数。
- 预留的成功/失败收敛：**task 成功 → 保留预留（不再二次递增）；task 抛错 → 归还预留**。该口径刻意保持与现状一致的语义「只有真正成功的调用消耗额度」，因此既有额度测试的断言不需改语义，只补并发维度的新断言。
- 预留必须绑定**窗口代次**（记录预留时的 `startedAt`）：若期间窗口因过期而重置，归还只作用于自己那一代，不得污染新窗口。
- `field !== 'requests'` 的 token 计数窗口**保持后置记账不变**（成本要响应回来才知道，无法预扣）。
- 429 重试路径：一次 `run()` 只预留一次，重试不重复预留（预留发生在重试循环之外）。
- 修正自检可观测性：`rate-limit-self-check` 的时间线与超额计数必须能区分「预检即拒（未执行）」与「已执行后被事后断言拒」，否则超额会表现为两个计数器同时偏高而不可归因。

## Capabilities

### New Capabilities
- （无）

### Modified Capabilities
- `ops-center/rate-limit-verifier`：「5h 额度预检」场景补上并发条件——预检即拒必须在 `maxConcurrent > 1` 时同样成立，`quota_exceeded_count = n - L` 且第 L+1 个起**零次执行**。
- `story2video/model-call-scheduler`：「排队等待与冷却时序预算」中「额度窗口请求前预检即拒返回 QUOTA_EXCEEDED」补上准入原子性、失败归还、以及 token 类窗口仍走后置记账的边界。

## Impact

- 主进程服务：`apps/desktop/electron/services/api-usage-governor.js`（`_preflightTokenBudget` / `_recordUsage` / `_assertTokenBudget` 三处协同）。
- 自检与观测：`apps/desktop/electron/services/rate-limit-self-check.js`（计数口径）。
- 消费方（行为只会**更保守**，即少发真实调用，不新增失败面）：`model-call-scheduler`、图片轮播/生成链、`api-platform-adapter` 与 RPA 发布链中经 governor 的调用。
- 测试：`api-usage-governor.test.js`（新增并发额度回归锁；既有串行额度用例保持通过）、`rate-limit-self-check.test.js`。
- 运营后台对拍：Python 模拟器是单线程顺序模型，本就满足新语义，无需改模拟器；需在对拍断言里显式声明「模拟器不覆盖并发维度」。
