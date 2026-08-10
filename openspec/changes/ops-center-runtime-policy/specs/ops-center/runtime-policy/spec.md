# ops-center/runtime-policy

## Requirements

### R1: 运行时策略数据模型
- `announcements` 表：title/content/severity(info|warning|maintenance)/active_from/active_until/enabled/sort_order/时间戳。
- `update_policy` 表：min_version/force_version/gray_ratio(0-100)/enabled/note；单条（upsert id=1）。
- `content_policy` 表：name/word_list(JSON)/replacement(≤16 字符)/enabled；单条（upsert id=1）。

### R2: 管理 CRUD（require_admin）
- `GET/POST /api/v1/announcements`、`PUT/DELETE /api/v1/announcements/{id}`。
- `GET/PUT /api/v1/update-policy`、`GET/PUT /api/v1/content-policy`。
- 校验失败返回 400 + 中文字段提示；不合法值拒绝保存。

### R3: 只读运行时端点
- `GET /api/v1/runtime/bootstrap`：`X-Catalog-Key` 鉴权（同目录端点；未配置→404；错→401）。
- 返回活动公告（enabled=1 且在有效窗口，按 sort_order）+ update_policy + content_policy + synced_at。

### R4: 桌面端运行时应用
- `OpsCenterSync.syncNow` 目录同步后 best-effort 拉取 runtime/bootstrap 并应用。
- announcements 经 IPC `ops-center-sync:runtime` 暴露；severity=maintenance 常驻强提示，warning/info 可关闭。
- content_policy 启用且词非空 → 重建 SensitiveFilter（内置词+远程词），`sensitive:check/replace` 自动生效。
- update_policy 供 auto-updater：force_version 强制、gray_ratio 灰度、min_version 提示。

### R5: 测试
- ops-center pytest：模型/公告/版本/内容安全 CRUD 校验、runtime/bootstrap 鉴权与活动过滤、单条 upsert。
- 桌面端 vitest：applyRuntime（公告/词重建/策略）、auto-updater policy（强制/灰度/提示）、sensitive 远程词、IPC。
