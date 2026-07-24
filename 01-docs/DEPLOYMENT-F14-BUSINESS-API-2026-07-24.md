# F14 真实业务 API 接入与登录恢复方案

> 状态：`APPROVED_FOR_EXECUTION`
> 日期：2026-07-24
> 关联：[PRD-F14-LOGTO-PRODUCTION-READINESS.md](./PRD-F14-LOGTO-PRODUCTION-READINESS.md)、[ARCH-F14-LOGTO-PRODUCTION-READINESS.md](./ARCH-F14-LOGTO-PRODUCTION-READINESS.md)、[RUNBOOK-LOGTO-PRODUCTION.md](./RUNBOOK-LOGTO-PRODUCTION.md)

## 1. 触发事实

普通用户已能在 `auth.iart.work` 完成注册，OIDC 授权端点接受当前 Native Application 与固定回环回调。回调完成后，桌面端会以 Access Token 请求 `BUSINESS_API_URL/api/v1/me` 同步业务用户与权益。当前验收实例的 `LOGTO_API_RESOURCE` 使用历史占位资源 `https://api.multi-publish.com`，该地址不可达；现有服务器也没有部署 `@multi-publish/api-publish-engine`，导致 `EntitlementService.sync()` 返回 `ENTITLEMENT_SYNC_FAILED`，登录状态机清理未完成会话并显示重试提示。

这不是 Logto 注册、PKCE、回环 callback 或 Electron 认证窗口的问题。

## 2. 目标与非目标

### P0 目标

1. 在阿里云同机部署 `@multi-publish/api-publish-engine`，使真实用户登录后能得到 `/api/v1/me` 的业务用户与免费权益响应。
2. 为业务 API 创建独立的 PostgreSQL 数据库和受限账号，不复用 Logto 的 `logto` 数据库。
3. 仅把业务 API 绑定到 `127.0.0.1:3030`，通过现有 `auth.iart.work` 的精确 `/api/` 路径反代供本轮验收使用，不暴露 Logto Admin 端口。
4. 以 production validation、版本化 migration、`/health`、`/ready`、production smoke 以及真实登录完成验收。

### 明确不做

- 不把数据库密码、Webhook key、权益私钥、Access Token 或 Refresh Token 提交到仓库、镜像或日志。
- 不使用现有 `8010` Ops Center 服务，也不占用已在使用的主机 `3000` 端口。
- 不把业务表建入 Logto 的 `logto` 数据库。
- 不在本轮接入短信供应商；手机验证码仍由后续 Logto connector 配置承担。

## 3. 当前验收拓扑

```text
Electron
  -> Logto OIDC: https://auth.iart.work/oidc
  -> /api/v1/me: https://auth.iart.work/api/v1/me
       -> Nginx location /api/
       -> 127.0.0.1:3030 publish-api container
       -> PostgreSQL database multi_publish

Logto container
  -> PostgreSQL database logto
```

桌面端本轮验收使用以下公开配置：

```text
LOGTO_ENDPOINT=https://auth.iart.work
LOGTO_API_RESOURCE=https://api.multi-publish.com
BUSINESS_API_URL=https://auth.iart.work
```

`LOGTO_API_RESOURCE` 暂时保持已在 Logto Native Application 中登记的 audience，以免改变已签发 Token 的验证合同；`BUSINESS_API_URL` 显式覆盖桌面端权益请求地址。`auth.iart.work/api/` 只是一条受控的验收兼容路径，不代表长期域名边界。

## 4. 长期域名迁移

长期应使用 `https://api.iart.work` 作为业务 API 的 base URL 和 Logto API Resource audience。完成条件：

1. 阿里云 DNS 的 `api.iart.work` A 记录指向该 ECS。
2. Nginx 配置独立 TLS vhost，证书包含 `api.iart.work`。
3. Logto Console 新建或迁移 API Resource audience，并更新桌面端发布配置。
4. 观察旧客户端使用兼容路径的比例为零后，再移除 `auth.iart.work/api/` 路由。

迁移前不得让桌面端把不可达的占位 audience 当作 API base URL。

## 5. 部署顺序与门禁

| 顺序 | 操作 | 成功条件 | 失败处理 |
|---|---|---|---|
| 1 | 从已合并 `main` 准备独立部署目录 | 不影响服务器旧源码和运行服务 | 删除新目录，不触碰旧目录 |
| 2 | 在服务器 Secret Store 创建业务 API 环境文件 | 权限 `0600`，不输出值 | 删除未引用的新文件 |
| 3 | 创建 `multi_publish` 数据库与受限角色 | 数据库名与 `logto` 不同 | 停止，不对 Logto DB 执行 DDL |
| 4 | 运行 `validate-production-config --phase shadow` | 退出码 0 | 只修配置，不启动容器 |
| 5 | 运行 migration runner | ledger 与 identity schema 就绪 | 保留 forward-only schema，按稳定错误码排查 |
| 6 | 构建并启动 API | 容器 health 与 `/ready` 均通过 | 停止新容器，保留日志和 DB |
| 7 | 加入精确 Nginx `/api/` 反代并测试配置 | `nginx -t` 通过后 reload | 恢复 Nginx 备份，不删除数据库 |
| 8 | 运行 production smoke 与普通用户登录 | `/api/v1/me` 返回业务用户和 entitlement | 回到 shadow，保留 Logto 用户数据 |

## 6. 安全约束

- 容器监听 `0.0.0.0:3000`，但 Docker 仅把它映射到宿主机 `127.0.0.1:3030`；公网访问只能经 Nginx 的 `/api/` 路径。
- Nginx 必须保留 `Host`、`X-Forwarded-Proto` 与真实客户端地址，并限制请求体大小；不得把 `/api/` 规则扩展为 Logto Admin 代理。
- 业务 API Secret Store 与 Compose 文件分离，权限为 `0600`；Docker Compose 只引用变量，不携带值。
- 数据库 migration 只通过仓库内固定目录执行；production API 使用 `BUSINESS_DATABASE_AUTO_MIGRATE=false`。
- 本轮为 shadow，保持 `IDENTITY_AUTH_REQUIRED=false`，直到真实登录、刷新、登出、切换账号和错误率观察通过。

## 7. 验收与回滚

验收需要同时满足：

1. Logto discovery、JWKS、API `/health` 与 `/ready` 返回成功。
2. production smoke 输出全绿且不包含机密。
3. 新注册普通用户回到桌面端后显示已连接，并能获得 `free` entitlement。
4. 重启该独立验收实例后会话恢复；退出和切换账号不会遗留旧 session。

回滚只停止新 API 容器并恢复 Nginx 配置，不删除 `multi_publish` 数据库、identity schema、Logto 用户或 migration ledger。桌面端保留 `IDENTITY_AUTH_REQUIRED=false`，并明确提示业务 API 不可用。
