## 设计

### 数据模型
- `announcements`：id(auto) / title / content / severity(info|warning|maintenance) / active_from / active_until / enabled(int) / sort_order(int) / created_at / updated_at。活动条件：enabled=1 且 (active_from 空或 <= now) 且 (active_until 空或 >= now)。
- `update_policy`：id(auto) / min_version / force_version / gray_ratio(0-100) / enabled / note / updated_at。单条有效行（保存即 upsert id=1）。
- `content_policy`：id(auto) / name / word_list(JSON array) / replacement(默认 ***) / enabled / updated_at。单条有效行（upsert id=1）。

### 运行时下发端点
`GET /api/v1/runtime/bootstrap`：
- 鉴权：`X-Catalog-Key` == `OPS_CATALOG_API_KEY`（与目录端点一致；未配置 → 404，Key 错 → 401）。
- 返回：`{ announcements: [活动公告按 sort_order], update_policy: {...}|null, content_policy: {...}|null, synced_at }`。
- announcements 仅含 title/content/severity（不含审计字段）；content_policy 含 word_list + replacement；update_policy 全字段（仅 4 个标量，无敏感）。

### 桌面端应用
- `OpsCenterSync.syncNow()`：目录拉取（原有，失败即报错）→ `_fetchRuntime()`（超时/失败仅 warn）→ `applyRuntime()`。
- `applyRuntime`：
  - announcements → 内存 + settings(`opsCenterRuntime.announcements` + `lastSyncedAt`)；IPC `ops-center-sync:runtime` 暴露。
  - content_policy.enabled 且 word_list 非空 → 重建 SensitiveFilter（`[...SensitiveFilter.getBuiltinWords(), ...word_list]`，去重），存入 `this._sensitiveFilter`；sensitive.js IPC 改从 OpsCenterSync 取过滤器（未注入时回退内置）。
  - update_policy → 内存 + `RuntimePolicyStore`（新小模块）供 auto-updater 读取。
- auto-updater：`setPolicy(policy)`；`check()`：
  - force_version 且 当前版本 < force_version → 跳过灰度直接检查并自动下载（强制升级）；
  - 否则 gray_ratio < 100 → 按概率跳过检查（灰度）；
  - min_version 仅用于提示（状态 available 附带 required 标记）。
- 前端公告横幅：App.vue 顶部渲染 `AnnouncementBanner`（新组件），从 `opsCenterSyncRuntime()` composable 读取；severity=maintenance → 常驻高亮不可关闭；warning → 可关闭；info → 可关闭淡显。关闭状态存 localStorage。

### 校验（ops-center 后端 400 + 前端提示）
- announcement：title/content 非空；severity ∈ 三值；active_from/active_until 可空 ISO 时间；active_until >= active_from（同非空时）。
- update_policy：版本号格式 `\d+\.\d+\.\d+`（可空）；gray_ratio 0-100 整数；force_version >= min_version（同非空时）。
- content_policy：word_list 每项非空字符串去重，≤5000 项；replacement 长度 ≤16。

### 安全
- 运行时端点复用 X-Catalog-Key 常量时间比较；管理端 require_admin。
- 公告/内容安全为运营策略，不包含用户隐私；word_list 经 JSON 数组下发。
