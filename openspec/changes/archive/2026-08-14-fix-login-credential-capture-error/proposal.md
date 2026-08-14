# Fix Login Credential Capture Error

## Why

用户从「账号管理 → 添加账号」选择平台打开登录页后，若未做任何操作直接关闭页签，应用会错误弹出「未捕获到有效登录凭证」报错。根因是 `auth:open-login` IPC 处理器把 `AuthViewManager.openLogin()` 返回的「用户取消/超时」控制信号（`{ cancelled: true }` / `{ timeout: true }`）误当作登录凭证数据传给 `saveCapturedAccount()`，后者因无 cookies/localStorage 而 fail-closed 抛出误导性错误。

## What Changes

- `auth:open-login` IPC 处理器识别控制信号：用户取消（关闭页签/Esc）时返回 `{ code: 0, cancelled: true }`，不进入凭证保存、不创建账号、不弹错误。
- 登录超时返回 `TIMEOUT_ERROR` 与明确超时文案，不进入凭证保存。
- `FirstRun.vue` 消费方同步识别 `cancelled`，取消时不误报「账号添加成功」。
- 回归测试覆盖取消与超时两条路径（IPC 层 + 渲染层）。

## Capabilities

- **New Capabilities**:
  - `desktop/account-login-capture` — 账号登录凭证捕获契约：控制信号与凭证数据的区分、取消/超时的 IPC 返回语义。
- **Modified Capabilities**: 无（`desktop` 下无既有登录捕获契约 spec，`user-facing-messages` 未定义该错误文案语义）。

## Impact

- 代码：`apps/desktop/electron/ipc-handlers/account.js`、`apps/desktop/src/views/FirstRun.vue`
- 测试：`apps/desktop/electron/ipc-handlers/account.test.js`、`apps/desktop/src/views/FirstRun.test.js`
- 不影响：QR 扫码流程（`auth:open-qrcode-login` 关闭走 reject，文案合理）、Playwright `captureCookies` 流程、`saveCapturedAccount` 对真实无凭证数据的 fail-closed 语义。
