# F14 Logto 生产就绪架构

> 状态：`PASS`（本地实现）；生产验收 `PENDING_EXTERNAL`  
> 日期：2026-07-21  
> 关联：[ARCH-F14-logto-user-system.md](./ARCH-F14-logto-user-system.md)

## 1. 方案比较

| 方案 | 优点 | 缺点 | 结论 |
|------|------|------|------|
| 应用启动自动建表 | 开发简单 | 多实例竞态、无版本、无法审计、权限过大 | 仅保留给显式开发模式 |
| 独立 migration runner + 应用只读检查 | 版本可追踪、可锁、可审计、最小权限 | 部署多一步 | 采用 |
| 引入完整第三方迁移框架 | 功能丰富 | 新依赖和迁移成本高 | 当前不采用 |

选择独立 Node runner，复用已有 `pg`，不新增运行时依赖。

## 2. 组件与数据流

```text
deploy pipeline
  -> validate-production-config
  -> migrate-postgres (advisory lock + checksum ledger)
  -> start publish-api (no startup DDL)
  -> GET /api/v1/health       process alive
  -> GET /api/v1/ready        DB schema + OIDC discovery + JWKS
  -> production-smoke         machine-readable release evidence

backup job
  -> quiesce Logto + business writes
  -> create private random temp files and hold descriptors
  -> pg_dump logto/business DB stdout directly into descriptors
  -> fsync + SHA-256, then hard-link both complete dumps atomically
  -> hard-link manifest last while lock is held (consistency=quiesced)
  -> fsync directory, release lock
  -> verify manifest before any restore
  -> acquire an exclusive restore state path outside the backup set
  -> isolate both targets from all non-restore clients and verify no user objects
  -> restore both dumps to fresh isolated DBs (single transaction per DB)
  -> publish restore-state.json status=complete
  -> validate both and verify complete state, then switch connection configuration
```

## 3. 配置边界

生产配置由 `deploy/logto/api.env.example` 定义。校验器只读取环境变量，不打印值。关键规则：

- `IDENTITY_AUTH_REQUIRED=true` 必须同时有 `IDENTITY_AUTH_ENABLED=true`。
- 生产 Logto endpoint/issuer 必须是 HTTPS；仅 loopback 开发环境允许 HTTP。
- `BUSINESS_DATABASE_AUTO_MIGRATE=false` 是生产默认门禁。
- `BUSINESS_DATABASE_URL` 与 Logto `DB_URL` 必须指向不同数据库名。
- Webhook signing key、权益 RSA 私钥和 operations token 只来自 Secret Store。

## 4. Migration 协议

1. runner 使用单一 PostgreSQL session 获取固定 advisory lock。
2. 创建 `schema_migrations(name, checksum, applied_at)` ledger。
3. 按 migration 文件名字典序执行尚未记录的 SQL。
4. 已记录文件的 SHA-256 与当前内容不一致时立即失败。
5. runner 去除 migration 文件最外层的 `BEGIN/COMMIT` 外壳，在同一事务内执行 migration body 和 ledger INSERT；checksum 仍基于原文件完整字节计算。没有标准事务外壳的 SQL 也由 runner 统一包裹。
6. 数据库变更 forward-only；回滚应用版本时不删除表或列。

应用启动路径：

- `BUSINESS_DATABASE_AUTO_MIGRATE=true`：仅用于本地开发/兼容模式，调用现有 `initialize()`。
- `false`：调用 `assertReady()` 检查连接、关键表和 migration ledger，不执行 DDL。

## 5. 就绪状态机

```text
starting -> checking -> ready
                    -> not_ready

not_ready --下一次探测成功--> ready
ready --DB/OIDC/JWKS失败--> not_ready
```

`/health` 不访问外部依赖，始终用于 liveness。`/ready` 通过注入的 readiness probe 并行检查：

- `database`: `SELECT 1`
- `schema`: 六张 `identity_*` 表和 migration ledger
- `oidc`: issuer 完全匹配的 discovery
- `jwks`: 同源 HTTPS URL 且至少一个可验签 RSA key

响应只返回组件状态和稳定错误码；具体异常只进入脱敏服务端日志。

## 6. 安全与故障处理

- 所有外部请求使用超时和 AbortController。
- discovery 的 `issuer` 必须精确匹配配置；`jwks_uri` 必须同源并使用 HTTPS，loopback 测试除外。
- migration runner CLI 只读取构建产物内固定目录中的 `NNN_*.sql`；独立部署可通过受控 Secret Store 注入 `BUSINESS_DATABASE_MIGRATIONS_DIR`，不得来自请求参数。
- 备份命令使用参数数组且 `shell:false`，密码只通过子进程环境传递；`pg_dump` stdout 直接绑定父进程以 `O_EXCL` 打开的 descriptor，不把可被替换的输出路径交给外部进程。
- backup 只有在显式确认 Logto 与业务写入均已暂停后才生成 `quiesced` manifest；Unix 输出目录要求 `0700`，dump、manifest 和锁文件为 `0600`，Windows 依赖 Runbook 要求的受限 NTFS ACL。
- 随机临时文件完整写入并 `fsync` 后，使用同目录硬链接把 dump 原子发布到最终文件名；不支持硬链接时返回 `BACKUP_ATOMIC_PUBLISH_UNSUPPORTED`，禁止退回到可见半成品复制。manifest 是最后一个硬链接工件，发布和目录 `fsync` 全程持有 `.backup.lock`。
- 未确认、并发执行、目录非空、路径身份变化或残留状态时 backup fail closed。恢复校验发现 `.backup.lock` 时返回 `BACKUP_IN_PROGRESS`，因此进程崩溃留下的外观完整快照不能自动进入恢复。
- restore 只接受 `quiesced` manifest，要求显式确认两个隔离目标数据库，并以 `--single-transaction --exit-on-error` 恢复。
- restore 在修改任何数据库前使用 `psql` 检查两个目标都没有业务对象；从该预检到恢复和 smoke 完成，部署编排层必须阻止非恢复客户端连接，因为脚本无法锁住不遵守协议的外部写入者。脚本不持有集群级 `CREATE/DROP DATABASE` 权限，目标创建及失败后的双库销毁由部署编排层负责，`failed` 或 `in-progress` 状态是强制销毁且禁止切换的机器信号。
- 恢复状态文件必须位于备份目录之外；同一路径的 `complete`、`failed`、`in-progress` 任一工件已存在时拒绝覆盖。进行中标记兼作独占锁，内容只包含稳定状态、manifest 摘要和目标数据库名，不包含 URL、用户名或密码。Unix 在状态创建、终态发布和进行中状态移除后同步父目录。
- manifest 与 dump 必须是普通文件；实际恢复从重新校验过 checksum 的同一只读文件描述符输入 `pg_restore`，避免校验后路径被替换。
- 任一库失败时只发布 `failed` 状态并记录已经恢复的逻辑库；两个临时目标都必须销毁。只有两个库均成功后才发布 `complete`，切换自动化必须拒绝缺失、不可解析、`failed` 或 `in-progress` 状态。
- ready 失败返回 503，不能让实例接流；liveness 仍返回 200，避免依赖短暂故障触发重启风暴。业务 API 容器健康检查使用 `/ready`，并按 pathname 路由，因此探针附带查询参数也不会误入认证路径。

## 7. 可观测性

- blackbox probe 监控 `/api/v1/ready` 和 OIDC discovery。
- 本仓库告警覆盖连续 3 次 ready 失败、OIDC 连续失败、探针指标缺失和探测延迟超过 2 秒。备份超过 25 小时未成功依赖部署平台的作业指标，保持 `PENDING_EXTERNAL`。
- Prometheus 将告警发送到独立 Alertmanager；`monitoring/alertmanager.example.yml` 只提供脱离仓库配置的占位模板，部署前必须替换通知地址并设置 `ALERTMANAGER_CONFIG_FILE`。
- smoke 输出 JSON，包括检查名、状态、耗时和稳定错误码，不包含 URL 中的凭据或响应正文。
- 业务 API Compose 的 `./config` 必须挂载到 `/app/packages/api-publish-engine/config`，覆盖 `ApiKeyManager` 和默认 `publish-api.json` 的实际读写目录；`/app/config` 没有对应消费者，禁止作为持久化目标。

## 8. 灰度与回滚

| 阶段 | 配置 | 进入条件 |
|------|------|----------|
| shadow | enabled=true, required=false | migration、ready、smoke 全绿 |
| required | enabled=true, required=true | 真实登录和错误率观察通过 |
| rollback | enabled=true, required=false | 保留 schema，仅临时恢复受限 API Key |

禁止以关闭 `IDENTITY_AUTH_ENABLED` 作为常规回滚，因为这会同时关闭 Logto verifier 和深度身份检查。禁止删除 `auth_subject`、Webhook ledger 和 migration ledger。

## 9. 目录

```text
deploy/logto/
  api.env.example
  scripts/
    validate-production-config.js
    production-smoke.js
    postgres-backup.js
    postgres-restore.js
  monitoring/
    prometheus.yml
    alerts.yml
migrations/postgresql/
packages/api-publish-engine/
  scripts/migrate-postgres.js
  src/auth/production-readiness.js
```
