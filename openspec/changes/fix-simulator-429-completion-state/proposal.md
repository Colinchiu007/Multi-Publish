# Proposal: 模拟器不再把注入 429 的请求记成 completed；完成**集合**升为硬判定、完成**序列**降为留痕

## Why

对拍把「完成顺序」比了一遍之后当场暴露：同一组 `inject-429` 输入，运营后台 Python 模拟器给出
`completed = [1,2,3,4,5,6]`，桌面端真实 governor 给出 `[1,2,4,5,6]` —— 被 429 拒掉的 req3 从未完成，
真实侧是对的。模拟器的注入分支先按 `completed` 记账（push `finish_heap`、`used_5h += 1`、写
`finished_at`），**之后**才补一个 `rate_limited_count += 1`，于是同一条请求同时具有两种身份。

而主规格 `openspec/specs/desktop/model-call-observability/spec.md`「模拟器与真实 governor 对拍」早已把
完成顺序列为**必须相等**的关键指标，`runParity` 却从未把它并入 `pass`。一条从不执行的 SHALL 比没有这条
SHALL 更危险：读者以为它有守卫（#2632 的过渡守卫只是让它"不被静默吞掉"，不是让它承重）。

## What Changes

- `ops-center/backend/services/scheduler_simulator.py` 注入分支：该请求 `state = "rate_limited"`、
  `finished_at = None`（429 的语义是"被拒、没做成"）。
  **槽位占用与额度记账保持不变**：`finish_heap` push、`used_5h += 1`、`end_times.append(finished)`
  三条一律不动 —— 真实侧同样在任务体内 `active += 1` 后递减，且桌面端 2026-09-28 起是"准入即占额度"
  （#2566），被 429 的调用照样消耗 5h 计数；改这三条会同时挪动 `max_concurrent_observed` 与
  `total_duration_ms`，那是**另一件事**，不在本 change 范围（见 Impact 的显式声明）。
- `ops-center/backend/tests/test_scheduler_simulator.py`：把钉住错误标签的断言改对
  （`states.count("rate_limited")` 3→4、`completed` 5→4），并新增一条"注入条目 `finished_at is None`
  而指标三项不变"的锚定用例，防止下一次有人为了"更真实"顺手改堆记账。
- `scripts/compare-scheduler-models.js`：`completion_order` 从"只打印"升为 `checks` 里的**硬判定**；
  CLI 与 vitest 的留痕文案同步改掉"未计入 pass"。
- `apps/desktop/electron/tests/test_scheduler_parity.test.js`：**删除** #2632 留下的那条
  "锁住分歧存在"的过渡断言（修好后它必然失效，留着就是把已知缺陷钉成正确行为），
  改为断言两侧完成集合相等且 `checks.completion_set === true`（按成员，不按次序）。
- `docs/parity-concurrency-measurement-noise.md`：新增一节，记录"为何承重的是集合、序列只能留痕"
  的实测依据，并完整保留我第一版探针**测了个恒真投影**这一错法。
- 主 spec 的「模拟器与真实 governor 对拍」Requirement：把"完成"这一指标拆成**集合**与**序列**两条，
  集合计入 pass、序列明确 SHALL NOT 计入（饥饿下会真实翻转，实测见 docs），并规定
  取数只能读未排序的实际完成序、缺席即 fail closed（防止退回恒真的排序投影）。

## Capabilities

- **Modified Capabilities**：`desktop/model-call-observability` —— 「模拟器与真实 governor 对拍」
  Requirement 的关键指标判据补一条「完成顺序」的口径与前提；新增两个 Scenario
  （注入 429 不得算完成；顺序前提失效时不得沿用硬判定）。
- **New Capabilities**：无。本 change 不引入新能力，只把已存在但未被执行的契约落到实现上。

## Impact

- **面向运营者的可见变化**：`POST /api/scheduler/verify` 与验证记录详情的 `timeline_json` 里，
  注入 429 那条不再显示"已完成"，`metrics` 的完成数随之从 6 变 5 —— 这是**预测值去掉虚高**，
  不是功能回归。数据库列、API 形状、前端组件均未改。
- **不在本 change 范围**（刻意排除，避免与判据混谈）：
  ① 模拟器与真实侧的 **429 槽位占用时长**分歧（真实侧在 `await sleep` 之前抛错、占用 ≈0ms，
  模拟器占满 `duration`）—— 当前用例参数下对 `max_concurrent_observed` 不可见，已登记在 #2626 评论 §2；
  ② `cooldown_until` 的起点口径（真实侧从抛错时刻起算，模拟器从 `finished` 起算）同样不在本次动。
- **代码面**：`ops-center/backend/{services,tests}`、`scripts/compare-scheduler-models{,.test}.js`、
  `apps/desktop/electron/services/rate-limit-self-check.js`（**新增返回字段 `completion_order`**，
  主进程服务文件 ⇒ QM-1 打包门禁适用）、`apps/desktop/electron/tests/test_scheduler_parity.test.js`、
  `docs/`、`openspec/`。
- **风险**：判据取数若退化成排序投影，就会变成**恒真守卫（假绿）**——这是我第一版实际踩到的，
  由 QM-6 后端评审用反例指出。已改为只读 `runSelfCheck` 新增返回的实际完成序、缺席 fail closed，
  并配 4.7 号变异（摘掉该字段 ⇒ vitest 2 红）证明这条链路真的在承重。
  另：集合判据本身对饥饿免疫，不会因时序抖动假红（实测翻转的 9 个样本成员集合始终一致）。
- **无 BREAKING**：不改 IPC 合同、不改数据库 schema、不改前端交互。
