<!-- 外部模型评审产物（QM-6 后端路，codeagent-wrapper --backend codex，真源 ~/.claude/.ccg/config.toml [routing.backend].primary）。结论的采信以文中给出的探针/命令为准；前端 claude 路两次尝试零产出，未纳入。-->

# 审查 ab4dd9e9：拆出账号资料刷新簇（后端）

审查对象：`apps/desktop/electron/publishers/account-manager.js` 拆分到
`apps/desktop/electron/publishers/account-profile-refresh.js`（commit `ab4dd9e9`）。

## 验证证据

- 六个相关测试文件实际跑过：`pnpm exec vitest run electron/publishers/account-manager.test.js electron/publishers/account-manager-profile.test.js electron/publishers/account-manager-relogin-status.test.js electron/publishers/account-manager-toutiao-render-crash.test.js electron/tests/account-manager-extract-info.test.js electron/publishers/account-profile-refresh.test.js` → `6 passed, 131 passed`。
- `pnpm exec madge --warning --circular apps/desktop/electron/main.js` → `Processed 399 files`,无环。
- 新模块与父提交 `ab4dd9e9^` 的函数体对比脚本：`refreshProfileFromPage` / `refreshProfileFromHttpApi` 的 `try` 块在归一化 `fetchAccountInfoViaHttpApi` / `guardProfilePatchBySource` 为调用点属性访问后逐字节一致；仅差异是新模块多了 `httpLoginChecker.` / `accountNameWrite.` 前缀与 `requirePathGuard`（在 `try` 外，属于有意的接线失败形态）。
- 动态探针（本机 Node 直接 monkey-patch `pythonBridge.requestBackend` / `httpLoginChecker.fetchAccountInfoViaHttpApi`）复现：`GET` 返回 `{ code: 500 }` 时仍随后发出 `PATCH`，patch 为 `{"account_name":"平台昵称","followers":9,"name_source":"auto"}`，函数返回 `true`。

## Critical

### C1：HTTP 快速路径违反 spec“真源 GET 失败或 code !== 0 时不发起 PATCH”，且该分支会绕过 `manual` 昵称保护
- 文件：`apps/desktop/electron/publishers/account-profile-refresh.js:110-124`
- 依据：
  - `account-profile-refresh.js:116-117` 把 `GET /api/accounts/{id}` 的失败/非 0/无 data 全部降级为 `curData = null`，并没有在 `PATCH` 前返回 `false`。
  - `account-profile-refresh.js:118-123` 随后用 `null` 当前值构建 patch 并调用 `guardProfilePatchBySource(patch, null)`。
  - `account-name-write.js:53-57` 的 `guardProfilePatchBySource` 只在 `current && current.name_source === 'manual'` 时保护；`current=null` 会走 `patch.name_source = 'auto'`，因此 HTTP 快速路径在 GET 失败时无法看到 `manual`，会把 `account_name` 连同 `name_source:'auto'` 写回真源。
  - `openspec/changes/split-account-profile-refresh/specs/desktop/spec.md:21` 明确规定：行为逐字一致必须包括“真源 GET 失败或 `code !== 0` 时不发起 PATCH”与“`name_source=manual` 的昵称不被采集结果覆盖”。
  - 实测探针：`GET` 返回 `code:500` → `METHODS=GET,PATCH`，`PATCH_BODY={"account_name":"新用户","followers":9,"name_source":"auto"}`，`RESULT=true`。
  - 该分支在父提交 `ab4dd9e9^:account-manager.js:752-760` 同样存在，即不是本次拆分新增；但本次的 spec delta 把它声明为验收行为，且用户要求的“昵称保护”纪律在当前拆分产物里仍未守住。
- 修复建议：在该路径对齐 `refreshProfileFromPage` 的做法，`if (!current || current.code !== 0 || !current.data) return false` 后再构建/写 PATCH；并补充 HTTP `GET` 失败不发 PATCH、`manual` 不被覆盖的回归测试。现有测试只覆盖 HTTP GET 成功（`account-profile-refresh.test.js:134-148`）与 Page 路径的 GET 失败（`account-profile-refresh.test.js:99-104`），缺 HTTP 的 GET 失败用例。

## Warning

### W1：反向锁只锁 DOM 回填形态，HTTP 快速路径被抄回 `account-manager.js` 不会变红
- 文件：`apps/desktop/electron/publishers/account-profile-refresh.test.js:174-180`
- 依据：
  - 反向锁只断言两处 `profileUtils.collectWith*` 字面量不在 `account-manager.js`，以及 `buildProfilePatch(info, current.data)` 后紧跟 PATCH 的组合不出现。
  - 旧 HTTP 正文（`ab4dd9e9^:account-manager.js:750-760`）是 `fetchAccountInfoViaHttpApi(platform, cookies)` + 多行 `buildProfilePatch({...}, curData)` + PATCH，既不含 `collectWith*`，也不匹配 `buildProfilePatch(info, current.data)`，整段被抄回仍会绿。
  - 同文件 `:166-171` 的“消费方”断言只钉了 `profileRefresh.refreshProfileFromPage(...)` 这一行，`refreshProfileFromHttpApi` 是否真的委托新模块没有结构锁。
- 建议：补 `expect(am).toContain('profileRefresh.refreshProfileFromHttpApi(platform, accountId, cookies, { isSafePathSegment })')`，或把 HTTP 正文的 `fetchAccountInfoViaHttpApi`/`curData` 形态也纳入反向锁。

### W2：QM-6 双模型外部评审未执行，提交按仓库规则仍不可合并
- 文件：`openspec/changes/split-account-profile-refresh/tasks.md:31-32`（`4.1` / `4.2` 未勾）
- 依据：提交说明自述“QM-6 双模型外部评审未执行”；本审查只是单模型后端审查。按 AGENTS.md“M+ 须在提 PR 前完成 QM-6”铁律，当前提交尚未达到可合并状态。
- 附注：同一任务文件里 `3.4`（QM-1）、`5.1`/`5.2`/`5.3`/`5.4`（文档回写与交付）也仍是未勾状态，而提交信息声称 QM-1 已跑、CHANGELOG 与 `.quality-gates.md` 已写，任务台账与提交内容不一致，建议一并回填。

## Info

### I1：spec 实际是 5 个 Scenario，不是 4 个
- 文件：`openspec/changes/split-account-profile-refresh/specs/desktop/spec.md:13-38`
- 依据：包含“资料刷新逻辑住在独立模块且不成环 / 公开面与签名保持 / 接线守卫区间 / 反向锁 / 依赖注入不得削弱可测性”5 个 Scenario。

### I2：`isSafePathSegment` 允许 `__proto__` 等原型键形态，但目前不构成可绕过路径
- 文件：`apps/desktop/electron/publishers/account-manager.js:60-61`
- 依据：白名单是 `[a-zA-Z0-9_-]+`，`__proto__` 会通过。`refreshProfileFromHttpApi` 用 `platform` 索引 `HTTP_CHECK_APIS` 时 `HTTP_CHECK_APIS['__proto__']` 拿到 Object 原型，但 `typeof api.extract !== 'function'` 使该路径返回 `supported:false`，不发请求、不改数据；PATCH URL 也仍是单一安全路径段。当前无注入绕过点，但若未来把 guard 复用到对象键索引场景，建议显式排除原型键。

### I3：接线守卫的 `body.length` 断言近乎恒真，真正的保护来自锚点断言
- 文件：`apps/desktop/electron/publishers/account-manager-profile.test.js:283-288`
- 依据：`tail` 正则取第一个顶格 `}`，`body.length < src.length - start` 在正常文件里几乎必然成立；`start >= 0` / `tail` 非空断言才是“锚点缺失即红”的实质。现状态可接受，不需要改动。

## 五个审查点结论

1. 降级/失败分支与拆分前逐字等价：**是**。归一化 `httpLoginChecker.` / `accountNameWrite.` 后，两个刷新函数的 `try` 块与父提交逐字节一致；`requirePathGuard` 是 `try` 外的有意接线失败形态，生产包装永远注入真校验。
2. `isSafePathSegment` 调用点注入：**当前树无绕过路径**。`account-manager.js:697/701` 是唯一生产消费方并注入真校验；`rg` 确认 `account-profile-refresh.js` 无其他生产 require 方；缺失 guard 会在发请求前抛 `TypeError`。
3. 与 http-login-checker / account-name-write / python-bridge 成环：**不成环**。`madge --circular apps/desktop/electron/main.js` 全量 399 文件无环；三者均不反向 require `account-profile-refresh` / `account-manager`。
4. spec delta Scenario：**不完全满足**。Scenario 1/3/5 满足；Scenario 2（公开面与签名保持）的“GET 失败不发 PATCH”条款被 C1 推翻；Scenario 4 的指定 DOM 触发形态被锁住，但 HTTP 回填可被抄回（W1）。
5. 昵称保护与“回填失败不得影响登录态”：**登录态纪律守住，昵称保护在 HTTP GET 失败分支未守住**。`checkLoginStatus` 四个出口（`account-manager.js:534/577/628/658`）都不使用回填返回值；模块内所有 `try` 内异常均 `warn + false`。但 C1 的 `curData=null` 分支会把 `account_name` 与 `name_source:'auto'` 写回，破坏 `manual` 保护。
