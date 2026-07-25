# Logto 远程部署验收记录（2026-07-22）

## 部署结果

- ECS：`39.105.42.85`；SSH 私钥仅在本机安全存储，不写入仓库。
- Docker Engine `26.1.3` + Compose `v2.27.0` 已安装。
- 部署目录：`/srv/projects/Multi-Publish/deploy/logto`。
- Logto `1.41.0` 与 PostgreSQL `16-alpine` 均为 `healthy`。
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
- Nginx 配置检查通过，公网 443 可访问，两个容器健康。

## 管理控制台

Admin Console 不直接暴露公网。首次初始化或日常管理时，从本机建立 SSH 隧道：

```powershell
ssh -i <本机私钥路径> -L 3022:127.0.0.1:3022 root@39.105.42.85
```

保持该终端运行，在浏览器打开 `http://127.0.0.1:3022/console/welcome`。完成初始化后继续使用同一隧道访问管理控制台。

## 后续配置

1. 在 Admin Console 创建 Multi-Publish Native App，配置 Electron 回环回调地址与 PKCE。
2. 创建 API Resource 和 scopes，至少覆盖 `publish:submit`、`publish:read`、`account:manage`、`cloud:publish`。
3. 将应用端 `LOGTO_ENDPOINT` 设置为 `https://auth.iart.work`，并填写真实 `LOGTO_APP_ID` 与 API Resource。
4. 若启用手机验证码，在 Logto 中接入选定的短信 connector；短信供应商不属于本次部署范围。
