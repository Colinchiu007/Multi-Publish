## 1. 后端

- [x] 1.1 RedemptionCode 模型（id 代理主键 + code 唯一）+ redemption_code_service（签发/列表/吊销/删除）+ routers/redemption_codes.py + config（redemption_secret）+ main.py
- [x] 1.2 测试：格式与签名复算、校验、吊销/删除/权限、未配置密钥 fail-closed（ops-center pytest 全量 115）

## 2. 前端/文档

- [x] 2.1 RedemptionCodes.vue + api + 路由/侧边栏；build
- [ ] 2.2 PRD + CHANGELOG + 审查 + 推送/PR/合并/归档 + 记忆
