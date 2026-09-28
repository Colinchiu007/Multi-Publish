## Context

现状（`apps/desktop/electron/services/api-usage-governor.js`）：`_runWithGovernance` 的顺序是 `_acquireSlot` → `_pace` → `_waitCooldown` → `_preflightTokenBudget`（只读） → `_executeWithRetry`（内部 `task()` → `_recordUsage` 递增 `win.used` → `_assertTokenBudget` 事后断言），槽的释放在其 `finally`。因此 `used` 的更新永远落后于准入判定一个完整 task 周期。

约束：

- 窗口对象是**进程内内存状态**（`st.tokenWindows`），无跨进程协调；本次修改不改变这一点。
- `field: 'requests'`（按次数，5 小时限额）与 `field: 'total_tokens'` 等（按 token 数）共用同一套窗口结构与同一条记账路径，但后者成本**必须**等响应回来才知道。
- `_executeWithRetry` 的重试发生在**同一次** `run()` 之内（429 退避、瞬时错误各按各自上限重试）。
- 同 key 重入透传（`_reentrant`）不进入治理主体，因此不预扣、不记账——外层已负责。
- 既有测试（`api-usage-governor.test.js`）全部用串行 `await p1; await p2; …`，这就是超额从未被抓到的原因。
- 动机与量化复现见 `proposal.md - Why`；对外契约见 `specs/*/spec.md`。

## Goals / Non-Goals

**Goals:**

- 使「预检即拒、不消耗执行」在 `maxConcurrent > 1` 时同样成立，且同参数重复运行结果确定。
- 保持既有语义「只有真正成功的调用消耗额度」不变（失败归还），从而**不改动**任何既有额度用例的断言语义。
- 让超额在自检产物里**可归因**：区分「未执行即被拒」与「已执行后被拒」。

**Non-Goals:**

- 不改 RPM 时间槽、并发信号量、429 冷却与自适应 `rateFactor` 的语义与预算。
- 不引入跨进程/跨实例的全局限流（那是另一件事）。
- 不改运营后台 Python 模拟器的实现；只在对拍结论里显式声明并发维度不由它覆盖。
- 不让 `total_tokens` 类窗口预扣（成本不可预知）。

## Decisions

### D1 预扣点放在并发槽内、`_executeWithRetry` 之前
把 `_preflightTokenBudget` 升级为原子的「检查并预留」：对每个未过期的 `requests` 窗口，`used >= limit` 即拒，否则 `used += 1` 并记下本次预留。

- 为什么不放在取槽之前：`_acquireSlot` 自身可能因 30s 排队预算超时而 reject。若那时已预扣，每个排队超时的请求都要归还一次，归还点散落到信号量路径上，且与「重入透传不记账」的边界纠缠。放在槽内则一次调用的预留/归还生命周期完全落在同一段代码里。
- 替代方案「把 `used` 拆成 `committed + inFlight` 双计数器」被否：语义更丰富但所有读 `used` 的地方（预检、事后断言、窗口滚动重置、上报聚合）都要跟着改，改动面大于收益。

### D2 归还点放在整次调用最终失败，而不是每次 attempt 失败
`_runWithGovernance` 用 `try/catch` 包住 `_executeWithRetry`：捕获到最终抛出的错误时归还预留，然后原样 rethrow。

- 若在 attempt 级归还，429 退避重试的等待窗口里，别的请求会插走这次释放的额度，超额只是概率变小而不是消失；同时一次调用可能在成功时留下一份额度、又在失败时多还一份。
- 由此自然满足「一次调用只占一次额度」：重试循环在预留之下，不会重复预扣。

### D3 归还必须恰好一次
用局部标志（已预留 / 已归还）保证：成功路径不归还、失败路径归还一次。禁止写成 `finally` 无条件归还——那会让每次成功调用都把额度还回去，等于额度失效。回归里必须有「limit=L 时恰好 L 次成功」这条硬断言。

### D4 预留与窗口代次绑定
预留时记录该窗口当时的 `startedAt` 作为代次凭据；归还时若 `win.startedAt` 已变（窗口过期被重置），**跳过归还**——新窗口里并没有这次占用，减它会把新窗口的计数打穿到负数。

### D5 `_recordUsage` 对 `requests` 窗口不再 +1
成功路径仍需要 `_recordUsage` 负责**窗口滚动重置**，但只对非 `requests` 字段做 `+= delta`；`requests` 字段的计数已由 D1 完成，再 +1 就是双重计数。

### D6 `_assertTokenBudget` 显式跳过 `requests` 窗口
预留成立后 `used > limit` 对 `requests` 窗口是不可达状态。保留它对 `requests` 生效会把「已执行 + 事后拒」这个形态重新引进来（正是本次要消灭的）。因此显式跳过并就地注释原因，防止后来者当它是"双保险"。

### D7 自检补一条「未执行即被拒」的时间线
`rate-limit-self-check.js` 现在只在 task 内 push `completed` 条目，被拒请求在 timeline 里**完全不存在**，于是「超额」只能通过 `requestCount - timeline.length` 反推；一旦同一请求既写了 `completed` 又被计成超额，两个计数器同时偏高就无法归因（CI 那次红正是这个形态）。改为在 catch 里补 `{state: 'quota_exceeded', started_at: 空}` 条目，使 `completed + quota_exceeded == requestCount` 成为可检查的守恒式。

### D8 测试夹具必须并发构造，且用假时钟
沿用该文件既有的 `vi.useFakeTimers()` + `advanceTimersByTimeAsync` 约定，用 `Promise.all` 一次提交 N 个请求、断言「task 内自增的执行计数」而非只看 `run()` 的 resolve/reject——执行次数才是"是否真的打了一次 provider"的唯一代理。

## Risks / Trade-offs

- [行为更保守：原先能"多跑几次"的并发用法会提前拿到 QUOTA_EXCEEDED] → 这正是期望行为（旧的那几次是本不该发生的真实调用）；在 CHANGELOG/发布说明里点名，并用回归固定「`maxConcurrent == limit` 时恰好 limit 次成功」。
- [归还与窗口换代竞争] → D4 的代次凭据 + 专项回归（预留后窗口被重置，迟到的归还不得污染新窗口）。
- [未来有人把 `_assertTokenBudget` 当成对 `requests` 的兜底而恢复] → D6 就地注释 + 结构锁断言 `requests` 窗口不进入事后断言分支。
- [重入透传路径被误改成也预扣，导致外层一次、内层一次] → 保留既有两条重入用例必须继续全绿，作为回归。
- [归还遗漏某条抛出分支（例如 `classifyProviderFailure` 之外的新分类）] → 归还写在 `catch` 的最外层（对任何最终错误生效），而不是按错误分类挑选。

## Migration Plan

纯内存语义，无数据迁移、无配置变更、无接口签名变化。回滚 = revert 该实现提交（单文件 + 自检文件）。上线顺序无要求；与运营后台模拟器的对拍不需要同步发布，因为新语义是模拟器本来就已满足的那一侧。

## Open Questions

- 是否需要给 `requests` 窗口暴露一个「失败是否归还」的开关以贴近不同 provider 的真实计费口径？当前判断：不加——先用与现状一致的「归还」跑起来，等出现真实争议再按 provider 粒度引入，避免现在为一个未观测到的差异建配置面。
