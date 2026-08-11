## Context

桌面端 IPC 错误链路：主进程 handler 返回 `{ code, message, data? }` → preload contextBridge → 渲染端 `src/api/electron-bridge.js`（invoke/invokeWithFallback）→ 视图/composable 展示 `result.message`。主进程此前把内部通道名（`store:list-publish-history`）、英文括号注释（`（No adapter registered ...）`）、英文错误码（`VOICE_CATALOG_UNAVAILABLE`）直接作为 message 返回；渲染端仅有 Story2Video 域的 pattern→key 映射，其他域直出原始 message。

## Goals

- 用户可见提示全部为「具体原因 + 解决方法建议」的自然语言，支持 zh/en。
- 内部标识符（通道名、errorCode、provider id、栈信息）不出现在用户可见区域。
- 语言解析：显式设置 > 系统语言 > 默认；设置入口在设置弹窗「通用设置」。

## Non-Goals

- 不改造 api-publish-engine / ops-center（独立服务，另有其错误面）。
- 不做主进程侧完整 i18n（渲染端按 errorCode 本地化已满足多语言；主进程 message 仅作兼容 fallback）。
- 不逐一重写所有业务的既有中文提示（它们已自然语言化，仅需确保不经由直出路径泄露技术文本）。

## Approach

### 主进程

`license-access-control.js` 三个拒绝函数返回：
```
{ code: ERROR.AUTH_ERROR, errorCode: 'AUTH_REQUIRED', message: '当前许可证无权访问该功能，请先登录并确认账号已开通所需权益后重试。', messageParams: { channel } }
{ code: ERROR.AUTH_ERROR, errorCode: 'ENTITLEMENT_REQUIRED', message: '当前账号没有所需权益，无法使用该功能。请升级或开通对应权益后重试。', messageParams: { channel } }
{ code: ERROR.AUTH_ERROR, errorCode: 'UNTRUSTED_SENDER', message: '未授权的调用来源' }
```
保留「当前许可证无权访问」「当前账号没有所需权益」前缀，兼容 Story2Video ACCESS_DENIED_PATTERN 与既有断言。

`model-provider-manager.js`：为 create/update/delete/setDefault/initialize/getAdapter/加密等路径补 `errorCode`，去掉英文括号注释与裸英文 message（`ID "x" already exists` → `PROVIDER_EXISTS` + `服务商 ID 已存在，请更换后重试。`）。渲染端 `useModelProviderCrud.js` 的 `already exists` 判断改为优先读 `errorCode === 'PROVIDER_EXISTS'`，保留 `includes('already exists')` 兼容。

`webview-manager.js`：`Failed to create tab` → `创建标签页失败，请重试`。

### 渲染端

`src/i18n/index.js`：
- 新增 `detectSystemLocale()`（navigator.language；ssr/测试环境回退 'zh'）。
- 初始化：`storedLocale ?? detectSystemLocale()`。
- 导出 `getAppLocale()` / `setAppLocale(locale)`（写 localStorage + `i18n.global.locale.value`）。

新增 `src/utils/user-facing-error.js`：
- `USER_ERROR_MESSAGES = { zh: {...}, en: {...} }`，键为 errorCode：`AUTH_REQUIRED` / `ENTITLEMENT_REQUIRED` / `UNTRUSTED_SENDER` / `NOT_SIGNED_IN` / `STORAGE_UNAVAILABLE` / `NETWORK_ERROR` / `TIMEOUT` / `VALIDATION_ERROR` / `NOT_FOUND` / `IO_ERROR` / `RATE_LIMITED` / `QUOTA_EXCEEDED` / `PROVIDER_EXISTS` / `ADAPTER_NOT_FOUND` / `PROVIDER_NOT_FOUND` / `API_KEY_NOT_CONFIGURED` / `ADAPTER_INIT_FAILED` / `OPERATION_NOT_SUPPORTED` / `CREATE_FAILED` / `UPDATE_FAILED` / `DELETE_FAILED` / `SET_DEFAULT_FAILED` / `ENCRYPT_FAILED` / `CRYPTO_UNAVAILABLE` / `INVALID_CATEGORY` / `STORE_NOT_INITIALIZED` / `NO_UPDATABLE_FIELDS` / 通用 `OPERATION_FAILED`。
- 每条 zh/en 都是「原因 + 建议」两段式。
- `formatUserError(input, { locale, fallback })` 解析顺序：`input.errorCode`（字符串）→ 数值 code（-3/-12/-11/-13/-2/-10/429/402）→ 遗留 raw pattern（复用 Story2Video 的 ACCESS_DENIED 等 pattern 思路）→ `fallback` 或通用文案。返回 `{ message, detail? }`。

接入点（把 `x = res?.message || fb` 改为 `x = formatUserError(res, { fallback: fb }).message`）：
- `views/CreateHistory.vue`（renderError / pipelineError）
- `views/PublishHistory.vue`（detailError / actionMessage / 删除）
- `composables/useModelProviderCrud.js`（ElMessage 全部错误 + already-exists 判断）
- `composables/useOpsCenterSync.js`
- `components/ApprovalGateModal.vue`、`components/UpgradeModal.vue`
- `composables/usePublishFlow.js`、`usePublishDrafts.js`、`useBatchPublish.js`
- `components/PipelineBrowser.vue`、`components/TemplatePicker.vue`、`views/ReplayTimeline.vue`
- `stores/accounts.js`、`views/CreateView.vue`（quickError / installLog）

`components/LogsSettings.vue`（通用设置页）新增「语言」选择（中文/English）：`v-model` 绑定当前 locale，`@change` 调 `setAppLocale`。

## Risks & Mitigations

- 主进程 message 变更破坏既有精确断言 → 保留 `未授权的调用来源` 不变；denied/entitlement 前缀保留；跑全量桌面测试确认。
- 渲染端逻辑依赖英文 message（`already exists`）→ 改 errorCode 优先 + 保留 includes 兜底。
- Story2Video 通知 pattern 依赖「当前许可证无权访问」前缀 → 新 message 保留前缀。
- i18n 初始化在测试环境无 navigator → detectSystemLocale 回退 'zh'，测试显式传 locale。
