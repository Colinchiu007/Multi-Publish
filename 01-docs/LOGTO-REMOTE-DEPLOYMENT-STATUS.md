# Logto 远程部署与生产验收记录（更新于 2026-07-28）

## 部署结果

- ECS：`39.105.42.85`；SSH 私钥仅在本机安全存储，不写入仓库。
- Docker Engine `26.1.3` + Compose `v2.27.0` 已安装。
- 部署目录：`/srv/projects/Multi-Publish/deploy/logto`。
- Logto `1.41.0` 与 PostgreSQL `16-alpine` 均为 `healthy`。
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
- ECS 根文件系统约 `49G`，可用约 `16G`，使用率约 `68%`，已满足至少 `5GiB` 且 `10%` 可用的发布门槛。

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
2. 将本分支业务 API entitlement 代码构建并部署到 ECS，重新运行 migration、`/ready` 与 production smoke；当前远端镜像仍是合并前版本。
3. 配置并完成真实 Webhook 创建、更新、暂停、删除、重试和乱序验收；完成前保持 `IDENTITY_AUTH_REQUIRED=false`。
4. 若启用手机验证码，在 Logto 中接入选定的短信 connector；短信供应商不属于当前部署范围。
