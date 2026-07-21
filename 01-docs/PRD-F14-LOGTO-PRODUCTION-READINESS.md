# F14 Logto 生产就绪 PRD

> 状态：`PASS`（本地实现）；生产验收 `PENDING_EXTERNAL`  
> 日期：2026-07-21  
> 关联：[PRD.md](./PRD.md)、[ARCH-F14-logto-user-system.md](./ARCH-F14-logto-user-system.md)

## 1. 一句话需求

把已完成的 Logto 用户系统从“本地代码可用”推进到“可配置、可迁移、可探测、可备份、可灰度、可回滚、可验收”的生产就绪状态。

## 2. 目标用户

| 用户 | 目标 |
|------|------|
| 运维/发布负责人 | 在没有阅读源码的情况下完成配置、迁移、部署、检查和回滚 |
| 后端工程师 | 明确数据库 schema 版本、启动边界和故障码 |
| QA | 用同一套 smoke 命令验证测试、预发布和生产环境 |
| 安全负责人 | 确认 Secret 不落库、不进镜像、不出现在探针和日志中 |

## 3. P0 范围

1. **生产配置合同**：提供完整 `.env.example` 和离线校验命令；缺少 URL、数据库、Webhook、权益签名等关键配置时 fail closed。
2. **版本化迁移**：按文件顺序执行 PostgreSQL migration，使用 advisory lock 防止多实例并发迁移，记录文件名和 SHA-256；已执行 migration 被修改时拒绝继续。
3. **启动 DDL 边界**：开发环境可显式自动初始化；生产环境要求 `BUSINESS_DATABASE_AUTO_MIGRATE=false`，应用只检查 schema，不在启动期间修改数据库。
4. **深度就绪探针**：`/api/v1/ready` 检查业务 PostgreSQL、migration 状态、OIDC Discovery 和 JWKS；失败返回 503 和脱敏错误码。
5. **可执行 smoke 验收**：检查 Logto discovery/JWKS、API liveness/readiness；可选 Bearer Token 检查 `/api/v1/me`。
6. **备份与恢复校验**：停写确认后分别备份 Logto DB 和业务 DB，`pg_dump` 通过预先打开的私有文件描述符输出，三个备份工件用硬链接原子发布并生成带一致性模式的 SHA-256 manifest；提供恢复前校验、隔离目标、私有文件权限、并发锁和明确的破坏性确认门槛。真实恢复必须把进度写入备份目录之外的状态文件，只有两个数据库均完成且状态为 `complete` 才允许切换。
7. **监控告警**：提供 Prometheus/blackbox 示例，至少覆盖 API ready、OIDC discovery、连续失败和高延迟。
8. **灰度与回滚**：提供 shadow、required、rollback 三阶段检查清单；回滚只切认证开关，不删除身份和 migration 数据。
9. **高风险回归测试**：覆盖并发额度扣减和并发重复 Webhook；所有测试由 API 全量测试入口真实等待。

## 4. P1 范围

- 在有真实 Logto 租户和 PostgreSQL 的 CI 环境运行 production smoke。
- 以至少 50 个并发请求验证额度扣减只允许限额内请求成功。
- 定期自动恢复备份到隔离数据库并校验关键表和行数。

## 5. 明确不做

- 不在仓库中创建真实 Logto 租户、云数据库或短信供应商账号。
- 不提交任何真实密码、Webhook signing key、权益私钥或 Access/Refresh Token。
- 不实现短信验证码发送服务；它由 Logto connector 或成熟付费 API 承担。
- 不新增组织/团队 UI。本轮继续以验证后的 `sub` 作为业务资源 owner。
- 不把真实外部服务未执行的结果标记为 PASS。

## 6. 验收标准

- 配置校验对缺失 Secret、HTTP 公网 issuer、弱数据库口令、生产自动迁移和矛盾认证开关返回非零退出码。
- 两个 migration runner 并发启动时只有一个持锁执行；checksum 漂移被拒绝。
- schema 缺失、数据库不可用、OIDC discovery/JWKS 不合法时 `/api/v1/ready` 返回 503；`/api/v1/health` 仍只表示进程存活。
- readiness 响应和日志不包含数据库 URL、Token、签名 key、邮箱或手机号。
- backup 未确认双库写入已暂停时拒绝执行；确认后输出两个独立 dump 和带 `quiesced` 标记的 manifest，校验失败时 restore 不启动。
- backup 使用独占锁且不覆盖已有快照，Unix 输出目录权限必须为 `0700` 且 dump、manifest、锁文件为 `0600`；Windows 目录必须配置仅运行账号可写的 NTFS ACL。`pg_dump` 不接收输出路径，只能写入父进程持有的 descriptor；dump 与 manifest 在完整写入、`fsync` 和身份校验后通过硬链接发布，不支持原子硬链接的文件系统 fail closed。
- manifest 在锁仍持有时最后发布并完成目录同步；恢复端检测到 `.backup.lock` 时必须返回 `BACKUP_IN_PROGRESS`。失败时不留下可被误用的 manifest，进程异常留下的锁必须阻止自动重试和恢复。
- restore 必须逐一确认两个隔离目标数据库名，并在修改任何数据库前验证两个目标都不含业务对象；使用已校验的 dump 文件描述符和单库事务恢复，并在备份目录之外独占创建状态文件。已有完成、失败或进行中状态时拒绝覆盖。任一库失败时只生成 `failed` 状态，整个临时恢复集不得切换；只有包含两个已恢复数据库且状态为 `complete` 的记录可供切换自动化使用。
- smoke 命令任一关键检查失败即非零退出；输出 JSON 可被 CI 和监控读取。
- API Docker 镜像使用根 lockfile 构建，并包含 production scripts 与 PostgreSQL migrations。
- API Compose 的配置持久化挂载必须覆盖运行时实际读写目录，容器重启后 API Key 状态不得丢失。
- 并发额度测试在 quota=1 时恰好一个成功；同一 Webhook 并发投递只执行一次副作用。
- Node API 全量测试、`git diff --check`、安全审查和 `.quality-gates.md` 自检通过。

## 7. 外部验收门禁

以下项目在没有真实环境变量/凭据时明确保持 `PENDING_EXTERNAL`，不能以本地测试替代：

1. 真实 Logto 登录、刷新、退出、账号切换和短信验证码。
2. 真实 PostgreSQL migration、备份恢复和并发压力。
3. 真实云端发布、用户暂停/删除后的会话撤销。

仓库交付的目标是把这些步骤变成“一条命令可执行、结果可审计”，不是代替外部账号和审批。
