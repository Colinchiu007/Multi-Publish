# Logto 生产就绪测试计划

> 日期：2026-07-21，最近生产验收：2026-07-29
> 状态：`PASS`（本地实现）；Webhook POST HTTP 状态码重试 `PASS_REMOTE`；其余生产门禁按本文逐项保留

## 1. TDD 场景矩阵

| 模块 | 正常 | 异常 | 边界/并发 |
|------|------|------|-----------|
| 配置校验 | 完整 shadow/required 配置和 M2M 凭据通过 | 缺 Secret、非法 URL、同库、生产自动迁移失败 | 单边/双空 M2M、空白值、弱密码、矛盾开关 |
| migration runner | 顺序执行并在同一事务记录 checksum | SQL 失败、checksum 漂移、ledger 多余文件 | advisory lock、重复执行幂等、事务回滚 |
| repository readiness | 连接和六张表存在 | DB 失败、缺表、无 ledger | 不执行任何 DDL |
| OIDC readiness | discovery/同源 JWKS/签名 key/同源 introspection | issuer 不匹配、跨源、HTTP、userinfo、重定向、M2M 无效、超时 | 随机无效 token 得到 active=false、并行 probe、响应不泄密 |
| HTTP ready | 全部正常返回 200 | 任一失败返回 503 | 无认证可探测、查询参数不改变路由、health 不受影响 |
| 部署合同 | API Compose 配置挂载到实际 config 路径 | 旧 `/app/config` 死挂载被拒绝 | API Key 状态和可选 JSON 配置跨容器重启保持 |
| production smoke | discovery/JWKS/health/ready/introspection 全过 | HTTP 非 2xx、ready 缺 introspection、非法 JSON、跨源 JWKS、重定向、超时 | JWKS 联网前信任校验、可选 `/me` token、JSON 输出 |
| backup/restore | stdout descriptor 双库 dump + 三工件硬链接原子发布 + manifest + 空目标预检 + `--verify-only` + 完成状态 | dump/restore/`fsync` 失败、checksum 错、非空目标、状态路径冲突、不支持硬链接 | 私有权限、锁内提交、源/目标路径替换、状态目录同步、锁存在时拒绝恢复、只校验不连库、目标重复、部分恢复不得切换 |
| entitlement | quota 内成功 | quota 用尽 429 | quota=1 并发只成功一次 |
| Webhook 消费者 | 首次执行副作用 | 事务失败后同一 payload 可再次消费 | 同 event 并发只有一次副作用、重复与乱序保持较新状态 |
| Logto Webhook 发送端 | 派生镜像首次请求 204 | 前两次 503 后第三次 204；签名错误、目标缺失、运行时哈希漂移 fail closed | 三次均为真实签名 POST；Ky 1.2.3 `TimeoutError` 不计入已覆盖重试 |

## 2. 测试层级

1. 纯函数单元测试：配置解析、URL/Secret 规则、manifest/checksum。
2. 真实进程测试：CLI 退出码、migration runner 参数、smoke 本地 HTTP server。
3. API 集成测试：真实 `PublishApiServer` 的 `/health` 与 `/ready`。
4. PostgreSQL 集成测试：有 `TEST_POSTGRES_URL` 时运行真实 migration、并发额度和恢复演练；无变量时明确 SKIP。
5. 外部验收：有真实 Logto 租户时运行 smoke 和桌面登录清单。
6. Webhook 发送端黑盒：使用独立 signing key 的临时 Hook 和精确 Nginx 路径，接收端按 `503 -> 503 -> 204` 响应；记录 UTC 时间、请求次数和签名有效性，不记录 payload、密钥或用户资料，完成后删除 Hook、路由、进程和日志。

## 3. 完成门禁

- 新测试先失败且失败原因是功能缺失。
- `npm test -w @multi-publish/api-publish-engine` 全量通过。
- 配置和部署合同测试纳入全量 runner，不能单独手工执行后遗漏。
- `git diff --check` 通过。
- 独立代码审查无 CRITICAL/MAJOR。
- 外部凭据未提供时，相关项标记 `PENDING_EXTERNAL`，不能写成 PASS。
- 发送端自动重试必须由真实 Logto 容器的三次 POST 证明；`logto-webhook.test.js` 的消费者手工重放不能替代。

## 3.1 实现与生产证据

- 配置、migration、readiness、smoke、备份恢复、监控、配置持久化挂载和容器合同测试均纳入 API 全量 runner。
- API 全量 runner 共发现 89 个测试文件：81 个直接执行测试和 8 个 Vitest 文件（24 个测试），全部通过；Vitest 固定使用 `--maxWorkers=1 --no-file-parallelism`，避免受限内存环境的 worker OOM。
- Opaque Token 定向回归覆盖 endpoint 信任边界、拒绝 HTTP 重定向、`active/sub/aud/iss/exp`、JWT 兼容、SHA-256 缓存键、并发合并、readiness、503 无回退语义和 loopback HTTP 正向边界；production smoke 还验证跨源 JWKS 在发起请求前被拒绝。
- 备份恢复专项共 28 个 Node 测试（含父测试）：25 passed、3 skipped。Windows 实际通过 stdout descriptor、普通 inode 替换、源描述符打开后替换、三工件硬链接、目标发布后替换、manifest `fsync`、恢复状态目录同步调用和锁门禁；2 个符号链接测试因普通 Windows 用户无创建权限跳过，Unix 目录 `fsync` 故障注入在 Windows 跳过。
- 本轮 16 个变更 JavaScript 文件通过 `node --check`；2 个相关 Compose YAML 通过 `js-yaml` 解析，业务 API Compose 使用完整占位变量执行 `docker compose config -q` 退出码 0；`git diff --check` 通过。
- `npm pack --dry-run --json` 列出 71 个发布文件并包含全部鉴权实现；部署合同按 Dockerfile runner `COPY` 清单构造隔离文件集并加载真实 `src/index.js`，require 链通过。
- 本机 Docker Desktop daemon 未启动，不把本机镜像构建冒充为通过；Webhook 派生镜像已在 ECS 通过磁盘门禁后完成真实 build、Logto 单服务切换、`/ready` 和 production smoke。该证据不替代后续业务 API 新镜像、PostgreSQL 恢复演练或压力测试。
- `TEST_POSTGRES_URL` 未提供时，真实 PostgreSQL migration、恢复演练和并发压力保持 `PENDING_EXTERNAL`；不伪造集成通过。
- `logto-webhook-runtime-patch.test.js` 覆盖唯一目标成功、哈希漂移、目标缺失、重复目标、多文件命中、上游已修复、路径身份漂移、部分写恢复、fd 回收和 symlink 拒绝十类边界；`logto-deploy-contract.test.js` 固定基础镜像、独立叠加层和一步回滚命令。ECS 真实 Logto 在 `2026-07-29T06:17:09.978Z`、`06:17:10.322Z`、`06:17:10.934Z` 收到三次 HMAC 有效 POST，依次响应 `503 -> 503 -> 204`；Ky `TimeoutError` 未覆盖且仍不得标记为 PASS。
