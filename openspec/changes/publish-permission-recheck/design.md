# Design: publish-permission-recheck（即时发布执行前复校权益/激活态）

## 总体策略

消除**即时发布（同步）路径与定时发布（异步）路径在授权契约上的不对称**：把即时路径「active-state 复校 + 权益 feature 断言 + 权益消费」三件事，从「中央预派发块（L661-673）+ 路由内联消费（L958/L994）」的隐式拆分，收口为与 `_authorizeScheduledEntry`（L511-534）**结构对称**的显式、自包含入口 `_authorizeImmediateEntry(req, amount)`。

- 不改变「被授权用户正常发布」的业务语义；正常用户的发布成功/失败/权益消费行为完全不变。
- 不替换中央预派发块（L661-673）的既有行为；`_authorizeImmediateEntry` 与其**叠加**（纵深防御），即使中央预检未来被重构/绕过，路由自身仍 fail-closed。
- 复用既有 `assertBusinessUserActive` / `ensureBusinessUser` / `BusinessIdentityError`（`packages/api-publish-engine/src/auth/business-identity.js`），不引入新依赖。
- 不改动 API Key（非 Logto）发布路径的既有语义：保持 `_isApiKeyOwnerSubject` / `_authorizeApiKeyScheduledOwner` 行为等价。

## 关键实现点

### 1. 新增 `_authorizeImmediateEntry(req, amount)`（P0-1 基石，镜像 `_authorizeScheduledEntry`）
在 `publish-api-server.js` 紧邻 `_authorizeScheduledEntry`（L534 之后）新增 `async _authorizeImmediateEntry(req, amount = 1)`，**收口与定时路径完全同构**：

```
async _authorizeImmediateEntry(req, amount = 1) {
  const auth = req && req.auth
  const ownerSubject = auth && (auth.subject || auth.ownerSubject)
  // API Key 分支：与 _authorizeScheduledEntry 对称，保持既有 _authorizeApiKeyScheduledOwner 语义
  if (!this._identityAuthRequired && this._isApiKeyOwnerSubject(ownerSubject)) {
    return this._authorizeApiKeyScheduledOwner(ownerSubject)
  }
  if (!this._logtoVerifier) return true
  // 自包含：不依赖中央预检已填充的 businessUser，defensive 重新推导
  if (!this._businessIdentityRepository || typeof this._businessIdentityRepository.findBySubject !== "function") {
    throw Object.assign(new Error("BUSINESS_USER_REPOSITORY_NOT_CONFIGURED"), {
      code: "BUSINESS_USER_REPOSITORY_NOT_CONFIGURED", status: 503,
    })
  }
  let user = auth && auth.businessUser
  if (!user) {
    if (typeof ownerSubject !== "string" || !ownerSubject) {
      throw Object.assign(new Error("SCHEDULE_OWNER_REQUIRED"), { code: "SCHEDULE_OWNER_REQUIRED", status: 403 })
    }
    user = await this._businessIdentityRepository.findBySubject("logto", ownerSubject)
  }
  if (!user) throw new BusinessIdentityError("BUSINESS_USER_NOT_FOUND", undefined, 403)
  assertBusinessUserActive(user)                       // ① active-state 复校（suspended/deleted/inactive → 403/503）
  await this._assertEntitlementFeature(req, "cloud_publish")  // ② feature 断言
  await this._consumeEntitlementFeature(req, "cloud_publish", Math.max(1, amount))  // ③ 权益消费
  return true
}
```

要点：
- ① `assertBusinessUserActive(user)`：suspended→`BUSINESS_USER_SUSPENDED`(403)、deleted→`BUSINESS_USER_DELETED`(403)、inactive→`BUSINESS_USER_INACTIVE`(403)、缺失→`BUSINESS_USER_UNAVAILABLE`(503)（见 `business-identity.js` L11-18）。
- ②③ 与 `_authorizeScheduledEntry` L530-532 完全一致，仅 `requestContext` 换为活请求 `req`（其 `req.auth.businessUser` 已由中央 L663-664 填充；此处 defensive 重推，保证解耦）。
- `amount`：即时发布 = 1，批量发布 = `Math.max(1, platforms.length)`（与 L994 同义）。

### 2. 路由收口：用 `_authorizeImmediateEntry` 替换内联消费块（P0-1 + P1-1）
- **`POST /api/v1/publish`（L946-983）**：将 L957-965 的 `try { await this._consumeEntitlementFeature(req,"cloud_publish",1) } catch … 503/403` 整段替换为 `try { await this._authorizeImmediateEntry(req, 1) } catch (error) { … 503/403 }`（沿用既有 `_logError` + `_json` 返回结构，错误码透传 `error.code`）。即「三件事」现在全部在 `_authorizeImmediateEntry` 内完成，路由层不再有裸消费。
- **`POST /api/v1/batch-publish`（L985-1006）**：将 L993-1001 的 `try { await this._consumeEntitlementFeature(req,"cloud_publish",Math.max(1,platforms.length)) } catch …` 替换为 `try { await this._authorizeImmediateEntry(req, platforms.length) } catch (error) { … }`，结构同上。
- 两个路由的 `catch` 分支文案与 `_json` 返回（`error.code` / `status`）保持不变，仅消费调用被收口进 `_authorizeImmediateEntry`。**错误响应契约与现网完全一致**（503 业务/权益不可用、403 无权）。

### 3. 保持与中央预检的叠加关系（纵深防御，非替换）
- L661-673 中央预检保留不动；对 Logto 用户它仍先做 `_ensureRequestIdentity`→`ensureBusinessUser`→`assertBusinessUserActive` + `_assertEntitlementFeature`。`_authorizeImmediateEntry` 在其**之后**再次执行同一套检查（active-state 幂等、feature 断言幂等、消费一次）。
- 叠加的收益：未来若中央预检因新路由注册、非 subject 认证分支、API Key 路径或重构而被改动/绕过，路由自身的 `_authorizeImmediateEntry` 仍 fail-closed，且被单测锁定（见测试策略）。

## 测试策略（镜像 scheduled-path 断言三元组）

1. **新增同步路径回归测试**（扩展 `packages/api-publish-engine/test/logto-security-boundaries.test.js` 或新增 `publish-permission-recheck.test.js`）：
   - **集成测试**：构造 `PublishApiServer({ logtoVerifier, businessIdentityRepository:{ findBySubject → {status:'suspended'} }, entitlementProvider:{ requireFeature → entitlementChecks++ / consumeFeature → consumeChecks++ } })`；`await request(port,'POST','/api/v1/publish', token, {platform:'weibo'})`。断言：
     - 响应 status === **403**，body.error === **`BUSINESS_USER_SUSPENDED`**；
     - `entitlementChecks === 0`（feature 断言未泄漏；active-state 复校在断言之前已 fail-closed）；
     - `consumeChecks === 0`（权益消费未泄漏到消费阶段）。
     - 镜像 `logto-security-boundaries.test.js` L254-283 的断言三元组（`entry.status==='failed'` / `match(entry.error,/BUSINESS_USER_SUSPENDED/)` / `entitlementChecks===0`）。
   - **批量路径同形态**：`POST /api/v1/batch-publish` 携带多个 platform，断言同样 403 + `consumeChecks===0`。
   - **单元测试（解耦证明）**：直接 `await server._authorizeImmediateEntry(req)` 其中 `req.auth.businessUser = {status:'suspended'}`，断言抛 `BUSINESS_USER_SUSPENDED`——证明 fail-closed 不依赖中央预检。
2. **正常态不回归**：构造 `businessIdentityRepository.findBySubject → {status:'active'}` + `entitlementProvider.consumeFeature` 成功，断言 `POST /api/v1/publish` 返回 200 / `success:true`，且 `consumeChecks === 1`（消费恰好一次，未因叠加而重复消费）。
3. **API Key 分支等价**：构造 API Key ownerSubject，断言 `_authorizeImmediateEntry` 走 `_authorizeApiKeyScheduledOwner`、不触发 Logto active-state 检查（与定时路径对称）。

## 验证

- 本 change 仅改 `packages/api-publish-engine/src/publish-api-server.js`（运行时代码）→ 完整质量节拍：**QM-2 代码必检项**（require 路径、注释语法、模块导出）+ **QM-3 风格门禁**（如有相关结构锁）+ vitest 全绿。
- 属 `api-publish-engine` 包，**不涉及 `apps/desktop/electron/` 运行时文件**，故**不触发 QM-1 本地打包**；但若后续 CI `changes` job 要求，以 `pnpm --filter @multi-publish/api-publish-engine test` 为准。
- 全部新增/扩展测试在 worktree 内 `pnpm test`（vitest，从 `packages/api-publish-engine` 目录运行）全绿。
- PR 落地前确认：中央预检（L661-673）行为未被改动；正常用户发布链路 E2E 文案/权益消费无变化。
