## 1. requestId 生成与回显（R1）

- [x] 1.1 `publish-api-server.js` `_handle` 入口生成 requestId（透传白名单校验 / `crypto.randomUUID()`），写入 `req.requestId`
- [x] 1.2 `_json` 响应头统一回显 `x-request-id`（gzip 与非 gzip 分支一致）

## 2. 结构化 access log（R2）

- [x] 2.1 `access-log.js` 升级为 JSON 结构化（ts/method/path/status/durationMs/requestId/ip/userAgent/errorCode），保持 enabled/writeFn 选项
- [x] 2.2 `_json` 采集 errorCode（status>=400 且有 error 码）→ res.end 钩子传入 access log
- [x] 2.3 更新 `test/access-log.test.js` 断言结构化字段

## 3. 错误日志关联 requestId（R3）

- [x] 3.1 新增 `_ctx(req, extra)` 辅助，既有 `_logWarn/_logError` 调用点改传 requestId 上下文
- [x] 3.2 补测试：错误响应 access log 含 errorCode；_logError 上下文含 requestId；响应头 x-request-id 回显且与日志一致；非法透传回落自生成

## 5. Claude 审查修复（W1-W3）

- [x] 5.1 W1：docs 端点 writeHead 补 X-Request-Id 回显
- [x] 5.2 W2：errorCodeOf raw 回退脱敏（redactText）+ 截断 64
- [x] 5.3 W3：_json 采集条件扩展为 status>=400 或 data.success===false（发布失败 200 也采 errorCode）
- [x] 5.4 回归测试：docs 头/W3/W2 脱敏截断（request-tracing.test.js 8/8）

## 4. 验证与交付

- [x] 4.1 api-publish-engine 全量测试通过
- [x] 4.2 `openspec validate http-request-tracing` 通过
- [ ] 4.3 提交、推送、PR、合并、三同步归档（含 learnings + 文档门禁同步）
