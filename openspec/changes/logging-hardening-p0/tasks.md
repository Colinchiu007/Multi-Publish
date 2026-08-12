## 1. R1：日志敏感信息脱敏（Python）

- [x] 1.1 修改 `packages/python-backend/src/multi_publish/publishers/douyin.py:445`：上传授权日志仅记录非敏感元信息（状态码/键存在性），不输出 token/签名 URL 明文
- [x] 1.2 新增/更新回归测试：捕获 douyin 上传授权路径日志输出，断言不含 token 字段明文值（场景「上传 token 泄漏回归防护」）

## 2. R2：HTTP 服务错误路径必须记录错误

- [x] 2.1 新增 `packages/api-publish-engine/src/log-redact.js` 脱敏辅助（Bearer/apiKey/authorization/sk-/cookie/refresh_token/access_token）并配单测
- [x] 2.2 `publish-api-server.js` 增加 `_logError(code, err, context)` 私有方法（error 级、stack 截断 500、经脱敏）
- [x] 2.3 所有 catch 分支（含 925/955 空 catch）接入 `_logError`，补测试：handler 抛错返回 5xx 时日志记录 error code/message/stack（场景「内部错误返回 5xx」「空 catch 吞错」）

## 3. R3：鉴权与安全事件必须记录

- [x] 3.1 `publish-api-server.js` `_checkAuth` 失败路径（缺失/无效 token、AUTH_*_UNAVAILABLE、entitlement 拒绝）记录 warn/error（原因码 + 安全上下文，不含 token）
- [x] 3.2 `webhook-manager.js` 验签失败与投递失败记录日志（hook id/事件/原因/目标 host，不含密钥），消除 `:156` 空 error handler
- [x] 3.3 补测试：鉴权失败触发日志、webhook 验签/投递失败触发日志（场景「请求鉴权失败」「webhook 验签或投递失败」）

## 4. R4：重试与熔断事件可观测

- [x] 4.1 `retry-middleware.js` 支持 `opts.logger` 注入（默认 no-op），记录重试尝试（attempt/原因/退避）与熔断状态迁移（open/half-open/close + circuitKey）
- [x] 4.2 补测试：注入 spy logger 断言重试与熔断事件日志（场景「重试尝试」「熔断状态迁移」）

## 5. 验证与交付

- [x] 5.1 运行受影响测试套件：api-publish-engine node 测试 + python-backend pytest（相关用例）
- [x] 5.2 `openspec validate --change logging-hardening-p0` 通过
- [ ] 5.3 提交到 `codex/logging-p0-fixes`、推送、创建 PR（含 CCG task 关联）
