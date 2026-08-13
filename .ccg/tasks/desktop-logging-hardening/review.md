# 审查记录（desktop-logging-hardening）

- 2026-08-13：Claude 后端连续 2 次 `claude exited with status 1`（wrapper 启动成功、backend 临时不可用），
  按机制硬化规则降级：主代理自查 + 本地验证替代，未盲等。antigravity 已知区域不可用。
- 主代理自查要点：
  1. console 脱敏：smoke 验证 6 类敏感模式（Bearer/apiKey/access_token/refresh_token/cookie/JWT/password）全部脱敏、无泄漏；
     输出改为单 body 参数，全仓无测试依赖旧 console 参数格式（grep 确认）。
  2. SECRET_PATTERNS 5 组正则与 api-publish-engine log-redact 对齐（String.raw 写入，验证 `\s`/`\b`/`\.` 转义完整）。
  3. pruneOldLogs 日期解析（UTC 解析文件名日期）+ retentionDays 30 默认；retention test 覆盖过期删除/期内保留。
  4. rollCurrentLogFile Windows rename 语义 + ensureLogPath 滚动后重建 currentLogPath（修复了滚动后写入 null 的 bug）。
  5. message 4096 截断 + meta 8000 截断均有测试。
- 本地验证：logger.test.js 12/12；main/window/logs/shutdown/base-python-bridge/bootstrap 188 通过；
  QM-1 打包通过（electron-builder exit 0、asar 含 electron/services/logger.js、rpa-engine require 链 OK、
  8s 存活 + stderr 无平台配置/插件/ENOTDIR 错误、junction 指向当前 worktree）。
