# Logto 生产就绪测试计划

> 日期：2026-07-21  
> 状态：`PASS`（本地实现）；生产验收 `PENDING_EXTERNAL`

## 1. TDD 场景矩阵

| 模块 | 正常 | 异常 | 边界/并发 |
|------|------|------|-----------|
| 配置校验 | 完整 shadow/required 配置通过 | 缺 Secret、非法 URL、同库、生产自动迁移失败 | 空白值、弱密码、矛盾开关 |
| migration runner | 顺序执行并在同一事务记录 checksum | SQL 失败、checksum 漂移、ledger 多余文件 | advisory lock、重复执行幂等、事务回滚 |
| repository readiness | 连接和六张表存在 | DB 失败、缺表、无 ledger | 不执行任何 DDL |
| OIDC readiness | discovery/同源 JWKS/RSA key | issuer 不匹配、跨源、HTTP、超时 | 并行 probe、响应不泄密 |
| HTTP ready | 全部正常返回 200 | 任一失败返回 503 | 无认证可探测、查询参数不改变路由、health 不受影响 |
| 部署合同 | API Compose 配置挂载到实际 config 路径 | 旧 `/app/config` 死挂载被拒绝 | API Key 状态和可选 JSON 配置跨容器重启保持 |
| production smoke | discovery/JWKS/health/ready 全过 | HTTP 非 2xx、非法 JSON、超时 | 可选 `/me` token、JSON 输出 |
| backup/restore | stdout descriptor 双库 dump + 三工件硬链接原子发布 + manifest + 空目标预检 + `--verify-only` + 完成状态 | dump/restore/`fsync` 失败、checksum 错、非空目标、状态路径冲突、不支持硬链接 | 私有权限、锁内提交、源/目标路径替换、状态目录同步、锁存在时拒绝恢复、只校验不连库、目标重复、部分恢复不得切换 |
| entitlement | quota 内成功 | quota 用尽 429 | quota=1 并发只成功一次 |
| Webhook | 首次执行副作用 | 事务失败可重试 | 同 event 并发只有一次副作用 |

## 2. 测试层级

1. 纯函数单元测试：配置解析、URL/Secret 规则、manifest/checksum。
2. 真实进程测试：CLI 退出码、migration runner 参数、smoke 本地 HTTP server。
3. API 集成测试：真实 `PublishApiServer` 的 `/health` 与 `/ready`。
4. PostgreSQL 集成测试：有 `TEST_POSTGRES_URL` 时运行真实 migration、并发额度和恢复演练；无变量时明确 SKIP。
5. 外部验收：有真实 Logto 租户时运行 smoke 和桌面登录清单。

## 3. 完成门禁

- 新测试先失败且失败原因是功能缺失。
- `npm test -w @multi-publish/api-publish-engine` 全量通过。
- 配置和部署合同测试纳入全量 runner，不能单独手工执行后遗漏。
- `git diff --check` 通过。
- 独立代码审查无 CRITICAL/MAJOR。
- 外部凭据未提供时，相关项标记 `PENDING_EXTERNAL`，不能写成 PASS。

## 3.1 本地实现证据

- 配置、migration、readiness、smoke、备份恢复、监控、配置持久化挂载和容器合同测试均纳入 API 全量 runner。
- API 全量 runner 共发现 77 个测试文件：69 个直接执行测试和 8 个 Vitest 文件（24 个测试），全部通过。
- 备份恢复专项共 28 个 Node 测试（含父测试）：25 passed、3 skipped。Windows 实际通过 stdout descriptor、普通 inode 替换、源描述符打开后替换、三工件硬链接、目标发布后替换、manifest `fsync`、恢复状态目录同步调用和锁门禁；2 个符号链接测试因普通 Windows 用户无创建权限跳过，Unix 目录 `fsync` 故障注入在 Windows 跳过。
- 30 个本次变更 Node 文件（29 个 `.js` + 1 个无扩展名 `bin/publish-api`）通过 `node --check`；6 个变更 YAML 和 1 个基线 Logto Compose 通过解析；Logto + monitoring 与业务 API Compose 配置均通过 `docker compose config --quiet`。
- Docker deps 阶段已在只复制根 manifest/lockfile 和目标 workspace manifest 的最小上下文中执行同参数 `npm ci --dry-run --offline`，解析 42 个包并退出 0。真实镜像构建因本机 Docker Desktop daemon 未启动保持 `PENDING_ENVIRONMENT`，未冒充通过。
- `TEST_POSTGRES_URL` 未提供时，真实 PostgreSQL migration、恢复演练和并发压力保持 `PENDING_EXTERNAL`；不伪造集成通过。
