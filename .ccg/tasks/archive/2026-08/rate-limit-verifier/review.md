# review.md — 运营后台限流与调度验证（P0+P1+P2）

## 审查方式
- 双模型探测：antigravity 区域不可用（Eligibility check failed）；子代理后端 403 不可用；Claude wrapper --lite 固定 diff 审查超过 5 分钟未完成（进程残留，已终止）。
- 按机制硬化规则降级**主代理本地逐条核验**（不冒充双模型通过）。

## 本地核验（对拍 + 测试 + 代码审读）
| 审查点 | 结论与证据 |
|--------|-----------|
| `_assertTokenBudget` used>=limit → used>limit 修复 | 与 `_preflightTokenBudget`（>=，第 limit+1 起拒）语义对齐；3 个既有额度用例 + self-check 5h 用例断言「第 limit 次成功、第 limit+1 起拒」全绿（api-usage-governor.test.js 240-297、rate-limit-self-check.test.js） |
| 模拟器 executing 口径 | scheduler_simulator.py 以 started-未-finished 计并发峰值；对拍四组 `max_concurrent_observed` 一致（compare-scheduler-models.js PARITY OK） |
| 假 adapter 零网络 | rate-limit-self-check.test.js 断言 `global.fetch` 未调用且 metrics.network_calls=0 |
| IPC 上报映射/鉴权 | rate-limit.test.js 断言 body（simulated=false/engine/preset_id/rpm）与未配置提示；preload rateLimitSelfCheck/Report 不在 PUBLIC_METHODS → 默认 authenticated |
| 计时采集不改语义 | observability 仅 `Date.now()` 前后差累加（无状态写入）；重入透传内层不计时（测试断言 ≤1） |
| 对拍充分性 | 四组固定输入：rpm120/并发2（并发+pace）、rpm30/并发1（FIFO+排队）、注入 429（冷却+自适应）、5h 额度（预检）；total_duration 容差 1500ms |
| ops-center 参数校验/权限 | test_scheduler_api.py：非法参数 400、非 admin 403、落库/历史/详情、契约校验 |

## 结论
- Critical：0；Warning：0（外部双模型不可用已记录为降级）。
- 测试：桌面 58 全绿（含 parity）+ ops-center 相关 49 全绿；Vue build 通过；preload build 通过。
- 已知边界：ops-center 全量 `pytest tests/` 存在既有多文件 DB 冲突（无 conftest、共享 engine 单例），CI doc-gate「失败不阻塞」；新文件隔离/组合跑全绿。
