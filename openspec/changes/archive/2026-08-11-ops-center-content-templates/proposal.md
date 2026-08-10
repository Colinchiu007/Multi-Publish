## Why

桌面端内容模板目前只依赖 `TemplateManager.getPresets()` 内置预设 + 用户自建，官方模板调整需发版。P0-2：运营后台统一维护官方内容模板库，随 runtime/bootstrap 下发，桌面端同步时合并进本地模板（内置标记 builtin，用户模板保留）。

## What Changes

- ops-center：`content_templates` 表 + CRUD（admin，POST 重复 409 / PUT 部分更新 + 404 / DELETE 软删）+ 校验（id 字符集、name 必填、content ≤20000、platforms/tags 字符串数组、sort_order 非负整数）+ 种子对齐桌面端 TemplateManager.getPresets() 5 个 + `runtime/bootstrap` 增加 `content_templates`（enabled=1 未软删，排序，builtin 标记）。
- ops-center 前端：「内容模板库」页（列表/分类筛选/新增/编辑/删除/启用停用）。
- 桌面端：`TemplateManager.applyRemote(templates)`（按 id upsert、官方标记 builtin、用户模板保留、数组 >200 fail-closed）；`OpsCenterSync.setTemplateManager` + `applyRuntime` 应用 content_templates；phase1 接线。

## Capabilities

### New Capabilities
- `ops-center/content-templates`: 官方内容模板库管理 + 运行时下发。

### Modified Capabilities
- `desktop/ops-center-sync`: 运行时策略扩展 content_templates 应用。
- `desktop/template-manager`: 支持官方模板运行时合并。

## Impact

- ops-center/backend：models.py、services/content_template_service.py（新）、routers/content_templates.py（新）、runtime bootstrap、main.py、tests
- ops-center/frontend：views/ContentTemplates.vue（新）、api/contentTemplates.js（新）、router、侧边栏
- apps/desktop/electron：services/template-manager.js、services/ops-center-sync.js、bootstrap/phase1-context.js
- 文档：01-docs/PRD.md、ops-center/docs/PRD.md、CHANGELOG
