# 基线 vs 现状 差异审计（2026-08-12，规格化前）

| 需求项 | 基线/现状核验 | 归类 |
|---|---|---|
| 运营后台「限流/调度验证」页面或端点 | 不存在（ops-center 无任何验证能力；前端路由/菜单无对应页） | **待办** |
| 运营后台调度模拟器（与桌面端 governor 同契约） | 不存在（后端无调度模型，仅有 model_presets 目录 CRUD + catalog） | **待办** |
| 配置契约校验（rpm/limit5h 范围、default∈models、并发换算） | 部分既有：写入时 `_validate_optional_positive_int` 校验范围；但无「校验清单/预测预算」展示端点 | **待办**（展示层 + 批量校验为新增） |
| 桌面端用量上报含排队/冷却指标 | `usage-reporter.js` 仅聚合 calls/ok/fail/ratelimit/latency；`model_provider_logs` 无 queued_ms/cooldown_ms 列；ingest 无排队字段 | **待办** |
| 桌面端限流自检（真实 governor 驱动假 adapter） | 不存在（无 rate-limit IPC、无假 adapter、无自检上报） | **待办** |
| Python 模拟器 vs 桌面端 governor 对拍 | 不存在 | **待办** |
| 待确认项 | 用户已确认 P0+P1+P2 范围 | 无遗留待确认 |

结论：全部为真实待办，无已交付项需要排除。
