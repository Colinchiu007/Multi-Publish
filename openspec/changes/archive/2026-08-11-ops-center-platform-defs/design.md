## 设计

### 数据模型
`platform_defs`：id（平台 id，主键，如 wechat_mp）/ name / category（中文|海外）/ content_category（VIDEO|IMAGE_TEXT|MIXED）/ type（article|mixed 兼容）/ max_title / max_content / has_api（0|1）/ enabled（0|1，临时下线）/ note / updated_at。

### 种子
从 `config/platforms.yaml` 提取关键平台（wechat_mp/weibo/douyin/bilibili/toutiao/xiaohongshu/zhihu/kuaishou/youtube/tiktok/twitter/facebook），对齐字段；INSERT OR IGNORE 不覆盖运营修改。

### 端点
- 管理：`GET/POST /api/v1/platform-defs`、`PUT/DELETE /api/v1/platform-defs/{id}`（admin）；校验：name 必填、content_category 枚举、max_title/max_content 正整数或空、has_api 布尔。
- 运行时：`GET /api/v1/runtime/bootstrap` 增加 `platform_defs`（enabled=1 项，含 id/name/category/content_category/max_title/max_content/has_api）。

### 桌面端应用
- `PlatformConfig.applyRemote(defs)`：遍历远程项，本地存在同 id → 用远程键覆盖（仅覆盖出现的键）；本地独有平台保留；不改写 yaml。
- `OpsCenterSync.applyRuntime`：若注入 platformConfig，应用 `platform_defs`；phase1 `opsCenterSync.setPlatformConfig(_platformConfig)`。
