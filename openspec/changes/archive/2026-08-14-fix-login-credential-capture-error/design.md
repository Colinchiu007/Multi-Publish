# Design: 登录取消/超时控制信号与凭证数据分离

## Context

见 proposal.md - Why。关键现状约束：

- `AuthViewManager.openLogin()` 的 resolve 值有三种：真实凭证数据（`{ cookies, name, localStorage, indexedDB }`）、用户取消 `{ cancelled: true }`（关闭页签/Esc）、超时 `{ timeout: true }`。
- `ipc-handlers/account.js` 的 `auth:open-login` 目前无条件把 resolve 值传给 `AccountManager.saveCapturedAccount()`。
- 渲染层 `Accounts.vue` 已预留 `result?.cancelled` 分支（静默关闭登录视图、不弹错误）；`FirstRun.vue` 未识别 `cancelled`。
- `saveCapturedAccount` 的「无 cookies/localStorage/indexedDB → 抛『未捕获到有效登录凭证』」是防伪校验，用于真实失败场景，应保留。

## Goals / Non-Goals

Goals：

- 用户主动取消（关闭页签/Esc）时不弹任何错误提示。
- 超时给出明确超时文案，不弹「未捕获到有效登录凭证」。
- 取消/超时均不创建账号、不调用凭证保存。

Non-Goals：

- 不改 QR 扫码流程（`auth:open-qrcode-login` 关闭走 reject 已返回合理文案「扫码登录窗口已关闭」）。
- 不改 Playwright `captureCookies` 流程（超时文案「登录超时」已存在且合理）。
- 不新增错误码；`saveCapturedAccount` 的 fail-closed 语义保持。

## Decisions

### D1: 取消返回 `{ code: 0, cancelled: true }`，而非错误码

- 备选 A（采纳）：`code: 0` + 顶层 `cancelled: true`。渲染层 `Accounts.vue` 先判 `result?.cancelled` 静默关闭，符合其既有设计；`FirstRun.vue` 需同步识别。
- 备选 B（否决）：返回 `TASK_CANCELLED(-999)` 错误码。会触发 `Accounts.vue` 的 `result.code !== 0` 错误分支弹窗，正是本次要消除的体验问题。
- 备选 C（否决）：在 `saveCapturedAccount` 内部放行空数据。会破坏其对真实无凭证数据的 fail-closed 校验（qrcode-login 直接调用方依赖此语义）。

### D2: 超时返回 `TIMEOUT_ERROR(-11)` + 明确文案

- 与既有错误码体系一致（`error-codes.js` 已定义 `TIMEOUT_ERROR: -11`）；渲染层错误分支展示「登录超时，请重试」，语义准确。

### D3: 拦截点在 IPC handler，而非 AuthViewManager

- `AuthViewManager` 保持「resolve 控制信号」的既有内部契约（`close()` 幂等、`_settleLogin` 单次 settle），拦截放在唯一消费控制信号的 `auth:open-login` handler，避免改动多个 settle 路径。

## Risks / Trade-offs

- [FirstRun.vue 取消时误报「添加成功」] → 同步更新 FirstRun 识别 `cancelled` 后静默返回，并补渲染层测试。
- [返回结构新增顶层字段影响其他消费方] → 追加字段向后兼容；`auth:open-login` 消费方仅 `Accounts.vue`、`FirstRun.vue`、`ipc-handlers/account.test.js`，已全部覆盖。
- [超时文案硬编码中文] → 与仓库既有 IPC 错误文案一致（均为中文直出，不强制走 locales）；本次不扩大 i18n 范围。

## Migration Plan

无数据迁移。变更随 `codex/fix-login-credential-capture-error` 分支 PR 合入；回滚 = revert 该 PR，行为恢复为现状（错误提示），无持久化副作用。

## Open Questions

无。
