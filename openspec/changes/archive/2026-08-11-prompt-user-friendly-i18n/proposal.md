## Why

用户反馈项目中仍会显示技术性提示，例如「当前许可证无权访问 store:list-publish-history」：主进程 `license-access-control.js` 把内部 IPC 通道名直接拼进 `message` 返回给渲染端，渲染端（如 CreateHistory.vue / PublishHistory.vue / useModelProviderCrud.js）又把 `result.message` 原样展示给用户。这暴露了内部标识符，且只给结论、没有「具体原因 + 解决方法建议」。

既有基线（差异审计结论）：
- 已交付：vue-i18n（zh/en）基础设施、Story2Video 通知的 pattern→key 本地化映射（story2video-notifications.js）、语言键 `settings.language`（但无 UI 入口）、`store:list-publish-history` 等只读历史通道未登录放行（PR #428 同源问题已修）。
- 待办：① 主进程访问控制/模型服务等仍返回含通道名、英文括号注释、英文错误码的 message；② 渲染端大量 `res.message`/`e.message` 直出路径未经过本地化映射；③ 无系统语言自动检测（i18n 仅读 localStorage，默认 zh）；④ 设置弹窗「通用设置」页无语言切换控件；⑤ PRD 无「提示文字规范」章节。

## What Changes

- 主进程 `license-access-control.js`：`denied/entitlementDenied/untrustedSender` 返回结构化字段 `errorCode`（AUTH_REQUIRED / ENTITLEMENT_REQUIRED / UNTRUSTED_SENDER）+ `messageParams`（含 channel，供诊断不供展示）+ 去掉通道名的自然语言 `message`（保留「当前许可证无权访问」等前缀以兼容既有 pattern 映射与测试）。
- 主进程 `model-provider-manager.js` / `webview-manager.js`：去除英文括号注释与裸英文错误，返回 `errorCode` + 自然语言 message；`ID already exists` 收敛为 `PROVIDER_EXISTS`。
- 渲染端新增 `src/utils/user-facing-error.js`：`formatUserError(input, { locale, fallback })` 统一把 IPC 错误映射为「原因 + 建议」的本地化文案（errorCode 优先 → 数值 code → 遗留 raw pattern 兜底），未知错误不暴露原始技术文本。
- 渲染端所有高可见直出路径接入 `formatUserError`（CreateHistory / PublishHistory / useModelProviderCrud / useOpsCenterSync / ApprovalGateModal / UpgradeModal / usePublishFlow / usePublishDrafts / useBatchPublish / PipelineBrowser / TemplatePicker / ReplayTimeline / stores/accounts / CreateView quickError）。
- `src/i18n/index.js`：无存储语言时按系统语言自动检测（zh*/en*），导出 `setAppLocale/getAppLocale/detectSystemLocale`；SettingsDialog「通用设置」页新增语言切换控件（持久化 localStorage）。
- 文档：PRD 新增「提示文字与多语言规范」章节（含数据校验、流程、交互、显示项、提示文字表）；learnings / CHANGELOG / .quality-gates.md 同步。

## Capabilities

### New Capabilities
- `user-facing-messages`: 桌面端所有用户可见提示统一走「结构化错误码 + 渲染端本地化映射」，输出自然语言「原因 + 建议」，支持系统语言检测与设置切换。

### Modified Capabilities
<!-- 无 -->

## Impact

- 运行时代码：`apps/desktop/electron/ipc-handlers/license-access-control.js`、`apps/desktop/electron/services/model-provider-manager.js`、`apps/desktop/electron/services/webview-manager.js`
- 渲染端：`src/i18n/index.js`、新增 `src/utils/user-facing-error.js`、`src/components/LogsSettings.vue`、`src/components/SettingsDialog.vue`（如需要）、`src/views/CreateHistory.vue`、`src/views/PublishHistory.vue`、`src/views/CreateView.vue`、`src/composables/*`、`src/stores/accounts.js`、`src/components/ApprovalGateModal.vue`、`src/components/UpgradeModal.vue`、`src/components/PipelineBrowser.vue`、`src/components/TemplatePicker.vue`、`src/views/ReplayTimeline.vue`
- 测试：`license-access-control.test.js`、`model-provider-manager` 相关测试、新增 `src/utils/user-facing-error.test.js`、`src/i18n/i18n.test.js`、受影响视图测试
- 文档：`01-docs/PRD.md`、`01-docs/learnings.md`、`CHANGELOG.md`、`.quality-gates.md`、OpenSpec specs
