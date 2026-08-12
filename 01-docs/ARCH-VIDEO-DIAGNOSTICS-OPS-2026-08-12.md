# ARCH-视频创作失败诊断系统（桌面端遥测 + 运营后台看板）— 2026-08-12

## 1. 背景与目标

视频创作（Story2Video 等）失败时缺少统一诊断与运营可见性：错误码分散、无阶段级结构化遥测、运营侧看不到失败趋势与根因。本方案交付两层：

- **P0（桌面端）**：统一诊断码分类 + 根因映射 + run 级结构化遥测（`run.diagnostics`），失败证据自动落盘。
- **运营后台落地**：桌面端脱敏上报 → ops-center ingest/日聚合/样本 → 运营看板（趋势/分布/Top 根因+处置建议/告警/样本明细）。

OpenSpec changes：`story2video-failure-diagnostics`、`ops-center-video-diagnostics`。

## 2. 数据链路

```mermaid
flowchart LR
    A[PipelineEngine._finalizeRun<br/>run.diagnostics 已产出] --> B[setRunFinalizedHook<br/>(additive)]
    B --> C[diagnostics-reporter.enqueue<br/>sqlite diagnostics_queue 白名单样本]
    C --> D["POST /api/v1/diagnostics/ingest<br/>X-Catalog-Key + batch_id 幂等"]
    D --> E[ops-center PG：DiagnosticsDaily/Sample/Batch]
    E --> F["GET /diagnostics/summary | /samples<br/>(require_admin)"]
    F --> G[运营看板 /diagnostics]
```

## 3. 桌面端设计

- `services/diagnostics/taxonomy.js`：统一诊断码（stage × failureType × severity × recoverability），未知输入 fail-closed 到 `unknown`，永不抛错。
- `services/diagnostics/root-cause-map.js`：声明式错误→候选根因（causeId/label/checks/advice/confidence），未命中给低置信度通用建议。
- `services/diagnostics/run-diagnostics.js`：run 诊断摘要 + best-effort 环境快照（字段白名单，无凭据/路径明文）。
- `pipeline-engine.js`：`_finalizeRun` 附加 `run.diagnostics` + 可选 `setRunFinalizedHook`（均 additive，IPC 契约不变）。
- `services/diagnostics-reporter.js`：run 终结入队（仅编排模式）→ 30min watermark 上报 daily 聚合桶 + 失败样本（≤50/批）；枚举复用 taxonomy；batch 幂等（服务端 duplicate 回传 `acked_max_id`，客户端据此推进水印，防超时重试 daily 翻倍）；队列/批量上限防积压；未配置 ops-center URL/Key 时静默跳过。

## 4. ops-center 后端设计

- 模型：`DiagnosticsDaily`（唯一键 diag_date+client_id+pipeline，累加）、`DiagnosticsSample`（唯一键 client_id+run_id，去重）、`DiagnosticsBatch`（client_id+batch_id 去重，记录 max_id 供 acked 回传）。
- 接口：
  - `POST /api/v1/diagnostics/ingest`（X-Catalog-Key；批/样本/桶三级幂等；非法枚举/日期/负数 400；样本 30 天 + 日聚合 90 天滚动清理）。
  - `GET /api/v1/diagnostics/summary`（require_admin）：totals（runs/failed/success/cancelled/failure_rate/affected_clients/avg_failed_duration_ms）、by_date、by_stage、by_failure_type、by_cause、by_client、env（磁盘不足/sidecar 异常）、alerts（阈值：失败率>20% HIGH、compose 占比>50% MEDIUM、sidecar 根因占比>20% MEDIUM、磁盘不足样本 LOW）。
  - `GET /api/v1/diagnostics/samples`（require_admin）：days/limit/offset/stage/failure_type/cause_id 过滤分页。

## 5. 运营看板（前端）

`/diagnostics` 页（菜单「创作诊断」）：KPI 卡片、阈值告警面板、每日趋势（CSS 柱状）、阶段/失败类型分布、Top 根因 + 处置建议（causeId → 建议 + 跳转功能开关）、失败样本列表 + 详情抽屉（白名单字段 + checks/advice + 复制诊断信息）。

处置建议为「建议 + 跳转」，不自动写 feature_flag（人工确认，避免误关 provider 影响全量用户）。

## 6. 安全与边界

- 上报/存储均为白名单：不含 errorParams 原文、凭据、路径明文；env 仅 `disk_free_bytes` / `python_backend`。
- 鉴权：ingest 用 X-Catalog-Key（未配置 404 / 不匹配 401）；summary/samples 用 require_admin。
- SQL 全部参数化；服务端对未知枚举 fail-closed 拒绝；桌面端上报前归一化未知枚举为 unknown。
- 告警为服务端阈值计算 + 看板展示；通知推送、provider 维度失败率留后续增量。

## 7. 验证

- 桌面端聚焦 233 用例；ops-center pytest 全量（合并 main 后 174）；前端 vite build；QM-1 打包（electron-builder --win --x64 exit 0 + 启动 10s 存活 stderr 干净）；Claude 双轮审查（Critical/Warning 全部闭合）。
- 真实验收边界：看板数据来自真实桌面端登录 + 真实失败 run 上报，需端到端联调后另行验收。
