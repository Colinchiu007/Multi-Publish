## Context

沿用审计与 http-request-tracing/log-redact 的既有成果：`services/logger.js` 已有文件侧 `redact()` 与 `safeMeta` 截断；api-publish-engine `log-redact.js` 已有扩展模式集。本 change 将脱敏/截断/保留策略统一到桌面 logger 单文件。

规格契约见 `openspec/changes/desktop-logging-hardening/specs/desktop-logging/spec.md`（R1-R3）。

## Goals / Non-Goals

**Goals:**
- console 与文件同源脱敏（R1）
- 脱敏模式全量覆盖（Cookie/JWT/refresh_token/password/secret）（R1）
- 保留策略：retentionDays 清理 + 500MB 滚动（R2）
- message 4096 截断（R3）

**Non-Goals:**
- 不引入第三方日志库/脱敏库（保持零依赖）
- 不统一 shared-utils/其他 logger（另立 change）
- 不做日志结构化 JSON（P2 项）

## Decisions

**D1: console 输出改为脱敏后的单行 body**
`log()` 中 `console.log(prefix, module, message, meta)` → `console.log(prefix, body)`（body 已含 redact + safeMeta）。备选：console 逐参脱敏（与文件格式不一致，易漏）→ 拒绝。副作用：console 行格式变化（多参变单参），无测试依赖旧格式。

**D2: 脱敏正则直接对齐 log-redact.js 模式集**
把 SECRET_PATTERNS 替换为 api-publish-engine 已验收的 5 组模式（Bearer / quoted key=value / unquoted key=value / sk- / eyJ JWT）。备选：各自维护（漂移）→ 拒绝。注：桌面与 API 双实现仍各自持有模式（同源不同文件），未来 P1 收敛项可抽公共包。

**D3: 超限滚动 + 按日清理**
超限处（ensureLogPath 与写检查点）由 `rmSync` 改为 `renameSync(file, file+'.1')`（覆盖旧 .1）；新增 `pruneOldLogs()`：解析 `app-YYYY-MM-DD.log` 文件名日期，早于 `now - retentionDays*86400e3` 删除；在 setLogOptions（含 dir 变更）与 ensureLogPath 跨日切换时调用。retentionDays 默认 30，注入/展示。
风险：rename 在 Windows 上目标被占用（.1 被其他进程持有）可能抛错 → try/catch 静默（保留现状容错风格）。

**D4: message 截断 4096**
`safeMessage` 超 4096 截断并补 `…`；与 meta 8000 规则一致。常量 `MAX_MESSAGE_LENGTH`。

## Risks / Trade-offs

- [console 格式变化] → 内部日志行，无消费者断言；devtools 显示为单行更清晰。
- [滚动 rename 失败] → 静默保留现状（appendFile 继续写原文件，超限未处理，下一检查点重试）。
- [清理误删] → 仅按 `app-YYYY-MM-DD.log` 文件名匹配 + 日期解析成功才删；非法文件名跳过。

## Migration Plan

- 单 PR；QM-1 打包验证；无配置迁移；回滚 = revert。

## Open Questions

无。
