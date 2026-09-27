# desktop (delta: split-account-manager-session-restore)

## ADDED Requirements

### Requirement: 账号会话凭证恢复模块边界

主进程中「把已保存凭证注入 Electron session / webContents」与「读取账号 session 分区 Cookie」的实现 SHALL 位于独立模块 `apps/desktop/electron/publishers/account-session-restore.js`，而不是 `account-manager.js`。`account-manager.js` MUST 通过该模块消费这些能力，且 MUST 保持其对外导出名与调用签名不变（IPC 合同面零变化）。

该边界为**单向依赖**：`account-session-restore.js` MUST NOT `require` `account-manager.js`（CJS 循环 require 会返回半初始化导出对象，表现为仅在加载顺序变化时偶发的 `is not a function`）。当被拆出的实现需要 `account-manager` 侧的私有校验（`isSafePathSegment`）时，MUST 由调用处在调用点注入，MUST NOT 由被拆模块自行 require 或复制一份实现。

#### Scenario: 会话恢复逻辑住在独立模块且不成环

- **WHEN** 检索 `apps/desktop/electron/publishers/account-session-restore.js` 的 require 列表
- **THEN** 其中不含 `./account-manager`；`account-manager.js` 中不再定义 `restoreCookies`、`restoreLocalStorage`、`buildLocalStorageRestoreScript`、`_electronSession`、`getAccountPartitionCookies`、`mergeCookies` 这 6 个函数，而是从该模块引入

#### Scenario: 公开面与签名保持

- **WHEN** 既有调用方（`openSavedAccount`、`checkLoginStatus`、IPC `account:*` 链路）以原签名调用 `restoreCookies(session, cookies, baseUrl)`、`restoreLocalStorage(webContents, obj)`、`getAccountPartitionCookies(platform, accountId)`、`mergeCookies(primary, extra)`
- **THEN** 行为与拆分前逐字一致，包括 `getAccountPartitionCookies` 在 `accountId` 非法时 fail-closed 返回空数组、异常时记 warn 并返回空数组，以及 `mergeCookies` 按 `name+domain` 去重且**前一个列表优先**

#### Scenario: 依赖注入不得削弱可测性

- **WHEN** 测试对 `require('../services/logger')` 或被注入的 `isSafePathSegment` 打桩
- **THEN** 打桩必须真实生效（不得因「`require` 期把依赖解构成本地函数绑定」而静默落到真实实现）；把注入改成 no-op 或改错优先级时，相应特征测试 MUST 变红

### Requirement: 纯平移重构必须先有特征测试并有反证

任何以「降低行数债务」为目的的纯代码平移 MUST 先在被移动的实现上建立特征测试（断言其**当前真实行为**，包括失败分支与降级分支），并实测这些测试在**改动前**全绿；改动后同一套测试 MUST 仍全绿。仅凭「移动后原有测试没红」不构成行为不变的证据。

每条新锁 MUST 做一次变异反证（把该行为改成相反实现即变红），否则视为装饰性锁。

#### Scenario: 特征测试先行

- **WHEN** 开始移动代码之前
- **THEN** 已存在覆盖 6 个函数正常/失败/降级分支的测试，且其运行结果为全绿（留痕需含运行输出，不接受「文件已存在」）

#### Scenario: 移动不改变部分失败语义

- **WHEN** `restoreCookies` 注入的 `session.cookies.set` 对部分 Cookie 失败
- **THEN** 失败的每条按 name 记 warn，结束后再记一条 `<失败数>/<总数> cookies failed to restore`，且不抛出、不中断其余 Cookie 的恢复
