## 1. ops-center 后端

- [ ] 1.1 ModelUsageDaily 表 + usage_service（ingest upsert / summary）+ routers/usage.py + main.py
- [ ] 1.2 测试：鉴权/幂等/非法输入/汇总/权限

## 2. 桌面端

- [ ] 2.1 usage-reporter.js（聚合/水印/周期）+ model-log-store created_at 修复 + phase1 接线
- [ ] 2.2 测试：聚合/水印/重试/静默跳过/created_at

## 3. 前端

- [ ] 3.1 ops-center UsageDashboard.vue + api + 路由/侧边栏；build

## 4. 文档/交付

- [ ] 4.1 PRD（01-docs + ops-center）+ CHANGELOG
- [ ] 4.2 全量测试 + 外部审查 + 推送/PR/合并/归档 + 记忆
