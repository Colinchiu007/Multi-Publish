# Logto 远程部署状态（2026-07-22）

- ECS: `root@39.105.42.85`，SSH 私钥仅在本机安全存储，不写入仓库。
- Docker Engine 26.1.3 + Compose v2.27.0 已安装。
- 服务器磁盘曾满，清理旧 OpenCode 备份/npm/VS Code/cache 后恢复约 9.7GB 空闲。
- Logto 1.41.0 和 PostgreSQL 16-alpine 已启动：`/srv/projects/Multi-Publish/deploy/logto`。
- 容器状态：两项 healthy；Logto 本地端口 `127.0.0.1:3021`，Admin `127.0.0.1:3022`。
- Nginx 已配置 `auth.iart.work` 反向代理到 `127.0.0.1:3021`，配置检查通过。
- DNS 权威服务器为 `ns1.alidns.com` / `ns2.alidns.com`；`auth.iart.work` 当前仍解析到 `198.18.3.101`，未指向 `39.105.42.85`。
- 当前未找到阿里云 AccessKey/STS，ECS 无 RAM 实例角色；不能自动修改 DNS。
- 下一步：在阿里云 DNS 添加 A 记录 `auth` -> `39.105.42.85`（TTL 600）；确认后申请 Let's Encrypt 证书，切换 Logto `ENDPOINT` 到 `https://auth.iart.work` 并做 OIDC/JWKS/回调验证。
- 不要把主账号密钥写入服务器；如需 API 自动化，创建仅 AliDNS 记录管理权限的 RAM 凭据，优先临时 STS。
