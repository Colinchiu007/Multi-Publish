## 1. 后端

- [x] 1.1 PublishMetricDaily 模型 + publish_metric_service（ingest/summary）+ routers/publish_metrics.py + main.py
- [x] 1.2 测试：校验/累加/权限/summary 聚合（ops-center pytest 全量 109）

## 2. 桌面端

- [x] 2.1 PublishReporter（聚合/水印/鉴权/周期）+ phase1 接线
- [x] 2.2 测试：分桶/水印去重/未配置跳过/鉴权失败保留水印

## 3. 前端/文档

- [x] 3.1 PublishDashboard.vue + api + 路由/侧边栏；build
- [ ] 3.2 PRD + CHANGELOG + 全量 vitest + 审查 + 推送/PR/合并/归档 + 记忆
