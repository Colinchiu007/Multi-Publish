# Logto 远程部署与生产验收记录（更新于 2026-07-31）

## 部署结果

- ECS：`39.105.42.85`；SSH 私钥仅在本机安全存储，不写入仓库。
- Docker Engine `26.1.3` + Compose `v2.27.0` 已安装。
- 部署目录：`/srv/projects/Multi-Publish/deploy/logto`。
- Logto `1.41.0` 已使用哈希绑定的 Webhook POST 重试派生镜像，PostgreSQL `16-alpine` 未重建，二者均为 `healthy`。
- 业务 API 容器已部署并为 `healthy`；`/api/v1/health` 与 `/api/v1/ready` 均经公网验证。
- Logto 仅绑定 `127.0.0.1:3021`，Admin Console 仅绑定 `127.0.0.1:3022`。
- 阿里云 DNS A 记录：`auth.iart.work -> 39.105.42.85`，TTL 600 秒。
- Nginx 对外提供 `https://auth.iart.work`，HTTP 自动 301 跳转到 HTTPS。
- Logto 正式 issuer：`https://auth.iart.work/oidc`。
- `LOGTO_TRUST_PROXY_HEADER=1`，仅由本机 Nginx 反向代理访问 Logto。

## HTTPS

- 证书：Let's Encrypt ECDSA，CN `auth.iart.work`。
- 本次证书有效期：2026-07-21 至 2026-10-19（UTC）。
- acme.sh 每日四次检查续期；续期成功后执行 `nginx -t && systemctl reload nginx`。
- Nginx 仅启用 TLS 1.2/1.3，并返回 HSTS。

## 验收证据

- `https://auth.iart.work/oidc/.well-known/openid-configuration` 可从公网访问。
- Discovery 中 `issuer`、`authorization_endpoint`、`token_endpoint`、`jwks_uri` 均使用 `https://auth.iart.work`。
- `https://auth.iart.work/oidc/jwks` 返回 1 个签名公钥。
- Nginx 配置检查通过，公网 443 可访问，三个容器健康。
- `production-smoke.js` 的 discovery、JWKS、health、ready 与 Nginx 路径分离检查全部通过。
- `/api/v1/ready` 的 database、schema、oidc、jwks、introspection 均为 `ready`。
- 2026-07-29 最终审计中，ECS 根文件系统约 `49G`，可用约 `15.2GiB`、可用比例 `32%`，已满足至少 `5GiB` 且 `10%` 可用的发布门槛。
- 2026-07-31 `00:41:39Z` 复核中，根文件系统为 `51,217,788 KiB`，可用 `15,780,308 KiB`（约 `15.0 GiB`、`32%`），仍通过发布门槛。运行中的健康业务 API 镜像标识为 `multi-publish-business-api-publish-api:e19a36b588a78a69ef4f5cf27ea79ccbba16783e`（image ID `sha256:23aa578093839cfd88d4310cb487da1961054adbb853f4d0876ef18c9d8ac4b2`）。该标签可解析为提交 `e19a36b588a78a69ef4f5cf27ea79ccbba16783e`，它是本次对照的 `main@feac9e91aac038c5359e62867ca27ce59c0f1db8` 祖先，且二者的目标 `packages/api-publish-engine/src/auth/entitlement.js` 无源文件差异；容器文件与该 Windows checkout 文件字节 SHA-256 同为 `a9ba9d5b120f8042a28cb342c23ac46f03065f7e6d4b725678972ab2a297bbf6`。这只证明 entitlement 时钟容差目标文件已在运行容器中，不证明整套镜像由当前 `main` 构建。该容器的 migration dry-run 跳过 `002_logto_identity.sql`、`003_logto_webhook_events.sql`，无 pending migration；本机受控网络下的公网 smoke 对 discovery、JWKS、health、ready 与两条 Nginx 路由分离检查全部通过。额外的匿名 GET 实测中，`/api/users` 返回 `401`、`/api/forgot-password` 返回 `404`，均未命中业务 API guard 或 API-key 鉴权响应。此轮没有重建镜像、重启容器或更改认证灰度。
- Webhook 派生镜像 ID 为 `sha256:9e946d21842f45670e4478eb38b51fa1a565586ac0f2ccf16999d45fda92b0a6`；运行时文件补丁前后 SHA-256 分别为 `77441c2d030d064343cfb22aa61b0e0ed45bff8fb33a1d4ce2beed6a8f1c752c` 与 `5108a3c6f3e60a627d32351687368cbf4510743b87ba7fbcad33e7fb7bcbb55e`。
- 临时 Hook 在 `2026-07-29T06:17:09.978Z`、`06:17:10.322Z`、`06:17:10.934Z` 收到三次 HMAC 有效 POST，响应序列为 `503 -> 503 -> 204`；该结果不包含 Ky `TimeoutError`。
- 主业务 Hook 对验收主体的 `User.Created`、`User.Deleted` 均处理成功；最终业务状态为 `deleted`、活跃会话 0，删除 tombstone 按防乱序合同保留。
- 验收后 Nginx 恢复原配置 SHA，临时 Hook、Logto 用户、角色关联、监听端口、systemd 单元、容器审计脚本和远端临时目录均无残留；Logto 用户数 `3 -> 3`、Hook 数 `1 -> 1`、Management Resource TTL 3600。

## 管理控制台

Admin Console 不直接暴露公网。首次初始化或日常管理时，从本机建立 SSH 隧道：

```powershell
ssh -i <本机私钥路径> -L 3022:127.0.0.1:3022 root@39.105.42.85
```

保持该终端运行，在浏览器打开 `http://127.0.0.1:3022/console/welcome`。完成初始化后继续使用同一隧道访问管理控制台。

## 当前身份与权限配置

1. Multi-Publish Native App、回环回调、PKCE、API Resource 与 M2M introspection 应用均已配置；凭据不写入本文或仓库。
2. `default` tenant 的默认角色 `Multi-Publish User` 已绑定 `profile:read`、`publish:read`、`publish:submit`、`account:manage`、`cloud:publish`，并赋予当前 2 个活跃用户；`admin` tenant 未修改。
3. 默认开发与打包配置均使用 `https://auth.iart.work` 作为 Logto 和业务 API 地址，API Resource 为 `https://api.multi-publish.com`。
4. 真实登录已证明 `/api/v1/me` 从缺 scope 的 `403` 修复为 `200`；entitlement 独立时钟偏差修复已进入最终 Windows 包并通过同账号 UAT。

## 最终 Windows 包 UAT（2026-07-28）

1. 专用普通用户完成 OIDC 登录并进入 `authenticated + free`；加密会话文件落盘，不包含明文用户名或 Token 标签。
2. 使用同一 profile 重启后自动恢复 `authenticated + free`，未再次打开认证窗口。
3. `identitySwitchAccount()` 已证明同账号重新认证；这不是 A→B 第二主体隔离证据。
4. `identitySignOut()` 后状态为 `signed_out`，用户与 entitlement 清空，会话和 entitlement 文件删除，认证窗口为 0。
5. 专用测试用户随后经短时 Management API 授权删除；独立复核目标用户为 0、Management Resource TTL 为 3600、临时角色关联为 0。业务库按 `User.Deleted` 语义保留 tombstone 并软标记 `deleted`，活跃会话为 0；本地 DPAPI 凭据、profile、日志和临时脚本已清理。

## 尚未闭环

1. 使用两个不同主体完成真正 A→B 账号切换与 owner/entitlement 隔离验收，并单独验证 refresh token 轮换；同账号重新认证不能替代。
2. Webhook 临时创建/删除、主 Hook Created/Deleted 和 HTTP 503 重试已完成；仍需验证主 Hook 更新/暂停、生产真实乱序，以及为 Ky `TimeoutError` 选择升级或持久化补偿。完成这些门禁前保持 `IDENTITY_AUTH_REQUIRED=false`。
3. 在隔离的双数据库目标上完成 restore drill；不得把恢复步骤直接指向生产库。
4. 以受控测试完成 API/身份依赖的并发压力验收，并完成云端发布撤销验证。
5. 若启用手机验证码，在 Logto 中接入选定的短信 connector；短信供应商不属于当前部署范围。

已确认的 entitlement 时钟容差变更不再是 ECS 部署阻塞项。任何后续业务 API 镜像变更仍必须重新运行 migration dry-run、`/api/v1/ready` 与 production smoke，不能仅凭本次文件哈希复用验收。
