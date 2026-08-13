## Why

审计 C1：`packages/shared-utils/src/logger.js` 仍被 `format-adapter/rules.js`、`cover-processor/presets.js` 引用（平台配置加载失败时同步写 `userData/logs/app.log`），但**无脱敏**（若错误信息含凭据会原文落盘）、注释声称"与 apps/desktop/electron/logger.js 保持行为一致"（该路径不存在且行为确不一致，误导维护）。

## What Changes

- 修正误导注释（指向真实实现差异：desktop 优先用 services/logger.js，本模块是共享库同步轻量实现）。
- 增加敏感信息脱敏（对齐 api-publish-engine log-redact 5 组模式：Bearer/quoted+unquoted 键值/sk-/通用 JWT），文件与控制台同源脱敏。
- 新增 `setLogOptions({ file, maxSize, level })` 支持测试/运行时覆盖路径、轮转上限与级别（保持零依赖与既有 API 兼容）。

## Capabilities

### New Capabilities
- `shared-utils-logging`: 共享库同步日志契约——文件/控制台同源脱敏、路径与轮转上限可注入、API 向后兼容。

### Modified Capabilities
<!-- 无 -->

## Impact

- 代码：`packages/shared-utils/src/logger.js`
- 测试：新增 `packages/shared-utils/src/__tests__/logger.test.js`
- 无调用方破坏（rules.js/presets.js 只用 debug/info/warn/error/getLogPath，均保留）
