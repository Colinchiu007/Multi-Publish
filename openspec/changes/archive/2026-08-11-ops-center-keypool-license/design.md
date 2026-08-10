## 设计

### A. 官方 Key 池
- OfficialKey 新列（迁移 `ensure_official_key_columns` 幂等补列）：rate_per_minute(Integer, null)、daily_limit(Integer, null)、alert_threshold_cost(Float, null)、note(String)。
- 校验：rate_per_minute/daily_limit 正整数或空；alert_threshold_cost ≥0 或空；其余沿用。
- `pool_summary()`：总数/活跃数/即将到期（30 天内）/已过期；按 provider 从 model_usage_daily 聚合近 30 天成本；配额达标率（有 daily_limit 的 Key 中成本/调用是否触线）。
- `GET /api/v1/secrets/summary`（admin）返回以上概览。

### B. 许可证
- `licenses`：license_key 唯一（生成 `MP-` + 4×4 大写字母数字，去易混淆字符）；plan（free/trial/pro，可扩展）；device_limit ≥1；expires_at ISO 或空（空=永久）；status 默认 active；禁用/到期计算由查询层给出（expired 派生）。
- license_service：generate_key（crypto.SystemRandom 或 secrets.token_hex 裁剪）、list/create/update/delete、disable；校验失败 ValueError → 400。
- 端点：`GET/POST /api/v1/licenses`、`PUT/DELETE /api/v1/licenses/{id}`（require_admin）；PUT 可禁用（status=disabled）。
- 前端：签发（plan/device_limit/expires_at/note → 展示生成的 key）、列表（状态标签、过期高亮）、禁用/删除确认。

### 边界
- 桌面端 license-manager 为本地激活，本 change 不接入服务端验签（避免触碰 entitlement QM 合同）；许可证管理面先行，验签接入待商业模式确认。
