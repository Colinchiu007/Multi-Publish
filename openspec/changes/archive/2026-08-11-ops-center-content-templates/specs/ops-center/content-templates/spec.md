## Purpose
官方内容模板库由运营后台维护，随运行时 bootstrap 下发，桌面端同步时合并进本地模板（内置标记 builtin，用户模板保留）。

## ADDED Requirements

### Requirement: 官方内容模板管理
`content_templates` 表 + `GET/POST /api/v1/content-templates`、`PUT/DELETE /api/v1/content-templates/{id}`（admin）。校验：id 字符集 `^[a-z0-9_-]{1,64}$`、name 必填 ≤100、title ≤200、content ≤20000、platforms/tags 非空字符串数组、sort_order 非负整数。POST 重复 → 409；PUT/DELETE 不存在 → 404；DELETE 软删（种子不复活）；软删后可重建。种子对齐桌面端内置预设 5 个（已存在即跳过）。

#### Scenario: 校验与 CRUD
- **WHEN** 非法 id / 空 name / 非字符串数组 / 负数 sort / 超长 content
- **THEN** 400 且提示字段
- **WHEN** POST 重复 id / PUT 不存在 id
- **THEN** 409 / 404
- **WHEN** 删除种子模板后再次种子化
- **THEN** 该模板保持删除（不复活）

### Requirement: 运行时下发
`GET /api/v1/runtime/bootstrap` 返回 `content_templates`（enabled=1 且未软删，按 sort_order 排序，含 builtin=true）。

#### Scenario: 下发
- **WHEN** 模板 enabled=1
- **THEN** bootstrap 返回其完整字段；enabled=0 / 已软删不返回

### Requirement: 桌面端合并
`TemplateManager.applyRemote(templates)` 按 id upsert（官方字段白名单，新增标记 builtin=true，用户模板保留，数组 >200 fail-closed）；`OpsCenterSync` 注入 templateManager 时应用 content_templates（异常仅 warn 不影响其他策略）。

#### Scenario: 合并语义
- **WHEN** 远程含官方模板
- **THEN** 按 id 覆盖已存在模板字段、新增官方模板、用户自建模板保留
- **WHEN** 未注入 templateManager
- **THEN** 跳过应用不影响其他运行时策略
