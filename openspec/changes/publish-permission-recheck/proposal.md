# Proposal: publish-permission-recheck（即时发布执行前复校权益/激活态）

## Why

对「发布执行前复校业务用户状态与 cloud_publish 权益」做审计后，发现**即时发布（同步）路径与定时发布（异步）路径在授权契约上不对称**，且**同步路径缺少显式回归测试**（均带 `file:line` 锚点）。

### P0（同步路径授权契约与定时路径不对称）

- **P0-1 定时路径有独立、自包含的授权入口，即时路径没有**：`packages/api-publish-engine/src/publish-api-server.js` 的 `POST /api/v1/schedule`（经 `ScheduledPublish`）执行前会调用 `_authorizeScheduledEntry(entry)`（`publish-api-server.js` L511-534），该函数在**同一处**集中完成了：owner 校验 → 业务用户仓库查询 → `assertBusinessUserActive(user)`（L528）→ `_assertEntitlementFeature`（L530）→ `_consumeEntitlementFeature`（L532）。而即时发布路径（`POST /api/v1/publish` L946-983、`POST /api/v1/batch-publish` L985-1006）把这三项拆散在两层：
  - 用户状态校验（active/suspended/deleted）+ 权益 feature 断言依赖**中央预派发块**（`publish-api-server.js` L661-673）：`if (authResult.subject) { try { await this._ensureRequestIdentity(req, url); await this._assertEntitlementFeature(req, this._requiredFeature(req)); } catch (error) { ...403/503... } }`，其中 `_ensureRequestIdentity` → `ensureBusinessUser` → `assertBusinessUserActive`。
  - 权益**消费**（`_consumeEntitlementFeature`）则在路由处理函数内部（L958 / L994）。
  - 这种「状态校验在中心、权益消费在路由」的拆分，使即时路径的 fail-closed 契约**隐式耦合到中央预派发块**：一旦中央预检因新路由注册、非 subject 认证分支、API Key 路径或后续重构而被改动/绕过，即时路径会静默丢失 active-state 校验，且没有任何单测能拦住。
- **P0-2 同步路径无显式回归测试（测试逃逸）**：`packages/api-publish-engine/test/logto-security-boundaries.test.js` 已覆盖定时路径——`定时发布执行前重新校验用户状态和 cloud_publish 权益`（L232-252）与 `PublishApiServer 将业务用户和权益校验接入定时执行器`（L254-283，断言 `entry.status==='failed'`、`entry.error` 匹配 `/BUSINESS_USER_SUSPENDED/`、`entitlementChecks===0`）。然而**该文件没有任何测试覆盖「同步（即时）发布」场景下被暂停/删除用户的行为**。即：当前测试只能证明「被暂停用户无法**定时**发布」，无法证明「被暂停用户无法**即时**发布」——同步路径成为安全回归的盲区。

> **重要事实澄清（避免误报为「Logto 用户现网可被利用的漏洞」）**：对 `publish-api-server.js` L661-673 的核实确认，任何 Logto 签名的请求（`authResult.subject` 存在）在路由派发**之前**已经过 `_ensureRequestIdentity`（→ `ensureBusinessUser` → `assertBusinessUserActive`）与 `_assertEntitlementFeature` 的集中校验；被暂停/删除的 Logto 用户会在 L667-671 被直接 `return` 并返回 403，根本到达不了 L958/L994 的 `_consumeEntitlementFeature`。因此**对 Logto 用户而言，同步即时发布在现网已经是中央 fail-closed 的**，不存在可被利用的现网缺口。本次 change 的价值在于**消除非对称性 + 补齐同步路径回归测试 + 让 fail-closed 契约自包含、解耦于中央预检**，属于纵深防御与测试覆盖增强，而非修复一个现网安全洞。

### P1（契约可读性与可维护性）

- **P1-1 授权逻辑分散、语义不一致**：定时路径把「状态 + 权益断言 + 权益消费」三件事收口在一个 `_authorizeScheduledEntry` 内，即时路径却把同一语义拆到中心块与路由两处，未来维护者无法一眼看出「即时发布与定时发布用的是同一套授权契约」，容易在改一处漏另一处。
- **P1-2 缺少统一的失败文案/语义常量来源**：两条路径的错误码（`BUSINESS_USER_SUSPENDED` 等）虽已存在于 `business-identity.js`，但即时路径的 active-state 检查目前**完全依赖**中心块抛出的文案，没有在路由层显式声明「此处也要做 active-state 复校」。

## What Changes

### ADDED Capabilities
- `publish-permission-recheck` — 即时发布（同步）路径提取显式、自包含的 `_authorizeImmediateEntry(req)`，镜像 `_authorizeScheduledEntry` 的授权契约（active-state 复校 + 权益 feature 断言 + 权益消费），使同步/异步两条路径语义对称、fail-closed 解耦于中央预派发块。
- `publish-permission-recheck-test` — 新增同步路径回归测试，断言被暂停/删除的 Logto 用户 `POST /api/v1/publish` / `POST /api/v1/batch-publish` 返回 403 `BUSINESS_USER_SUSPENDED`，且 `entitlementChecks===0`（权益消费计数为 0，证明未泄漏到消费阶段）。

### 变更明细
逐项见对应 `specs/publish-permission-recheck/spec.md` 的 `Requirement` / `Scenario`（含 `file:line` 锚点与断言）。

## Impact
- 仅调整即时发布路径的授权**收口位置与显式化**，不改变「被授权用户正常发布」的业务语义；正常用户的发布成功/失败/权益消费行为保持完全不变。
- 不引入新依赖；复用的 `assertBusinessUserActive` / `ensureBusinessUser` / `BusinessIdentityError` 均来自既有 `packages/api-publish-engine/src/auth/business-identity.js`。
- 不改动中央预派发块（L661-673）的既有行为；`_authorizeImmediateEntry` 为新增、与中央预检**叠加**（纵深防御），不是替换。
- 属 `packages/api-publish-engine` 运行时代码改动 → 必须在 worktree 内经完整质量节拍 + PR 落地（**非** docs-only 通道）。

## Out of Scope
- 中央预派发块（L661-673）本身的重构或移除。
- API Key（非 Logto）发布路径的权益语义改造（本 change 仅确保既有 `_isApiKeyOwnerSubject` / `_authorizeApiKeyScheduledOwner` 行为不被影响）。
- 登录态观测、权益配额计算逻辑、Webhook 触发逻辑改造。
- 任何前端（apps/desktop）交互或提示文案改动（本次为后端引擎层契约对称化 + 测试覆盖）。
