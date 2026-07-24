# Logto 生产部署、灰度与回滚 Runbook

> 日期：2026-07-21  
> 适用范围：Logto、业务 PostgreSQL、`@multi-publish/api-publish-engine`

## 1. 发布前

1. 在 Secret Store 配置 `deploy/logto/.env.example` 和 `api.env.example` 对应变量，不创建带真实值的仓库文件。
2. 确认 Logto DB 与业务 DB 的主机/数据库组合不同。
3. 生成 2048 位以上 RSA entitlement 私钥，私钥仅进入业务 API Secret Store。
4. shadow 阶段运行：

```text
node packages/api-publish-engine/scripts/validate-production-config.js --phase shadow
node packages/api-publish-engine/scripts/migrate-postgres.js --dry-run
node packages/api-publish-engine/scripts/migrate-postgres.js
```

任一命令非零退出即停止发布。

migration CLI 只使用构建产物内的固定目录，不接受任意 `--directory`。独立制品必须由受控 Secret Store 提供只读的 `BUSINESS_DATABASE_MIGRATIONS_DIR`。

## 2. 备份

运行主机必须安装与 PostgreSQL 主版本兼容的 `psql`、`pg_dump` 和 `pg_restore`。双库无法共享同一个 PostgreSQL snapshot；生成生产恢复点前，必须先把业务 API 从负载均衡摘除、暂停排期任务，并冻结 Logto 登录注册和管理员写操作。等待在途写请求结束后再执行：

备份输出目录必须是本地或支持同目录硬链接的文件系统。Unix 先创建权限为 `0700` 的新目录；Windows 使用 NTFS，并通过 ACL 只授予备份运行账号写权限。网络盘、FAT 或不支持硬链接的卷会返回 `BACKUP_ATOMIC_PUBLISH_UNSUPPORTED`，不得绕过或改用非原子复制。

```text
set LOGTO_DATABASE_URL=postgresql://...
set BUSINESS_DATABASE_URL=postgresql://...
set BACKUP_OUTPUT_DIRECTORY=D:\secure-backups\2026-07-21
node deploy/logto/scripts/postgres-backup.js --confirm-writes-paused
```

未提供 `--confirm-writes-paused` 时命令以退出码 `2` 拒绝执行。成功结果包含 `logto.dump`、`business.dump` 和 `manifest.json`，manifest 会记录 `quiesced` 一致性模式。输出目录必须是新的空目录，失败不会留下可用 manifest；把三者作为同一个不可变备份集保存，不要单独移动 dump。

脚本先用 `O_EXCL` 打开随机私有临时文件，再把 `pg_dump` stdout 直接连接到该 descriptor；外部进程不会收到输出路径。两个 dump 完整写入、`fsync` 和 SHA-256 完成后以硬链接原子发布，manifest 最后在 `.backup.lock` 仍持有时发布并同步目录。Unix dump、manifest 和锁为 `0600`；Windows 的 `chmod` 不等价于 ACL，必须依赖前述受限 NTFS 目录。

若进程被强制终止而遗留 `.backup.lock` 或 `.partial`，即使三个最终文件看似齐全，`--verify-only` 也会返回 `BACKUP_IN_PROGRESS`。自动重试和恢复必须停止。确认没有备份进程、检查作业日志并隔离整个输出目录后，再创建一个全新的空目录重跑；不要自动删除未知锁或复用残留 dump。备份成功后才能恢复流量。备份任务至少每日一次，保留 30 天；调度平台必须把“停写、备份、恢复流量”作为同一作业。每月至少在隔离数据库执行一次恢复演练。

## 3. 启动和 smoke

以下命令均从仓库根目录执行：

```text
docker compose -f deploy/logto/docker-compose.yml --env-file deploy/logto/.env up -d
docker compose -f deploy/logto/docker-compose.yml --env-file deploy/logto/.env ps
```

本机裸进程诊断与生产 Compose 是两条互斥路径，不要同时启动。选择裸进程诊断时，API 默认监听 `3000`：

```text
node packages/api-publish-engine/bin/publish-api --port 3000
node packages/api-publish-engine/scripts/production-smoke.js --logto https://id.example.com --api http://127.0.0.1:3000
```

需要容器化运行时，从仓库根目录执行。Compose 将容器内的 `3000` 固定映射到宿主机回环 `3030`，因此该路径的 smoke 必须访问 `3030`：

```text
docker compose -f packages/api-publish-engine/docker-compose.yml --env-file deploy/logto/api.env up -d
node packages/api-publish-engine/scripts/production-smoke.js --logto https://id.example.com --api http://127.0.0.1:3030
```

该 Compose 的 `./config` 必须预先创建，并在 Linux 主机上授权给容器 UID `1001`。它挂载到 `/app/packages/api-publish-engine/config`，与 `ApiKeyManager` 和默认配置文件路径一致；不要改回 `/app/config`。监控 overlay 也不能单独启动，必须和基础 Logto Compose 一起传给 `docker compose -f`。

`/api/v1/health` 只表示进程存活；只有 `/api/v1/ready` 返回 200 才能把实例加入负载均衡。

## 4. 灰度

### Shadow

```text
IDENTITY_AUTH_ENABLED=true
IDENTITY_AUTH_REQUIRED=false
BUSINESS_DATABASE_AUTO_MIGRATE=false
```

确认真实登录、刷新、退出、账号切换、Webhook 和云端发布后，观察至少一个完整业务高峰。API ready、OIDC discovery、401/403、Webhook 失败和额度拒绝均在预期范围内才进入 required。

### Required

```text
IDENTITY_AUTH_ENABLED=true
IDENTITY_AUTH_REQUIRED=true
BUSINESS_DATABASE_AUTO_MIGRATE=false
```

切换前运行 `validate-production-config.js --phase required`。旧 API Key 立即撤销；已排期任务会在执行前重新验证 owner。

## 5. 回滚

回滚只改变认证流量，不回滚或删除 schema：

1. 设置 `IDENTITY_AUTH_REQUIRED=false`，保持 `IDENTITY_AUTH_ENABLED=true`。
2. 运行 `validate-production-config.js --phase rollback`。
3. 如业务必须继续，仅在受限内部网络临时恢复单独 API Key，并设置撤销时间。
4. 回退桌面客户端。
5. 重新运行 `/health`、`/ready` 和 production smoke。

禁止重新启用共享 `JWT_SECRET`，禁止删除 `auth_subject`、Webhook 事件或 `identity_schema_migrations`。

## 6. 恢复演练

默认只验证 manifest，不连接数据库，也不会执行 `pg_restore`：

```text
set BACKUP_MANIFEST=D:\secure-backups\2026-07-21\manifest.json
node deploy/logto/scripts/postgres-restore.js --verify-only
```

命令退出码为 `0` 才表示 `.backup.lock` 不存在、两个 dump 文件存在、checksum 与 manifest 一致，并且备份是在停写确认后生成。真正恢复属于破坏性操作，必须使用两个新建且未接入任何流量的隔离目标数据库，并逐一确认目标数据库名。从空库预检开始，直到两个数据库恢复、状态变为 `complete` 且 smoke 结束，部署平台必须通过网络策略、连接权限或维护模式确保只有恢复账号能够连接；脚本无法阻止不遵守维护协议的外部客户端在 `psql` 预检与 `pg_restore` 之间写入。`RESTORE_STATE_FILE` 必须位于备份目录之外的受限运维目录；Windows 主机同样需要为该目录设置仅运行账号可写的 NTFS ACL：

```text
set BACKUP_MANIFEST=D:\secure-backups\2026-07-21\manifest.json
set RESTORE_STATE_FILE=D:\secure-restore-state\2026-07-21.json
set LOGTO_DATABASE_URL=postgresql://.../isolated_logto
set BUSINESS_DATABASE_URL=postgresql://.../isolated_business
node deploy/logto/scripts/postgres-restore.js --state-file "%RESTORE_STATE_FILE%" --confirm-logto-database isolated_logto --confirm-business-database isolated_business
```

脚本先使用 `psql` 验证两个隔离目标都没有用户 schema 中的业务对象；任一非空或无法检查时，在执行任何 `pg_restore` 前失败。随后从重新校验 checksum 的只读文件描述符执行 `pg_restore --single-transaction --exit-on-error`，避免校验后路径被替换。

运行期间会独占创建 `%RESTORE_STATE_FILE%.in-progress`。Unix 会在创建进行中状态、发布成功/失败终态和移除进行中状态后同步状态目录；Windows 的目录项耐久性依赖受限 NTFS 卷。任意一个数据库恢复失败时，只生成 `%RESTORE_STATE_FILE%.failed`，整个恢复集均视为失败：立即销毁两个隔离目标数据库，重新创建后使用新的状态文件从头恢复，禁止复用已部分恢复的目标。`.in-progress`、`.failed`、缺失或不可解析状态一律禁止切换；状态文件不是数据库回滚机制。

两个数据库都成功后，再运行 migration dry-run、真实登录/Webhook 一致性检查和 production smoke。所有检查通过后，切换自动化还必须执行以下机器门禁；只有退出码为 `0` 才能由数据库平台原子切换连接配置：

```text
node deploy/logto/scripts/postgres-restore.js --verify-state --state-file "%RESTORE_STATE_FILE%"
```

`--verify-state` 会重新校验 manifest/dump、状态文件中的 manifest SHA-256、两个完成库和冲突工件，不需要数据库 URL 或密码。不得直接对生产主库试验恢复。

## 7. 监控

先将 `monitoring/alertmanager.example.yml` 复制到受控路径并替换 webhook 地址，再设置：

```text
set ALERTMANAGER_CONFIG_FILE=D:\secure-config\alertmanager.yml
docker compose -f deploy/logto/docker-compose.yml -f deploy/logto/docker-compose.monitoring.yml --env-file deploy/logto/.env up -d
```

Prometheus 仅绑定 `127.0.0.1:9090`。生产环境通过受控运维通道访问，不直接暴露公网。默认探测业务 API 的宿主机回环 `3030` 端口和 Compose 内 Logto；变更部署拓扑时必须同步修改 Compose 和 `monitoring/prometheus.yml`。

不要直接使用示例通知地址。备份超时告警由生产调度平台接入，未接入前保持 `PENDING_EXTERNAL`。

## 8. 外部验收状态

没有真实 Logto 租户、真实 PostgreSQL 和云发布环境时，以下状态保持 `PENDING_EXTERNAL`：登录/刷新/退出/切换、真实 migration/恢复、并发压力、真实 Webhook 重试及云端发布撤销。仓库测试通过不能替代这些证据。
