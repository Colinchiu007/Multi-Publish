## Purpose
运营后台签发/吊销/查询兑换码，格式与桌面端 `redemption-codes.js` 完全兼容（共享 HMAC 密钥）。

## ADDED Requirements

### Requirement: 兑换码批次签发
`POST /api/v1/redemption-codes/batch`（admin）：count 1-200、plan ∈ free/trial/pro、expires_at ISO 或空、note ≤200；未配置 `OPS_REDEMPTION_SECRET` → 400 fail-closed。生成格式 `MP-RAND-RAND-SIG`（HMAC-SHA256 首 4 位大写 hex，随机字母表去 I/O/0/1），返回掩码列表 + batch_id。

#### Scenario: 校验与格式
- **WHEN** count/plan/expires_at 非法
- **THEN** 400 且提示字段
- **WHEN** 未配置密钥
- **THEN** 400「未配置 OPS_REDEMPTION_SECRET」
- **WHEN** 签发成功
- **THEN** 每个码格式与桌面端 validate() 兼容（签名可复算）

### Requirement: 列表/吊销/删除
`GET /api/v1/redemption-codes`（admin，plan/status 筛选，掩码展示）；`PUT /{id}/revoke` 置 revoked；`DELETE /{id}` 删除；不存在 → 404。

#### Scenario: 操作语义
- **WHEN** 非 admin
- **THEN** 403
- **WHEN** 吊销/删除不存在 id
- **THEN** 404
