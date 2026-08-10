## 设计

### 数据模型
`content_templates`：id（PK，`^[a-z0-9_-]{1,64}$`）/ name（必填 ≤100）/ category（≤40，report|marketing|tutorial|event|daily…）/ title（≤200）/ content（Markdown ≤20000）/ platforms（JSON 字符串数组）/ tags（JSON 字符串数组）/ enabled（0|1）/ sort_order（非负整数）/ deleted_at（软删）/ updated_at / updated_by。

### 端点
- 管理：`GET /api/v1/content-templates`（登录读）、`POST`（admin，重复 409）、`PUT /{id}`（admin，404，部分更新）、`DELETE /{id}`（admin，404，软删）。
- 运行时：`GET /api/v1/runtime/bootstrap` 增加 `content_templates`（enabled=1 且未软删，按 sort_order 排序，含 builtin=true）。

### 种子
对齐桌面端 `TemplateManager.getPresets()` 5 个（preset-weekly/product/tutorial/event/daily）；已存在（含软删）即跳过，软删不复活。

### 桌面端
- `TemplateManager.applyRemote(templates)`：按 id upsert；官方字段白名单（name/category/title/content/platforms/tags/sort_order/builtin）；新增模板标记 builtin=true；用户自建模板保留；数组 >200 fail-closed 返回 0；变更后 save() 持久化。
- `OpsCenterSync`：`setTemplateManager` 注入（phase1 接线）；`applyRuntime` 在 payload.content_templates 为数组且已注入时应用，异常仅 warn。
