# F14：Logto 用户身份与权益系统技术架构

> **版本**：v1.1
> **日期**：2026-07-20
> **状态**：批准实施
> **对应 PRD**：[PRD.md 2.4](./PRD.md)
> **源码基线**：Logto Core `c751ac0`（1.41.0），Logto JS `562b8e9`（`@logto/client` 3.1.8）

## 1. 决策摘要

采用 Logto 作为独立身份提供商，Multi-Publish 保留业务用户、订阅、权益、用量、设备和平台账号归属。桌面端默认使用受限 Electron 独立认证窗口 + Authorization Code + PKCE S256，第三方身份提供商拒绝嵌入式 user-agent 时回退系统浏览器；API 使用 OIDC Discovery/JWKS 验证 Access Token；`sub` 是唯一外部身份键。

不采用共享用户数据库、共享 `JWT_SECRET`、主 Renderer/iframe 内嵌登录、自建密码表单、客户端持有 M2M Token 或用本地 license 文件作为 Pro 权限权威。

## 2. 源码验证结论

| 结论 | Logto 源码证据 | 应用决策 |
|------|----------------|----------|
| Native/SPA 是 public client | Core `packages/core/src/oidc/init.ts` | 不配置 client secret，必须使用 PKCE S256 |
| Client Adapter 只需存储与导航能力 | JS `packages/client/src/adapter/types.ts`、`client.ts` | Electron 主进程自定义 Adapter，CommonJS 用动态 `import()` |
| Refresh Token 支持旋转与 Grant 限制 | Core OIDC 配置 | Native App 开启轮换，最大 Grant 数设为 5 |
| API Resource 决定 Access Token audience | Core `middleware/koa-auth/index.ts` | 每次取 Token 指定 `https://api.multi-publish.com` |
| Application Access Control 可按用户/角色限制 | Core `libraries/application-access-control.ts` | 封闭测试期限制允许登录的人群 |
| Sentinel 保护登录和验证码尝试 | Core `sentinel/basic-sentinel.ts` | 仍需在业务 API 单独做速率/额度限制 |
| Webhook 使用 HMAC、超时和重试但不阻塞认证 | Core `libraries/hook/utils.ts` | Webhook 仅辅助同步，首个有效请求必须 lazy upsert |
| OSS 不执行 Cloud quota | Core `isCloud=false` 分支 | 自托管配额由 Multi-Publish entitlement 服务负责 |

参考链接：

- [Logto Core OIDC 初始化](https://github.com/logto-io/logto/blob/c751ac0e9e703d2ff5572719794103cb55b668d5/packages/core/src/oidc/init.ts)
- [Logto Koa Auth Middleware](https://github.com/logto-io/logto/blob/c751ac0e9e703d2ff5572719794103cb55b668d5/packages/core/src/middleware/koa-auth/index.ts)
- [Logto JS Client](https://github.com/logto-io/js/blob/562b8e9016448d939f50a2ca876173facc4690c1/packages/client/src/client.ts)
- [Logto Client Adapter](https://github.com/logto-io/js/blob/562b8e9016448d939f50a2ca876173facc4690c1/packages/client/src/adapter/types.ts)

## 3. 系统拓扑与信任边界

```text
┌──────────────────────────── Electron（不可信客户端）───────────────────────────┐
│ Renderer ──窄 IPC──> AuthService ──> @logto/client ──> 独立认证 BrowserWindow  │
│                         │                   │                    │              │
│                  safeStorage         127.0.0.1 回环回调       隔离 Session      │
└─────────────────────────┼───────────────────┼───────────────────────────────────┘
                          │ TLS               │ OIDC
                          ▼                   ▼
┌──────────────────── Multi-Publish 服务端 ─────────────┐  ┌──── Logto ─────────┐
│ API Gateway/JWKS Middleware                           │  │ OIDC / Account API  │
│  ├─ user lazy upsert                                  │  │ PostgreSQL          │
│  ├─ entitlement/usage                                 │  │ Redis（多实例可选） │
│  └─ publish jobs（owner = verified sub）              │  │ JWKS / Webhook      │
│ PostgreSQL                                            │  └────────────────────┘
└───────────────────────────────────────────────────────┘
```

信任规则：Renderer、Electron 本地文件、请求体中的 `user_id` 和本地 license 都不可信；只有通过 Logto 公钥验证且声明完整的 Access Token 可建立身份。entitlement 只信任服务端响应或服务端私钥签名的离线快照。

## 4. Logto 租户配置

### 4.1 Native Application

| 字段 | 值 |
|------|----|
| Name | Multi-Publish Desktop |
| Type | Native |
| Redirect URI | `http://127.0.0.1:16526/auth/callback` |
| Post Sign-out URI | 同回环地址或 Logto 默认完成页 |
| Refresh Token | 启用旋转 |
| Max Allowed Grants | 5 |

回调服务器只监听 `127.0.0.1`，仅接受 `GET /auth/callback`，验证 Host、路径、state 和单次 nonce，收到一次有效回调后立即停止。端口冲突时不得静默换端口，因为 Redirect URI 必须精确注册；应提示用户释放端口并重试。

### 4.2 API Resource 与 Scope

Resource Indicator：`https://api.multi-publish.com`

| Scope | 用途 |
|-------|------|
| `profile:read` | 读取当前业务用户资料 |
| `publish:submit` | 提交发布任务 |
| `publish:read` | 查看本人任务 |
| `account:manage` | 管理本人平台账号 |
| `cloud:publish` | 使用云端发布能力 |
| `admin:users` | 管理用户，仅管理员/M2M |

### 4.3 Management API

管理任务使用独立 M2M Application，凭证保存在服务端 Secret Store。Electron 不调用 Management API；本人资料、密码、MFA 和授权管理优先使用 Account API 或跳转 Logto 账户中心。

## 5. Electron 登录实现

### 5.1 文件边界

```text
apps/desktop/electron/services/identity/
├── logto-client.js              # ESM SDK 动态加载、自定义 Adapter
├── identity-auth-window.js      # 受限独立认证窗口与导航策略
├── auth-service.js              # 登录状态机与令牌生命周期
├── secure-token-storage.js      # safeStorage 加密会话存储
├── loopback-callback-server.js  # 单次回环 HTTP 服务
└── identity-errors.js           # 对外错误码和脱敏
apps/desktop/electron/ipc-handlers/identity.js
apps/desktop/electron/preload/identity.js
apps/desktop/src/api/identity.js
apps/desktop/src/stores/identity.js
apps/desktop/src/composables/useIdentity.js
```

### 5.2 状态机

```text
signed_out
  └─ signIn() ─> signing_in ─> authenticated
                     ├─ timeout/cancel ─> signed_out
                     └─ invalid_callback ─> error ─> signed_out
authenticated
  ├─ access token expiring ─> refreshing ─> authenticated
  │                                  └─ invalid_grant ─> signed_out
  ├─ network unavailable ─> offline_authenticated（仅本地能力）
  └─ signOut/account switch ─> signing_out ─> signed_out
```

状态变化由主进程广播；Renderer 只能调用 `getState/signIn/signOut/getAccessToken` 的受限桥接，不能读取 Refresh Token、ID Token 原文、code_verifier 或 safeStorage 密文。

### 5.3 登录时序

1. `AuthService.signIn()` 拒绝并发登录，启动固定端口的单次回调服务。
2. `@logto/client.signIn(redirectUri)` 生成 state、nonce 和 PKCE verifier；Adapter 打开独立认证窗口。
3. 认证窗口只加载 Logto issuer，使用独立持久化 Session；固定回环地址可导航，其他导航和新窗口请求被阻止。第三方身份提供商拒绝内嵌时显式回退系统浏览器。
4. 回环服务接收 callback URL，不记录 query；用户关闭认证窗口时立即取消回调等待。
5. `handleSignInCallback(url)` 校验 state/nonce 并交换 Token；SDK 验证 ID Token。
6. Session 数据通过 `safeStorage.encryptString()` 加密后原子写入用户数据目录。
7. 获取 API Resource 的 Access Token，调用 `/v1/me` 完成业务用户 lazy upsert 和 entitlement 同步。
8. 广播脱敏状态；无论成功、取消或失败都关闭认证窗口、回调服务并清理临时 PKCE 数据。

### 5.4 刷新、退出与恢复

- 启动恢复只读取 safeStorage 密文并交给 SDK；解密失败、结构版本不兼容或 Refresh Token 失效时清空会话并进入 `signed_out`。
- Access Token 只缓存在主进程内存。并发请求共享一个刷新 Promise，避免 Refresh Token 旋转竞态。
- API 第一次返回 401 时仅允许刷新并重放一次；第二次 401 直接退出登录，禁止无限重试。
- 退出先让 Logto SDK 在仍可读取 Refresh Token 时尽力完成 revoke/end-session，再在 `finally` 中清理本地 Token、用户缓存和 entitlement；远端失败不得阻止本地退出。退出与登录回调/刷新并发时使用操作代次取消旧操作，禁止旧 Token 回写。

## 6. 业务用户与 entitlement

### 6.1 数据模型

```sql
CREATE TABLE identity_users (
  id TEXT PRIMARY KEY,
  auth_provider TEXT NOT NULL DEFAULT 'logto',
  auth_subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  display_name TEXT,
  avatar_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (auth_provider, auth_subject)
);

CREATE TABLE identity_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES identity_users(id),
  plan TEXT NOT NULL,
  status TEXT NOT NULL,
  current_period_start TEXT,
  current_period_end TEXT,
  provider_reference TEXT,
  UNIQUE (provider_reference)
);

CREATE TABLE identity_entitlement_snapshots (
  user_id TEXT PRIMARY KEY REFERENCES identity_users(id),
  version INTEGER NOT NULL,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

当前仓库的兼容迁移见 `migrations/002_logto_identity.sql`。使用 `identity_*` 前缀是为了不改变已有本地 `users` 数据；生产 PostgreSQL 可保留同名边界并把时间/JSON 字段换成 `TIMESTAMPTZ/JSONB`。第一次有效请求在事务中 `INSERT ... ON CONFLICT ... UPDATE`，不得以邮箱或手机号关联旧用户；账号合并必须是单独、经验证且可审计的管理操作。

### 6.2 离线权益快照

服务端返回非对称签名快照：

```json
{
  "sub": "Logto subject",
  "device_id": "本机稳定随机 ID",
  "plan": "pro",
  "features": ["cloud_publish"],
  "quota": { "cloud_publish_monthly": 1000 },
  "iat": 1784515200,
  "exp": 1785120000,
  "kid": "entitlement-2026-01"
}
```

客户端内置/配置公钥验证签名，并核对 `sub`、`device_id`、`iat/exp`、`kid`。建议离线宽限最长 7 天；涉及付费消耗和云端写操作始终在线校验。账号切换、退出、设备撤销或签名失败立即清除快照。

## 7. API 鉴权中间件

Node 和 Python 实现必须输出统一的请求上下文：

```text
auth = {
  subject: claims.sub,
  scopes: Set(claims.scope),
  issuer: claims.iss,
  audience: claims.aud,
  tokenId: claims.jti | null
}
```

校验顺序：解析 Bearer Header → OIDC Discovery/JWKS → 选择 `kid` → 校验允许的非对称算法 → 签名 → issuer/audience/time → scope → 建立上下文。禁止 `alg=none`、对称算法降级、把 decode 当 verify、根据请求参数改变 issuer/audience。

云端任务的 owner 由 `auth.subject` 设置；列表强制 `WHERE auth_subject = :subject`；单任务跨用户访问统一返回 404。业务 API 另行执行每用户/设备速率限制和 entitlement/额度事务扣减。

## 8. Webhook

接收 `User.Created`、`User.Data.Updated`、`User.SuspensionStatus.Updated`、`User.Deleted` 等事件时：

1. 在读取业务字段前，以原始请求体和配置 Secret 验证 Logto HMAC 签名。
2. 优先以事件 ID 做幂等；当前 Logto payload 没有 delivery ID 时，以签名原文 SHA-256 作为稳定回退键。
3. 更新显示名/头像/状态，不保存不需要的敏感身份数据。
4. 删除事件默认软删除并撤销业务会话；业务数据按保留策略异步处理。
5. Webhook 延迟或丢失不影响 lazy upsert；暂停/删除用户在每次在线鉴权时还需经过本地状态校验。

实现要求 `repository.transaction()` 在同一数据库事务内依次完成 `claimWebhookEvent → upsertUserState/revokeUserSessions → completeWebhookEvent`；任一步失败必须整体回滚，使 Logto 重试仍可处理。部署样例和初始化步骤见 `deploy/logto/README.md`，幂等表迁移见 `migrations/003_logto_webhook_events.sql`。

## 9. 威胁模型与控制

| 威胁 | 控制 |
|------|------|
| 授权码截获 | PKCE S256、state/nonce、回环只监听 localhost、短超时、单次消费 |
| 恶意本地进程抢占端口 | 固定端口失败即停止登录；校验 state；不把 Token 返回浏览器页面 |
| Renderer 被注入后窃取 Token | contextIsolation、sandbox、窄 preload、Refresh Token 永不进入 Renderer |
| 认证窗口越权导航/窗口注入 | 独立 Session、无 preload、nodeIntegration=false、导航白名单、禁止任意新窗口与下载 |
| 磁盘凭证泄露 | `safeStorage` 加密、原子写入、严格权限、无明文降级 |
| Token 替换/错误 audience | 完整 JWKS + issuer + audience + time + algorithm 验证 |
| 跨用户访问 | 服务端从 `sub` 计算 owner，忽略 `user_id`，404 防枚举 |
| Refresh Token 旋转竞态 | 单飞刷新、一次重放、invalid_grant 清会话 |
| Webhook 伪造/重放 | 原始体 HMAC、恒时比较、事件 ID 幂等 |
| 本地 Pro 篡改 | 服务端 entitlement 权威、非对称签名、绑定 sub/device/exp |
| 撤销凭据遗留任务 | 定时任务持久化稳定 `ownerSubject`；每次执行前重新读取 API Key 撤销状态或用户状态，失败即停止发布 |
| 日志泄密 | Token/授权码/query/手机号/邮箱脱敏，统一安全错误码 |

## 10. 运维、可观测性与回滚

必须采集但不含 PII/Token 的指标：登录成功率和耗时、callback 超时/端口冲突、刷新成功率及 `invalid_grant`、401/403 比例、JWKS 缓存命中/更新失败、Webhook 延迟/重试、entitlement 拒绝原因。

Logto 使用 PostgreSQL 持久化；多实例部署时启用 Redis central cache。Logto、业务数据库和 entitlement 私钥分别备份与轮换。JWKS 缓存 TTL 默认 5 分钟，遇到未知 `kid` 主动刷新一次；刷新失败采用 fail closed。

灰度开关：`IDENTITY_AUTH_ENABLED`、`IDENTITY_AUTH_REQUIRED`。回滚顺序为关闭 required → 恢复受限旧 API Key → 回退客户端；不删除已迁移的 `auth_subject` 数据。任何回滚都不能重新启用共享 `JWT_SECRET`。

## 11. 架构验收门禁

- Electron 中不存在 Logto client secret、Management API Token 或 Refresh Token IPC。
- Node/Python 中间件均有真实签名、错误 issuer/audience、过期、scope 和 key rotation 测试。
- 业务迁移幂等且唯一约束有效；并发首次请求只创建一个用户。
- 两个用户的任务隔离集成测试通过；请求体伪造 `user_id` 无效。
- safeStorage 不可用时拒绝持久化登录，不明文降级。
- 登录、恢复、刷新、退出、离线和账号切换端到端路径有证据。
- 独立认证窗口的安全选项、导航白名单、用户取消、加载失败、回调关闭和系统浏览器回退有自动化证据。
- Electron 完整打包、preload 双 sandbox 验证、Vue 构建和视觉回归门禁通过。

## 12. 落地状态与边界（2026-07-20）

### 12.1 已落地模块

- Electron 主进程已实现 Logto SDK Adapter、PKCE 回环回调、安全会话存储、登录状态机、单飞刷新、退出和账号切换；Renderer 只通过窄 IPC 获取脱敏状态。
- Node API 已实现 OIDC Discovery/JWKS 验签、scope、业务用户 lazy upsert、`sub` 资源归属、entitlement/额度、Webhook HMAC/幂等/乱序保护和 PostgreSQL repository。
- Python API 已实现与 Node 一致的 Bearer/JWKS/issuer/audience/time/scope 语义，并把认证上下文接入发布入口。
- 本地 SQLite 迁移用于桌面兼容；生产业务 API 使用 `migrations/postgresql/`，不能把根目录 SQLite 脚本用于 PostgreSQL。
- MVP 不包含组织/团队管理 UI。当前所有业务资源以已验证 Token 的 `sub` 隔离，团队套餐和角色扩展保留在服务端 entitlement/Logto RBAC 边界内。

### 12.2 关键一致性约束

- `safeStorage` 暂时不可用时不创建明文降级，也不删除磁盘上已有的加密会话；状态进入 `error`，待安全存储恢复后重试。这不等于继续授予在线身份或云端权限。
- Webhook 在写入幂等记录前完成时间新鲜度校验；正式 PostgreSQL 路径的 `claim -> upsert/revoke -> complete` 位于同一事务，异常整体回滚。自定义 repository 也必须提供真实事务，不能只满足同名接口。
- 旧事件的 `upsertUserState` 返回 `applied: false` 后，不得触发暂停/删除的会话撤销副作用。
- API Key 定时任务以 `api-key:<sha256>` 作为稳定 owner；执行前必须从 Key 存储重新校验有效性和 `publish:submit` scope。撤销返回 `SCHEDULE_OWNER_REVOKED`，不能因重启、无 Logto 模式或静态配置 fallback 恢复权限。Key 存储损坏或不可读时返回 `API_KEY_STORE_UNAVAILABLE` 并 fail closed，自动迁移不得覆盖原文件。
- 退出和切换账号时，远端注销采用 best effort；本地 Token 与 entitlement 必须清理。远端失败返回 warning，但不得阻止本地退出。

### 12.3 上线前外部验收

本地自动化、Windows 打包和产物启动已验证，实际命令和数字见 [TEST-PLAN-LOGTO.md](./TEST-PLAN-LOGTO.md)。以下项目依赖外部凭据/基础设施，不作为本地实现已通过项：

1. 真实 Logto 测试租户中的首次登录、重启恢复、Refresh Token 轮换、退出和账号切换。
2. 真实 PostgreSQL 迁移、并发 lazy upsert、Webhook 重试事务和高并发额度扣减压力测试。
3. 真实云端 API 的端到端发布与暂停/删除用户会话撤销。

生产配置、版本化 migration、深度就绪探针、备份恢复、监控和灰度回滚的补充设计见 [ARCH-F14-LOGTO-PRODUCTION-READINESS.md](./ARCH-F14-LOGTO-PRODUCTION-READINESS.md)。
