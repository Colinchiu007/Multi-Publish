# desktop (delta: split-account-profile-refresh)

## ADDED Requirements

### Requirement: 账号资料刷新模块边界

主进程中「把采集到的账号资料（昵称、头像、粉丝、平台 ID）回填进唯一真源」的实现 SHALL 位于独立模块 `apps/desktop/electron/publishers/account-profile-refresh.js`，而不是 `account-manager.js`。`account-manager.js` MUST 通过该模块消费这些能力，且 MUST 保持其对外导出名与调用签名不变（IPC 合同面零变化）。

该边界为**单向依赖**：`account-profile-refresh.js` MUST NOT `require` `account-manager.js`（CJS 循环 require 会返回半初始化导出对象，表现为仅在加载顺序变化时偶发的 `is not a function`）。当被拆出的实现需要 `account-manager` 侧的私有校验（`isSafePathSegment`）时，MUST 由调用处在调用点注入，MUST NOT 由被拆模块自行 require 或复制一份实现。

采集实现 MUST 保持单一来源 `@multi-publish/shared-utils/src/account-profile`；昵称保护 MUST 继续经 `./account-name-write` 的 `guardProfilePatchBySource`，不得在新模块内另写一份 `name_source` 判定。

#### Scenario: 资料刷新逻辑住在独立模块且不成环

- **WHEN** 检索 `apps/desktop/electron/publishers/account-profile-refresh.js` 的 require 列表与 `account-manager.js` 的函数定义
- **THEN** require 列表不含 `./account-manager`；`account-manager.js` 中不再定义 `extractAccountInfo`、`extractAccountInfoFromWebContents`、`refreshProfileFromPage`、`refreshProfileFromHttpApi` 这 4 个函数的实现体，而是从该模块引入

#### Scenario: 公开面与签名保持

- **WHEN** 既有调用方（`checkLoginStatus` 的两处 DOM 有效出口、两处 HTTP 快速路径、`tests/account-manager-extract-info.test.js`）以原签名调用 `extractAccountInfo(page, platform)`、`refreshProfileFromPage(page, platform, accountId)`、`refreshProfileFromHttpApi(platform, accountId, cookies)`
- **THEN** 行为与拆分前逐字一致，包括：资料回填失败只记 warn 并返回 `false`（**绝不**影响登录态判定）、`accountId`/`platform` 非法时不发起任何后端请求、真源 GET 失败或 `code !== 0` 时不发起 PATCH、`buildProfilePatch` 无命中字段时不发起 PATCH、`name_source=manual` 的昵称不被采集结果覆盖

#### Scenario: 接线守卫的区间必须钉在函数体本身，且锚点缺失即红

- **WHEN** `account-manager-profile.test.js` 的接线守卫计算 `checkLoginStatus` 的函数体区间
- **THEN** 区间终点 MUST 取该函数自己的顶层闭合括号，MUST NOT 取「同文件里另一个函数是否还存在」——后者一旦被删除或搬走，`indexOf` 返回 -1，而 `String.prototype.slice` 把负数解释为「从文件末尾倒数」，守卫会在区间扩大的情况下继续通过
- **AND** 起点与终点两个锚点都必须**先断言存在**（缺失即红），不允许用 -1 参与后续计算
- **AND** 守卫必须同时计数 DOM 出口与 HTTP 出口的回填调用；实测对照：摘掉两处 HTTP 出口回填时旧守卫绿、新守卫红

#### Scenario: 反向锁——回填不得在 account-manager 内重新内联

- **WHEN** 有人在 `account-manager.js` 内直接组合 `profileUtils.collectWith*` 与对 `/api/accounts/` 的 PATCH 写入（即把拆出去的实现抄回主文件）
- **THEN** 新模块的接线锁 MUST 变红

#### Scenario: 依赖注入不得削弱可测性

- **WHEN** 测试对 `require('../services/python-bridge')`、`require('../services/logger')` 或被注入的 `isSafePathSegment` 打桩
- **THEN** 打桩必须真实生效（不得因「`require` 期把依赖解构成本地函数绑定」而静默落到真实实现）；把注入改成 no-op、或把 `name_source` 保护的调用摘掉时，相应特征测试 MUST 变红
