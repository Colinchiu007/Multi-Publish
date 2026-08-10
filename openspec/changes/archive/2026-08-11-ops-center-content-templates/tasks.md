## 1. 后端

- [x] 1.1 ContentTemplate 模型（含 deleted_at）+ content_template_service（CRUD/校验/种子/运行时）+ routers/content_templates.py + bootstrap + main.py
- [x] 1.2 测试：CRUD/校验/种子/软删不复活/重建/bootstrap 下发/权限（ops-center pytest 全量 107）

## 2. 桌面端

- [x] 2.1 TemplateManager.applyRemote + OpsCenterSync.setTemplateManager/applyRuntime + phase1 接线
- [x] 2.2 测试：applyRemote 合并/上限 fail-closed、sync 应用/跳过

## 3. 前端/文档

- [x] 3.1 ContentTemplates.vue + api + 路由/侧边栏；build
- [ ] 3.2 PRD + CHANGELOG + 全量 vitest + 审查 + 推送/PR/合并/归档 + 记忆
