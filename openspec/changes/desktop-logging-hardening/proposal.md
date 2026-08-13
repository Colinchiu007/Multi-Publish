## Why

审计 A2/A4/C3/C4 与 Claude N3：桌面 logger（`apps/desktop/electron/services/logger.js`）控制台输出未脱敏（仅文件侧脱敏，stdout 被捕获时敏感信息外泄）；脱敏正则仅 4 类（Cookie/JWT/refresh_token/password 未覆盖）；按日文件无自动清理、500MB 达上限整文件删除（当日日志整体丢失）；message 不截断（超长行撑爆文件）。

## What Changes

- 控制台输出与文件输出共用同一 `redact()`（console 不再输出原始值）。
- 脱敏正则扩展对齐 api-publish-engine `log-redact.js`：Cookie/access_token/refresh_token/password/secret/通用 JWT（eyJ 三段）。
- 保留策略：500MB 超限改为滚动到 `.1`（保留最近两份，不再整删）；新增 `retentionDays`（默认 30）按文件名日期自动清理过期 `app-*.log`；`getLogsInfo` 展示 retentionDays。
- 消息长度上限：message 截断 4096（meta 已有 8000 上限）。

## Capabilities

### New Capabilities
- `desktop-logging`: 桌面应用日志契约——console 与文件同源脱敏、敏感模式全量覆盖、按日保留 + 超限滚动、消息长度上限。

### Modified Capabilities
<!-- 无 -->

## Impact

- 代码：`apps/desktop/electron/services/logger.js`
- 测试：`apps/desktop/electron/services/logger.test.js`（vitest）
- 门禁：修改 apps/desktop/electron/ 需 QM-1 本地打包验证（electron-builder --win --x64 + asar logger 检查）
