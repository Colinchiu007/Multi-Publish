# Tasks: publish-permission-recheck（即时发布执行前复校权益/激活态）

> TDD-first：每个任务先写测试再实现。运行时代码改动必须在 worktree 内（`scripts/start-mp-task.ps1 -TaskName publish-permission-recheck`）进行，提交前过 QM-2 + vitest 全绿（本 change 不涉及 `apps/desktop/electron/` 运行时文件，不触发 QM-1 打包，但仍属运行时代码 → 完整质量节拍门禁）。

## P0-1 提取 `_authorizeImmediateEntry` + 路由收口（核心，先落地）
- [ ] T1.1 新增同步路径回归测试（扩展 `packages/api-publish-engine/test/logto-security-boundaries.test.js` 或新增 `publish-permission-recheck.test.js`）：构造 `PublishApiServer({ logtoVerifier, businessIdentityRepository:{ findBySubject → {status:'suspended'} }, entitlementProvider:{ requireFeature → entitlementChecks++, consumeFeature → consumeChecks++ } })`；`POST /api/v1/publish` 断言：响应 **403**、`body.error === 'BUSINESS_USER_SUSPENDED'`、`entitlementChecks === 0`、`consumeChecks === 0`（断言三元组，镜像 `logto-security-boundaries.test.js` L254-283）。
- [ ] T1.2 同形态批量路径：构造同上 suspended 用户，`POST /api/v1/batch-publish`（多 platform）断言 403 + `consumeChecks === 0`。
- [ ] T1.3 单元测试（解耦证明）：`await server._authorizeImmediateEntry(req)`，其中 `req.auth.businessUser = {status:'suspended'}`（且不依赖中央预检已填充），断言抛 `BUSINESS_USER_SUSPENDED`。
- [ ] T1.4 正常态不回归：构造 `findBySubject → {status:'active'}` + `entitlementProvider.consumeFeature` 成功，断言 `POST /api/v1/publish` 返回 200 / `success:true` 且 `consumeChecks === 1`（消费恰好一次）。
- [ ] T1.5 API Key 分支等价：构造 API Key `ownerSubject`（`/^api-key:[a-f0-9]{64}$/`），断言 `_authorizeImmediateEntry` 走 `_authorizeApiKeyScheduledOwner`、不触发 Logto active-state 检查。
- [ ] T1.6 在 `publish-api-server.js` L534 之后新增 `async _authorizeImmediateEntry(req, amount = 1)`（同构 `_authorizeScheduledEntry`：API Key 分支 → repository 校验 → `assertBusinessUserActive` → `_assertEntitlementFeature('cloud_publish')` → `_consumeEntitlementFeature('cloud_publish', Math.max(1, amount))`）。
- [ ] T1.7 `POST /api/v1/publish`（L957-965）将裸 `_consumeEntitlementFeature` 内联块替换为 `await this._authorizeImmediateEntry(req, 1)`，沿用既有 `_logError` + `_json` 返回结构与错误码透传。
- [ ] T1.8 `POST /api/v1/batch-publish`（L993-1001）将裸 `_consumeEntitlementFeature` 内联块替换为 `await this._authorizeImmediateEntry(req, platforms.length)`，结构同上。

## P1-1 契约对称/可读（与 P0-1 同步落地）
- [ ] T2.1 在 design/spec 注明：中央预检（L661-673）与 `_authorizeImmediateEntry` 为**叠加**关系，中央预检行为不变；两者错误响应契约（503 业务/权益不可用、403 无权、文案「当前账号无权执行此操作」/「业务用户或权益服务暂时不可用」）与现网完全一致。
- [ ] T2.2 新增注释锚点：在 `_authorizeScheduledEntry` 与 `_authorizeImmediateEntry` 两处注明「即时/定时发布共用同一授权契约，改一处须同步另一处」。

## 收口
- [ ] T3.1 全量 `pnpm test`（vitest，从 `packages/api-publish-engine` 目录运行）绿。
- [ ] T3.2 QM-2 代码必检项（require 路径、注释语法、模块导出、`/* */` 成对）。
- [ ] T3.3 确认中央预检（L661-673）行为未被改动、正常用户发布链路 E2E 权益消费无变化。
- [ ] T3.4 经 PR 落地（运行时代码 → worktree + PR，非 docs-only 通道）。
