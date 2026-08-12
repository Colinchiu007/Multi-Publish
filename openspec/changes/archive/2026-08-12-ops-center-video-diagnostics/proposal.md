## Why

视频创作失败诊断 P0（PR #574）已在桌面端自动产出结构化 `run.diagnostics`，但数据只落在本地 userData，运营侧看不到。目标：把失败证据经既有上报通道（镜像 usage-reporter/publish-reporter 模式）汇聚到运营后台，让运营能看失败率趋势、根因分布、失败样本明细，并据此给出处置建议——形成「采集 → 上报 → 汇聚 → 看板 → 处置建议」闭环。

## What Changes

新增能力，不修改既有对外行为（IPC 返回契约、usage/publish 上报通道不动）：

- 桌面端新增 `DiagnosticsReporter`：PipelineEngine 在 run 终结时经新增可选钩子 `setRunFinalizedHook` 入队（仅编排模式 run），reporter 按 watermark 聚合（日×pipeline 总/失败/成功/取消）+ 失败样本白名单，POST `ops-center /api/v1/diagnostics/ingest`（X-Catalog-Key 鉴权；未配置静默跳过；batch 幂等）。
- ops-center 新增 `diagnostics` 模块：`DiagnosticsDaily`（日聚合桶，幂等累加）、`DiagnosticsSample`（白名单样本，run_id 去重）、`DiagnosticsBatch`（批次去重）；ingest / summary / samples 三个接口；样本 30 天滚动保留。
- ops-center 看板 `/diagnostics`：KPI（失败 run/失败率/受影响设备/平均失败耗时）、每日趋势、按 stage/failureType/根因分布、Top 根因 + 处置建议（causeId → 建议操作 + 跳转功能开关）、阈值告警面板、失败样本列表 + 详情抽屉（checks/advice + 复制诊断）。
- 告警：summary 服务端按阈值计算（失败率、compose 失败占比、sidecar 类根因占比、磁盘不足样本）返回 `alerts`；不做自动写 feature_flag（只给建议 + 跳转），避免自动化处置风险。

## Capabilities

### New Capabilities

- `ops-center-video-diagnostics`: 视频创作失败诊断的运营后台能力——桌面端脱敏上报 ingest、日聚合与样本存储、管理端汇总/样本查询、阈值告警与处置建议、看板页面。

### Modified Capabilities

无（usage/publish 通道与既有看板行为不变）。

## Impact

- 桌面端：新增 `apps/desktop/electron/services/diagnostics-reporter.js` + 测试；`pipeline-engine.js` 增加可选 `setRunFinalizedHook`（additive）；`core/container.setup.js`、`bootstrap/phase1-context.js` 接线。
- ops-center 后端：`models.py` +3 表、`services/diagnostics_service.py`、`routers/diagnostics.py`、`main.py` 注册、`tests/test_diagnostics_api.py`。
- ops-center 前端：`api/diagnostics.js`、`views/Diagnostics.vue`、路由与菜单。
- 零新第三方依赖；X-Catalog-Key / require_admin 复用既有机制。
