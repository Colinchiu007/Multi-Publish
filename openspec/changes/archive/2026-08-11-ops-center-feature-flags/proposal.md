## Why

桌面端功能开关（如 4K 输出能力）目前只能通过本地 store 设置或环境变量控制，无法由运营远程即时调整。ops-center 的 FeatureFlags 模块仍面向旧项目（platform-orchestrator feature_gates.yaml 文件生成），桌面端并不消费。P0-1：新增桌面端功能开关管理面，随 runtime/bootstrap 下发，4K 能力开关作为首个真实用例。

## What Changes

- ops-center：新增 `feature_flags` 表（key/value_type/value/description/enabled）+ 管理 CRUD（admin）+ 种子（`videoCreation.maxOutputResolution`='1080p'）+ 加入 `GET /api/v1/runtime/bootstrap` 响应（`{key: typed_value}`，enabled 项）。
- ops-center 前端：「桌面端功能开关」页（列表/新增/编辑/删除/启用停用/类型化值）。
- 桌面端：`OpsCenterSync` 运行时状态新增 `featureFlags`（applyRuntime 应用 + 持久化 + `getFeatureFlag`）；4K 能力开关读取优先级改为 环境变量 → 运营功能开关 → store → 默认 1080p（fail-closed）；compose 引擎惰性读取（getMaxOutputResolution）；CreateView 渲染端优先读功能开关。
- 测试：后端 CRUD/校验/种子/bootstrap；桌面端 featureFlags 应用/恢复/结构 fail-closed、引擎惰性 4K 开关。

## Capabilities

### New Capabilities
- `ops-center/feature-flags`: 桌面端功能开关管理 + 运行时下发。

### Modified Capabilities
- `desktop/ops-center-sync`: 运行时策略扩展 featureFlags 应用与读取。
- `desktop/story2video-compose-engine`: 输出分辨率能力开关惰性读取（运营功能开关）。
- `desktop/output-resolution`: 前端 4K 开关读取优先级扩展。

## Impact

- ops-center/backend：models.py、services/feature_flag_service.py（新）、routers/feature_flags.py（新）、runtime bootstrap、main.py、tests
- ops-center/frontend：views/RuntimeFlags.vue（新）、api/runtimeFlags.js（新）、router、侧边栏
- apps/desktop/electron：services/ops-center-sync.js、core/container.setup.js、services/story2video-compose-engine.js、bootstrap/phase1-context.js
- apps/desktop/src：views/CreateView.vue
- 文档：01-docs/PRD.md、ops-center/docs/PRD.md、CHANGELOG
