# ops-center-rate-limit-verifier Tasks

> 进度单一来源（openspec status --change ops-center-rate-limit-verifier）。实现按 P0 → P1 → P2 分层，每层完成即跑对应门禁。

## P0 — ops-center 调度模拟器 + 契约校验 + 验证页

- [ ] T1 新增 `ops-center/backend/services/scheduler_simulator.py`：确定性模拟器（RPM 时间槽/并发信号量/冷却/5h 预检/429 自适应）+ 6 条断言库
  - 测试：`ops-center/backend/tests/test_scheduler_simulator.py`（确定性、并发上限、RPM 排队、冷却/自适应、5h 预检、断言库、注入场景）→ 映射 ops-center/rate-limit-verifier 全部模拟场景
- [ ] T2 数据表与迁移：`scheduler_verification_runs`（main.py ensure 迁移）
  - 测试：`test_scheduler_api.py::test_run_persisted`（落库/读回）
- [ ] T3 新增 `ops-center/backend/routers/scheduler.py`：POST /verify、GET /verify、GET /verify/{id}、GET /contract（全部 require_admin，参数校验 400）
  - 测试：`test_scheduler_api.py`（admin 权限 403、合法/非法参数、历史/详情、契约校验）→ 映射 模拟验证/契约校验/验证记录 场景
- [ ] T4 前端：路由 `/rate-limit-verifier` + App.vue 菜单「限流验证」+ `views/RateLimitVerifier.vue`（模拟验证/契约校验/历史记录 三 tab + 时间线/指标/断言展示 + 历史详情）
  - 测试：前端 build（`npm run build`）；组件级断言可后补
- [ ] T5 契约常量一致性单测（ops-center 侧）：常量表（30s/180s/45s/×0.75/+0.05/0.2/clamp）→ 映射 desktop/model-call-observability「契约常量一致」

## P1 — 桌面端排队/冷却可观测性 + 用量健康度

- [ ] T6 store 迁移：`model_provider_logs` 增加 `queued_ms`/`cooldown_ms`（INTEGER NOT NULL DEFAULT 0，幂等）
  - 测试：store 迁移测试（新库/存量库补列）
- [ ] T7 `api-usage-governor.js`：run() 采集 `observability={queuedMs, cooldownMs}`（仅计时不改语义；重入内层不计时）；写入日志点透传
  - 测试：`api-usage-governor.test.js` +（排队>0、冷却>0、重入不重复计时）→ 映射「调度等待指标采集」
- [ ] T8 `usage-reporter.js`：聚合 `queued_count`/`cooldown_count`/`queue_wait_ms`/`cooldown_wait_ms` 上报
  - 测试：`usage-reporter.test.js` +（新字段聚合、缺失按 0）→ 映射「用量上报携带调度指标」
- [ ] T9 ops-center：`model_usage_daily` 加可空列；ingest 接受可选字段（非负、缺失按 0）；`usage_service` upsert 累加；`usage_summary` 输出
  - 测试：`test_usage_api.py` +（可选字段、旧客户端兼容、累加幂等）→ 映射「旧客户端兼容」
- [ ] T10 `UsageDashboard.vue` 新增「调度健康度」区块（429 率/排队/冷却/利用率 warning）
  - 测试：前端 build；后端 summary 聚合测试

## P2 — 桌面端真实自检 + 对拍

- [ ] T11 新增 `apps/desktop/electron/services/rate-limit-self-check.js`：独立 governor + 假 adapter + 断言库 + timeline/metrics
  - 测试：`rate-limit-self-check.test.js`（时间线/断言/无网络泄漏（fetch 未调用）/不污染生产 governor）→ 映射「真实 governor 限流自检」
- [ ] T12 IPC + preload：`ipc-handlers/rate-limit.js`（`rate-limit:self-check`/`rate-limit:report`，authenticated）+ preload 暴露 + phase1-context 注册
  - 测试：`ipc-handlers/rate-limit.test.js`（未登录拒、参数校验、上报未配置提示）→ 映射「自检可上报」
- [ ] T13 模型设置页「运营后台同步」卡片旁「限流自检」入口弹窗（参数表单/运行/结果/上报）
  - 测试：composable 或组件级 + 前端 build
- [ ] T14 对拍：`scripts/compare-scheduler-models.js` + `test_scheduler_parity.js`（四组固定输入：rpm=6/8 请求、rpm=20/10 请求、注入 429、5h 超限）
  - 测试：对拍一致（关键指标容差内）→ 映射「模拟器与真实 governor 对拍」

## 收尾

- [ ] T15 openspec validate；双模型/降级审查；CCG task 关联（task.json openspecChange=ops-center-rate-limit-verifier）；CHANGELOG/learnings/.quality-gates 记录；归档三同步（openspec archive + ccg archive + learnings）
- [ ] T16 分支 PR：桌面端 + ops-center 运行时代码经 codex/ 分支 + CI 全绿 + 合并；核验远程
