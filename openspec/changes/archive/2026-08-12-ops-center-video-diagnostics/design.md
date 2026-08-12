## Context

见 proposal.md。P0（PR #574）已产出桌面端 `run.diagnostics`；`usage-reporter.js` / `publish-reporter.js` 提供了完整的「watermark + 30min + 静默跳过 + X-Catalog-Key + batch 幂等」上报模式；ops-center `usage.py`/`publish_metrics.py` 提供了 ingest/summary 服务模式；前端 UsageDashboard.vue 提供 Element Plus + CSS 柱状看板模式。

## Goals / Non-Goals

Goals：
- 复制既有上报/接收/看板模式，零新依赖；两端 taxonomy 一致（failure_type/stage/severity/recoverability/cause_id 与桌面端枚举对齐）。
- 上报与存储均为白名单、幂等、可重试。
- 看板覆盖：趋势、分布、Top 根因+建议、告警、样本明细。

Non-Goals：
- 自动写 feature_flag（只给建议 + 跳转）；告警通知推送（只计算 + 展示）；provider 维度（本期样本不含 provider_id，留 P2 扩展）；桌面端 UI 渲染 diagnostics（仍走 run-state）。

## Decisions

### D1: 上报数据源 = PipelineEngine 内存历史 + enqueue 钩子
`pipeline-engine` 新增可选 `setRunFinalizedHook(fn)`（additive，默认 null），`_finalizeRun` 在附加 diagnostics 后调用；`phase1-context` 将钩子接到 `DiagnosticsReporter.enqueue(run)`，写入 sqlite 队列表 `diagnostics_queue`（run_id 唯一），reporter 按 watermark 读队列。
- 备选 A：直接读 `getHistory()`（内存 50 条上限）→ 高并发会漏；备选 B：读 run-state 快照（只存失败/取消）→ 缺成功分母。选 enqueue 队列：完整、可测试、不阻塞终态。

### D2: 上报内容 = 日聚合桶 + 失败样本
每日桶 (date, pipeline, client) 累加 total/failed/success/cancelled（供失败率分母）；失败 run 另发白名单样本（≤50 条/批）。成功 run 不产生样本行，控制存储量。
- 备选：逐 run 全量样本 → 数据量放大且成功样本无运营价值。

### D3: 服务端模型镜像 usage 三表模式
`DiagnosticsDaily`（唯一键 diag_date+client_id+pipeline，累加）、`DiagnosticsSample`（唯一键 client_id+run_id，upsert 跳过重复）、`DiagnosticsBatch`（client_id+batch_id 去重）。样本 30 天滚动清理（ingest 时顺带执行）。
- 依据：usage/publish 已用同一模式并经验证（幂等、可重试）。

### D4: 告警为服务端纯函数 + 静态阈值
summary 内计算 alerts（失败率>20% HIGH；compose 失败占比>50% MEDIUM；sidecar 根因占比>20% MEDIUM；磁盘不足样本>0 LOW）。阈值进常量，测试可覆盖。
- 备选：独立告警表 + 通知 → 超本期范围，P3 后续再做通知推送。

### D5: 处置建议 = 静态 causeId → 建议映射 + 跳转
前端内置 `CAUSE_SUGGESTIONS`（causeId → {advice, flagKey?, flagValue?, flagHint?}），看板展示建议与「前往功能开关」链接；不自动写 flag。
- 理由：自动处置风险高（误关 provider 影响所有用户），先人工确认。

## Risks / Trade-offs

- [上报缺失成功分母] → 钩子入队覆盖所有编排 run（含成功），分母准确；内存队列重启丢失 → 失败样本另有 run-state 快照，成功计数以窗口内为准。
- [样本含 env 白名单] → 服务端只存 env 的 disk_free_bytes/python_backend 两个键，服务端再校验丢弃未知键。
- [两端枚举漂移] → 服务端校验未知 failure_type/stage/severity 直接拒绝该条（fail-closed），上报带 taxonomy 版本字段备查。
- [前端无图表库] → 沿用 CSS 柱状（UsageDashboard 先例），零新依赖。

## Migration Plan

部署：随 codex 分支 PR 合入；新表由 `Base.metadata.create_all` 自动创建（既有模式，ops-center 无 alembic）。
回滚：移除路由注册与前端路由即可；上报器未配置时静默，无破坏性。

## Open Questions

无阻塞项。告警通知推送（站内/邮件）与 provider 维度留 P3 增量。
