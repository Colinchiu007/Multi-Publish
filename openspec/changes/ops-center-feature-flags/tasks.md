## 1. 后端

- [x] 1.1 FeatureFlag 模型 + feature_flag_service（CRUD/校验/种子/typed_value）+ routers/feature_flags.py + runtime bootstrap 扩展 + main.py
- [x] 1.2 测试：CRUD/校验/种子/bootstrap 下发/权限（ops-center pytest 全量 104）

## 2. 桌面端

- [x] 2.1 OpsCenterSync featureFlags（applyRuntime/持久化/恢复/getFeatureFlag/结构 fail-closed）
- [x] 2.2 4K 能力开关：container.setup resolveMaxOutputResolution 优先级 + setFeatureFlagProvider + 引擎惰性读取 + phase1 接线 + CreateView 渲染端读取
- [x] 2.3 测试：ops-center-sync featureFlags（+3）、引擎惰性 4K（+2）、container 全量

## 3. 前端/文档

- [x] 3.1 RuntimeFlags.vue + api/runtimeFlags.js + 路由/侧边栏；build
- [ ] 3.2 PRD + CHANGELOG + 全量 vitest + 审查 + 推送/PR/合并/归档 + 记忆
