## 设计

### 数据模型
`redemption_codes`：id（代理主键，操作引用）/ code（唯一，`MP-XXXX-XXXX-SIG`）/ plan（free|trial|pro）/ batch_id（`rc_` 前缀）/ status（active|revoked）/ expires_at（ISO 或空）/ note（≤200）/ created_at / updated_by。列表始终掩码，操作按 id。

### 签发算法（与桌面端 redemption-codes.js 一致）
- 随机段：字母表 `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`（去 I/O/0/1），4 字符 ×2。
- payload = `MP-RAND-RAND`；签名 = `HMAC-SHA256(payload, secret).hexdigest().upper()[:4]`。
- code = `payload-SIG`；桌面端 `validate()` 可验证（需 OPS_REDEMPTION_SECRET = 桌面 REDEMPTION_SECRET）。

### 端点（均 admin）
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/v1/redemption-codes/batch | 批量签发（count 1-200；未配置密钥 400） |
| GET | /api/v1/redemption-codes?plan=&status=&limit=&offset= | 列表（掩码） |
| PUT | /api/v1/redemption-codes/{id}/revoke | 吊销（404 兜底） |
| DELETE | /api/v1/redemption-codes/{id} | 删除（404 兜底） |

### 前端「兑换码」页
批量签发弹窗（数量/套餐/过期时间/备注）+ 签发结果掩码列表 + 列表（掩码/套餐/状态 tag/批次/过期/签发时间/备注）+ 吊销/删除；提示 OPS_REDEMPTION_SECRET 与桌面端一致契约。
