## Purpose
运营后台集中维护公告、版本发布策略、内容安全敏感词库，桌面端经 `GET /api/v1/runtime/bootstrap` 一次性拉取应用，无需发版即可全局生效。

## ADDED Requirements

### Requirement: 运行时策略数据模型与校验
`announcements`（title/content/severity info|warning|maintenance/active_from/active_until/enabled/sort_order）、`update_policy`（min_version/force_version/gray_ratio 0-100/enabled/note，单条 upsert id=1）、`content_policy`（name/word_list JSON/replacement ≤16/enabled，单条 upsert id=1）。校验失败返回 400 + 中文字段提示：标题必填、severity 三值、ISO 时间且 until ≥ from、版本号 `x.y.z` 且 force ≥ min、灰度 0-100、词去重 ≤5000 项且单项 ≤100 字符。

#### Scenario: 非法输入拒绝保存
- **WHEN** 标题为空 / severity 非法 / 时间倒挂 / 版本号非 x.y.z / force < min / 灰度越界 / 替换串超长
- **THEN** 400 且错误信息含字段名，数据不变

#### Scenario: 单条 upsert
- **WHEN** 重复保存 update_policy / content_policy
- **THEN** 仍只有一条记录（id=1），字段更新

### Requirement: 管理 CRUD
`GET/POST /api/v1/announcements`、`PUT/DELETE /api/v1/announcements/{id}`、`GET/PUT /api/v1/update-policy`、`GET/PUT /api/v1/content-policy`，全部 require_admin。

#### Scenario: 权限
- **WHEN** 非 admin 调用写端点
- **THEN** 403

### Requirement: 运行时只读端点
`GET /api/v1/runtime/bootstrap`：`X-Catalog-Key` == `OPS_CATALOG_API_KEY`（常量时间比较）；未配置 → 404；错 → 401。返回 `{ announcements: [enabled=1 且在有效窗口，按 sort_order], update_policy, content_policy, synced_at }`。

#### Scenario: 鉴权与活动过滤
- **WHEN** 未带/带错误 key
- **THEN** 401（未配置时 404）
- **WHEN** 存在停用/过期公告与活动公告
- **THEN** 仅返回活动公告

### Requirement: 桌面端运行时应用
`OpsCenterSync.syncNow` 目录同步成功后 best-effort 拉取 runtime/bootstrap 并应用（失败仅 warn 不影响目录结果）：公告缓存 settings + IPC `ops-center-sync:runtime`；内容安全启用且词非空 → 重建 SensitiveFilter（内置+远程词，`sensitive:check/replace` 生效）；版本策略推给 auto-updater（force 强制检查、gray_ratio 灰度跳过、min_version 提示）。

#### Scenario: 目录成功但 runtime 失败
- **WHEN** runtime/bootstrap 拉取失败（超时/404/结构错误）
- **THEN** 目录同步仍返回成功，runtime 失败仅 warn

#### Scenario: 敏感词远程应用
- **WHEN** content_policy.enabled 且 word_list 非空
- **THEN** SensitiveFilter 命中远程词；关闭/空词时仅内置词库

#### Scenario: 版本发布策略
- **WHEN** 当前版本 < force_version
- **THEN** 跳过灰度强制检查更新
- **WHEN** gray_ratio < 100 且随机值 ≥ 比例
- **THEN** 跳过检查（skipped-by-policy）
- **WHEN** 当前版本 < min_version
- **THEN** 状态推送 policy-min-version 提示
