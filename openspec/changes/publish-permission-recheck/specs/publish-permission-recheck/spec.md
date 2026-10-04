# publish-permission-recheck (delta)

> 在即时/批量发布执行前复校业务用户激活态与权益。定时发布路径（`_authorizeScheduledEntry`）已有同等契约，**本次补齐即时发布路径的对称性、显式 fail-closed 与测试覆盖**。中央预检（L661-673）对 Logto 用户已 fail-closed → 本次为叠加保障 + 测试缺口补齐，不宣称修复活跃安全漏洞。

## ADDED Requirements

### Requirement: 即时发布执行前复校激活态与权益
即时发布（`POST /api/v1/publish`）与批量发布（`POST /api/v1/batch-publish`）在消费 `cloud_publish` 权益前，必须复用与定时发布一致的授权契约：先校验 owner（API Key / Logto 业务用户）激活态，再校验并消费 `cloud_publish` 权益；任何环节失败必须 fail-closed 返回既有错误码，且不得触发权益消费或后续发布动作。

#### Scenario: 业务用户已暂停 → 即时发布被拒且不消费权益
- **Given** 请求携带有效 Logto 令牌，且 `businessIdentityRepository.findBySubject("logto", subject)` 返回 `{ status: "suspended" }`
- **When** 调用 `POST /api/v1/publish`
- **Then** 响应状态码 **403**，响应体 `error === "BUSINESS_USER_SUSPENDED"`
- **And** `entitlementProvider.requireFeature("cloud_publish")` 调用次数 **0**
- **And** `entitlementProvider.consumeFeature("cloud_publish", ...)` 调用次数 **0**

#### Scenario: 业务用户已暂停 → 批量发布被拒且不消费权益
- **Given** 请求携带有效 Logto 令牌，业务用户 `status === "suspended"`
- **When** 调用 `POST /api/v1/batch-publish`（多 platform）
- **Then** 响应状态码 **403**，响应体 `error === "BUSINESS_USER_SUSPENDED"`
- **And** `consumeFeature("cloud_publish", ...)` 调用次数 **0**

#### Scenario: 业务用户已删除/非激活 → 即时发布被拒
- **Given** `findBySubject` 返回 `{ status: "deleted" }` 或 `{ status: "inactive" }` 或 `null`（未找到）
- **When** 调用 `POST /api/v1/publish`
- **Then** 响应状态码 **403**，错误码为 `BUSINESS_USER_DELETED` / `BUSINESS_USER_INACTIVE` / `BUSINESS_USER_NOT_FOUND`
- **And** 权益消费次数 **0**

#### Scenario: 业务用户仓库未配置 → 503
- **Given** `this._businessIdentityRepository` 为 `undefined`
- **When** 调用 `POST /api/v1/publish`
- **Then** 响应状态码 **503**，错误码 `BUSINESS_USER_REPOSITORY_NOT_CONFIGURED`

#### Scenario: 权益不足 → 即时发布被拒且不消费/已消费后失败
- **Given** 业务用户激活态正常，`entitlementProvider.consumeFeature("cloud_publish", amount)` 抛 `BusinessEntitlementError`（403 或 503）
- **When** 调用 `POST /api/v1/publish`
- **Then** 透传既有错误码（403 无权 / 503 服务不可用），响应 `error` 字段与 `status` 与现网一致

#### Scenario: 正常态 → 权益恰好消费一次且发布继续
- **Given** 业务用户 `status === "active"`，`entitlementProvider.consumeFeature` 成功
- **When** 调用 `POST /api/v1/publish`
- **Then** `consumeFeature("cloud_publish", 1)` 调用次数 **1**（仅一次）
- **And** 响应 `success: true`，后续发布链路照常执行

#### Scenario: API Key 分支等价
- **Given** 请求 `ownerSubject` 命中 `/^api-key:[a-f0-9]{64}$/`
- **When** 调用 `POST /api/v1/publish`
- **Then** 走 `_authorizeApiKeyScheduledOwner`（校验 API Key 归属与撤销态），不触发 Logto 业务用户激活态检查；错误码 `API_KEY_STORE_UNAVAILABLE`(503) / `SCHEDULE_OWNER_REVOKED`(403) / `SCHEDULE_OWNER_INVALID`(403) 保持既有语义

#### Scenario: 与中央预检叠加（非替换）
- **Given** 中央路由预检（L661-673）已对 Logto 用户执行 `_ensureRequestIdentity` + `_assertEntitlementFeature`
- **When** `_authorizeImmediateEntry` 收口即时/批量发布路由
- **Then** 两者为叠加关系：中央预检行为不变；任一层 fail-closed 均返回既有契约（503 业务/权益不可用、403 无权），文案与现网一致（`当前账号无权执行此操作` / `业务用户或权益服务暂时不可用`）

## 实现约束（QM-3 断言）
- 新增 `async _authorizeImmediateEntry(req, amount = 1)`，必须与 `_authorizeScheduledEntry`（L511-534）同构：API Key 分支 → `businessIdentityRepository.findBySubject` → `assertBusinessUserActive(user)` → `_assertEntitlementFeature(req, "cloud_publish")` → `_consumeEntitlementFeature(req, "cloud_publish", Math.max(1, amount))`。
- 路由收口：`POST /api/v1/publish`（L957-965）与 `POST /api/v1/batch-publish`（L993-1001）的裸 `_consumeEntitlementFeature` 内联块，替换为 `await this._authorizeImmediateEntry(req, 1)` / `await this._authorizeImmediateEntry(req, platforms.length)`，沿用既有 `_logError` + `_json` 返回结构与错误码透传。
- 测试覆盖：在 `logto-security-boundaries.test.js`（或新增 `publish-permission-recheck.test.js`）补齐即时/批量同步路径的「suspended → 403 + entitlementChecks===0 + consumeChecks===0」断言三元组；并补单元测试证明 `_authorizeImmediateEntry` 无需依赖中央预检也能 fail-closed；正常态 `consumeChecks===1` 不回归；API Key 分支对称。
- 中央预检（L661-673）行为不变，正常用户即时/批量发布权益消费链路无变化。
