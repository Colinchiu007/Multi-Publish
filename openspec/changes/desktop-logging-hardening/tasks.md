## 1. console 同源脱敏 + 正则扩展（R1）

- [x] 1.1 `log()` console 输出改为脱敏后的 body（console.log(prefix, body)）
- [x] 1.2 SECRET_PATTERNS 对齐 log-redact 5 组模式（Bearer/quoted/unquoted/sk-/eyJ）
- [x] 1.3 测试：console spy 断言不含敏感原文；文件断言扩展模式（cookie/jwt/refresh_token/password）

## 2. 保留策略（R2）

- [x] 2.1 超限由删除改滚动到 `.1`（ensureLogPath + 写检查点）
- [x] 2.2 新增 retentionDays（默认 30）+ pruneOldLogs()（文件名日期解析清理），setLogOptions/getLogsInfo 接入
- [x] 2.3 测试：超限滚动产生 .1 且主文件重建；过期文件被清理、期内文件保留

## 3. 消息长度上限（R3）

- [x] 3.1 message 截断 4096（MAX_MESSAGE_LENGTH 常量）
- [x] 3.2 测试：超长消息落盘截断且带标记

## 4. 验证与交付

- [x] 4.1 vitest logger.test.js 全通过
- [x] 4.2 QM-1 打包验证（electron-builder --win --x64 + asar logger 清单 + 启动 8s 无 stderr 错误）
- [x] 4.3 `openspec validate desktop-logging-hardening` 通过
- [ ] 4.4 提交、推送、PR、合并、三同步归档（含 learnings + 文档门禁同步）
