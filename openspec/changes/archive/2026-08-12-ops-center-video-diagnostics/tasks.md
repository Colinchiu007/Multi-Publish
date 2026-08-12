## 1. 桌面端上报器（TDD）

- [x] 1.1 `pipeline-engine.js` 新增可选 `setRunFinalizedHook(fn)`（additive），`_finalizeRun` 在 diagnostics 附加后调用（try/catch 包裹）
- [x] 1.2 新增 `services/diagnostics-reporter.js`：`enqueue(run)`（sqlite 队列表 diagnostics_queue，仅编排模式 run，run_id 唯一）+ `reportPending()`（watermark + 日聚合桶 + 失败样本 ≤50 + POST ingest + batch 幂等 + 静默跳过）
- [x] 1.3 `container.setup.js`（pipelineEngine 工厂）+ `phase1-context.js` 接线（钩子 → reporter.enqueue；reporter 构造复用 getOpsCenterAuth/getClientId 模式）
- [x] 1.4 新增 `diagnostics-reporter.test.js` + pipeline-engine 钩子测试；聚焦用例通过

## 2. ops-center 后端（pytest TDD）

- [x] 2.1 `models.py` 新增 DiagnosticsDaily / DiagnosticsSample / DiagnosticsBatch（镜像 usage 三表）
- [x] 2.2 新增 `services/diagnostics_service.py`：ingest（校验/批去重/桶累加/样本 upsert/30 天清理）、summary（totals/by_date/by_stage/by_failure_type/by_cause/by_client/env/alerts）、samples（分页过滤）
- [x] 2.3 新增 `routers/diagnostics.py`（ingest X-Catalog-Key；summary/samples require_admin）+ `main.py` 注册
- [x] 2.4 新增 `tests/test_diagnostics_api.py`：鉴权 401/404、幂等批次、非法字段 400、桶累加、样本去重与保留期、summary alerts 阈值、样本过滤

## 3. 运营看板（前端）

- [x] 3.1 `api/diagnostics.js`（getSummary/getSamples）
- [x] 3.2 `views/Diagnostics.vue`：KPI + CSS 趋势 + 分布表 + Top 根因+建议 + 告警面板 + 样本列表/详情抽屉/复制
- [x] 3.3 路由 `/diagnostics` + 侧边菜单入口
- [x] 3.4 `npm run build`（ops-center/frontend）通过

## 4. 门禁与交付

- [x] 4.1 (桌面端 231 用例通过 + eslint 0 error；ops-center pytest 全量 128 通过；前端 vite build 通过) 桌面端聚焦测试 + eslint；ops-center `pytest`（新文件 + 全量回归）
- [x] 4.2 (QM-1：electron-builder --win --x64 exit 0 ×2；启动 10s 存活、stderr 无失败签名；asar 含 diagnostics-reporter) QM-1 打包（electron-builder --win --x64）+ 启动验证
- [x] 4.3 (Claude 审查完成：Critical batch 幂等键已修（acked_max_id 回传）+ Warning/Info 全部落实并补回归) 双模型审查（antigravity 不可用则 Claude 单模型降级）；Critical 修复后复跑
- [x] 4.4 (openspec validate --strict 通过；提交/推送完成，PR #574 已更新为全量范围) `openspec validate --strict`；提交/推送；更新 PR #574（或新 PR）说明全量范围
- [x] 4.5 (待 PR 合并后三同步归档) 归档三同步（合并后执行）
