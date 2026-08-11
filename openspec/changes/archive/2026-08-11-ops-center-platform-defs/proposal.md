## Why

发布平台元数据（平台名/类别/字段上限/是否 API 发布/临时下线）目前维护在 `config/platforms.yaml`，改字段上限/临时下线要发版。P1 其余：迁移到运营后台管理，桌面端启动拉取后在内存覆盖本地 yaml（不删本地独有平台、不改本地持久化）。

## What Changes

- ops-center：新增 `platform_defs` 表（id/name/category/content_category/type/max_title/max_content/has_api/enabled/note）+ 管理 CRUD（admin）+ 种子（对齐 config/platforms.yaml 关键平台）+ 加入 `GET /api/v1/runtime/bootstrap` 响应（enabled 项）。
- ops-center 前端：「平台元数据」页（列表/编辑/启用停用/临时下线）。
- 桌面端：`PlatformConfig.applyRemote(defs)` —— 按 id 覆盖匹配项字段（仅覆盖远程出现的键，不删除本地独有平台）；`OpsCenterSync.applyRuntime` 应用 platform_defs（setPlatformConfig 注入）；phase1 接线。
- 测试：后端 CRUD/校验/种子/端点；桌面端 applyRemote 合并语义 + applyRuntime 应用。

## Capabilities

### New Capabilities
- `ops-center/platform-defs`: 平台发布元数据管理 + 运行时下发。

### Modified Capabilities
- `desktop/ops-center-sync`: 运行时策略扩展 platform_defs 应用。
- `desktop/platform-config`: 支持远程元数据内存覆盖。

## Impact

- ops-center/backend：models.py、services/platform_def_service.py（新）、routers/platform_defs.py（新）、runtime bootstrap、main.py、tests
- ops-center/frontend：views/PlatformDefs.vue（新）、api、router、侧边栏
- apps/desktop/electron：services/ops-center-sync.js（platform defs 应用）、services/store/../platform-config（shared-utils）、bootstrap/phase1
- packages/shared-utils：src/platform-config.js（applyRemote）
- 文档：01-docs/PRD.md、ops-center/docs/PRD.md、CHANGELOG
