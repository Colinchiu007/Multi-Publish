## Purpose
平台发布元数据迁移到运营后台，桌面端启动拉取覆盖（临时下线/字段上限即时生效）。

## ADDED Requirements

### Requirement: 平台元数据管理
`platform_defs` 表 + `GET/POST /api/v1/platform-defs`、`PUT/DELETE /api/v1/platform-defs/{id}`（admin）。校验：name 必填、id 字符集 `^[a-z0-9_-]{1,64}$`、content_category ∈ VIDEO/IMAGE_TEXT/MIXED、category ∈ 中文/海外、type ∈ article/mixed、max_title/max_content 正整数或空、has_api/enabled 仅 true/false/1/0。POST 重复 id → 409；PUT 不存在 → 404；删除为软删（deleted_at + enabled=0），种子不复活已删平台；`deleted_at` 为空才可下发/列出。种子对齐 config/platforms.yaml 关键平台（已存在即跳过，不覆盖运营修改/软删）。

#### Scenario: 校验与种子
- **WHEN** 非法 content_category / 负数上限 / 非法布尔 / 非法 id 字符 / 重复 POST / PUT 不存在 id
- **THEN** 分别 400 / 400 / 400 / 400 / 409 / 404 且提示字段
- **WHEN** 首次启动
- **THEN** 关键平台种子存在且可编辑
- **WHEN** 删除种子平台后再次启动种子化
- **THEN** 该平台保持删除（不复活）

### Requirement: 运行时下发
`GET /api/v1/runtime/bootstrap` 返回 `platform_defs`（enabled=1 项）。

#### Scenario: 下发
- **WHEN** 平台 enabled=1
- **THEN** bootstrap 返回其元数据；enabled=0 不返回

### Requirement: 桌面端覆盖
`PlatformConfig.applyRemote(defs)`：按 id 覆盖匹配项（仅远程出现的键），本地独有平台保留，不改写 yaml。`OpsCenterSync.applyRuntime` 应用 platform_defs（setPlatformConfig 注入）。

#### Scenario: 合并语义
- **WHEN** 远程含本地平台字段
- **THEN** 覆盖生效；本地独有平台仍可用
- **WHEN** 未注入 platformConfig
- **THEN** 跳过应用不影响其他运行时策略
