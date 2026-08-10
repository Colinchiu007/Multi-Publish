## Why

桌面端 `redemption-codes.js` 用 HMAC-SHA256 生成/验证 Pro 激活码（`MP-XXXX-XXXX-SIG`），但运营目前只能靠本地脚本/手工生成。P1-4：运营后台提供兑换码批次签发/吊销/查询管理面，与桌面端格式完全兼容（共享 `OPS_REDEMPTION_SECRET`=桌面端 `REDEMPTION_SECRET`）。

## What Changes

- ops-center：`redemption_codes` 表（id 代理主键 + code 唯一）+ `POST /api/v1/redemption-codes/batch`（admin，count 1-200 / plan free|trial|pro / expires_at ISO / note ≤200；未配置 OPS_REDEMPTION_SECRET → 400 fail-closed）+ `GET /api/v1/redemption-codes`（admin，plan/status 筛选）+ `PUT /{id}/revoke` + `DELETE /{id}`。
- 签发算法与桌面端逐字符一致：`MP-随机4-随机4-HMAC_SHA256(payload, secret).hex.upper()[:4]`，随机字母表去 I/O/0/1；列表掩码 `MP-****-****-SIG`，操作按 id。
- ops-center 前端：「兑换码」页（批量签发弹窗/列表/吊销/删除，签发成功展示掩码批次）。
- 文档：PRD/CHANGELOG + OpenSpec；许可证域整合（侧边栏紧邻「许可证管理」）。

## Capabilities

### New Capabilities
- `ops-center/redemption-codes`: 兑换码批次签发/吊销/查询。

## Impact

- ops-center/backend：models.py、services/redemption_code_service.py（新）、routers/redemption_codes.py（新）、config.py（redemption_secret）、.env.example、main.py、tests
- ops-center/frontend：views/RedemptionCodes.vue（新）、api/redemptionCodes.js（新）、router、侧边栏
- 文档：01-docs/PRD.md、ops-center/docs/PRD.md、CHANGELOG
