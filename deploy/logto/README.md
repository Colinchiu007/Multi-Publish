# Multi-Publish Logto 部署

该目录提供与 Multi-Publish 身份架构匹配的 Logto 1.41.0 + PostgreSQL 16 样例。Logto 负责 OIDC 身份、会话、MFA 和账户资料；业务用户、订阅、权益、用量和资源归属仍由业务 API 持有。业务 API 使用独立的 `BUSINESS_DATABASE_URL`，不要复用 Logto 的 `DB_URL`。

## 安全边界

- `.env.example` 不提供密码、client secret、签名密钥或管理员初始凭据。复制成 `.env` 后必须自行生成 `LOGTO_DB_PASSWORD`（建议 32 位以上、仅字母数字），Compose 会拒绝空值。
- Compose 默认把 3001/3002 都绑定到 `127.0.0.1`。生产环境应通过同机可信反向代理暴露 `LOGTO_ENDPOINT`（3001），并对 `LOGTO_ADMIN_ENDPOINT`（3002）实施管理员访问控制；不要把 3002 直接暴露到公网。
- `TRUST_PROXY_HEADER` 默认关闭。只有可信反向代理覆盖 `X-Forwarded-*` 时，才在 `.env` 设置 `LOGTO_TRUST_PROXY_HEADER=1`；代理必须清理外部同名请求头。
- PostgreSQL 卷、Logto 配置和业务数据库需要分别备份。不要把 Logto Management API Token 或 webhook signing key 放进桌面端。
- 备份/恢复主机必须安装兼容版本的 `psql`、`pg_dump` 和 `pg_restore`。备份卷必须支持同目录硬链接；`pg_dump` 通过私有 descriptor 输出，dump 与 manifest 完整写入后才原子发布，不支持硬链接时 fail closed。Unix 输出目录要求 `0700`、备份与状态文件为 `0600`；Windows 上必须使用 NTFS 并另设仅运行账号可写的 ACL。恢复校验发现 `.backup.lock` 时拒绝执行。

## 首次启动

```text
cd deploy/logto
copy .env.example .env
```

编辑 `.env`，填写随机数据库密码和两个 HTTPS 地址，然后启动：

```text
docker compose --env-file .env up -d
docker compose ps
docker compose logs -f logto
```

Compose 会等待 PostgreSQL `pg_isready` 成功，再启动 Logto。Logto 容器的健康检查访问 OIDC discovery；因此健康不代表业务 API 已接入，只代表数据库迁移完成且 OIDC 端点可响应。

业务 API 的 Dockerfile 和 Compose 健康检查访问 `/api/v1/ready`，数据库 schema、migration 或 OIDC/JWKS 任一未就绪时容器保持 unhealthy。启用 `docker-compose.monitoring.yml` 前还必须把 `monitoring/alertmanager.example.yml` 复制到受控路径、替换示例通知地址，并单独设置 `ALERTMANAGER_CONFIG_FILE`；该变量不在基础 `.env.example` 中，缺失时 monitoring overlay 会 fail closed。

监控 Compose 是叠加层，禁止单独启动；必须与基础 Logto Compose 合并：

```text
docker compose -f deploy/logto/docker-compose.yml -f deploy/logto/docker-compose.monitoring.yml --env-file deploy/logto/.env up -d
```

## 启动业务 API

复制 `api.env.example` 为业务 API 的 Secret Store 模板。以下 Node 命令仍从 `deploy/logto` 目录执行，因此使用 `../../packages/...` 路径。先执行配置门禁：

```text
node ../../packages/api-publish-engine/scripts/validate-production-config.js --phase shadow
```

生产环境必须先执行版本化迁移，再启动 API。应用在 `NODE_ENV=production` 下不会自动建表；migration CLI 不接受任意目录：

```text
node ../../packages/api-publish-engine/scripts/migrate-postgres.js --dry-run
node ../../packages/api-publish-engine/scripts/migrate-postgres.js
```

在业务 API 的 Secret Store 配置以下变量后运行 `../../packages/api-publish-engine/bin/publish-api`：

```text
IDENTITY_AUTH_ENABLED=true
LOGTO_ENDPOINT=https://id.example.com
LOGTO_API_RESOURCE=https://api.multi-publish.com
BUSINESS_DATABASE_URL=postgresql://multi_publish:<password>@db.example.com:5432/multi_publish
LOGTO_WEBHOOK_SIGNING_KEY=<Logto Webhook signing key>
LOGTO_WEBHOOK_MAX_EVENT_AGE_SECONDS=900
LOGTO_WEBHOOK_MAX_FUTURE_SKEW_SECONDS=300
ENTITLEMENT_KEY_ID=entitlement-2026-01
ENTITLEMENT_PRIVATE_KEY=<RSA private key, server only>
```

若使用 `packages/api-publish-engine/docker-compose.yml` 启动业务 API，先创建其相对路径的 `config/` 目录，并确保 Linux 主机上该目录可由容器 UID `1001` 写入。Compose 会把它挂载到 `/app/packages/api-publish-engine/config`，这是 API Key 哈希和可选 `publish-api.json` 的实际读写目录；不要挂载到无消费者的 `/app/config`，否则容器重启可能丢失 API Key 状态。

API 入口在开发模式可自动创建 `identity_*` 表；生产模式只检查 schema readiness。迁移系统使用 `migrations/postgresql/002_logto_identity.sql` 和 `003_logto_webhook_events.sql`，并在 `identity_schema_migrations` 记录 checksum；根目录同名脚本是本地 SQLite 兼容版本，不能在 PostgreSQL 执行。缺少业务数据库、issuer 或 audience 时会 fail closed，不会静默退回 API Key 模式。`ENTITLEMENT_PRIVATE_KEY` 只用于签发绑定 `sub + device_id` 的短期离线快照，绝不能打包到 Electron；桌面端仅配置对应公钥 `ENTITLEMENT_PUBLIC_KEY`。

验证 discovery：

```text
curl -fsS "%LOGTO_ENDPOINT%/oidc/.well-known/openid-configuration"
```

验证 API 存活和就绪（`health` 不访问外部依赖，`ready` 会检查业务数据库、migration 和 OIDC/JWKS）：

```text
curl -fsS http://127.0.0.1:3000/api/v1/health
curl -fsS http://127.0.0.1:3000/api/v1/ready
node ../../packages/api-publish-engine/scripts/production-smoke.js --logto "%LOGTO_ENDPOINT%" --api http://127.0.0.1:3000
```

首次打开 `LOGTO_ADMIN_ENDPOINT` 完成管理员初始化。创建 Native Application（桌面端）和业务 API Resource 时，记录 issuer、audience 和 redirect URI；桌面端只保存公开的 endpoint/app id，不保存 client secret。

## Webhook 配置

在 Logto Console 创建 Web Hook，URL 指向业务 API 的公开地址，例如：

```text
https://api.example.com/api/v1/auth/logto/webhook
```

启用以下事件：

- `User.Created`
- `User.Data.Updated`
- `User.SuspensionStatus.Updated`
- `User.Deleted`

将 Logto 生成的 signing key 写入业务 API 的 Secret Store（例如 `LOGTO_WEBHOOK_SIGNING_KEY`），不要写入仓库、Compose 文件或桌面应用。业务 API 必须对原始请求体使用 `logto-signature-sha-256` 做 HMAC-SHA256 恒时比较；事件处理和幂等记录使用同一数据库事务。默认拒绝超过 15 分钟的事件和超前服务器时间 5 分钟以上的事件，可用上述两个秒数变量按实际投递延迟调整。

Logto 当前 webhook payload 没有独立 delivery id，Multi-Publish 使用 payload 原文 SHA-256 作为幂等回退键，同时兼容未来 payload 的 `eventId` 字段。Logto Console 的测试请求使用 fake payload，会被验签后忽略且不会创建业务用户。

## 运行检查与停止

```text
docker compose ps
docker inspect --format "{{json .State.Health}}" multi-publish-logto-logto-1
docker compose down
```

生产就绪架构、备份校验、恢复状态机器门禁、监控和灰度回滚步骤见 `01-docs/ARCH-F14-LOGTO-PRODUCTION-READINESS.md` 和 `01-docs/TEST-PLAN-LOGTO-PRODUCTION.md`。真实恢复必须提供备份目录之外的 `--state-file`，切换前运行 `postgres-restore.js --verify-state`；真实 Logto、PostgreSQL 和云端验收没有凭据时保持 `PENDING_EXTERNAL`。

`docker compose down` 不会删除 PostgreSQL 卷。只有确认完成备份且需要销毁租户数据时，才显式执行 `docker compose down -v`。

完整的备份、恢复演练、监控、shadow/required 灰度和回滚步骤见 [RUNBOOK-LOGTO-PRODUCTION.md](../../01-docs/RUNBOOK-LOGTO-PRODUCTION.md)。
