## Context

延续 desktop-logging-hardening（PR #684）与 http-request-tracing/log-redact（PR #664）的脱敏模式集。本 change 收敛 shared-utils logger：它是共享库内的同步轻量实现（被 format-adapter/rules、cover-processor/presets 引用），无脱敏且注释误导。

规格契约见 `openspec/changes/shared-utils-logging/specs/shared-utils-logging/spec.md`（R1-R2）。

## Goals / Non-Goals

**Goals:**
- 文件与控制台同源脱敏（R1）
- setLogOptions 注入路径/上限/级别（R2）
- 修正误导注释；API 向后兼容

**Non-Goals:**
- 不改为异步队列/按日文件（那是 desktop services/logger.js 的职责，避免重复实现）
- 不引入第三方依赖
- 不统一 5 套 logger（跨组件收敛另立 P1/P2 项）

## Decisions

**D1: 内联 SECRET_PATTERNS（复制 log-redact 模式集）**
shared-utils 零依赖且不能反向依赖 api-publish-engine；直接内联同一组正则。备选：抽公共脱敏包（跨包收敛项，本轮不做）。注：desktop 与 shared-utils 各自持有同源模式，learnings 记录收敛方向。

**D2: 新增 `setLogOptions({ file, maxSize, level })`**
默认行为不变（Electron userData/cwd logs、5MB→.1、LOG_LEVEL env）；仅当显式传入才覆盖。备选：直接导出 setter 逐个（API 碎片化）→ 拒绝。

**D3: console 输出与文件使用同一脱敏 line**
`console.log(line)` 与 `appendFileSync(line)` 共用同一 redact 后的 line。备选：console 原样输出（与 desktop A2 同类漏洞）→ 拒绝。

## Risks / Trade-offs

- [同步写阻塞] → 保持现状（调用方仅配置加载失败路径，低频）；desktop 高频路径用 services/logger.js。
- [脱敏正则误伤] → 与 log-redact 同源已验收；普通文本无 `key=`/`Bearer `/`eyJ` 前缀不命中。

## Migration Plan

- 单 PR；无配置迁移；回滚 = revert。

## Open Questions

无。
