## 设计

### 数据模型
`publish_metrics_daily`：usage_date（YYYY-MM-DD）/ client_id（设备稳定哈希，脱敏）/ platform（平台 id）/ publish_count / ok_count / fail_count / updated_at；唯一约束 (usage_date, client_id, platform)。

### 端点
- `POST /api/v1/publish/ingest`（X-Catalog-Key）：body `{client_id, items:[{date, platform, publish_count, ok_count, fail_count}]}`；校验 date 格式、platform 字符集 `^[A-Za-z0-9_.-]{1,64}$`、非负整数、publish_count ≥ ok+fail、items ≤500；同桶 upsert 累加（幂等由客户端水印防重）。
- `GET /api/v1/publish/summary?days=N`（admin，默认 30，上限 90）：totals（发布/成功/失败/成功率/平台数/设备数）+ by_date（每日趋势）+ by_platform（排行+成功率）。

### 桌面端
`PublishReporter`：复用 usage-reporter 模式（ops-center URL/Key 鉴权回调、5s 首报 + 30min 周期、未配置静默、失败保留水印重试）。
- 从 publish-history `listRecords({limit:5000})` 读取；水印 = 最后上报记录 timestamp（ISO 字符串字典序）。
- 分类：status success → ok；含 fail/error → fail；监控状态（visible 等）→ 不计（避免同一次发布重复计数）。
- 仅上报计数，不含标题/正文/账号/平台凭证等敏感内容。

### 前端「发布数据」页
7/30/90 天切换 + 6 张汇总卡片 + 按平台表（发布/成功/失败/成功率）+ 每日趋势 CSS 柱状图（成功绿色段/失败红色段）+ 空态「尚未收到发布数据上报」。
