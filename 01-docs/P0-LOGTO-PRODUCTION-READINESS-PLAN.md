# P0 Logto 生产就绪实施计划

> 日期：2026-07-21  
> 分支：`codex/logto-production-readiness`

| 顺序 | 任务 | 依赖 | 状态 | 验收 |
|------|------|------|------|------|
| 1 | PRD、架构、测试计划 | 无 | PASS | 文档先于代码，边界明确 |
| 2 | 配置合同与校验 CLI | 1 | PASS | normal/error/edge 测试通过 |
| 3 | migration runner 与 schema readiness | 2 | PASS | checksum、锁、事务、幂等、只读启动测试通过 |
| 4 | OIDC probe 与 `/ready` | 3 | PASS | 200/503、超时、脱敏、缓存测试通过 |
| 5 | smoke、备份、恢复校验 | 2-4 | PASS（本地） | CLI 测试、原子快照、私有权限、并发锁、恢复完成状态和失败退出码通过 |
| 6 | 监控、告警、灰度/回滚 runbook | 4-5 | PASS | Prometheus/Alertmanager 配置可解析、步骤可执行 |
| 7 | 并发额度和 Webhook 回归 | 3 | PASS（本地合同） | 并发合同通过；真实压力 `PENDING_EXTERNAL` |
| 8 | 全量门禁与独立审查 | 1-7 | PASS（本地） | API 全量测试、静态/Compose/边界门禁和修复后独立复审通过；真实 PostgreSQL/Logto/云端证据待补 |

外部凭据任务不阻塞仓库实现，但阻塞生产 C5 的最终 PASS，状态统一为 `PENDING_EXTERNAL`。
