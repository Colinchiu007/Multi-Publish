# desktop/account-login-capture Specification

## Purpose

定义桌面端「添加账号」登录凭证捕获的 IPC 行为契约：用户取消（关闭登录页签/Esc）与登录超时是控制信号，不得被当作凭证数据进入保存流程，也不得向用户弹出误导性的「未捕获到有效登录凭证」错误。

## ADDED Requirements

### Requirement: 用户取消登录不得报错或保存

`auth:open-login` SHALL 在用户未完成登录即关闭登录视图（关闭页签）或按 Esc 取消时，返回 `{ code: 0, cancelled: true }` 结果，且不得创建账号、不得调用凭证保存流程。

#### Scenario: 关闭页签取消

- **WHEN** 用户在账号管理选择平台打开登录页后，未做任何操作直接关闭登录页签
- **THEN** `auth:open-login` 返回 `cancelled: true` 且 `code: 0`，不创建账号，不弹出错误提示

#### Scenario: Esc 取消

- **WHEN** 用户按 Esc 关闭登录视图
- **THEN** 行为与关闭页签一致：返回 `cancelled: true`，不保存凭证

#### Scenario: 取消不进入保存流程

- **WHEN** 登录视图以取消信号收尾
- **THEN** `AccountManager.saveCapturedAccount` 不被调用，账号列表无新增项

#### Scenario: 消费方静默处理取消

- **WHEN** 任意调用 `auth:open-login` 的渲染层收到 `cancelled: true`
- **THEN** 该渲染层不得把取消展示为成功或失败消息

### Requirement: 登录超时返回明确超时错误

`auth:open-login` SHALL 在登录等待超时（未登录且未取消）时返回 `TIMEOUT_ERROR` 及明确超时文案，且不得调用凭证保存流程。

#### Scenario: 等待超时

- **WHEN** 登录视图持续打开超过等待时限且用户未登录
- **THEN** `auth:open-login` 返回 `TIMEOUT_ERROR`，文案包含超时语义，不创建账号

#### Scenario: 超时不进入保存流程

- **WHEN** 登录流程以超时信号收尾
- **THEN** `AccountManager.saveCapturedAccount` 不被调用

#### Scenario: 超时展示

- **WHEN** 渲染层收到 `TIMEOUT_ERROR`
- **THEN** 按错误分支展示超时文案，而非「未捕获到有效登录凭证」

#### Scenario: 正常登录不受影响

- **WHEN** 用户在时限内完成平台登录并产生有效凭证
- **THEN** `auth:open-login` 仍按既有成功契约返回 `code: 0` 与脱敏账号数据

### Requirement: 凭证保存仅接受真实凭证数据

`saveCapturedAccount` SHALL 继续对「非控制信号但无任何 cookies/localStorage/indexedDB」的输入 fail closed，抛出「未捕获到有效登录凭证」；本契约不放松该校验。

#### Scenario: 真实无凭证失败

- **WHEN** 登录流程结束但未产生任何 cookies/localStorage/indexedDB 且非取消/超时信号
- **THEN** 保存流程抛出「未捕获到有效登录凭证」错误，账号不创建

#### Scenario: 控制信号不触发该校验

- **WHEN** 输入为 `{ cancelled: true }` 或 `{ timeout: true }` 控制信号
- **THEN** 该输入在到达保存流程前被拦截，不触发「未捕获到有效登录凭证」

#### Scenario: 空数据对象仍拒绝

- **WHEN** 输入为无控制标志的空对象或空数组凭证
- **THEN** 保存流程按既有语义拒绝并抛出「未捕获到有效登录凭证」

#### Scenario: 有效凭证正常保存

- **WHEN** 输入包含平台域 cookies 或 localStorage 数据
- **THEN** 保存流程正常创建账号并返回脱敏账号信息
