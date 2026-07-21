# Logto 生产就绪独立审查报告

> 日期：2026-07-21  
> 范围：`codex/logto-production-readiness` 相对 `main@0fa5e08`  
> 当前状态：`PASS`（本地门禁）；生产验收 `PENDING_EXTERNAL`；镜像构建 `PENDING_ENVIRONMENT`

## 1. 审查轮次

| 轮次 | 维度 | 发现 | 处理 |
|------|------|------|------|
| 初次终审 | 代码、Git 范围、安全、运维、文档、migration/备份 | API 默认匿名暴露、Runbook 工作目录、状态枚举和双库停写一致性 | 已补 fail-closed 配置、路径合同、统一状态和 `quiesced` manifest |
| 恢复专项一轮 | 正确性、安全、测试质量 | 缺恢复状态、`--single-transaction`、dump 私有权限、备份并发锁 | TDD 增加状态、事务、`0600`、锁及失败状态 |
| 恢复专项二轮 | TOCTOU、崩溃一致性、隔离目标 | dump 校验后可替换、进度状态原地截断、锁释放无所有权、目标库未验证为空 | descriptor 恢复、不可变进行中状态、inode 所有权、`psql` 双目标空库预检 |
| 备份专项三轮 | 路径 TOCTOU、原子可见性、测试质量 | `pg_dump --file` 可跟随替换路径、最终文件复制期间可见、成功 checksum 未直验 | stdout 绑定私有 descriptor、随机临时文件、硬链接原子发布、内容/bytes/SHA-256 回归 |
| 备份专项四轮 | 提交顺序、崩溃一致性、恢复门禁 | manifest 发布前释放锁，存在无锁并发窗口；`fsync` 分支覆盖不足 | manifest 发布与目录同步全程持锁，恢复检测锁即拒绝；补 dump/manifest/目录 `fsync` 故障注入 |
| 收尾独立审查 | 容器门禁、状态耐久性、请求路由 | Docker 仍探测 liveness、恢复状态目录未同步、ready 查询参数误鉴权 | 容器改探测 `/ready`；Unix 同步状态目录；统一 pathname 路由并补 TDD 合同 |
| 修复后复审 | 运行时、恢复、安全、证据边界 | workspace Docker deps 上下文需实证；静态/YAML 计数口径需明确 | 最小上下文同参数 npm dry-run 退出 0；口径明确为 29 `.js` + 1 bin、6 变更 YAML + 1 基线 Compose；无未关闭 CRITICAL/MAJOR |
| 提交前部署合同复审 | Compose 持久化边界 | `./config:/app/config` 不对应 API 实际读写目录，API Key 状态会在容器重启后丢失 | TDD 合同先红后绿，改挂载到 `/app/packages/api-publish-engine/config`，并在 Runbook 约束主机目录权限 |

## 2. 已关闭的高风险发现

1. **半恢复不可判定**：真实恢复现在强制 `--state-file`；成功只发布 `complete`，失败只发布 `failed`，状态记录已恢复逻辑库且不含 URL、用户名或密码。
2. **切换依赖人工判断**：新增 `--verify-state`，重新校验 manifest/dump、manifest SHA-256、双库完成集合和冲突工件；非零退出禁止切换。
3. **单库内部分执行**：`pg_restore` 使用 `--single-transaction --exit-on-error`，每个数据库内部失败回滚。
4. **目标污染**：恢复任何一库前用 `psql` 检查两个目标都没有业务对象；非空或无法检查时不执行 `pg_restore`。部署门禁要求从预检到 smoke 完成持续隔离目标，脚本不冒充能锁住外部客户端。
5. **校验后替换**：dump 必须是普通文件，实际恢复从重新校验 checksum 的同一只读 descriptor 读取。
6. **并发覆盖与误删**：备份锁、最终文件和状态发布均排他创建；失败清理在操作前核对创建时 inode，已观察到的路径替换会 fail closed；同运行账号在核对与删除之间恶意替换的不可消除窗口列入残余边界。
7. **敏感文件权限**：Unix 文件使用 `0600`；Windows Runbook 明确要求受限 NTFS ACL，未把 `chmod` 冒充为 ACL。
8. **外部工具路径 TOCTOU**：`pg_dump` 不再接收输出路径，stdout 直接写入父进程持有的私有 descriptor；路径被替换不会改写外部目标。
9. **半成品与提交窗口**：dump 和 manifest 仅通过同目录硬链接原子发布；manifest 最后发布且目录同步完成前不释放锁。恢复校验发现锁时返回 `BACKUP_IN_PROGRESS`。
10. **容器误接流量**：Dockerfile 和 Compose 均以 `/ready` 判定健康；pathname 统一解析保证附带查询参数的探针不经过 Token 校验。

## 3. 残余边界

- 两个 PostgreSQL 数据库之间无法共享事务。第一库完成、第二库失败时，部署编排层必须依据 `failed` 状态销毁两个隔离目标并重新创建；状态文件不是跨库回滚。
- 脚本遵循最小权限，不持有集群级 `CREATE/DROP DATABASE` 权限；目标创建和失败销毁属于生产编排层 `PENDING_EXTERNAL` 验收。
- 空库预检与 `pg_restore` 是两个进程，脚本无法阻止不遵守维护协议的外部连接在两者之间写入。生产编排层必须从预检到恢复及 smoke 完成持续隔离两个目标；真实演练保持 `PENDING_EXTERNAL`。
- Windows 普通用户默认不能创建符号链接，符号链接拒绝测试在当前 Windows 环境跳过；校验后路径替换的 descriptor 测试在 Windows 已实际通过。
- Node 没有跨平台的“按 inode 条件 unlink”API；锁释放和失败清理的不可消除微小竞态以受限运行账号作为安全边界。Unix 输出目录强制拒绝 group/other 权限，Windows 必须由 NTFS ACL 保证只有备份账号可写；同账号恶意进程不在脚本隔离能力内。
- Windows 不支持对目录执行本脚本使用的 `fsync`，备份和恢复状态目录项耐久性依赖 NTFS；Unix 会在 dump/manifest 发布和恢复状态转换后同步目录。不支持硬链接的卷直接拒绝备份。
- Docker Desktop Linux daemon 未启动时，真实镜像构建保持 `PENDING_ENVIRONMENT`；真实 Logto/PostgreSQL/云端演练保持 `PENDING_EXTERNAL`。

## 4. 最终门禁

- API 全量 runner 发现 77 个测试入口，69 个直接执行测试和 8 个 Vitest 文件（24 个测试）全部通过，退出码 0。
- 备份恢复专项 28 个 Node 测试：25 passed、3 skipped、0 failed；跳过项为 Windows 符号链接权限和 Unix 目录 `fsync` 平台分支。
- 30 个变更 Node 文件通过 `node --check`；6 个变更 YAML 和 1 个基线 Logto Compose 解析通过；Logto + monitoring 与业务 API Compose 配置均通过。
- `git diff --check`、53 文件范围、临时物、`.env` 实例和敏感信息扫描通过。22 个已跟踪文件与 31 个未跟踪文件均属于 Logto 生产就绪范围。
- API Compose 的配置挂载合同通过：`./config` 指向 `/app/packages/api-publish-engine/config`，旧 `/app/config` 目标被回归测试拒绝。
- 收尾独立审查发现的容器 liveness、恢复状态目录同步和 ready 查询参数问题已按 TDD 修复；修复后运行时、恢复和证据复审无未关闭 CRITICAL/MAJOR。
- Docker deps 最小上下文同参数 `npm ci --dry-run --offline` 解析 42 个包并退出 0。Docker daemon 未启动，真实镜像 build 保持 `PENDING_ENVIRONMENT`。
- 真实 Logto、PostgreSQL migration/恢复/压力、云端会话撤销和备份时效告警保持 `PENDING_EXTERNAL`，不计入本地 PASS。
